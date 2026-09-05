"""
backend/payments/razorpay_utils.py

Single source of truth for the Razorpay Payment Gateway logic shared between
payments.CreateOrderView and payments.VerifyPaymentView (new bookings and the
₹5 reschedule fee). Keeping order creation, payment confirmation and plan
pricing in ONE place means checkout and verify can never silently drift
apart. (Replaces
cashfree_utils.py — we're back on Razorpay for patient checkout; doctor
payouts are handled manually, not via a gateway payout API.)

Same shape as the old cashfree_utils.py so callers barely change:

  * Money moves through this module in RUPEES (Decimal) — only right at the
    Razorpay API boundary do we convert to/from paise, Razorpay's unit.

  * There is no client-returned signature to trust either. Razorpay Checkout
    DOES hand the browser a signature, but we ignore it and instead confirm
    the order server-side (fetch the order + its payments and check for a
    captured payment) — confirm_order_paid() is the money-critical gate,
    exactly like the Cashfree version. This also means the frontend contract
    (send only order_id to /verify/) didn't need to change.

This module imports no app models, so it is safe to import from any app
without risking a circular import.
"""
import logging
import os
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

import razorpay

logger = logging.getLogger('tokenwalla')

TWO_PLACES = Decimal('0.01')


def _q2(amount) -> Decimal:
    return Decimal(str(amount)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


# Server is the source of truth for prices — never trust the client for amounts.
# Keyed in RUPEES. 'reschedule' does NOT create a new Booking; it's the only
# fixed-amount plan left now that checkout collects the full bill (consultation
# fee + platform + gateway + GST) and every booking includes queue access. The
# old ₹15 'queue_view' upgrade was retired with that change.
VALID_PLAN_AMOUNTS = {
    Decimal('5.00'): {'fee': 5, 'queue_access': False, 'plan': 'reschedule'},
}

_client = None


def get_client():
    """Lazily build and reuse a single Razorpay client across requests.

    Refuses to build a LIVE client while DEBUG is on. Razorpay has no sandbox
    for live credentials, so a local checkout against an `rzp_live_` key
    charges a real card — and local testing is the normal way this repo gets
    exercised. Every real gateway call routes through here, so this one guard
    covers order creation, confirmation and refunds alike. Set
    ALLOW_LIVE_RAZORPAY=1 to override deliberately.
    """
    global _client
    if _client is None:
        if (settings.DEBUG
                and settings.RAZORPAY_KEY_ID.startswith('rzp_live_')
                and os.environ.get('ALLOW_LIVE_RAZORPAY') != '1'):
            raise ImproperlyConfigured(
                'Refusing to use a LIVE Razorpay key with DEBUG=True — a local '
                'checkout would charge a real card. Put the rzp_test_ pair in '
                'backend/.env (then `touch tokenwalla/settings.py`), or set '
                'ALLOW_LIVE_RAZORPAY=1 if you really mean it.'
            )
        _client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    return _client


def checkout_key() -> str:
    """The public key id Razorpay Checkout needs client-side. Safe to expose —
    it's the id half of the key pair, not the secret."""
    return settings.RAZORPAY_KEY_ID


def plan_for_amount(amount_rupees):
    """Resolve a fixed-amount plan (currently only 'reschedule') by rupee
    amount, or None. Tolerant of int/str/Decimal inputs."""
    return VALID_PLAN_AMOUNTS.get(_q2(amount_rupees))


def create_order(*, order_id, amount_rupees, customer, tags=None):
    """Create a Razorpay order for `amount_rupees` (rupees).

    Razorpay assigns its own order id (there's no supply-your-own-id option
    like Cashfree's), so `order_id` is passed through only as the `receipt`
    field for our own traceability. `tags` (plan, doctor_id, doctor_fee, …)
    are stored as order `notes` so verify can rebuild the same context.

    `customer` isn't sent to Razorpay (unlike Cashfree, an order needs no
    customer_details) — it's accepted for interface parity with the caller.

    Returns {'order_id', 'key'}. Raises on any gateway error.
    """
    order = get_client().order.create({
        'amount':   int(_q2(amount_rupees) * 100),   # paise
        'currency': 'INR',
        'receipt':  str(order_id),
        'notes':    {k: str(v) for k, v in (tags or {}).items()},
    })
    return {'order_id': order['id'], 'key': checkout_key()}


def confirm_order_paid(order_id):
    """Server-side confirmation of a Razorpay payment — the new 'verify'.

    Fetches the order and, when a payment against it was captured, that
    payment's id. Returns (paid: bool, payment_ref: str, amount_rupees:
    Decimal, tags: dict). Raises on any gateway/network error — callers must
    wrap in try/except and treat a failure as "could not verify" (502), never
    as success.
    """
    client = get_client()
    order  = client.order.fetch(order_id)

    amount_rupees = _q2(Decimal(order.get('amount') or 0) / 100)
    tags          = dict(order.get('notes') or {})

    payment_ref = ''
    for p in (client.order.payments(order_id).get('items') or []):
        if p.get('status') == 'captured':
            payment_ref = str(p['id'])
            break

    paid = bool(payment_ref)
    return paid, payment_ref, amount_rupees, tags


def find_existing_refund(payment_id) -> str:
    """Id of any refund Razorpay already holds against this payment, or ''.

    Exists because `refund_payment` raising does NOT mean the refund failed to
    happen — a gateway timeout can leave Razorpay having processed it while our
    caller sees an exception and rolls back the Refund row. The patient then
    retries, our idempotency check finds no row, and a SECOND refund goes out.

    Asking the gateway what it already holds turns that retry into a
    reconciliation. One booking is only ever refunded once here (see
    process_cancellation_refund's one-row-per-payment rule), so ANY refund found
    against this payment is ours and must be adopted rather than duplicated.

    Failing soft on purpose: if this lookup itself errors we return '' and the
    caller proceeds to refund. Refusing to refund because a diagnostic call
    failed would strand a patient's money over a transient network fault, which
    is the worse of the two errors.
    """
    try:
        resp = get_client().payment.fetch_multiple_refund(payment_id) or {}
        for item in (resp.get('items') or []):
            rid = str(item.get('id', '') or '')
            if rid:
                return rid
    except Exception:
        logger.warning('Could not list existing refunds for payment %s; '
                       'proceeding as if none exist.', payment_id)
    return ''


def refund_payment(payment_id, amount_rupees, refund_id, note=None):
    """Issue a (partial or full) refund on a captured Razorpay payment.

    `payment_id` is the captured Razorpay payment id (NOT the order id —
    Razorpay refunds are per-payment). `refund_id` is only used for logging;
    our own DB-level lock (payments.refunds.process_cancellation_refund)
    is what stops a double refund, not a gateway idempotency key. Returns a
    normalised {'id': <razorpay_refund_id>}. Raises on any gateway/network
    error — the caller decides whether to proceed.
    """
    resp = get_client().payment.refund(payment_id, {
        'amount': int(_q2(amount_rupees) * 100),   # paise
        'notes':  {'reason': note or 'TokenWalla refund', 'refund_id': str(refund_id)},
    })
    return {'id': str(resp.get('id', '') or '')}
