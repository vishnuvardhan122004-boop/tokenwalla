"""
backend/payments/pass_utils.py

Everything about an Appointment Pass that isn't fee math (that lives in
fees.py) or a view: finding the one a patient can spend, and what a
cancellation does to it.

The credit itself is taken inside the booking transaction in
payments.views._handle_new_booking, under select_for_update — not here. A
credit must be spent in the same transaction that creates the booking it paid
for, or a rolled-back booking leaves the patient short one visit.
"""
import logging

from django.db import transaction
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger('tokenwalla')


class PassUnavailable(Exception):
    """The pass was spent, expired or voided between the check and the spend."""

    def __init__(self, message='This pass has no visits left.'):
        self.message = message
        super().__init__(message)


def active_pass(user):
    """The pass this user can spend right now, or None.

    Ordered oldest-expiry-first so the one closest to running out is spent
    first — the patient loses the least if they only use one.
    """
    from payments.models import AppointmentPass
    return (AppointmentPass.objects
            .filter(user=user, voided_at__isnull=True,
                    expires_at__gt=timezone.now(),
                    used_bookings__lt=F('total_bookings'))
            .order_by('expires_at')
            .first())


def serialize_pass(ap):
    """JSON shape shared by /pass/, /verify/ and /pass/redeem/ so the website
    and the app read the same keys wherever a pass turns up."""
    if ap is None:
        return None
    return {
        'id':         ap.id,
        'remaining':  ap.remaining,
        'total':      ap.total_bookings,
        'used':       ap.used_bookings,
        'expires_at': ap.expires_at.isoformat(),
        'price':      str(ap.price),
    }


def on_booking_cancelled(booking):
    """Settle the pass side of a cancellation. Returns a short reason or None.

    Two cases, and they must not be confused:

      * the booking that BOUGHT the pass is cancelled → the money is being
        refunded, so the unused credits are VOIDED. Without this, cancelling
        a pass purchase returns most of the ₹35 and keeps the free visit.
      * a booking that SPENT a credit is cancelled → the credit comes back,
        provided the pass hasn't expired or been voided in the meantime.

    Best-effort by design: it runs after the cancellation is committed, and a
    failure here must never turn a successful cancellation into an error.
    """
    from payments.models import AppointmentPass

    if booking.appointment_pass_id is None:
        return None

    with transaction.atomic():
        ap = (AppointmentPass.objects
              .select_for_update()
              .filter(pk=booking.appointment_pass_id)
              .first())
        if ap is None:
            return None

        if ap.source_booking_id == booking.id:
            if ap.voided_at is not None:
                return 'already_voided'
            ap.voided_at = timezone.now()
            ap.save(update_fields=['voided_at'])
            reason = 'voided'
        else:
            if ap.used_bookings <= 0:
                return None
            ap.used_bookings -= 1
            ap.save(update_fields=['used_bookings'])
            reason = 'credit_restored'

    logger.info('Pass %s %s by cancellation of booking %s', ap.id, reason, booking.id)
    return reason
