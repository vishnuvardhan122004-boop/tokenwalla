"""
backend/bookings/capacity.py

Whether a doctor's slot can take one more booking.

Until now `max_per_slot` was only ever consulted by the read-only
`/slot-availability/` endpoint the UI uses to grey out full slots — which means
the cap was effectively client-side. `payments/views.py:_handle_new_booking`
created the booking *after* Razorpay captured the money and checked nothing but
`slot in doctor.slots`, so two patients racing for the last seat both paid and
both got a token. See CAPACITY.md §1.

This module is the single definition both money paths now share, and it matches
the one `slot_availability` and the reschedule path already use:

    booked = CONFIRMED + IN_PROGRESS for (doctor, date, slot)
    full   = booked >= doctor.max_per_slot

`BOOKING_CUTOFF_HOURS` is enforced here too — it was also frontend-only, so a
direct API call could book a slot that had already started.
"""
import logging

from django.db import transaction

from tokenwalla.utils import is_slot_bookable

logger = logging.getLogger('tokenwalla')

# Statuses that occupy a seat. A cancelled or no-show booking frees it; a
# completed one is in the past and no longer contends for today's capacity.
OCCUPYING_STATUSES = ('CONFIRMED', 'IN_PROGRESS')


class SlotUnavailable(Exception):
    """This slot cannot take the booking. `.message` is patient-facing."""

    def __init__(self, message, *, reason):
        super().__init__(message)
        self.message = message
        self.reason = reason        # 'full' | 'too_soon' | 'invalid_slot'


def _booked_count(doctor_id, date_val, slot_val, exclude_pk=None):
    from bookings.models import Booking

    qs = Booking.objects.filter(
        doctor_id=doctor_id, date=date_val, slot=slot_val,
        status__in=OCCUPYING_STATUSES,
    )
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    return qs.count()


def check_slot_available(doctor, date_val, slot_val, *, exclude_pk=None):
    """Raise SlotUnavailable if this slot can't take another booking.

    Read-only and unlocked — use before taking any money, so the common
    collision is a clean rejection with no payment involved. For the
    after-capture backstop use `check_slot_available_locked`, which closes the
    race this one cannot.
    """
    if slot_val not in (doctor.slots or []):
        raise SlotUnavailable(
            'Invalid slot for this doctor.', reason='invalid_slot')

    if not is_slot_bookable(date_val, slot_val):
        raise SlotUnavailable(
            f'Slot "{slot_val}" is no longer bookable — it starts too soon. '
            f'Please pick a later slot.',
            reason='too_soon')

    if _booked_count(doctor.id, date_val, slot_val, exclude_pk) >= doctor.max_per_slot:
        raise SlotUnavailable(
            f'Slot "{slot_val}" on {date_val} is full. Please pick another slot.',
            reason='full')


def check_slot_available_locked(doctor_id, date_val, slot_val, *, exclude_pk=None):
    """The same check, serialised against concurrent bookings. Returns the Doctor.

    MUST be called inside `transaction.atomic()`.

    Locking the *doctor row* rather than the matching bookings is deliberate.
    `SELECT ... FOR UPDATE` on the booking rows only locks rows that already
    exist, so two concurrent INSERTs for the last seat would both count N-1 and
    both succeed — the phantom-insert case, which is exactly the race we're
    trying to close. Taking a row lock on the doctor serialises every booking
    attempt for that doctor: the second transaction blocks until the first
    commits, then counts it and is correctly rejected.

    Contention is per doctor, which is the right granularity — two patients
    booking different doctors never wait on each other.
    """
    from doctors.models import Doctor

    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError(
            'check_slot_available_locked must run inside transaction.atomic()')

    doctor = Doctor.objects.select_for_update().select_related('hospital').get(pk=doctor_id)
    check_slot_available(doctor, date_val, slot_val, exclude_pk=exclude_pk)
    return doctor
