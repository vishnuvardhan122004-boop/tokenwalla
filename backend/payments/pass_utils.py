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
from datetime import timedelta

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


# A credit handed back into a pass that has already lapsed is worth nothing, so
# a late cancellation reopens the window by this much — once (see EXTEND below).
LATE_CANCEL_EXTENSION_DAYS = 7


def on_booking_cancelled(booking):
    """Settle the pass side of a cancellation.

    Returns None for an ordinary booking, otherwise a dict the notifications
    read so the patient is told what actually happened to their pass:

        {'result': 'credit_restored' | 'voided' | 'already_voided',
         'remaining': int, 'expires_at': iso str, 'extended': bool}

    Two cases, and they must not be confused:

      * the booking that BOUGHT the pass is cancelled → the money is being
        refunded (for the unused share — see refunds.unused_pass_share), so the
        unused credits are VOIDED. Without this, cancelling a pass purchase
        returns money for a visit and leaves the visit standing.
      * a booking that SPENT a credit is cancelled → the credit comes back.
        If the pass has already lapsed the credit would be dead on arrival, so
        the window reopens for LATE_CANCEL_EXTENSION_DAYS. Stamped in
        `expiry_extended_at` so it happens at most once: the credit count never
        grows, but without the stamp a book-and-cancel loop could keep a pass
        alive indefinitely, and expiry is where this promotion earns.

    Best-effort by design: it runs after the cancellation is committed, and a
    failure here must never turn a successful cancellation into an error.
    """
    from payments.models import AppointmentPass

    if booking.appointment_pass_id is None:
        return None

    extended = False
    with transaction.atomic():
        ap = (AppointmentPass.objects
              .select_for_update()
              .filter(pk=booking.appointment_pass_id)
              .first())
        if ap is None:
            return None

        if ap.source_booking_id == booking.id:
            if ap.voided_at is not None:
                result = 'already_voided'
            else:
                ap.voided_at = timezone.now()
                ap.save(update_fields=['voided_at'])
                result = 'voided'
        elif ap.used_bookings <= 0:
            return None
        else:
            now = timezone.now()
            ap.used_bookings -= 1
            fields = ['used_bookings']
            if (ap.voided_at is None
                    and ap.expires_at <= now
                    and ap.expiry_extended_at is None):
                ap.expires_at = now + timedelta(days=LATE_CANCEL_EXTENSION_DAYS)
                ap.expiry_extended_at = now
                fields += ['expires_at', 'expiry_extended_at']
                extended = True
            ap.save(update_fields=fields)
            result = 'credit_restored'

    logger.info('Pass %s %s by cancellation of booking %s%s',
                ap.id, result, booking.id, ' (window reopened)' if extended else '')
    return {
        'result':     result,
        'remaining':  ap.remaining if ap.voided_at is None else 0,
        'expires_at': ap.expires_at.isoformat(),
        'extended':   extended,
    }


def cancellation_line(pass_result) -> str:
    """One sentence about what the cancellation did to the patient's pass.

    Shared by the push and the WhatsApp message so the two can't drift, and so
    a ₹0 pass visit never gets told "no refund was due" and nothing else —
    which is true about the money and silent about the thing that matters.

    Empty string for an ordinary booking.
    """
    if not pass_result:
        return ''
    result = pass_result.get('result')
    if result == 'credit_restored':
        left = pass_result.get('remaining', 0)
        visits = 'visit' if left == 1 else 'visits'
        line = f'This visit is back on your Appointment Pass ({left} {visits} left)'
        if pass_result.get('extended'):
            line += ', and the pass has been reopened for 7 days'
        return line + '.'
    if result in ('voided', 'already_voided'):
        return ('Your Appointment Pass ended with this booking, so the remaining '
                'free visit is no longer available.')
    return ''
