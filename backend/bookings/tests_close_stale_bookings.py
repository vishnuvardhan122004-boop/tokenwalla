"""
Auto-close: a stale IN_PROGRESS booking becomes COMPLETED, a stale never-called
CONFIRMED booking becomes NO_SHOW. Both the cron
(`manage.py close_stale_bookings`) and the two write sites that make the sweep
possible (`CallNextView`, `ScanQRView.post` — both set `called_at`) are covered
here, since the whole feature only works if `called_at` is actually written.

Dates/times are always computed relative to `timezone.now()` (never
hard-coded — see CLAUDE.md's dated-literal trap) via `slot_in()`, which mirrors
the same helper in tests_cutoff.py.
"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from notifications.models import WhatsAppLog

User = get_user_model()


def slot_in(hours):
    """A (date, slot) pair `hours` from now, on the hour so it round-trips
    through parse_slot_datetime exactly."""
    when = timezone.localtime(timezone.now() + timedelta(hours=hours))
    return when.date(), when.strftime('%I:%M %p').lstrip('0').rjust(8, '0')


class CloseStaleBookingsFixture(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000005000', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9000005001', fee=200, slots=['09:00 AM'])
        self.patient = User.objects.create(
            username='pat-stale', mobile='9000005002', role='patient')

    def make_booking(self, status, date=None, slot='09:00 AM', called_at=None):
        if date is None:
            date = timezone.localdate()
        return Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=date, slot=slot, token=f'TW-{Booking.objects.count()}',
            status=status, called_at=called_at,
        )


class InProgressSweepTests(CloseStaleBookingsFixture):
    def test_in_progress_over_two_hours_is_completed(self):
        b = self.make_booking(Booking.IN_PROGRESS,
                               called_at=timezone.now() - timedelta(hours=3))
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.COMPLETED)

    def test_in_progress_under_two_hours_is_untouched(self):
        b = self.make_booking(Booking.IN_PROGRESS,
                               called_at=timezone.now() - timedelta(minutes=30))
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.IN_PROGRESS)

    def test_legacy_in_progress_with_no_called_at_is_never_swept(self):
        """A row from before this migration has called_at=NULL. NULL never
        satisfies `called_at__lte=cutoff`, so it is left for staff to close by
        hand rather than guessed at from an arbitrary anchor."""
        b = self.make_booking(Booking.IN_PROGRESS, called_at=None)
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.IN_PROGRESS)


class ConfirmedSweepTests(CloseStaleBookingsFixture):
    def test_confirmed_never_called_two_hours_past_slot_becomes_no_show(self):
        date, slot = slot_in(-3)
        b = self.make_booking(Booking.CONFIRMED, date=date, slot=slot)
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.NO_SHOW)
        # The same notifications NoShowView sends by hand — proves the sweep
        # actually reaches the patient, not just flips a column.
        self.assertTrue(
            WhatsAppLog.objects.filter(booking=b, event_type='booking_no_show').exists())

    def test_confirmed_within_two_hours_of_slot_is_untouched(self):
        date, slot = slot_in(-1)
        b = self.make_booking(Booking.CONFIRMED, date=date, slot=slot)
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_confirmed_future_slot_is_untouched(self):
        date, slot = slot_in(3)
        b = self.make_booking(Booking.CONFIRMED, date=date, slot=slot)
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_on_hold_is_never_auto_no_showed(self):
        """ON_HOLD is a deliberate staff action (HoldBookingView) - a patient
        staff explicitly kept in the system must not be swept just because the
        original slot is long past."""
        date, slot = slot_in(-6)
        b = self.make_booking(Booking.ON_HOLD, date=date, slot=slot)
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.ON_HOLD)

    def test_confirmed_older_than_the_lookback_window_is_not_swept(self):
        """Bounds the scan the same way HospitalQueueView bounds its own -
        a booking this old was never going to be called anyway, and letting
        this go unbounded would grow into a full-table scan on every run."""
        old_date = timezone.localdate() - timedelta(days=30)
        b = self.make_booking(Booking.CONFIRMED, date=old_date, slot='09:00 AM')
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_terminal_statuses_are_never_touched(self):
        date, slot = slot_in(-6)
        cancelled = self.make_booking(Booking.CANCELLED, date=date, slot=slot)
        completed = self.make_booking(Booking.COMPLETED, date=date, slot=slot)
        no_show   = self.make_booking(Booking.NO_SHOW,   date=date, slot=slot)
        call_command('close_stale_bookings')
        cancelled.refresh_from_db()
        completed.refresh_from_db()
        no_show.refresh_from_db()
        self.assertEqual(cancelled.status, Booking.CANCELLED)
        self.assertEqual(completed.status, Booking.COMPLETED)
        self.assertEqual(no_show.status, Booking.NO_SHOW)


class CalledAtIsWrittenTests(CloseStaleBookingsFixture):
    """The cron only works if the two hospital-facing endpoints that move a
    booking into IN_PROGRESS actually stamp `called_at` — otherwise every
    booking looks like the "never called" case forever."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.staff = User.objects.create(
            username='staff-stale', mobile='9000005003', role='hospital',
            last_name=str(self.hospital.id))

    @mock.patch('bookings.views._whatsapp_async', lambda *a, **k: None)
    def test_call_next_sets_called_at(self):
        b = self.make_booking(Booking.CONFIRMED)
        self.client.force_authenticate(self.staff)
        r = self.client.patch(f'/api/bookings/call/{b.id}/')
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.IN_PROGRESS)
        self.assertIsNotNone(b.called_at)

    @mock.patch('bookings.views._whatsapp_async', lambda *a, **k: None)
    def test_qr_scan_sets_called_at(self):
        b = self.make_booking(Booking.CONFIRMED)
        self.client.force_authenticate(self.staff)
        r = self.client.post(f'/api/bookings/scan/{b.token}/')
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.IN_PROGRESS)
        self.assertIsNotNone(b.called_at)
