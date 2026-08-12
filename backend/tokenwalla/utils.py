"""
tokenwalla/utils.py
Shared helpers used across apps.
"""
import re
from datetime import datetime, timedelta, date as date_cls
from django.utils import timezone

SLOT_TIME_FORMAT = '%I:%M %p'   # e.g. "09:00 AM", "12:30 PM"
BOOKING_CUTOFF_HOURS = 2        # slots within this window of "now" cannot be booked

# ── Phone numbers ────────────────────────────────────────────────────────────
# A mobile is the only thing SMS/WhatsApp can reach, so it stays strict and is
# what OTP, patient notifications and the doctor payout message all use.
# A landline is a display/call-me-back number ONLY — small clinics often have
# nothing else. Kept in its own column rather than loosening `mobile`, so no
# notification path can ever try to text a landline.
MOBILE_RE   = re.compile(r'^[6-9][0-9]{9}$')
LANDLINE_RE = re.compile(r'^0[1-9][0-9]{1,3}[- ]?[0-9]{6,8}$')


def is_valid_mobile(value) -> bool:
    return bool(MOBILE_RE.fullmatch((value or '').strip()))


def is_valid_landline(value) -> bool:
    """0 + STD code (1–4 more digits) + 6–8 digit number, optional - or space."""
    return bool(LANDLINE_RE.fullmatch((value or '').strip()))


def parse_slot_datetime(date_val, slot_str):
    """
    Combine a date (date object or 'YYYY-MM-DD' string) and a slot string
    like '09:00 AM' into a timezone-aware datetime in the server's TIME_ZONE.
    Returns None if either piece can't be parsed.
    """
    if isinstance(date_val, str):
        try:
            date_val = datetime.strptime(date_val, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return None

    if not isinstance(date_val, date_cls):
        return None

    try:
        time_part = datetime.strptime((slot_str or '').strip(), SLOT_TIME_FORMAT).time()
    except (ValueError, TypeError):
        return None

    naive = datetime.combine(date_val, time_part)
    return timezone.make_aware(naive, timezone.get_current_timezone())


def is_slot_bookable(date_val, slot_str, cutoff_hours=BOOKING_CUTOFF_HOURS):
    """
    A slot is only bookable if it starts at least `cutoff_hours` from now
    (server time, Asia/Kolkata). This naturally allows any slot on a future
    date and blocks anything on today's date that's too close / already past.

    Returns False (blocks the booking) if the slot can't be parsed at all —
    fail closed rather than silently allowing an unparseable slot through.
    """
    slot_dt = parse_slot_datetime(date_val, slot_str)
    if slot_dt is None:
        return False

    return slot_dt >= timezone.now() + timedelta(hours=cutoff_hours)