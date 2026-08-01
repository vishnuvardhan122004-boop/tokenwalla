"""
backend/payments/fees.py

Single source of truth for TokenWalla's money math. Two independent charges:

  1. Patient-facing checkout fee  → compute_fee_breakdown()
     Collected through Cashfree at booking time. Split into named components
     and stored on Payment (never a single lump total).

  2. Hospital commission          → compute_hospital_commission()
     Charged to the HOSPITAL and deducted at doctor-payout time — never routed
     through Cashfree Checkout, so it incurs no gateway fee.

All arithmetic uses Decimal and rounds half-up to 2 places, so the figures
here exactly match what the patient sees on the receipt and what we settle.

Kept model-free (like cashfree_utils.py) so it's safe to import anywhere.
"""
from decimal import Decimal, ROUND_HALF_UP

# ── Patient-facing fee constants ──────────────────────────────────────────────
PLATFORM_FEE = Decimal('20.00')   # TokenWalla's flat platform fee
GATEWAY_FEE  = Decimal('1.50')    # Cashfree passthrough, shown as a line item
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


def compute_fee_breakdown(doctor_fee, collection_mode=FULL) -> dict:
    """Split a doctor's consultation fee into the full patient bill.

        gst          = 18% × (platform_fee + gateway_fee)   # doctor_fee exempt
        final_amount = online_doctor_fee + platform_fee + gateway_fee + gst

    `collection_mode` (matches Doctor.payment_collection_mode) decides whether
    the doctor's consultation fee is charged online:

      FULL          → online_doctor_fee = doctor_fee (default; existing behaviour)
      SERVICE_ONLY  → online_doctor_fee = 0. The consultation fee is collected
                      offline at the hospital, so nothing is captured online for
                      the doctor and no payout is owed. `offline_doctor_fee`
                      carries the amount payable at the clinic for the receipt.

    Returns Decimals (2dp). `doctor_fee` may be an int/str/Decimal.
    Example: doctor_fee=200, FULL → total 225.37; SERVICE_ONLY → total 25.37.
    """
    doctor_fee   = _q(doctor_fee)
    platform_fee = _q(PLATFORM_FEE)
    gateway_fee  = _q(GATEWAY_FEE)
    service_only = (collection_mode == SERVICE_ONLY)
    online_doctor_fee  = _q(0) if service_only else doctor_fee
    offline_doctor_fee = doctor_fee if service_only else _q(0)
    taxable      = platform_fee + gateway_fee            # doctor_fee is exempt
    gst_amount   = _q(taxable * GST_RATE)
    final_amount = _q(online_doctor_fee + platform_fee + gateway_fee + gst_amount)
    return {
        # `doctor_fee` is the amount charged ONLINE (what payout logic reads).
        'doctor_fee':   online_doctor_fee,
        'offline_doctor_fee': offline_doctor_fee,  # payable at clinic (SERVICE_ONLY)
        'collection_mode':    collection_mode,
        'platform_fee': platform_fee,
        'gateway_fee':  gateway_fee,
        'taxable_value': taxable,       # GST-taxable portion (platform + gateway)
        'gst_amount':   gst_amount,
        'final_amount': final_amount,
        'gst_rate':     GST_RATE,
        'sac_code':     SAC_CODE,
    }


def to_paise(amount) -> int:
    """Convert a rupee Decimal/number to an integer paise amount for Cashfree."""
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
