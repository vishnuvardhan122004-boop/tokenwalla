"""
backend/bookings/utils.py

Small, model-free helpers shared across the bookings app (and by the payments
refund logic). Kept import-light so it's safe to import from models.py without
risking a circular import.
"""
from datetime import datetime

from django.utils import timezone

# Matches the DEFAULT_SLOTS format used in the hospital dashboard, e.g. "09:00 AM".
SLOT_FORMAT = '%I:%M %p'


def parse_slot_datetime(date_val, slot_str):
    """Combine a date and a '09:00 AM'-style slot string into an aware datetime.

    Returns an `Asia/Kolkata` (settings.TIME_ZONE) aware datetime, or None if
    either input is missing or the slot can't be parsed. Single source of truth
    for turning a booking's (date, slot) into a real point in time — reused by
    the reminder cron and the cancellation-refund tier calculation.
    """
    if not date_val or not slot_str:
        return None
    try:
        time_part = datetime.strptime(str(slot_str).strip(), SLOT_FORMAT).time()
    except (ValueError, TypeError):
        return None
    naive = datetime.combine(date_val, time_part)
    return timezone.make_aware(naive, timezone.get_current_timezone())
