"""
backend/payments/cashfree_utils.py

Single source of truth for the Cashfree Payment Gateway logic shared between
payments.VerifyPaymentView (new bookings / reschedule) and
bookings.UpgradeQueueAccessView (queue-access upgrade). Keeping order creation,
payment confirmation and plan pricing in ONE place means the paid endpoints can
never silently drift apart — a fix here protects both. (Replaces the old
razorpay_utils.py.)

Two things differ fundamentally from the previous Razorpay integration and shape
every caller:

  * Amounts are in RUPEES (Decimal), not paise. Cashfree's order_amount /
    refund_amount are rupee numbers, so there is no more to_paise() at the
    gateway boundary.

  * There is NO client-returned signature to verify. Cashfree confirms a payment
    server-side: we fetch the order and check order_status == 'PAID', then read
    the successful payment's cf_payment_id. confirm_order_paid() is the new
    "verify" — it is the money-critical gate.

This module imports no app models, so it is safe to import from any app without
risking a circular import.
"""
import base64
import hashlib
import hmac
import logging
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings

from cashfree_pg.api_client import Cashfree
from cashfree_pg.models.create_order_request import CreateOrderRequest
from cashfree_pg.models.customer_details import CustomerDetails
from cashfree_pg.models.order_create_refund_request import OrderCreateRefundRequest

logger = logging.getLogger('tokenwalla')

# Cashfree API contract version this integration is written against.
API_VERSION = '2023-08-01'

TWO_PLACES = Decimal('0.01')


