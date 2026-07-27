"""
backend/payments/refunds.py

Cancellation-refund logic: tiered percentage by how long before the slot the
patient cancels, a proportional split of the refunded pool between the doctor's
and the platform's share, and the doctor-absence adjustment.

Hard rules (see the feature spec):
  * Refunds are only permitted BEFORE a booking reaches COMPLETED.
  * Only (doctor_fee + platform_fee) is refundable — Razorpay does NOT return
    the gateway fee or GST to us, so those are never refunded.
  * A refund needed AFTER completion (doctor no-show recorded late) is NOT a
    clawback of an already-sent payout — it's a negative ledger adjustment
    netted against the doctor's NEXT payout.
"""
import logging
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

logger = logging.getLogger('tokenwalla')

TWO_PLACES = Decimal('0.01')


def _q(amount) -> Decimal:
    return Decimal(amount).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


class RefundNotAllowed(Exception):
    """Raised when a booking is past the point where refunds are permitted."""


def get_refund_percentage(booking) -> Decimal:
    """Tiered refund percentage based on hours before the scheduled slot.

        >= 24h → 70% ; >= 12h → 60% ; >= 2h → 50% ; otherwise 0%.

    If the slot time can't be determined, returns 0% (conservative — never
    over-refund on ambiguous data).
    """
    slot_dt = booking.scheduled_datetime
    if slot_dt is None:
        logger.warning('Refund: could not resolve slot time for booking %s; 0%%', booking.id)
        return Decimal('0.00')

    hours_before = (slot_dt - timezone.now()).total_seconds() / 3600
    if hours_before >= 24:
        return Decimal('0.70')
    elif hours_before >= 12:
        return Decimal('0.60')
    elif hours_before >= 2:
        return Decimal('0.50')
    return Decimal('0.00')


def compute_refund_split(payment, refund_pct) -> dict:
    """Split the refunded pool proportionally between doctor and platform.

        refund_pool   = refund_pct × (doctor_fee + platform_fee)
        doctor_loss   = refund_pool × doctor_fee   / (doctor_fee + platform_fee)
        platform_loss = refund_pool × platform_fee / (doctor_fee + platform_fee)

    Legacy payments with no component split (base = 0) yield a zero pool.
    """
    refund_pct = Decimal(refund_pct)
    base = _q(payment.doctor_fee) + _q(payment.platform_fee)
    if base <= 0:
        return {'refund_pool': Decimal('0.00'),
                'doctor_loss': Decimal('0.00'),
                'platform_loss': Decimal('0.00')}
    refund_pool   = _q(refund_pct * base)
    doctor_loss   = _q(refund_pool * (_q(payment.doctor_fee) / base))
    platform_loss = _q(refund_pool - doctor_loss)   # remainder → no rounding leak
    return {'refund_pool': refund_pool,
            'doctor_loss': doctor_loss,
            'platform_loss': platform_loss}


def process_cancellation_refund(booking):
    """Compute, issue (via Razorpay) and record a cancellation refund.

    Idempotent: a booking's Payment carries at most one cancellation Refund.
    Returns (refund_or_None, info). Raises RefundNotAllowed if the booking is
    already terminal. Raises on a Razorpay gateway error (caller should abort
    the cancellation so it can be retried rather than cancel without refunding).
    """
    # Local imports avoid a circular import (models import nothing from here).
    from bookings.models import Booking
    from payments.models import Payment, Refund
    from payments.razorpay_utils import refund_payment
    from payments.fees import to_paise

    if booking.status not in Booking.REFUNDABLE_STATUSES:
        raise RefundNotAllowed(
            f'Booking {booking.id} is {booking.status}; refunds are only allowed before COMPLETED.'
        )

    payment = getattr(booking, 'payment', None)
    if payment is None or payment.status != Payment.PAID:
        return None, {'refunded': False, 'reason': 'no_paid_payment'}

    # Idempotency — never refund the same booking twice.
    existing = payment.refunds.first()
    if existing is not None:
        return existing, {'refunded': True, 'reason': 'already_refunded',
                          'amount': str(existing.refund_amount)}

    pct   = get_refund_percentage(booking)
    split = compute_refund_split(payment, pct)
    pool  = split['refund_pool']

    razorpay_refund_id = ''
    if pool > 0:
        resp = refund_payment(
            payment.payment_id,
            to_paise(pool),
            notes={'booking_id': str(booking.id), 'reason': 'cancellation'},
        )
        razorpay_refund_id = (resp or {}).get('id', '') or ''

    refund = Refund.objects.create(
        payment            = payment,
        refund_percentage  = pct,
        doctor_loss        = split['doctor_loss'],
        platform_loss      = split['platform_loss'],
        razorpay_refund_id = razorpay_refund_id,
    )
    logger.info('Refund %s for booking %s: %s%% pool ₹%s (doctor ₹%s / platform ₹%s) rzp=%s',
                refund.id, booking.id, pct, pool, split['doctor_loss'],
                split['platform_loss'], razorpay_refund_id or '—')
    return refund, {'refunded': pool > 0, 'percentage': str(pct), 'amount': str(pool)}


def record_absence_refund(booking):
    """Doctor no-show recorded AFTER completion: net the doctor's take-home for
    this booking back out via a negative ledger adjustment (settled against
    their next payout). Never reverses an already-sent payout.

    Idempotent per booking. Returns (ledger_entry_or_None, info).
    """
    from bookings.models import Booking
    from payments.models import DoctorLedger, Payment
    from payments.fees import compute_doctor_payout

    if booking.status != Booking.COMPLETED:
        raise RefundNotAllowed(
            f'Absence refund only applies to COMPLETED bookings (booking {booking.id} is {booking.status}).'
        )

    # One absence adjustment per booking.
    existing = DoctorLedger.objects.filter(
        booking=booking, reason=DoctorLedger.ABSENCE_REFUND
    ).first()
    if existing is not None:
        return existing, {'adjusted': True, 'reason': 'already_recorded'}

    payment = getattr(booking, 'payment', None)
    doctor_fee = payment.doctor_fee if payment else Decimal('0.00')
    payout = compute_doctor_payout(doctor_fee, booking.hospital.commission_rate)

    entry = DoctorLedger.objects.create(
        doctor  = booking.doctor,
        booking = booking,
        amount  = _q(-payout),   # negative — deducted from the next payout batch
        reason  = DoctorLedger.ABSENCE_REFUND,
    )
    logger.info('Absence refund ledger %s: doctor %s −₹%s (booking %s)',
                entry.id, booking.doctor_id, payout, booking.id)
    return entry, {'adjusted': True, 'amount': str(payout)}
