"""
Tests for the fee-split / refund / payout / invoice / receipt feature.

Run:  python manage.py test payments
"""
import os
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.models import Payment, Refund, DoctorLedger, PayoutBatch
from payments.fees import compute_fee_breakdown, compute_doctor_payout
from payments.refunds import (
    get_refund_percentage, compute_refund_split,
    process_cancellation_refund, record_absence_refund,
)

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# Fee math
# ─────────────────────────────────────────────────────────────────────────────
class FeeMathTests(TestCase):
    def test_breakdown_matches_spec_example(self):
        b = compute_fee_breakdown(200, 'FULL')
        self.assertEqual(b['platform_fee'], Decimal('20.00'))
        self.assertEqual(b['gateway_fee'],  Decimal('1.50'))
        self.assertEqual(b['gst_amount'],   Decimal('3.87'))   # 18% of 21.50
        self.assertEqual(b['final_amount'], Decimal('225.37'))

    def test_doctor_fee_is_gst_exempt(self):
        # GST must not depend on the doctor fee.
        self.assertEqual(compute_fee_breakdown(500, 'FULL')['gst_amount'],
                         compute_fee_breakdown(50, 'FULL')['gst_amount'])

    def test_doctor_is_paid_the_whole_online_fee(self):
        # We charge the patient, never the doctor or the hospital — so the
        # payout is the consultation fee itself, with nothing deducted.
        self.assertEqual(compute_doctor_payout(200), Decimal('200.00'))
        b = compute_fee_breakdown(200, 'FULL')
        self.assertEqual(compute_doctor_payout(b['doctor_fee']), Decimal('200.00'))


# ─────────────────────────────────────────────────────────────────────────────
# Refund tiers + split
# ─────────────────────────────────────────────────────────────────────────────
class RefundTierTests(TestCase):
    def _booking_in(self, hours):
        return SimpleNamespace(id=1, scheduled_datetime=timezone.now() + timedelta(hours=hours))

    def test_tiers(self):
        self.assertEqual(get_refund_percentage(self._booking_in(25)), Decimal('0.70'))
        self.assertEqual(get_refund_percentage(self._booking_in(13)), Decimal('0.60'))
        self.assertEqual(get_refund_percentage(self._booking_in(3)),  Decimal('0.50'))
        self.assertEqual(get_refund_percentage(self._booking_in(1)),  Decimal('0.00'))

    def test_unknown_time_is_zero(self):
        self.assertEqual(
            get_refund_percentage(SimpleNamespace(id=2, scheduled_datetime=None)),
            Decimal('0.00'))

    def test_split_is_proportional_and_exact(self):
        pay = SimpleNamespace(doctor_fee=Decimal('200'), platform_fee=Decimal('20'))
        s = compute_refund_split(pay, Decimal('0.70'))
        self.assertEqual(s['refund_pool'],   Decimal('154.00'))
        self.assertEqual(s['doctor_loss'],   Decimal('140.00'))
        self.assertEqual(s['platform_loss'], Decimal('14.00'))
        self.assertEqual(s['doctor_loss'] + s['platform_loss'], s['refund_pool'])

    def test_gateway_and_gst_never_refunded(self):
        # Pool is based only on doctor_fee + platform_fee.
        pay = SimpleNamespace(doctor_fee=Decimal('200'), platform_fee=Decimal('20'))
        s = compute_refund_split(pay, Decimal('1.00'))
        self.assertEqual(s['refund_pool'], Decimal('220.00'))   # excludes gateway+gst


# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures for DB-backed flows
# ─────────────────────────────────────────────────────────────────────────────
class BaseDataMixin:
    def make_world(self, *, status=Booking.COMPLETED, doctor_fee=Decimal('200'),
                   token='TW-TEST-1', paid=True):
        self.user = User.objects.create(username='pat', mobile='9000000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=int(doctor_fee), slots=['09:00 AM'],
            payment_collection_mode=Doctor.COLLECT_FULL,
            # Payout details — a doctor with none is HELD, not batched (see
            # PayoutPipelineTests.test_doctor_without_payout_details_is_held).
            bank_account_number='00111122233', ifsc='HDFC0000001')
        self.booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate() + timedelta(days=2), slot='09:00 AM',
            token=token, status=status, amount=int(doctor_fee))
        bd = compute_fee_breakdown(doctor_fee, 'FULL')
        self.payment = Payment.objects.create(
            booking=self.booking, order_id='order_1', payment_id='pay_1',
            amount=int(bd['final_amount']),
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'],
            status=Payment.PAID if paid else Payment.CREATED)
        return self


# ─────────────────────────────────────────────────────────────────────────────
# Cancellation refund (DB)
# ─────────────────────────────────────────────────────────────────────────────
class CancellationRefundTests(BaseDataMixin, TestCase):
    @mock.patch('payments.razorpay_utils.refund_payment', return_value={'id': 'rfnd_test'})
    def test_confirmed_cancel_creates_single_refund(self, _rp):
        self.make_world(status=Booking.CONFIRMED, token='TW-C1')
        refund, info = process_cancellation_refund(self.booking)
        self.assertIsNotNone(refund)
        self.assertEqual(refund.razorpay_refund_id, 'rfnd_test')
        # >24h out → 70% of (200+20).
        self.assertEqual(refund.doctor_loss + refund.platform_loss, Decimal('154.00'))
        # Idempotent — second call returns the same refund, no duplicate.
        again, info2 = process_cancellation_refund(self.booking)
        self.assertEqual(again.id, refund.id)
        self.assertEqual(Refund.objects.filter(payment=self.payment).count(), 1)

    def test_completed_booking_cannot_be_refunded(self):
        self.make_world(status=Booking.COMPLETED, token='TW-C2')
        from payments.refunds import RefundNotAllowed
        with self.assertRaises(RefundNotAllowed):
            process_cancellation_refund(self.booking)

    def test_absence_refund_writes_negative_ledger(self):
        self.make_world(status=Booking.COMPLETED, token='TW-C3')
        entry, info = record_absence_refund(self.booking)
        self.assertEqual(entry.reason, DoctorLedger.ABSENCE_REFUND)
        # Claws back the whole fee — nothing was deducted when it was earned.
        self.assertEqual(entry.amount, Decimal('-200.00'))
        # Idempotent.
        again, _ = record_absence_refund(self.booking)
        self.assertEqual(again.id, entry.id)


