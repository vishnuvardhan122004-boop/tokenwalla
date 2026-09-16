"""
Once-daily sweep: a CONFIRMED booking from a day that has fully ended, never
called in, becomes NO_SHOW (`manage.py mark_daily_no_shows`).

Dates are always computed relative to `timezone.localdate()` (never
hard-coded — see CLAUDE.md's dated-literal trap), so this suite is safe to
run on any day.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from notifications.models import WhatsAppLog

User = get_user_model()


class MarkDailyNoShowsFixture(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000007000', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9000007001', fee=200, slots=['09:00 AM'])
        self.patient = User.objects.create(
            username='pat-noshow', mobile='9000007002', role='patient')

    def make_booking(self, status, date, called_at=None):
        return Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=date, slot='09:00 AM', token=f'TW-NS-{Booking.objects.count()}',
            status=status, called_at=called_at,
        )


class DailyNoShowSweepTests(MarkDailyNoShowsFixture):
    def test_confirmed_from_a_finished_day_never_called_becomes_no_show(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        b = self.make_booking(Booking.CONFIRMED, date=yesterday)
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.NO_SHOW)
        # The same notifications NoShowView sends by hand — proves the sweep
        # actually reaches the patient, not just flips a column.
        self.assertTrue(
            WhatsAppLog.objects.filter(booking=b, event_type='booking_no_show').exists())

    def test_confirmed_today_is_untouched(self):
        """Today isn't over yet — a doctor running behind can still call this
        patient before midnight, so it must not be swept mid-day."""
        today = timezone.localdate()
        b = self.make_booking(Booking.CONFIRMED, date=today)
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_confirmed_future_date_is_untouched(self):
        tomorrow = timezone.localdate() + timedelta(days=1)
        b = self.make_booking(Booking.CONFIRMED, date=tomorrow)
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_on_hold_is_never_auto_no_showed(self):
        """ON_HOLD is a deliberate staff action (HoldBookingView) — a patient
        staff explicitly kept in the system must not be swept just because
        the original day is long over."""
        old_date = timezone.localdate() - timedelta(days=2)
        b = self.make_booking(Booking.ON_HOLD, date=old_date)
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.ON_HOLD)

    def test_already_called_confirmed_is_not_swept(self):
        """Can't actually happen in practice (calling moves status to
        IN_PROGRESS), but the filter is called_at__isnull=True regardless of
        status, so pin the guard directly."""
        yesterday = timezone.localdate() - timedelta(days=1)
        b = self.make_booking(Booking.CONFIRMED, date=yesterday,
                               called_at=timezone.now() - timedelta(days=1))
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_confirmed_older_than_the_lookback_window_is_not_swept(self):
        """Bounds the scan the same way HospitalQueueView / close_stale_bookings
        bound theirs — a booking this old was never going to be called
        anyway, and letting this go unbounded would grow into a full-table
        scan on every run."""
        old_date = timezone.localdate() - timedelta(days=30)
        b = self.make_booking(Booking.CONFIRMED, date=old_date)
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)

    def test_terminal_statuses_are_never_touched(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        cancelled = self.make_booking(Booking.CANCELLED, date=yesterday)
        completed = self.make_booking(Booking.COMPLETED, date=yesterday)
        no_show   = self.make_booking(Booking.NO_SHOW,   date=yesterday)
        call_command('mark_daily_no_shows')
        cancelled.refresh_from_db()
        completed.refresh_from_db()
        no_show.refresh_from_db()
        self.assertEqual(cancelled.status, Booking.CANCELLED)
        self.assertEqual(completed.status, Booking.COMPLETED)
        self.assertEqual(no_show.status, Booking.NO_SHOW)

    def test_in_progress_is_never_touched_by_this_command(self):
        """The stale-IN_PROGRESS case belongs to close_stale_bookings, not
        this one."""
        yesterday = timezone.localdate() - timedelta(days=1)
        b = self.make_booking(Booking.IN_PROGRESS, date=yesterday,
                               called_at=timezone.now() - timedelta(days=1))
        call_command('mark_daily_no_shows')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.IN_PROGRESS)
