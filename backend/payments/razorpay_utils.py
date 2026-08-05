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
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings

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
    """Lazily build and reuse a single Razorpay client across requests."""
    global _client
    if _client is None:
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