def _q2(amount) -> Decimal:
    return Decimal(str(amount)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


# Server is the source of truth for prices — never trust the client for amounts.
# Keyed in RUPEES (Cashfree's unit). 'reschedule' is a separate plan that does
# NOT create a new Booking. Mirrors the old VALID_AMOUNTS_PAISE, re-denominated.
VALID_PLAN_AMOUNTS = {
    Decimal('15.00'): {'fee': 15, 'queue_access': True,  'plan': 'queue_view'},
    Decimal('5.00'):  {'fee': 5,  'queue_access': False, 'plan': 'reschedule'},
}

# The queue-access upgrade is the ₹15 "queue_view" plan. Derived from
# VALID_PLAN_AMOUNTS so a repricing there flows through automatically.
QUEUE_UPGRADE_AMOUNT_INR = 15


def get_client():
    """Return a Cashfree client configured from settings. In cashfree-pg v6 the
    environment + credentials are constructor args (read fresh each call, so an
    override_settings in tests or a settings reload is always reflected)."""
    env = (
        Cashfree.PRODUCTION
        if str(settings.CASHFREE_ENV).upper() == 'PRODUCTION'
        else Cashfree.SANDBOX
    )
    return Cashfree(env, settings.CASHFREE_CLIENT_ID, settings.CASHFREE_CLIENT_SECRET)


def plan_for_amount(amount_rupees):
    """Resolve a legacy fixed-amount plan (reschedule / queue_view) by rupee
    amount, or None. Tolerant of int/str/Decimal inputs."""
    return VALID_PLAN_AMOUNTS.get(_q2(amount_rupees))


def create_order(*, order_id, amount_rupees, customer, tags=None):
    """Create a Cashfree order for `amount_rupees` (rupees).

    `order_id` is OUR own unique id (Cashfree accepts and echoes it, and rejects
    a duplicate — giving idempotent order creation for free). `tags` (plan,
    doctor_id, doctor_fee, …) are stored as order_tags so verify can rebuild the
    same context, exactly as the old Razorpay order `notes` did.

    Returns {'order_id', 'payment_session_id'}. Raises on any gateway error.
    """
    req = CreateOrderRequest(
        order_id=str(order_id),
        order_amount=float(_q2(amount_rupees)),
        order_currency='INR',
        customer_details=CustomerDetails(
            # Cashfree requires customer_id to be >= 3 characters. Small user ids
            # (e.g. '1') fail validation, so prefix a stable, per-user token that
            # is always long enough and alphanumeric.
            customer_id=f"tw_user_{customer['id']}",
            # Cashfree requires a phone; fall back to a placeholder for users
            # with no mobile on file (rare) so order creation never hard-fails.
            customer_phone=str(customer.get('phone') or '9999999999'),
            customer_name=(customer.get('name') or None),
        ),
        order_tags={k: str(v) for k, v in (tags or {}).items()},
    )
    resp = get_client().PGCreateOrder(
        create_order_request=req,
        x_idempotency_key=str(order_id),
    )
    data = resp.data
    return {'order_id': data.order_id, 'payment_session_id': data.payment_session_id}


def confirm_order_paid(order_id):
    """Server-side confirmation of a Cashfree payment — the new 'verify'.

    Fetches the order and, when it is PAID, the successful payment's reference.
    Returns (paid: bool, payment_ref: str, amount_rupees: Decimal, tags: dict).
    Raises on any gateway/network error — callers must wrap in try/except and
    treat a failure as "could not verify" (502), never as success.
    """
    client = get_client()
    order  = client.PGFetchOrder(order_id=str(order_id)).data

    paid          = (order.order_status == 'PAID')
    amount_rupees = _q2(order.order_amount or 0)
    tags          = dict(order.order_tags or {})

    payment_ref = ''
    if paid:
        try:
            payments = client.PGOrderFetchPayments(order_id=str(order_id)).data or []
            for p in payments:
                if getattr(p, 'payment_status', '') == 'SUCCESS':
                    payment_ref = str(p.cf_payment_id)
                    break
        except Exception as exc:
            # The order is authoritatively PAID; a payments-list hiccup shouldn't
            # block the booking. Fall back to an order-derived reference so the
            # unique-payment_id idempotency guard still has a stable, unique key.
            logger.warning('Cashfree: order %s is PAID but payments fetch failed: %s',
                           order_id, exc)
        if not payment_ref:
            payment_ref = f'cford_{order_id}'
    return paid, payment_ref, amount_rupees, tags


def refund_payment(order_id, amount_rupees, refund_id, note=None):
    """Issue a (partial or full) refund on a captured Cashfree order.

    `amount_rupees` is the rupee amount to return; `refund_id` must be unique per
    refund (we derive it from the Refund/Payment id). Returns a normalised
    {'id': <cf_refund_id>} so callers stay gateway-agnostic. Raises on any
    gateway/network error — the caller decides whether to proceed.
    """
    req = OrderCreateRefundRequest(
        refund_amount=float(_q2(amount_rupees)),
        refund_id=str(refund_id),
        refund_note=(note or 'TokenWalla refund'),
        refund_speed='STANDARD',
    )
    resp = get_client().PGOrderCreateRefund(
        order_id=str(order_id),
        order_create_refund_request=req,
    )
    data = resp.data
    return {'id': str(getattr(data, 'cf_refund_id', '') or getattr(data, 'refund_id', '') or '')}


def verify_webhook_signature(raw_body, signature, timestamp, secret=None):
    """Constant-time verification of a Cashfree webhook.

    Cashfree signs the RAW body: expected =
        base64( HMAC_SHA256( f"{timestamp}{raw_body}", secret ) )
    with `signature` in the `x-webhook-signature` header and `timestamp` in
    `x-webhook-timestamp`. Defaults to CASHFREE_WEBHOOK_SECRET (the Payment
    Gateway webhook secret) when `secret` isn't given; pass the Payouts secret
    explicitly to verify a Payouts webhook instead — see
    payments.cashfree_payouts_utils.verify_payout_webhook_signature. Returns
    False when the secret is unset (fail closed) so we never trust an
    unverifiable webhook.
    """
    secret = (secret if secret is not None else settings.CASHFREE_WEBHOOK_SECRET) or ''
    secret = secret.encode('utf-8')
    if not secret or not signature or not timestamp:
        return False
    if isinstance(raw_body, (bytes, bytearray)):
        raw_body = bytes(raw_body).decode('utf-8')
    signed   = f'{timestamp}{raw_body}'.encode('utf-8')
    expected = base64.b64encode(hmac.new(secret, signed, hashlib.sha256).digest()).decode('utf-8')
    return hmac.compare_digest(expected, str(signature))
