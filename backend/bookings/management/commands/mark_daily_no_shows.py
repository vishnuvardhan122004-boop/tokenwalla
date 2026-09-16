"""
Runs off the EXISTING reminders cron, every 10 minutes — see
backend/railway.cron.json:

    python manage.py send_appointment_reminders; python manage.py send_pass_expiry_reminders; python manage.py close_stale_bookings; python manage.py mark_daily_no_shows

Despite the name, this does NOT need its own once-a-day schedule to behave
like a once-a-day sweep: the `date__lt=today` filter below is the thing that
makes "yesterday and earlier" true, not the cron cadence. Running this every
10 minutes finds nothing to do on 143 of 144 runs a day and does the real
sweep within 10 minutes of the calendar date rolling over — tighter than a
fixed midnight-plus-offset schedule would have been, at zero extra cost.

It rides along rather than getting its own cron service for the same reason
close_stale_bookings does: Railway closed Config-as-Code to new services on
2026-08-28 (see ROADMAP item 14b and send_pass_expiry_reminders, which hit
this first), so a dedicated service could only be configured by hand in the
dashboard, where the start command and schedule live nowhere the repo can
see them. Sharing a cron that's already declared here keeps the whole
schedule reviewable in a PR.

Marks CONFIRMED bookings from a day that has fully ended (`date` before
today, local time) that were never called in (`called_at` still NULL) ->
NO_SHOW. Mirrors NoShowView's own push + WhatsApp, since from the patient's
side this is exactly that: never called, never seen.

Keyed on the calendar day rolling over rather than a rolling couple of hours
after the slot (the original design of this sweep, corrected before this
shipped): a doctor running hours behind can leave a patient genuinely still
waiting near a 2h mark with no fault of staff or the patient, so "this
patient never showed" is only unambiguous once the whole clinic day is over.
An IN_PROGRESS booking staff forgot to close is a different problem — that's
close_stale_bookings, since that is about the live queue, not attendance.

ON_HOLD is deliberately never touched here either, for the same reason
close_stale_bookings leaves it alone — HoldBookingView is a deliberate staff
action, not a forgotten booking.

Uses a conditional UPDATE (the same pattern as bookings.views.
_claim_transition) so a staff action on the same booking between one run and
the next always wins.
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