# ─────────────────────────────────────────────────────────────────────────────
# Daily ledger run — writes DoctorLedger rows only; payouts are manual (see
# ManualPayoutTests below for the mark-paid flow).
# ─────────────────────────────────────────────────────────────────────────────
class PayoutPipelineTests(BaseDataMixin, TestCase):
    def test_run_creates_ledger_row(self):
        self.make_world(status=Booking.COMPLETED, token='TW-P1')
        call_command('run_daily_payouts')

        # One row per booking, the full fee. Nothing is deducted from a doctor.
        rows = DoctorLedger.objects.filter(booking=self.booking)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().reason, DoctorLedger.BOOKING_COMPLETED)
        self.assertEqual(rows.first().amount, Decimal('200.00'))
        self.assertIsNone(rows.first().payout_batch)

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.doctor_payout_status, Booking.PAYOUT_PROCESSING)

    def test_run_is_idempotent(self):
        self.make_world(status=Booking.COMPLETED, token='TW-P2')
        call_command('run_daily_payouts')
        call_command('run_daily_payouts')   # second run: no new ledger row
        self.assertEqual(DoctorLedger.objects.count(), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Manual payouts — admin payouts page (PendingPayoutsView / MarkPayoutPaidView)
# ─────────────────────────────────────────────────────────────────────────────
# mark-paid fires _notify_doctor_payout_async on a background thread that opens
# its own DB connection and outlives the test — the same trap as
# _dispatch_booking_notifications. See "Four traps" in CLAUDE.md.
@mock.patch('payments.views._notify_doctor_payout_async', lambda b: None)
class ManualPayoutTests(BaseDataMixin, TestCase):
    def _admin_client(self):
        admin = User.objects.create(username='adm', mobile='9000000099',
                                    role='admin', password='x')
        client = APIClient()
        client.force_authenticate(admin)
        return client

    def test_pending_view_lists_doctor_with_positive_balance(self):
        self.make_world(status=Booking.COMPLETED, token='TW-M1')
        call_command('run_daily_payouts')
        client = self._admin_client()
        r = client.get('/api/payment/payouts/pending/')
        self.assertEqual(r.status_code, 200)
        rows = r.json()['payouts']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['doctor_id'], self.doctor.id)
        self.assertEqual(rows[0]['pending_amount'], '200.00')
        self.assertEqual(rows[0]['mode'], 'IMPS')   # bank details, no upi_vpa

    def test_mark_paid_batches_ledger_and_settles_booking(self):
        self.make_world(status=Booking.COMPLETED, token='TW-M2')
        call_command('run_daily_payouts')
        client = self._admin_client()
        r = client.post('/api/payment/payouts/mark-paid/',
                        {'doctor_id': self.doctor.id, 'reference': 'UTR123'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['amount_paid'], '200.00')

        batch = PayoutBatch.objects.get(doctor=self.doctor)
        self.assertEqual(batch.status, PayoutBatch.PROCESSED)
        self.assertEqual(batch.total_amount, Decimal('200.00'))
        self.assertEqual(batch.razorpay_payout_id, 'UTR123')

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.doctor_payout_status, Booking.PAYOUT_PAID)

        # Now paid — no longer pending.
        self.assertEqual(
            DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 0)
        r2 = client.get('/api/payment/payouts/pending/')
        self.assertEqual(r2.json()['payouts'], [])

    def test_mark_paid_with_no_pending_balance_is_rejected(self):
        self.make_world(status=Booking.COMPLETED, token='TW-M3')
        client = self._admin_client()
        r = client.post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        self.assertEqual(r.status_code, 400)

    def test_doctor_without_payout_details_still_marks_paid_as_other(self):
        # No VPA and no bank account on file — money was still wired manually
        # (e.g. cash), so mode falls back to OTHER rather than blocking.
        self.make_world(status=Booking.COMPLETED, token='TW-M4')
        self.doctor.bank_account_number = ''
        self.doctor.ifsc = ''
        self.doctor.save(update_fields=['bank_account_number', 'ifsc'])
        call_command('run_daily_payouts')
        client = self._admin_client()
        r = client.post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(PayoutBatch.objects.get().payout_mode, PayoutBatch.OTHER)

    def test_uses_upi_when_vpa_present(self):
        self.make_world(status=Booking.COMPLETED, token='TW-P3')
        self.doctor.upi_vpa = 'rao@upi'
        self.doctor.save(update_fields=['upi_vpa'])
        call_command('run_daily_payouts')
        client = self._admin_client()
        client.post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        self.assertEqual(PayoutBatch.objects.get(doctor=self.doctor).payout_mode,
                         PayoutBatch.UPI)


