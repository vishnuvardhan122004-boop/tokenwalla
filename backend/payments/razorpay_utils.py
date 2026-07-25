"""
backend/payments/razorpay_utils.py

Single source of truth for the money-critical Razorpay logic shared between
payments.VerifyPaymentView (new bookings / reschedule) and
bookings.UpgradeQueueAccessView (queue-access upgrade). Keeping the signature
check, order-amount validation, and plan pricing in ONE place means the two
paid endpoints can never silently drift apart — a fix here protects both.

This module imports no app models, so it is safe to import from any app
without risking a circular import.
"""
import hashlib
import hmac
import logging

import razorpay
from django.conf import settings

logger = logging.getLogger('tokenwalla')

# Server is the source of truth for prices — never trust the client for amounts.
# 'reschedule' is a separate plan that does NOT create a new Booking.
VALID_AMOUNTS_PAISE = {
    1500: {'fee': 15, 'queue_access': True,  'plan': 'queue_view'},
    500:  {'fee': 5,  'queue_access': False, 'plan': 'reschedule'},
}

# The queue-access upgrade is the ₹15 "queue_view" plan → 1500 paise. Derived
# from VALID_AMOUNTS_PAISE so a repricing there flows through automatically.
QUEUE_UPGRADE_AMOUNT_PAISE = 1500
QUEUE_UPGRADE_AMOUNT_INR   = VALID_AMOUNTS_PAISE[QUEUE_UPGRADE_AMOUNT_PAISE]['fee']

_client = None


def get_client():
    """Lazily build and reuse a single Razorpay client across requests."""
    global _client
    if _client is None:
        _client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        )
    return _client


def verify_signature(order_id, payment_id, signature):
    """Constant-time HMAC-SHA256 verification of a Razorpay payment signature."""
    secret   = settings.RAZORPAY_KEY_SECRET.encode('utf-8')
    msg      = f'{order_id}|{payment_id}'.encode('utf-8')
    expected = hmac.new(secret, msg, digestmod=hashlib.sha256).hexdigest()
    # Compare as bytes so a non-ASCII client signature can't raise TypeError.
    return hmac.compare_digest(expected.encode('utf-8'), str(signature).encode('utf-8'))


def fetch_order_amount_paise(order_id):
    """Return the paid amount in paise for a Razorpay order.

    `or 0` guards against a present-but-None `amount` in the gateway response so
    the caller gets a clean 0 (→ amount-mismatch) instead of an int(None) crash.
    Raises on any gateway/network error — callers should wrap in try/except.
    """
    order = get_client().order.fetch(order_id)
    return int(order.get('amount') or 0)
