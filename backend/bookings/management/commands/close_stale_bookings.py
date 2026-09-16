"""
Run every ~15 minutes via Railway Cron Schedule:
    python manage.py close_stale_bookings

Two independent sweeps, both closing out bookings hospital staff left open
past a 2-hour window. Neither touches ON_HOLD — that is a staff-driven
skip/resume state (HoldBookingView) this command has no opinion about, and a
patient staff explicitly kept in the system should not be auto-no-showed.

  1. IN_PROGRESS for over STALE_HOURS -> COMPLETED. The patient was called in
     (`called_at` set by CallNextView / the QR-scan endpoint), so the visit
     almost certainly happened and staff simply never tapped Complete. Same
     terminal state and payout treatment as a manual Complete.
  2. CONFIRMED, never called (`called_at` still NULL), whose slot started over
     STALE_HOURS ago -> NO_SHOW. Mirrors NoShowView's own notifications, since
     from the patient's side this is exactly that: never called, never seen.

Both use a conditional UPDATE (the same pattern as bookings.views.
_claim_transition) so a staff action on the same booking in the same window
always wins — this command can only act on a booking still sitting in the
state it read, never overwrite a fresher human decision.
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.models import Booking
from bookings.utils import parse_slot_datetime
from notifications.push import push_booking_no_show
from notifications.whatsapp import send_booking_no_show

logger = logging.getLogger('tokenwalla')

STALE_HOURS = 2
# Bounds the CONFIRMED scan the same way HospitalQueueView bounds its own —
# a booking this old was never going to be called anyway.
LOOKBACK_DAYS = 7


class Command(BaseCommand):
    help = 'Auto-close bookings hospital staff left open past the 2h window.'

    def handle(self, *args, **options):
        now    = timezone.now()
        cutoff = now - timedelta(hours=STALE_HOURS)

        completed = (
            Booking.objects
            .filter(status=Booking.IN_PROGRESS, called_at__lte=cutoff)
            .update(status=Booking.COMPLETED)
        )

        candidates = (
            Booking.objects
            .filter(
                status=Booking.CONFIRMED,
                called_at__isnull=True,
                date__gte=(now - timedelta(days=LOOKBACK_DAYS)).date(),
                date__lte=now.date(),
            )
            .select_related('user', 'doctor', 'hospital')
        )

        no_shows = 0
        for booking in candidates:
            slot_dt = parse_slot_datetime(booking.date, booking.slot)
            if slot_dt is None or slot_dt > cutoff:
                continue

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
                logger.exception('[close_stale_bookings] notify failed for booking %s', booking.id)

        msg = (f'Closed {completed} stale in-progress booking(s), '
               f'marked {no_shows} stale confirmed booking(s) no-show.')
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