# ─────────────────────────────────────────────────────────────────────────────
# Multi-booking batching
# ─────────────────────────────────────────────────────────────────────────────
@mock.patch('payments.views._notify_doctor_payout_async', lambda b: None)
class MultiBookingPayoutTests(BaseDataMixin, TestCase):
    def test_two_completed_bookings_pay_out_as_one_batch(self):
        self.make_world(status=Booking.COMPLETED, token='TW-I2')
        bd = compute_fee_breakdown(Decimal('200'), 'FULL')
        b2 = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-I3',
            status=Booking.COMPLETED, amount=200)
        Payment.objects.create(
            booking=b2, order_id='o2', payment_id='pay2', amount=225,
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'], status=Payment.PAID)
        call_command('run_daily_payouts')
        self.assertEqual(DoctorLedger.objects.count(), 2)

        # Marking the doctor paid batches both bookings' fees into one payout.
        admin = User.objects.create(username='adm2', mobile='9000000098',
                                    role='admin', password='x')
        client = APIClient()
        client.force_authenticate(admin)
        client.post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        self.assertEqual(PayoutBatch.objects.get(doctor=self.doctor).total_amount,
                         Decimal('400.00'))


# ─────────────────────────────────────────────────────────────────────────────
# GST receipt endpoint
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(TOKENWALLA_GSTIN='36ABCDE1234F1Z5')
class ReceiptEndpointTests(BaseDataMixin, TestCase):
    def test_owner_gets_gst_compliant_receipt(self):
        self.make_world(status=Booking.CONFIRMED, token='TW-R1')
        client = APIClient()
        client.force_authenticate(self.user)
        r = client.get(f'/api/payment/receipt/{self.booking.id}/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['seller']['gstin'], '36ABCDE1234F1Z5')
        self.assertEqual(data['total'], '225.37')
        self.assertEqual(data['taxable_value'], '21.50')
        self.assertEqual(data['gst']['amount'], '3.87')
        # Doctor fee line marked GST-exempt.
        doc_line = data['line_items'][0]
        self.assertEqual(doc_line['gst_amount'], '0.00')
        self.assertIn('exempt', doc_line['note'].lower())

    def test_other_user_denied(self):
        self.make_world(status=Booking.CONFIRMED, token='TW-R2')
        stranger = User.objects.create(username='x', mobile='9111111111', role='patient')
        client = APIClient()
        client.force_authenticate(stranger)
        r = client.get(f'/api/payment/receipt/{self.booking.id}/')
        self.assertEqual(r.status_code, 403)


# ─────────────────────────────────────────────────────────────────────────────
# Live Razorpay key must never be usable from a DEBUG machine
# ─────────────────────────────────────────────────────────────────────────────
class LiveKeyGuardTests(TestCase):
    """A local checkout against an `rzp_live_` key charges a real card — there
    is no Razorpay sandbox for live credentials. get_client() is the single
    chokepoint every gateway call goes through."""

    def setUp(self):
        import payments.razorpay_utils as ru
        ru._client = None                       # the module caches one client
        self.addCleanup(setattr, ru, '_client', None)
        self.ru = ru

    @override_settings(DEBUG=True, RAZORPAY_KEY_ID='rzp_live_abc', RAZORPAY_KEY_SECRET='x')
    def test_live_key_with_debug_is_refused(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('ALLOW_LIVE_RAZORPAY', None)
            with self.assertRaises(ImproperlyConfigured):
                self.ru.get_client()

    @override_settings(DEBUG=True, RAZORPAY_KEY_ID='rzp_test_abc', RAZORPAY_KEY_SECRET='x')
    def test_test_key_with_debug_is_fine(self):
        self.assertIsNotNone(self.ru.get_client())

    @override_settings(DEBUG=False, RAZORPAY_KEY_ID='rzp_live_abc', RAZORPAY_KEY_SECRET='x')
    def test_live_key_in_production_is_fine(self):
        self.assertIsNotNone(self.ru.get_client())

    @override_settings(DEBUG=True, RAZORPAY_KEY_ID='rzp_live_abc', RAZORPAY_KEY_SECRET='x')
    def test_escape_hatch(self):
        with mock.patch.dict(os.environ, {'ALLOW_LIVE_RAZORPAY': '1'}):
            self.assertIsNotNone(self.ru.get_client())


# ─────────────────────────────────────────────────────────────────────────────
# Absence clawback must not close out a booking that was never credited
# ─────────────────────────────────────────────────────────────────────────────
class AbsenceClawbackSettlementTests(TestCase):
    """record_absence_refund writes a NEGATIVE ledger row and deliberately
    leaves doctor_payout_status PENDING, waiting for run_daily_payouts to write
    the matching +fee row.

    MarkPayoutPaidView used to mark every booking behind the batched rows as
    PAID — including one whose only row was that clawback. That removed it from
    the cron's `COMPLETED + PENDING` filter permanently, so the earning was
    never written and the doctor was docked a fee with nothing to net it
    against. Order-dependent: it only bites when the absence is recorded before
    the cron runs, which is the normal same-day case.
    """

    def setUp(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from hospitals.models import Hospital
        from doctors.models import Doctor
        User = get_user_model()

        self.user = User.objects.create(username='p', mobile='9400000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9400000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9400000003', fee=200, slots=['09:00 AM'],
            payment_collection_mode=Doctor.COLLECT_FULL,
            upi_vpa='rao@upi')
        admin = User.objects.create(
            username='adm', mobile='9400000009', role='admin', is_staff=True)
        self.admin = APIClient()
        self.admin.force_authenticate(admin)
        self._n = 0

    def _completed_booking(self, fee=Decimal('200.00')):
        self._n += 1
        b = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token=f'TW-AC{self._n}',
            status=Booking.COMPLETED, amount=225)
        Payment.objects.create(
            booking=b, order_id=f'o{self._n}', payment_id=f'pay_{self._n}',
            amount=225, doctor_fee=fee, platform_fee=Decimal('20.00'),
            gateway_fee=Decimal('1.50'), gst_amount=Decimal('3.87'),
            final_amount=Decimal('225.37'), status=Payment.PAID)
        return b

    @mock.patch('payments.views._notify_doctor_payout_async', lambda b: None)
    def test_a_clawback_only_booking_still_gets_its_earning_row_later(self):
        from payments.refunds import record_absence_refund
        from payments.models import DoctorLedger

        # Two bookings completed and ledgered by an earlier cron run: +400 owed.
        self._completed_booking()
        self._completed_booking()
        call_command('run_daily_payouts')

        # A third completes AFTER that run, so it is still PENDING with no
        # ledger rows at all — this ordering is what makes the bug reachable.
        absent = self._completed_booking()
        self.assertEqual(absent.doctor_payout_status, Booking.PAYOUT_PENDING)

        # The doctor is marked absent for it: a NEGATIVE row, status untouched.
        record_absence_refund(absent)
        self.assertEqual(
            list(DoctorLedger.objects.filter(booking=absent)
                 .values_list('amount', flat=True)),
            [Decimal('-200.00')])

        # Admin settles before the next cron. Net owed is 400 - 200 = 200, so
        # the batch goes through and closes out the rows behind it.
        res = self.admin.post('/api/payment/payouts/mark-paid/',
                              {'doctor_id': self.doctor.id}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['amount_paid'], '200.00')

        absent.refresh_from_db()
        # THE ASSERTION: the absent booking was never credited, so closing it
        # out here would remove it from the cron's COMPLETED+PENDING filter
        # forever and the +200 would never be written — docking the doctor 200.
        self.assertNotEqual(
            absent.doctor_payout_status, Booking.PAYOUT_PAID,
            'A booking whose only ledger row is a clawback was closed out, so '
            'its +fee row can never be written and the doctor is short a fee.')

        # The next cron writes the earning, and the pair nets to zero.
        call_command('run_daily_payouts')
        self.assertEqual(
            sum(r.amount for r in DoctorLedger.objects.filter(booking=absent)),
            Decimal('0.00'),
            'clawback and earning must net to zero for an absent visit')


class RefundRetryReconciliationTests(TestCase):
    """A gateway timeout must not become a second refund.

    refund_payment raising does NOT mean the refund failed to happen: Razorpay
    can process it while the HTTP response is lost. The exception rolls back the
    Refund row, the booking stays CONFIRMED, and the patient's retry sees no row
    and refunds again. The Payment lock only serialises CONCURRENT cancels — it
    does nothing for a sequential retry after a rollback.
    """

    def setUp(self):
        from django.contrib.auth import get_user_model
        from hospitals.models import Hospital
        from doctors.models import Doctor
        User = get_user_model()
        self.user = User.objects.create(username='p', mobile='9600000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9600000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9600000003', fee=200, slots=['09:00 AM'])
        self.booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate() + timedelta(days=3), slot='09:00 AM',
            token='TW-RR1', status=Booking.CONFIRMED, amount=225)
        self.payment = Payment.objects.create(
            booking=self.booking, order_id='o1', payment_id='pay_rr1',
            amount=225, doctor_fee=Decimal('200.00'),
            platform_fee=Decimal('20.00'), gateway_fee=Decimal('1.50'),
            gst_amount=Decimal('3.87'), final_amount=Decimal('225.37'),
            status=Payment.PAID)

    def test_a_retry_after_a_lost_response_adopts_the_refund_instead_of_repeating(self):
        from payments.refunds import process_cancellation_refund
        from payments.models import Refund

        # First attempt: Razorpay processes it, the response is lost.
        with mock.patch('payments.razorpay_utils.refund_payment',
                        side_effect=ConnectionError('timeout')), \
             mock.patch('payments.razorpay_utils.find_existing_refund', return_value=''):
            with self.assertRaises(ConnectionError):
                process_cancellation_refund(self.booking)

        # The row was rolled back — this is the state the patient retries from.
        self.assertEqual(Refund.objects.count(), 0)

        # Retry: the gateway reports the refund it already holds.
        with mock.patch('payments.razorpay_utils.refund_payment') as issue, \
             mock.patch('payments.razorpay_utils.find_existing_refund',
                        return_value='rfnd_already_there'):
            refund, info = process_cancellation_refund(self.booking)

        issue.assert_not_called()          # THE ASSERTION: no second refund
        self.assertEqual(refund.razorpay_refund_id, 'rfnd_already_there')
        self.assertEqual(Refund.objects.count(), 1)

    def test_a_clean_first_refund_still_calls_the_gateway(self):
        from payments.refunds import process_cancellation_refund

        with mock.patch('payments.razorpay_utils.refund_payment',
                        return_value={'id': 'rfnd_new'}) as issue, \
             mock.patch('payments.razorpay_utils.find_existing_refund', return_value=''):
            refund, info = process_cancellation_refund(self.booking)

        issue.assert_called_once()
        self.assertEqual(refund.razorpay_refund_id, 'rfnd_new')


class NoShowPayoutTests(TestCase):
    """A patient no-show on a FULL provider still owes the provider their fee.

    The fee was collected online and NO_SHOW is terminal and non-refundable, so
    if the cron skips it the money is neither paid out nor returned — TokenWalla
    just keeps it, which the money rules forbid.
    """

    def setUp(self):
        from django.contrib.auth import get_user_model
        from hospitals.models import Hospital
        from doctors.models import Doctor
        User = get_user_model()
        self.user = User.objects.create(username='p', mobile='9700000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9700000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9700000003', fee=200, slots=['09:00 AM'],
            payment_collection_mode=Doctor.COLLECT_FULL, upi_vpa='rao@upi')

    def _booking(self, status):
        b = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM',
            token=f'TW-NS{status[:3]}', status=status, amount=225)
        Payment.objects.create(
            booking=b, order_id=f'o{b.id}', payment_id=f'pay_{b.id}',
            amount=225, doctor_fee=Decimal('200.00'),
            platform_fee=Decimal('20.00'), gateway_fee=Decimal('1.50'),
            gst_amount=Decimal('3.87'), final_amount=Decimal('225.37'),
            status=Payment.PAID)
        return b

    def test_a_no_show_is_ledgered_to_the_provider(self):
        from payments.models import DoctorLedger
        b = self._booking(Booking.NO_SHOW)
        call_command('run_daily_payouts')
        rows = DoctorLedger.objects.filter(booking=b)
        self.assertEqual(
            [r.amount for r in rows], [Decimal('200.00')],
            'the slot was held and lost, and the patient is not refunded — so '
            'the provider must be paid, not TokenWalla')

    def test_a_cancelled_booking_is_still_never_ledgered(self):
        from payments.models import DoctorLedger
        b = self._booking(Booking.CANCELLED)
        call_command('run_daily_payouts')
        self.assertFalse(DoctorLedger.objects.filter(booking=b).exists())


class ForceDeleteFinancialGuardTests(TestCase):
    """A hard delete must never take the money record with it.

    Booking.doctor/hospital are PROTECT (bookings migration 0004) so a provider
    delete cannot silently wipe patient history — but the force-delete endpoints
    bypass that by deleting the Bookings first, and every money model behind a
    Booking is still CASCADE. One admin click erased every Payment row (and the
    GST charged on it), every Refund, and every PROCESSED PayoutBatch carrying a
    hand-entered UTR, with a success response.
    """

    def setUp(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from hospitals.models import Hospital
        from doctors.models import Doctor
        User = get_user_model()
        self.patient = User.objects.create(username='p', mobile='9800000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9800000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9800000003', fee=200, slots=['09:00 AM'])
        admin = User.objects.create(
            username='adm', mobile='9800000009', role='admin', is_staff=True)
        self.admin = APIClient()
        self.admin.force_authenticate(admin)

    def _paid_booking(self):
        b = Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-FD1',
            status=Booking.COMPLETED, amount=225)
        Payment.objects.create(
            booking=b, order_id='o1', payment_id='pay_fd1', amount=225,
            doctor_fee=Decimal('200.00'), platform_fee=Decimal('20.00'),
            gateway_fee=Decimal('1.50'), gst_amount=Decimal('3.87'),
            final_amount=Decimal('225.37'), status=Payment.PAID)
        return b

    def test_hospital_force_delete_is_refused_when_payments_exist(self):
        self._paid_booking()
        res = self.admin.delete(f'/api/hospitals/{self.hospital.id}/force-delete/')
        self.assertEqual(res.status_code, 409, res.content)
        self.assertIn('payments', res.json()['blocking'])
        # Nothing was destroyed.
        self.assertEqual(Payment.objects.count(), 1)
        self.assertTrue(Hospital.objects.filter(pk=self.hospital.id).exists())

    def test_doctor_force_delete_is_refused_when_payments_exist(self):
        self._paid_booking()
        res = self.admin.delete(f'/api/doctors/{self.doctor.id}/force-delete/')
        self.assertEqual(res.status_code, 409, res.content)
        self.assertEqual(Payment.objects.count(), 1)

    def test_a_provider_with_no_money_history_can_still_be_deleted(self):
        # The case these endpoints actually exist for: a test fixture or an
        # abandoned registration. Guarding must not break it.
        from hospitals.models import Hospital
        res = self.admin.delete(f'/api/hospitals/{self.hospital.id}/force-delete/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(Hospital.objects.filter(pk=self.hospital.id).exists())

    def test_a_patient_with_payments_cannot_be_deleted_from_the_admin(self):
        from users.admin import CustomUserAdmin
        from django.contrib.admin.sites import site
        self._paid_booking()
        admin_obj = CustomUserAdmin(type(self.patient), site)

        class _Req:
            def __init__(self, u): self.user = u
        req = _Req(self.patient)
        req.user.is_superuser = True

        self.assertFalse(
            admin_obj.has_delete_permission(req, self.patient),
            'Booking.user is CASCADE, so deleting this account would destroy '
            'its Payment and Refund rows and the GST charged on them')

    def test_a_patient_with_no_payments_can_still_be_deleted(self):
        from users.admin import CustomUserAdmin
        from django.contrib.admin.sites import site
        from django.contrib.auth import get_user_model
        User = get_user_model()
        clean = User.objects.create(username='clean', mobile='9800000055', role='patient')
        admin_obj = CustomUserAdmin(User, site)

        class _Req:
            def __init__(self, u): self.user = u
        req = _Req(clean)
        req.user.is_superuser = True

        self.assertTrue(admin_obj.has_delete_permission(req, clean))
