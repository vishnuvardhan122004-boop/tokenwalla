"""
backend/payments/razorpayx_utils.py

The ONE place that talks to RazorpayX Payouts. Everything else (the daily task,
the webhook handler) goes through create_payout() so that switching from the
current simulation to the live API is a one-file change.

RazorpayX requires KYC + current-account activation that isn't done yet, so
`settings.RAZORPAYX_ENABLED` defaults to False and create_payout() SIMULATES a
queued payout (returns a fake id, no network call). This lets the whole
pipeline — ledger → batch → webhook — be built and tested end to end now.

When the account is live:
  * set RAZORPAYX_ENABLED=true and RAZORPAYX_ACCOUNT_NUMBER,
  * fill in the `_live_payout()` body with the RazorpayX Payouts call,
nothing else changes.
"""
import logging
import uuid

from django.conf import settings

from payments.fees import to_paise

logger = logging.getLogger('tokenwalla')


def _fund_account(mode, doctor):
    """The payout destination for a doctor: UPI VPA when present, else bank/IMPS."""
    if mode == 'UPI':
        return {'account_type': 'vpa', 'vpa': {'address': doctor.upi_vpa}}
    return {
        'account_type': 'bank_account',
        'bank_account': {
            'name':           doctor.name,
            'ifsc':           doctor.ifsc,
            'account_number': doctor.bank_account_number,
        },
    }


def choose_mode(doctor):
    """UPI if the doctor has a VPA, else IMPS (bank) as fallback."""
    return 'UPI' if (doctor.upi_vpa or '').strip() else 'IMPS'


def _simulate_payout(doctor, amount, mode, idempotency_key):
    """Stand-in for the live RazorpayX call while payouts are disabled."""
    logger.info(
        '[razorpayx:SIMULATED] payout ₹%s to doctor %s via %s (key=%s) — '
        'RazorpayX disabled; no money moved.',
        amount, doctor.id, mode, idempotency_key,
    )
    return {
        'id':          f'pout_sim_{uuid.uuid4().hex[:14]}',
        'status':      'queued',
        'mode':        mode,
        'amount':      to_paise(amount),
        'simulated':   True,
    }


def _live_payout(doctor, amount, mode, idempotency_key):
    """Real RazorpayX Payouts call. Fill in once the account is activated.

    Sketch (uncomment + adapt when live):

        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        return client.payout.create({
            'account_number': settings.RAZORPAYX_ACCOUNT_NUMBER,
            'amount': to_paise(amount),
            'currency': 'INR',
            'mode': mode,                       # 'UPI' | 'IMPS'
            'purpose': 'payout',
            'fund_account': _fund_account(mode, doctor),
            'queue_if_low_balance': True,
            'reference_id': idempotency_key,
        }, headers={'X-Payout-Idempotency': idempotency_key})
    """
    raise NotImplementedError(
        'RAZORPAYX_ENABLED is true but the live payout call is not implemented. '
        'Complete _live_payout() in payments/razorpayx_utils.py.'
    )


def create_payout(doctor, amount, mode, idempotency_key):
    """Create a doctor payout. Routes to the live API or the simulation depending
    on settings.RAZORPAYX_ENABLED. Returns the payout object (its ['id'] is the
    razorpay_payout_id). The idempotency_key makes retries safe on both paths.
    """
    if settings.RAZORPAYX_ENABLED:
        return _live_payout(doctor, amount, mode, idempotency_key)
    return _simulate_payout(doctor, amount, mode, idempotency_key)
