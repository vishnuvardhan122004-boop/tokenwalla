"""
Runs off the EXISTING reminders cron, every 10 minutes — see
backend/railway.cron.json:

    python manage.py send_appointment_reminders; python manage.py send_pass_expiry_reminders; python manage.py close_stale_bookings; python manage.py mark_daily_no_shows

It rides along rather than getting its own cron service on purpose: Railway
closed Config-as-Code to new services on 2026-08-28 (see ROADMAP item 14b and
send_pass_expiry_reminders, which hit this first), so a dedicated service
could only be configured by hand in the dashboard, where the start command
and schedule live nowhere the repo can see them. Sharing a cron that's
already declared here keeps the whole schedule reviewable in a PR. 10 minutes
instead of the originally-planned ~15 is fine — more frequent only shortens
how long a forgotten booking sits open, never a correctness concern.

Auto-completes an IN_PROGRESS booking 2 hours after it was called in
(`called_at`, stamped by CallNextView / the QR-scan endpoint) -> COMPLETED.
The patient was called, so the visit almost certainly happened and staff
simply never tapped Complete. Same terminal state and payout treatment as a
manual Complete.

Uses a conditional UPDATE (the same pattern as bookings.views.
_claim_transition) so a staff action on the same booking in the same window
always wins — this command can only act on a booking still sitting in the
state it read, never overwrite a fresher human decision.

The CONFIRMED-but-never-called case is deliberately NOT handled here — see
mark_daily_no_shows, a separate once-a-day job. A doctor running hours behind
can leave a patient genuinely still waiting near the 2h mark with no fault of
staff or the patient, so "this patient never showed" is only unambiguous once
the whole clinic day is over, not on a rolling few-hour clock. ON_HOLD is
untouched here for the same reason both commands leave it alone —
HoldBookingView is a deliberate staff action, not a forgotten booking.
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.models import Booking

logger = logging.getLogger('tokenwalla')

STALE_HOURS = 2


class Command(BaseCommand):
    help = 'Auto-complete IN_PROGRESS bookings staff left open past the 2h window.'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=STALE_HOURS)

        completed = (
            Booking.objects
            .filter(status=Booking.IN_PROGRESS, called_at__lte=cutoff)
            .update(status=Booking.COMPLETED)
        )

        msg = f'Closed {completed} stale in-progress booking(s).'
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
