"""
Tests for the daily ops summary (payments/daily_ops.py + DailyOpsSummaryView).

This is the screen Vishnu reads before deciding how to spend the day, so the
tests care about two things above all:

  * the numbers are right, and money owed onward is never counted as revenue
  * the summary NEVER writes anything — payouts are manual by design, and a
    "report" that mutates state would break that

Run:  python manage.py test payments.tests_daily_ops
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.daily_ops import build_daily_summary
from payments.fees import compute_fee_breakdown
from payments.models import DoctorLedger, Payment, PayoutBatch

User = get_user_model()


class DailyOpsMixin:
    """Minimal world: one hospital, one payable doctor, helpers to add rows."""

    def make_world(self):
        self.today = timezone.localdate()
        self.user = User.objects.create(
            username='pat', mobile='9000000001', role='patient')
        self.admin = User.objects.create(
            username='boss', mobile='9000000009', role='admin')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9000000003', fee=200, slots=['09:00 AM'],
            payment_collection_mode=Doctor.COLLECT_FULL,
            bank_account_number='00111122233', ifsc='HDFC0000001')
        self._n = 0
        return self

    def add_booking(self, *, status=Booking.COMPLETED, date=None,
                    payout=Booking.PAYOUT_PENDING, doctor=None, paid=True):
        self._n += 1
        booking = Booking.objects.create(
            user=self.user, doctor=doctor or self.doctor, hospital=self.hospital,
            date=date or self.today, slot='09:00 AM',
            token=f'TW-D{self._n}', status=status, amount=200,
            doctor_payout_status=payout)
        bd = compute_fee_breakdown(Decimal('200'), 'FULL')
        Payment.objects.create(
            booking=booking, order_id=f'order_{self._n}',
            payment_id=f'pay_{self._n}', amount=int(bd['final_amount']),
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'],
            status=Payment.PAID if paid else Payment.CREATED)
        return booking

    def add_ledger(self, amount, *, doctor=None, days_ago=0, batch=None):
        entry = DoctorLedger.objects.create(
            doctor=doctor or self.doctor, amount=Decimal(amount),
            reason=DoctorLedger.BOOKING_COMPLETED, payout_batch=batch)
        if days_ago:
            # created_at is auto_now_add, so age it with an UPDATE.
            DoctorLedger.objects.filter(pk=entry.pk).update(
                created_at=timezone.now() - timedelta(days=days_ago))
            entry.refresh_from_db()
        return entry


# ─────────────────────────────────────────────────────────────────────────────
# The numbers
# ─────────────────────────────────────────────────────────────────────────────
class DailyNumbersTests(DailyOpsMixin, TestCase):

    def test_empty_day_is_all_clear_and_zeroed(self):
        self.make_world()
        s = build_daily_summary()
        self.assertTrue(s['all_clear'])
        self.assertEqual(s['attention'], [])
        self.assertEqual(s['bookings']['total'], 0)
        self.assertEqual(s['collected']['gross'], '0.00')
        self.assertEqual(s['payouts']['total_owed'], '0.00')

    def test_bookings_counted_by_status_for_today_only(self):
        self.make_world()
        self.add_booking(status=Booking.COMPLETED)
        self.add_booking(status=Booking.CONFIRMED)
        self.add_booking(status=Booking.NO_SHOW)
        self.add_booking(status=Booking.COMPLETED,
                         date=self.today - timedelta(days=1))  # yesterday
        s = build_daily_summary()
        self.assertEqual(s['bookings']['total'], 3)
        self.assertEqual(s['bookings']['completed'], 1)
        self.assertEqual(s['bookings']['confirmed'], 1)
        self.assertEqual(s['bookings']['no_show'], 1)

    def test_money_owed_onward_is_not_counted_as_revenue(self):
        """The number that must never be wrong.

        Gross is what landed in the account. TokenWalla only keeps the service
        fee — the doctor's fee is owed to the doctor and GST is owed to the
        government. Confusing gross with revenue is how a payout goes wrong.
        """
        self.make_world()
        self.add_booking()
        s = build_daily_summary()['collected']
        # 200 doctor + 20 platform + 1.50 gateway + 3.87 GST
        self.assertEqual(s['gross'], '225.37')
        self.assertEqual(s['doctor_fees'], '200.00')
        self.assertEqual(s['gst'], '3.87')
        self.assertEqual(s['tokenwalla_revenue'], '21.50')   # platform + gateway
        # Gross reconciles exactly — no rupee is unaccounted for.
        self.assertEqual(
            Decimal(s['doctor_fees']) + Decimal(s['tokenwalla_revenue'])
            + Decimal(s['gst']),
            Decimal(s['gross']))

    def test_unpaid_payments_are_not_counted_as_collected(self):
        self.make_world()
        self.add_booking(paid=False)
        self.assertEqual(build_daily_summary()['collected']['gross'], '0.00')

    def test_owed_sums_unbatched_ledger_and_ignores_paid_rows(self):
        self.make_world()
        self.add_ledger('200')
        self.add_ledger('150')
        batch = PayoutBatch.objects.create(
            doctor=self.doctor, total_amount=Decimal('99'),
            payout_mode=PayoutBatch.IMPS, status=PayoutBatch.PROCESSED,
            idempotency_key='manual_test_1')
        self.add_ledger('99', batch=batch)          # already wired — excluded
        p = build_daily_summary()['payouts']
        self.assertEqual(p['total_owed'], '350.00')
        self.assertEqual(p['doctors_owed'], 1)

    def test_clawbacks_net_off_what_is_owed(self):
        self.make_world()
        self.add_ledger('200')
        self.add_ledger('-50')                      # absence refund
        self.assertEqual(build_daily_summary()['payouts']['total_owed'], '150.00')


# ─────────────────────────────────────────────────────────────────────────────
# What needs a human
# ─────────────────────────────────────────────────────────────────────────────
class AttentionTests(DailyOpsMixin, TestCase):

    def _codes(self):
        return {i['code'] for i in build_daily_summary()['attention']}

    def test_silent_cron_failure_is_surfaced(self):
        """A completed booking with no ledger row means run_daily_payouts
        stopped. Nothing else in the product would ever tell you."""
        self.make_world()
        self.add_booking(status=Booking.COMPLETED,
                         date=self.today - timedelta(days=5),
                         payout=Booking.PAYOUT_PENDING)
        self.assertIn('ledger_not_running', self._codes())

    def test_recent_completions_are_not_flagged_yet(self):
        # Today's completions haven't had a cron run yet — not a problem.
        self.make_world()
        self.add_booking(status=Booking.COMPLETED, payout=Booking.PAYOUT_PENDING)
        self.assertNotIn('ledger_not_running', self._codes())

    def test_doctor_waiting_too_long_for_a_wire_is_flagged(self):
        self.make_world()
        self.add_ledger('200', days_ago=5)
        self.assertIn('payouts_ageing', self._codes())

    def test_fresh_ledger_row_is_not_nagged_about(self):
        self.make_world()
        self.add_ledger('200')
        self.assertNotIn('payouts_ageing', self._codes())

    def test_owed_money_with_nowhere_to_send_it_is_flagged(self):
        self.make_world()
        broke = Doctor.objects.create(
            hospital=self.hospital, name='NoDetails', specialization='GP',
            mobile='9000000004', fee=200, slots=['09:00 AM'],
            payment_collection_mode=Doctor.COLLECT_FULL)   # no UPI, no bank
        self.add_ledger('200', doctor=broke)
        self.assertIn('no_payout_details', self._codes())

    def test_queue_left_open_from_a_previous_day_is_flagged(self):
        self.make_world()
        self.add_booking(status=Booking.IN_PROGRESS,
                         date=self.today - timedelta(days=1))
        self.assertIn('stale_queue', self._codes())

    def test_negative_balance_is_visible_even_though_payouts_page_hides_it(self):
        self.make_world()
        self.add_ledger('-75')
        s = build_daily_summary()
        self.assertIn('negative_balance', {i['code'] for i in s['attention']})
        self.assertEqual(s['payouts']['total_owed'], '0.00')   # nothing owed

    def test_money_problems_are_high_severity(self):
        self.make_world()
        self.add_ledger('200', days_ago=5)
        item = next(i for i in build_daily_summary()['attention']
                    if i['code'] == 'payouts_ageing')
        self.assertEqual(item['severity'], 'high')
        self.assertEqual(item['count'], 1)


# ─────────────────────────────────────────────────────────────────────────────
# The endpoint
# ─────────────────────────────────────────────────────────────────────────────
class DailyOpsEndpointTests(DailyOpsMixin, TestCase):
    URL = '/api/payment/daily-summary/'

    def setUp(self):
        self.make_world()
        self.client = APIClient()

    def test_requires_authentication(self):
        self.assertIn(self.client.get(self.URL).status_code, (401, 403))

    def test_patient_cannot_read_the_business_numbers(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self.URL).status_code, 403)

    def test_admin_gets_the_summary(self):
        self.add_booking()
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['date'], str(self.today))
        self.assertEqual(res.data['bookings']['completed'], 1)
        self.assertEqual(res.data['collected']['tokenwalla_revenue'], '21.50')

    def test_the_summary_never_writes_anything(self):
        """Payouts are manual on purpose. A read-only report that quietly
        created ledger rows or batches would destroy that guarantee."""
        self.add_booking()
        self.add_ledger('200', days_ago=5)
        before = (DoctorLedger.objects.count(), PayoutBatch.objects.count(),
                  Booking.objects.count(), Payment.objects.count(),
                  list(Booking.objects.values_list('doctor_payout_status', flat=True)))

        self.client.force_authenticate(user=self.admin)
        self.client.get(self.URL)
        build_daily_summary()

        after = (DoctorLedger.objects.count(), PayoutBatch.objects.count(),
                 Booking.objects.count(), Payment.objects.count(),
                 list(Booking.objects.values_list('doctor_payout_status', flat=True)))
        self.assertEqual(before, after)
