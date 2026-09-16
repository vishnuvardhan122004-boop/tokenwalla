"""
Auto-close: a stale IN_PROGRESS booking becomes COMPLETED (`manage.py
close_stale_bookings`). The CONFIRMED-but-never-called -> NO_SHOW sweep is a
separate, once-daily job — see tests_mark_daily_no_shows.py.

Also covers the two write sites that make the IN_PROGRESS sweep possible
(`CallNextView`, `ScanQRView.post` — both set `called_at`), since the whole
feature only works if `called_at` is actually written.
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

User = get_user_model()


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

    def test_confirmed_is_never_touched_by_this_command(self):
        """The never-called CONFIRMED case belongs to mark_daily_no_shows,
        not this one — regardless of how stale it is."""
        b = self.make_booking(Booking.CONFIRMED,
                               date=timezone.localdate() - timedelta(days=3))
        call_command('close_stale_bookings')
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.CONFIRMED)


class CalledAtIsWrittenTests(CloseStaleBookingsFixture):
    """Both sweeps only work if the two hospital-facing endpoints that move a
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
