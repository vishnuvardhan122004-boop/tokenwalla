"""
Run every ~10 minutes via Railway Cron Schedule:
    python manage.py send_appointment_reminders

Finds 'waiting' bookings whose slot starts in roughly 1h50m-2h10m from now
and haven't had a reminder sent yet, then sends + flags them.
"""
import logging
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.models import Booking
from notifications.whatsapp import send_appointment_reminder

logger = logging.getLogger('tokenwalla')

# Matches your DEFAULT_SLOTS format in Hdashboard.js, e.g. "09:00 AM"
SLOT_FORMAT = '%I:%M %p'


def _parse_slot_datetime(date_val, slot_str):
    """Combine a date and a '09:00 AM'-style slot string into an aware datetime."""
    try:
        time_part = datetime.strptime(slot_str.strip(), SLOT_FORMAT).time()
    except ValueError:
        return None
    naive = datetime.combine(date_val, time_part)
    return timezone.make_aware(naive, timezone.get_current_timezone())


class Command(BaseCommand):
    help = 'Send WhatsApp reminders for appointments starting in ~2 hours.'

    def handle(self, *args, **options):
        now = timezone.now()
        window_start = now + timedelta(hours=1, minutes=50)
        window_end   = now + timedelta(hours=2, minutes=10)

        candidates = (
            Booking.objects
            .filter(
                status='waiting',
                reminder_sent=False,
                date__in=[window_start.date(), window_end.date()],
            )
            .select_related('user', 'doctor', 'hospital')
        )

        sent_count = 0
        for booking in candidates:
            slot_dt = _parse_slot_datetime(booking.date, booking.slot)
            if slot_dt is None:
                logger.warning('[reminders] Could not parse slot "%s" for booking %s', booking.slot, booking.id)
                continue

            if window_start <= slot_dt <= window_end:
                try:
                    send_appointment_reminder(booking)
                    sent_count += 1
                except Exception as exc:
                    logger.exception('[reminders] Failed sending reminder for booking %s: %s', booking.id, exc)

        self.stdout.write(self.style.SUCCESS(f'Reminder run complete. Sent {sent_count} reminder(s).'))
