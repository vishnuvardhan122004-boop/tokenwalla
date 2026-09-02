"""
Run hourly via Railway Cron Schedule:
    python manage.py send_pass_expiry_reminders

Nudges patients holding an unused Appointment Pass visit three days before the
pass lapses. Push only — a WhatsApp version needs a new Meta template, which is
a manual submission (see ROADMAP item 14).

Idempotent through `expiry_reminder_sent`, so the schedule can be as frequent
as you like without a patient ever being nudged twice. Runs in one query and
touches nothing but that flag.
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
