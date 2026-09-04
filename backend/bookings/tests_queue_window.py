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
from bookings.serializers import build_queue_map
from bookings.views import QUEUE_LOOKAHEAD_DAYS, QUEUE_LOOKBACK_DAYS
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class QueueFixture:
    """Fixtures only — deliberately carries no test methods.

    The query-count classes below need this hospital/doctor/patient world, but
    NOT the parent's assertions: AdminListQueryCountTests authenticates as an
    admin, and inheriting the suite would re-run
    `test_another_hospitals_queue_is_still_forbidden` under a client for whom
    cross-hospital access is legitimately allowed. It would also re-run every
    window test once per subclass for nothing.
    """

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


class QueueWindowTests(QueueFixture, TestCase):
    """The original suite: the window is wide enough for every dashboard tab
    and narrow enough to bound the query."""

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


class QueueQueryCountTests(QueueFixture, TestCase):
    QUERY_BUDGET = 6
    """The queue must cost a FLAT number of queries, not one per patient.

    This endpoint is polled every 10 seconds by every reception desk that has
    the dashboard open, which makes it the busiest read in the product
    (CAPACITY.md §2). It was serialising without a `queue_map`, so
    BookingSerializer.get_queue_position took its slow path — one query per
    waiting patient — and `select_related` omitted hospital / scan /
    appointment_pass, which the serializer reads on every row.

    The assertion that matters is not the absolute number, it is that adding
    patients does not add queries. If this starts failing after a serializer
    change, the fix is to feed the new field through select_related — not to
    raise the number.
    """

    def test_query_count_does_not_grow_with_the_queue(self):
        for _ in range(3):
            self.book(days=0)
        with self.assertNumQueries(self.QUERY_BUDGET):
            self.get_queue()

        # Four times the patients, same query count.
        for _ in range(9):
            self.book(days=0)
        with self.assertNumQueries(self.QUERY_BUDGET):
            self.get_queue()

    def test_a_scan_booking_costs_no_extra_queries(self):
        from scans.models import Scan
        centre = Hospital.objects.create(
            name='Centre', city='Hyd', mobile='9000000077', password='x',
            status='active', kind=Hospital.SCAN_CENTER)
        scan = Scan.objects.create(
            center=centre, name='MRI Brain', modality='MRI', price=2000,
            slots=['09:00 AM'], days=['Mon'])
        for i in range(3):
            self._n += 1
            Booking.objects.create(
                user=self.patient, doctor=None, scan=scan,
                hospital=self.hospital, date=self.today, slot='09:00 AM',
                token=f'TW-QS{self._n}', status=Booking.CONFIRMED, amount=2000)

        with self.assertNumQueries(self.QUERY_BUDGET):
            self.get_queue()


class QueueMapShapeTests(QueueFixture, TestCase):
    """build_queue_map must accept whatever a view actually holds.

    It used to call `.values_list()` and `.filter()` on its argument, so it only
    worked for an un-sliced QuerySet. That silently excluded the two callers
    that needed it most — a paginator page is a LIST, and AdminReportsView holds
    a SLICE — and both quietly fell back to one query per row instead. These
    pin the three shapes so the constraint cannot come back.
    """

    def test_accepts_a_plain_list(self):
        a, b = self.book(days=0), self.book(days=0)
        qmap = build_queue_map([a, b])
        self.assertEqual(qmap[a.id], 1)
        self.assertEqual(qmap[b.id], 2)

    def test_accepts_a_sliced_queryset(self):
        self.book(days=0)
        self.book(days=0)
        sliced = Booking.objects.filter(hospital=self.hospital).order_by('created')[:2]
        self.assertEqual(len(build_queue_map(sliced)), 2)

    def test_accepts_a_queryset(self):
        self.book(days=0)
        self.assertEqual(len(build_queue_map(Booking.objects.all())), 1)

    def test_empty_input_costs_no_queries(self):
        with self.assertNumQueries(0):
            self.assertEqual(build_queue_map([]), {})

    def test_in_progress_is_position_zero(self):
        b = self.book(days=0, status=Booking.IN_PROGRESS)
        self.assertEqual(build_queue_map([b])[b.id], 0)

    def test_position_counts_patients_outside_the_page(self):
        # Three ahead of you, but only YOU are on this page. Your position must
        # still be 4 — the map is built from every CONFIRMED booking for the
        # provider, not just the rows handed in.
        for _ in range(3):
            self.book(days=0)
        mine = self.book(days=0)
        self.assertEqual(build_queue_map([mine])[mine.id], 4)


class AdminListQueryCountTests(QueueFixture, TestCase):
    """The admin list endpoints must not scale queries with rows either.

    HospitalQueueView was fixed first because it is polled; these two were left
    on the slow path because build_queue_map could not take their argument
    shape. AllBookingsView serialises up to 50 rows a page and AdminReportsView
    up to 500.
    """

    def setUp(self):
        super().setUp()
        self.admin = User.objects.create(
            username='adm', mobile='9000000099', role='admin', is_staff=True)
        self.client.force_authenticate(user=self.admin)

    def _budget(self, url, n):
        Booking.objects.all().delete()
        self._n = 0
        for _ in range(n):
            self.book(days=0)
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(url)
        self.assertEqual(res.status_code, 200, res.content)
        return len(ctx)

    def test_all_bookings_does_not_grow_with_rows(self):
        self.assertEqual(self._budget('/api/bookings/', 3),
                         self._budget('/api/bookings/', 15))

    def test_admin_reports_does_not_grow_with_rows(self):
        self.assertEqual(self._budget('/api/payment/reports/', 3),
                         self._budget('/api/payment/reports/', 15))
