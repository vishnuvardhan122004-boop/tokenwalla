"""
backend/payments/fees.py

Single source of truth for TokenWalla's money math. Two independent charges:

  1. Patient-facing checkout fee  → compute_fee_breakdown()
     Collected through Razorpay at booking time. Split into named components
     and stored on Payment (never a single lump total).

  2. Hospital commission          → compute_hospital_commission()
     Charged to the HOSPITAL and deducted at doctor-payout time — never routed
     through Razorpay Checkout, so it incurs no gateway fee.

All arithmetic uses Decimal and rounds half-up to 2 places, so the figures
here exactly match what the patient sees on the receipt and what we settle.

Kept model-free (like razorpay_utils.py) so it's safe to import anywhere.
"""
from decimal import Decimal, ROUND_HALF_UP

# ── Patient-facing fee constants ──────────────────────────────────────────────
PLATFORM_FEE = Decimal('20.00')   # TokenWalla's flat platform fee
GATEWAY_FEE  = Decimal('1.50')    # Razorpay passthrough, shown as a line item
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


def compute_fee_breakdown(doctor_fee) -> dict:
    """Split a doctor's consultation fee into the full patient bill.

        gst          = 18% × (platform_fee + gateway_fee)   # doctor_fee exempt
        final_amount = doctor_fee + platform_fee + gateway_fee + gst

    Returns Decimals (2dp). `doctor_fee` may be an int/str/Decimal.
    Example: doctor_fee=200 → total 225.37.
    """
    doctor_fee   = _q(doctor_fee)
    platform_fee = _q(PLATFORM_FEE)
    gateway_fee  = _q(GATEWAY_FEE)
    taxable      = platform_fee + gateway_fee            # doctor_fee is exempt
    gst_amount   = _q(taxable * GST_RATE)
    final_amount = _q(doctor_fee + platform_fee + gateway_fee + gst_amount)
    return {
        'doctor_fee':   doctor_fee,
        'platform_fee': platform_fee,
        'gateway_fee':  gateway_fee,
        'taxable_value': taxable,       # GST-taxable portion (platform + gateway)
        'gst_amount':   gst_amount,
        'final_amount': final_amount,
        'gst_rate':     GST_RATE,
        'sac_code':     SAC_CODE,
    }


def to_paise(amount) -> int:
    """Convert a rupee Decimal/number to an integer paise amount for Razorpay."""
    return int((_q(amount) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def compute_hospital_commission(commission_rate) -> dict:
    """Hospital commission charged by TokenWalla, deducted at payout time.

        hospital_commission = commission_rate + 18% × commission_rate
        (e.g. ₹20 → ₹20 + ₹3.60 = ₹23.60)

    `commission_rate` is the per-hospital negotiated base (Hospital.commission_rate).
    Returns the taxable base, its GST, and the gross commission — all Decimals.
    """
    base       = _q(commission_rate)
    gst_amount = _q(base * GST_RATE)
    total      = _q(base + gst_amount)
    return {
        'commission_base': base,
        'gst_amount':      gst_amount,
        'total_commission': total,
        'gst_rate':        GST_RATE,
    }


def compute_doctor_payout(doctor_fee, commission_rate) -> Decimal:
    """Doctor's net take-home for one completed booking.

        doctor_payout_amount = doctor_fee − hospital_commission(commission_rate)
    """
    commission = compute_hospital_commission(commission_rate)['total_commission']
    return _q(_q(doctor_fee) - commission)
