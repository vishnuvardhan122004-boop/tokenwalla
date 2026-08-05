"""
backend/payments/fees.py

Single source of truth for TokenWalla's money math.

TokenWalla charges the PATIENT and nobody else. Hospitals and doctors are never
billed and never have anything deducted: our entire revenue is the service fee
(platform + gateway) collected at checkout, and a doctor's payout is exactly the
consultation fee the patient paid online — see compute_fee_breakdown().

All arithmetic uses Decimal and rounds half-up to 2 places, so the figures
here exactly match what the patient sees on the receipt and what we settle.

Kept model-free (like razorpay_utils.py) so it's safe to import anywhere.
"""
from decimal import Decimal, ROUND_HALF_UP

# ── Patient-facing fee constants ──────────────────────────────────────────────
PLATFORM_FEE = Decimal('20.00')   # TokenWalla's flat platform fee
GATEWAY_FEE  = Decimal('1.50')    # gateway passthrough, shown as a line item
GST_RATE     = Decimal('0.18')    # 18% GST

# SAC (Service Accounting Code) for the taxable service line on the GST invoice.
# 998551 — "Reservation services for … and related services". The doctor's
# consultation fee is a healthcare service and is GST-EXEMPT, so GST applies
# only to (platform_fee + gateway_fee).
SAC_CODE = '998551'

TWO_PLACES = Decimal('0.01')


def _q(amount) -> Decimal:
    """Quantize to 2 decimal places, rounding half-up (currency rounding)."""
    return Decimal(amount).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


FULL         = 'FULL'          # patient pays doctor_fee + service fee online
SERVICE_ONLY = 'SERVICE_ONLY'  # patient pays ONLY the service fee online


def compute_fee_breakdown(doctor_fee, collection_mode=SERVICE_ONLY) -> dict:
    """Split a doctor's consultation fee into the full patient bill.

        gst          = 18% × (platform_fee + gateway_fee)   # doctor_fee exempt
        final_amount = online_doctor_fee + platform_fee + gateway_fee + gst

    `collection_mode` (matches Doctor.payment_collection_mode) decides whether
    the doctor's consultation fee is charged online:

      FULL          → online_doctor_fee = doctor_fee. Opt-in: only an explicit
                      'FULL' collects the consultation fee online.
      SERVICE_ONLY  → online_doctor_fee = 0. This is what a blank, missing or
                      unrecognised mode means too — never collect a fee online
                      for a doctor nobody chose to collect for. The fee is
                      offline at the hospital, so nothing is captured online for
                      the doctor and no payout is owed. `offline_doctor_fee`
                      carries the amount payable at the clinic for the receipt.

    Returns Decimals (2dp). `doctor_fee` may be an int/str/Decimal.
    Example: doctor_fee=200, FULL → total 225.37; SERVICE_ONLY → total 25.37.
    """
    doctor_fee   = _q(doctor_fee)
    platform_fee = _q(PLATFORM_FEE)
    gateway_fee  = _q(GATEWAY_FEE)
    service_only = (collection_mode != FULL)   # blank/unknown ⇒ service only
    online_doctor_fee  = _q(0) if service_only else doctor_fee
    offline_doctor_fee = doctor_fee if service_only else _q(0)
    taxable      = platform_fee + gateway_fee            # doctor_fee is exempt
    gst_amount   = _q(taxable * GST_RATE)
    final_amount = _q(online_doctor_fee + platform_fee + gateway_fee + gst_amount)
    return {
        # `doctor_fee` is the amount charged ONLINE (what payout logic reads).
        'doctor_fee':   online_doctor_fee,
        'offline_doctor_fee': offline_doctor_fee,  # payable at clinic (SERVICE_ONLY)
        # Canonical, never the raw input — a blank/unknown mode is reported as
        # SERVICE_ONLY so the receipt and Payment row match what was charged.
        'collection_mode':    FULL if not service_only else SERVICE_ONLY,
        'platform_fee': platform_fee,
        'gateway_fee':  gateway_fee,
        'taxable_value': taxable,       # GST-taxable portion (platform + gateway)
        'gst_amount':   gst_amount,
        'final_amount': final_amount,
        'gst_rate':     GST_RATE,
        'sac_code':     SAC_CODE,
    }


def compute_doctor_payout(doctor_fee) -> Decimal:
    """Doctor's take-home for one completed booking — the whole online fee.

    Nothing is deducted. TokenWalla's revenue comes from the patient's service
    fee, never from the doctor's consultation fee.
    """
    return _q(doctor_fee)
