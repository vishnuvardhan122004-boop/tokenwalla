"""
Run once a day, shortly after midnight, via Railway Cron Schedule:
    python manage.py mark_daily_no_shows

Marks CONFIRMED bookings from a day that has fully ended (`date` before
today, local time) that were never called in (`called_at` still NULL) ->
NO_SHOW. Mirrors NoShowView's own push + WhatsApp, since from the patient's
side this is exactly that: never called, never seen.

Run once after midnight, on the calendar day rolling over, rather than a
rolling couple of hours after the slot (the original design of this sweep):
a doctor running hours behind can leave a patient genuinely still waiting
near a 2h mark with no fault of staff or the patient, so "this patient never
showed" is only unambiguous once the whole clinic day is over. An
IN_PROGRESS booking staff forgot to close is a different problem — handled
far more frequently by close_stale_bookings, since that is about the live
queue, not attendance.

ON_HOLD is deliberately never touched here either, for the same reason
close_stale_bookings leaves it alone — HoldBookingView is a deliberate staff
action, not a forgotten booking.

Uses a conditional UPDATE (the same pattern as bookings.views.
_claim_transition) so a staff action on the same booking in the window
between midnight and this run always wins.
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.models import Booking
from notifications.push import push_booking_no_show
from notifications.whatsapp import send_booking_no_show

logger = logging.getLogger('tokenwalla')

# Bounds the scan the same way HospitalQueueView / close_stale_bookings bound
# theirs — a booking this old was never going to be called anyway.
LOOKBACK_DAYS = 7


class Command(BaseCommand):
    help = 'Mark yesterday-and-earlier CONFIRMED, never-called bookings as NO_SHOW.'

    def handle(self, *args, **options):
        today = timezone.localdate()

        candidates = (
            Booking.objects
            .filter(
                status=Booking.CONFIRMED,
                called_at__isnull=True,
                date__lt=today,
                date__gte=today - timedelta(days=LOOKBACK_DAYS),
            )
            .select_related('user', 'doctor', 'hospital')
        )

        no_shows = 0
        for booking in candidates:
            claimed = (
                Booking.objects
                .filter(pk=booking.pk, status=Booking.CONFIRMED)
                .update(status=Booking.NO_SHOW)
            )
            if not claimed:
                continue  # staff already acted on this booking

            booking.status = Booking.NO_SHOW
            no_shows += 1
            try:
                push_booking_no_show(booking)
                send_booking_no_show(booking)
            except Exception:
                logger.exception('[mark_daily_no_shows] notify failed for booking %s', booking.id)

        msg = f'Marked {no_shows} finished-day confirmed booking(s) as no-show.'
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
