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

# ── The Appointment Pass ──────────────────────────────────────────────────────
# ₹35 buys the SERVICE FEE for two bookings inside 30 days (the doctor's
# consultation fee is never part of it — see compute_fee_breakdown). The price
# is what the patient sees, so it is GST-INCLUSIVE and split backwards out of
# ₹35 rather than built up from a taxable base like a single booking is.
#
# It clears cost because only ONE gateway fee is paid across the two visits.
PASS_PRICE    = Decimal('35.00')
PASS_BOOKINGS = 2
PASS_DAYS     = 30

# What a fee breakdown is doing about a pass.
PASS_BUY    = 'BUY'      # this checkout is buying one (service fee → ₹35)
PASS_REDEEM = 'REDEEM'   # a credit is paying the service fee (service fee → ₹0)


def _q(amount) -> Decimal:
    """Quantize to 2 decimal places, rounding half-up (currency rounding)."""
    return Decimal(amount).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


FULL         = 'FULL'          # patient pays doctor_fee + service fee online
SERVICE_ONLY = 'SERVICE_ONLY'  # patient pays ONLY the service fee online


def compute_pass_split() -> dict:
    """Split the GST-INCLUSIVE pass price back into platform / gateway / GST.

        taxable  = 35.00 / 1.18            = 29.66
        gst      = 35.00 − taxable         =  5.34   (remainder, NOT taxable×18%)
        gateway  = the usual passthrough   =  1.50
        platform = taxable − gateway       = 28.16

    GST is taken as the REMAINDER on purpose: 29.66 × 0.18 rounds to 5.34 here,
    but that is luck, not arithmetic. Deriving it as the remainder guarantees the
    three lines always add up to exactly what the patient was charged, whatever
    the price is changed to later.
    """
    taxable  = _q(PASS_PRICE / (Decimal('1') + GST_RATE))
    gst      = _q(PASS_PRICE - taxable)
    gateway  = _q(GATEWAY_FEE)
    platform = _q(taxable - gateway)
    return {'platform_fee': platform, 'gateway_fee': gateway,
            'gst_amount': gst, 'taxable_value': taxable}


def pass_eligible(collection_mode) -> bool:
    """Can a pass be bought or spent on this provider?

    Only where nothing else is charged online. The pass waives the SERVICE fee,
    never the consultation fee, so at a FULL doctor a redemption would still have
    to open checkout for the consultation — a second, paid redemption path. v1
    refuses instead: a redemption is always a ₹0 booking with no gateway
    involved, and no payout is ever owed on one.
    """
    return collection_mode != FULL


def compute_fee_breakdown(doctor_fee, collection_mode=SERVICE_ONLY,
                          pass_action=None) -> dict:
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

    `pass_action` replaces the SERVICE-fee half of the bill, never the doctor's:

      PASS_BUY     → the ₹35 pass price stands in for this visit's service fee
      PASS_REDEEM  → the service fee is ₹0, already paid for by a pass credit

    Returns Decimals (2dp). `doctor_fee` may be an int/str/Decimal.
    Example: doctor_fee=200, FULL → total 225.37; SERVICE_ONLY → total 25.37;
    SERVICE_ONLY + PASS_BUY → 35.00; SERVICE_ONLY + PASS_REDEEM → 0.00.
    """
    doctor_fee   = _q(doctor_fee)
    service_only = (collection_mode != FULL)   # blank/unknown ⇒ service only
    online_doctor_fee  = _q(0) if service_only else doctor_fee
    offline_doctor_fee = doctor_fee if service_only else _q(0)

    if pass_action == PASS_BUY:
        # The service fee for this visit is replaced by the pass price.
        split = compute_pass_split()
        platform_fee, gateway_fee = split['platform_fee'], split['gateway_fee']
        taxable, gst_amount       = split['taxable_value'], split['gst_amount']
    elif pass_action == PASS_REDEEM:
        # A credit already paid for this visit's service fee — charge nothing
        # for it. With an eligible (service-only) provider that makes the whole
        # bill ₹0, which is why redemption never touches the gateway.
        platform_fee = gateway_fee = taxable = gst_amount = _q(0)
    else:
        platform_fee = _q(PLATFORM_FEE)
        gateway_fee  = _q(GATEWAY_FEE)
        taxable      = platform_fee + gateway_fee        # doctor_fee is exempt
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
        'pass_action':  pass_action or '',
    }


def compute_doctor_payout(doctor_fee) -> Decimal:
    """Doctor's take-home for one completed booking — the whole online fee.

    Nothing is deducted. TokenWalla's revenue comes from the patient's service
    fee, never from the doctor's consultation fee.
    """
    return _q(doctor_fee)
