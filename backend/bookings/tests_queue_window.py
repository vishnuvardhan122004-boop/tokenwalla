"""
The hospital queue is bounded to a date window.

It used to filter on hospital + status with no date bound and no pagination, so
every booking a hospital had ever taken came back on every poll — and the
dashboard polls every 10 seconds (CAPACITY.md §2).

The tests below pin the two things that could regress in opposite directions:
the window has to be small enough to bound the query, and wide enough that the
dashboard's Today / Tomorrow / All tabs all still have their data.

Run:  python manage.py test bookings.tests_queue_window
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from bookings.views import QUEUE_LOOKAHEAD_DAYS, QUEUE_LOOKBACK_DAYS
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class QueueWindowTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9000000003', fee=200, slots=['09:00 AM'])
        self.patient = User.objects.create(
            username='pat', mobile='9000000001', role='patient')
        # Hospital staff: the managed hospital id lives in User.last_name.
        self.staff = User.objects.create(
            username='staff', mobile='9000000004', role='hospital',
            last_name=str(self.hospital.id))
        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)
        self._n = 0

    def book(self, *, days, status=Booking.CONFIRMED):
        self._n += 1
        return Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=self.today + timedelta(days=days), slot='09:00 AM',
            token=f'TW-Q{self._n}', status=status, amount=200)

    def get_queue(self):
        res = self.client.get(f'/api/bookings/queue/{self.hospital.id}/')
        self.assertEqual(res.status_code, 200, res.content)
        return res.data

    def tokens(self, data):
        return {b['token'] for group in data.values() for b in group}

    # ── the window keeps the dashboard working ───────────────────────────────

    def test_today_is_included(self):
        b = self.book(days=0)
        self.assertIn(b.token, self.tokens(self.get_queue()))

    def test_tomorrow_is_included(self):
        """The dashboard has a Tomorrow tab — filtering to today alone would
        silently empty it."""
        b = self.book(days=1)
        self.assertIn(b.token, self.tokens(self.get_queue()))

    def test_recent_past_is_included_so_stale_bookings_can_be_closed_out(self):
        b = self.book(days=-1, status=Booking.ON_HOLD)
        self.assertIn(b.token, self.tokens(self.get_queue()))

    def test_every_status_group_is_present(self):
        self.book(days=0, status=Booking.CONFIRMED)
        self.book(days=0, status=Booking.ON_HOLD)
        self.book(days=0, status=Booking.IN_PROGRESS)
        self.book(days=0, status=Booking.COMPLETED)
        data = self.get_queue()
        self.assertEqual(len(data['waiting']), 1)
        self.assertEqual(len(data['onHold']), 1)
        self.assertEqual(len(data['inProgress']), 1)
        self.assertEqual(len(data['completed']), 1)

    # ── the window is actually bounded ───────────────────────────────────────

    def test_ancient_bookings_are_excluded(self):
        """The unbounded tail: an abandoned booking never leaves an active
        status by itself, so without a bound these accumulate forever."""
        old = self.book(days=-365, status=Booking.CONFIRMED)
        self.assertNotIn(old.token, self.tokens(self.get_queue()))

    def test_far_future_bookings_are_excluded(self):
        far = self.book(days=QUEUE_LOOKAHEAD_DAYS + 5)
        self.assertNotIn(far.token, self.tokens(self.get_queue()))

    def test_the_window_edges_are_inclusive(self):
        first = self.book(days=-QUEUE_LOOKBACK_DAYS)
        last  = self.book(days=QUEUE_LOOKAHEAD_DAYS)
        found = self.tokens(self.get_queue())
        self.assertIn(first.token, found)
        self.assertIn(last.token, found)

    def test_just_outside_the_window_is_dropped(self):
        before = self.book(days=-QUEUE_LOOKBACK_DAYS - 1)
        after  = self.book(days=QUEUE_LOOKAHEAD_DAYS + 1)
        found = self.tokens(self.get_queue())
        self.assertNotIn(before.token, found)
        self.assertNotIn(after.token, found)

    # ── access control is unchanged ──────────────────────────────────────────

    def test_another_hospitals_queue_is_still_forbidden(self):
        other = Hospital.objects.create(
            name='Other', city='Hyd', mobile='9000000009', password='x')
        res = self.client.get(f'/api/bookings/queue/{other.id}/')
        self.assertEqual(res.status_code, 403)
