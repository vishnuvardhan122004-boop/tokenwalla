"""
Slot-capacity enforcement on the money paths.

Before this, `max_per_slot` was consulted only by the read-only availability
endpoint, so the cap was effectively client-side: `_handle_new_booking` created
the booking after Razorpay captured the money and checked nothing but
`slot in doctor.slots`. Two patients racing for the last seat both paid and both
got a token (CAPACITY.md §1).

The tests that matter most here are the ones asserting that the patient's money
comes back when we can't seat them — an oversell that silently keeps the money
is the worst outcome in this codebase.

Run:  python manage.py test payments.tests_capacity
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.capacity import SlotUnavailable, check_slot_available
from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.fees import compute_fee_breakdown
from payments.models import Payment

User = get_user_model()

SLOT = '09:00 AM'


class CapacityMixin:
    def make_world(self, *, max_per_slot=1):
        self.tomorrow = timezone.localdate() + timedelta(days=2)
        self.user = User.objects.create(
            username='pat', mobile='9000000001', role='patient')
        self.other = User.objects.create(
            username='pat2', mobile='9000000005', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9000000003', fee=200, slots=[SLOT, '10:00 AM'],
            max_per_slot=max_per_slot,
            payment_collection_mode=Doctor.COLLECT_FULL)
        self._n = 0
        return self

    def seat(self, *, status=Booking.CONFIRMED, slot=SLOT, date=None):
        """Occupy a seat in the slot."""
        self._n += 1
        return Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=date or self.tomorrow, slot=slot, token=f'TW-CAP{self._n}',
            status=status, amount=200)


# ─────────────────────────────────────────────────────────────────────────────
# The rule itself
# ─────────────────────────────────────────────────────────────────────────────
class CapacityRuleTests(CapacityMixin, TestCase):

    def setUp(self):
        self.make_world(max_per_slot=2)

    def test_free_slot_is_available(self):
        check_slot_available(self.doctor, self.tomorrow, SLOT)   # no raise

    def test_full_slot_is_rejected(self):
        self.seat()
        self.seat()
        with self.assertRaises(SlotUnavailable) as ctx:
            check_slot_available(self.doctor, self.tomorrow, SLOT)
        self.assertEqual(ctx.exception.reason, 'full')

    def test_cancelled_and_no_show_free_the_seat(self):
        self.seat(status=Booking.CANCELLED)
        self.seat(status=Booking.NO_SHOW)
        check_slot_available(self.doctor, self.tomorrow, SLOT)   # still free

    def test_in_progress_still_occupies_a_seat(self):
        self.seat(status=Booking.CONFIRMED)
        self.seat(status=Booking.IN_PROGRESS)
        with self.assertRaises(SlotUnavailable):
            check_slot_available(self.doctor, self.tomorrow, SLOT)

    def test_capacity_is_per_slot_and_per_date(self):
        self.seat(); self.seat()
        check_slot_available(self.doctor, self.tomorrow, '10:00 AM')
        check_slot_available(
            self.doctor, self.tomorrow + timedelta(days=1), SLOT)

    @mock.patch('tokenwalla.utils.timezone.now')
    def test_slot_inside_the_2h_cutoff_is_rejected(self, m_now):
        """The cutoff was frontend-only — a direct API call ignored it.

        `now` is pinned rather than taken from the clock: an earlier version of
        this test used today's date with a 09:00 slot, which passes when the
        suite runs in the evening and fails when it runs before 07:00. A test
        whose result depends on what time you run it is worse than no test.
        """
        m_now.return_value = timezone.make_aware(datetime(2026, 8, 10, 8, 0))
        with self.assertRaises(SlotUnavailable) as ctx:
            check_slot_available(self.doctor, date(2026, 8, 10), SLOT)  # 09:00, 1h away
        self.assertEqual(ctx.exception.reason, 'too_soon')

    @mock.patch('tokenwalla.utils.timezone.now')
    def test_a_slot_exactly_at_the_cutoff_is_still_bookable(self, m_now):
        m_now.return_value = timezone.make_aware(datetime(2026, 8, 10, 8, 0))
        # 10:00 AM is exactly BOOKING_CUTOFF_HOURS away — the boundary is
        # inclusive, so this must be allowed.
        check_slot_available(self.doctor, date(2026, 8, 10), '10:00 AM')

    def test_unknown_slot_is_rejected(self):
        with self.assertRaises(SlotUnavailable) as ctx:
            check_slot_available(self.doctor, self.tomorrow, '11:45 PM')
        self.assertEqual(ctx.exception.reason, 'invalid_slot')


# ─────────────────────────────────────────────────────────────────────────────
# Before the money moves
# ─────────────────────────────────────────────────────────────────────────────
@mock.patch('payments.views.create_order', return_value={
    'order_id': 'order_x', 'key': 'rzp_test_key'})
class PrePaymentRejectionTests(CapacityMixin, TestCase):
    URL = '/api/payment/create-order/'

    def setUp(self):
        self.make_world(max_per_slot=1)
        self.client = APIClient()
        self.client.force_authenticate(user=self.other)

    def test_full_slot_never_reaches_the_gateway(self, m_create):
        self.seat()
        res = self.client.post(self.URL, {
            'doctorId': self.doctor.id, 'date': str(self.tomorrow), 'slot': SLOT,
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertIn('full', res.data['message'])
        m_create.assert_not_called()          # no order, so no money

    def test_free_slot_creates_the_order(self, m_create):
        res = self.client.post(self.URL, {
            'doctorId': self.doctor.id, 'date': str(self.tomorrow), 'slot': SLOT,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        m_create.assert_called_once()

    def test_older_clients_that_omit_date_and_slot_still_work(self, m_create):
        """The mobile app ships on its own release cycle and must not break."""
        self.seat()
        res = self.client.post(
            self.URL, {'doctorId': self.doctor.id}, format='json')
        self.assertEqual(res.status_code, 200)
        m_create.assert_called_once()


# ─────────────────────────────────────────────────────────────────────────────
# After the money moves — the part that must never keep a patient's money
# ─────────────────────────────────────────────────────────────────────────────
class OversellRefundTests(CapacityMixin, TestCase):
    URL = '/api/payment/verify/'

    def setUp(self):
        self.make_world(max_per_slot=1)
        self.client = APIClient()
        self.client.force_authenticate(user=self.other)
        self.breakdown = compute_fee_breakdown(Decimal('200'), 'FULL')

    def _verify(self):
        return self.client.post(self.URL, {
            'order_id': 'order_x',
            'booking': {
                'doctorId': self.doctor.id,
                'date': str(self.tomorrow),
                'slot': SLOT,
            },
        }, format='json')

    def _captured(self):
        """What confirm_order_paid returns for a genuinely captured order:
        (paid, payment_ref, amount_rupees, server-written order tags)."""
        return (
            True,
            'pay_race_1',
            self.breakdown['final_amount'],
            {
                'user_id': str(self.other.id), 'plan': 'booking',
                'doctor_id': str(self.doctor.id), 'doctor_fee': '200',
                'collection_mode': 'FULL',
            },
        )

    @mock.patch('payments.views.refund_payment', return_value={'id': 'rfnd_1'})
    @mock.patch('payments.views.confirm_order_paid')
    def test_losing_the_race_refunds_in_full_and_creates_no_booking(
            self, m_confirm, m_refund):
        m_confirm.return_value = self._captured()
        self.seat()                       # the winner took the only seat

        res = self._verify()

        self.assertEqual(res.status_code, 409)
        self.assertTrue(res.data['refunded'])
        self.assertIn('refunded', res.data['message'])
        # The whole captured amount comes back — not the tiered cancellation
        # refund. The patient did nothing wrong and got no appointment.
        args = m_refund.call_args[0]
        self.assertEqual(args[0], 'pay_race_1')
        self.assertEqual(args[1], self.breakdown['final_amount'])
        # Nothing was written.
        self.assertEqual(Booking.objects.filter(user=self.other).count(), 0)
        self.assertEqual(Payment.objects.filter(payment_id='pay_race_1').count(), 0)

    @mock.patch('payments.views.refund_payment', side_effect=Exception('gateway down'))
    @mock.patch('payments.views.confirm_order_paid')
    def test_a_failed_refund_is_reported_honestly_not_swallowed(
            self, m_confirm, _m_refund):
        m_confirm.return_value = self._captured()
        self.seat()

        with self.assertLogs('tokenwalla', level='ERROR') as logs:
            res = self._verify()

        self.assertEqual(res.status_code, 409)
        self.assertFalse(res.data['refunded'])
        # The patient is told the truth, and the log tells staff to act.
        self.assertIn('24 hours', res.data['message'])
        self.assertTrue(any('REFUND THIS BY HAND' in line for line in logs.output))

    @mock.patch('payments.views.refund_payment')
    @mock.patch('payments.views.confirm_order_paid')
    def test_a_seat_that_is_actually_free_books_normally(
            self, m_confirm, m_refund):
        m_confirm.return_value = self._captured()
        res = self._verify()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])
        m_refund.assert_not_called()
        self.assertEqual(Booking.objects.filter(user=self.other).count(), 1)


# ─────────────────────────────────────────────────────────────────────────────
# The race itself
# ─────────────────────────────────────────────────────────────────────────────
class ConcurrentBookingTests(CapacityMixin, TestCase):
    """Two patients, one seat. Exactly one may end up with a booking.

    SQLite serialises writers, so this asserts the ordering guarantee rather
    than true parallelism: the second attempt, run after the first has
    committed inside the same locked flow, must see the first and be rejected.
    The production guarantee comes from the row lock in
    check_slot_available_locked — see the docstring there for why the lock is
    on the doctor row and not on the booking rows (phantom inserts).
    """

    def setUp(self):
        self.make_world(max_per_slot=1)

    def _attempt(self, user, token):
        from bookings.capacity import check_slot_available_locked
        try:
            with transaction.atomic():
                doctor = check_slot_available_locked(
                    self.doctor.id, self.tomorrow, SLOT)
                Booking.objects.create(
                    user=user, doctor=doctor, hospital=self.hospital,
                    date=self.tomorrow, slot=SLOT, token=token,
                    status=Booking.CONFIRMED, amount=200)
            return True
        except SlotUnavailable:
            return False

    def test_only_one_of_two_bookings_for_the_last_seat_succeeds(self):
        first = self._attempt(self.user, 'TW-RACE-1')
        second = self._attempt(self.other, 'TW-RACE-2')

        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(
            Booking.objects.filter(doctor=self.doctor, date=self.tomorrow,
                                   slot=SLOT, status=Booking.CONFIRMED).count(),
            1)

    def test_the_rejected_attempt_leaves_nothing_behind(self):
        self._attempt(self.user, 'TW-RACE-1')
        self._attempt(self.other, 'TW-RACE-2')
        self.assertFalse(Booking.objects.filter(token='TW-RACE-2').exists())


class LockedCheckGuardTests(CapacityMixin, TransactionTestCase):
    """The lock is the whole point: running the check unlocked would give false
    confidence against exactly the race it exists to stop, so it refuses.

    TransactionTestCase, not TestCase — TestCase wraps every test in an atomic
    block, which would make the guard pass vacuously.
    """

    def test_locked_check_refuses_to_run_outside_a_transaction(self):
        from bookings.capacity import check_slot_available_locked
        self.make_world(max_per_slot=1)
        with self.assertRaises(RuntimeError):
            check_slot_available_locked(self.doctor.id, self.tomorrow, SLOT)

    def test_inside_a_transaction_it_runs(self):
        from bookings.capacity import check_slot_available_locked
        self.make_world(max_per_slot=1)
        with transaction.atomic():
            doctor = check_slot_available_locked(
                self.doctor.id, self.tomorrow, SLOT)
        self.assertEqual(doctor.id, self.doctor.id)
