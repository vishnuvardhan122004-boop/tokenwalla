"""
Runs off the EXISTING reminders cron, every 10 minutes — see
backend/railway.cron.json:

    python manage.py send_appointment_reminders; python manage.py send_pass_expiry_reminders

It rides along rather than having its own cron service on purpose. Railway
closed config-as-code to new services on 2026-08-28, so a dedicated service
could only be configured by hand in the dashboard, where the start command and
schedule live nowhere the repo can see them. Sharing a cron that is already
declared in this repo keeps the whole schedule reviewable in a PR.

`;` and not `&&`: a failure in the reminders run must not stop the nudge, and
both commands log their own completion line so the logs still say which ran.

Nudges patients holding an unused Appointment Pass visit three days before the
pass lapses. Push only — a WhatsApp version needs a new Meta template, which is
a manual submission (see ROADMAP item 14).

Idempotent through `expiry_reminder_sent`, so running every 10 minutes never
nudges a patient twice. One narrow query, and it writes nothing but that flag.
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import F
from django.utils import timezone

from notifications.push import push_pass_expiring
from payments.models import AppointmentPass

logger = logging.getLogger('tokenwalla')

REMIND_DAYS_BEFORE = 3


class Command(BaseCommand):
    help = 'Push a reminder for Appointment Passes expiring in ~3 days.'

    def handle(self, *args, **options):
        now = timezone.now()
        due = (AppointmentPass.objects
               .select_related('user')
               .filter(
                   voided_at__isnull=True,
                   expiry_reminder_sent=False,
                   # Still has something to spend, and hasn't already lapsed —
                   # nudging someone about a dead pass is worse than silence.
                   used_bookings__lt=F('total_bookings'),
                   expires_at__gt=now,
                   expires_at__lte=now + timedelta(days=REMIND_DAYS_BEFORE),
               ))

        sent = 0
        for ap in due:
            push_pass_expiring(ap)
            ap.expiry_reminder_sent = True
            ap.save(update_fields=['expiry_reminder_sent'])
            sent += 1

        msg = f'Pass expiry run complete. Nudged {sent} pass(es).'
        logger.info(msg)
        self.stdout.write(msg)
