"""
Tests for the fee-split / refund / payout / invoice / receipt feature.

Run:  python manage.py test payments
"""
import base64
import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
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
        b = compute_fee_breakdown(200)
        self.assertEqual(b['platform_fee'], Decimal('20.00'))
        self.assertEqual(b['gateway_fee'],  Decimal('1.50'))
        self.assertEqual(b['gst_amount'],   Decimal('3.87'))   # 18% of 21.50
        self.assertEqual(b['final_amount'], Decimal('225.37'))

    def test_doctor_fee_is_gst_exempt(self):
        # GST must not depend on the doctor fee.
        self.assertEqual(compute_fee_breakdown(500)['gst_amount'],
                         compute_fee_breakdown(50)['gst_amount'])

    def test_doctor_is_paid_the_whole_online_fee(self):
        # We charge the patient, never the doctor or the hospital — so the
        # payout is the consultation fee itself, with nothing deducted.
        self.assertEqual(compute_doctor_payout(200), Decimal('200.00'))
        b = compute_fee_breakdown(200)
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
            # Payout details — a doctor with none is HELD, not batched (see
            # PayoutPipelineTests.test_doctor_without_payout_details_is_held).
            bank_account_number='00111122233', ifsc='HDFC0000001')
        self.booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate() + timedelta(days=2), slot='09:00 AM',
            token=token, status=status, amount=int(doctor_fee))
        bd = compute_fee_breakdown(doctor_fee)
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
    @mock.patch('payments.cashfree_utils.refund_payment', return_value={'id': 'rfnd_test'})
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
# Daily payout pipeline
# ─────────────────────────────────────────────────────────────────────────────
class PayoutPipelineTests(BaseDataMixin, TestCase):
    def test_run_creates_ledger_and_one_batch_per_doctor(self):
        self.make_world(status=Booking.COMPLETED, token='TW-P1')
        call_command('run_daily_payouts')

        # One row per booking, the full fee. Nothing is deducted from a doctor.
        rows = DoctorLedger.objects.filter(booking=self.booking)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().reason, DoctorLedger.BOOKING_COMPLETED)
        self.assertEqual(rows.first().amount, Decimal('200.00'))

        batches = PayoutBatch.objects.filter(doctor=self.doctor)
        self.assertEqual(batches.count(), 1)
        batch = batches.first()
        self.assertEqual(batch.total_amount, Decimal('200.00'))
        self.assertEqual(batch.payout_mode, PayoutBatch.IMPS)   # no upi_vpa set
        self.assertEqual(batch.status, PayoutBatch.QUEUED)

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.doctor_payout_status, Booking.PAYOUT_PROCESSING)

    def test_run_is_idempotent(self):
        self.make_world(status=Booking.COMPLETED, token='TW-P2')
        call_command('run_daily_payouts')
        call_command('run_daily_payouts')   # second run: no new ledger, no new batch
        self.assertEqual(DoctorLedger.objects.count(), 1)
        self.assertEqual(PayoutBatch.objects.count(), 1)

    def test_doctor_without_payout_details_is_held(self):
        # No VPA and no bank account → nowhere to send the money. The ledger is
        # written but left unbatched so nothing is lost; it pays out in a later
        # cycle once the hospital adds the details.
        self.make_world(status=Booking.COMPLETED, token='TW-P4')
        self.doctor.bank_account_number = ''
        self.doctor.ifsc = ''
        self.doctor.save(update_fields=['bank_account_number', 'ifsc'])
        call_command('run_daily_payouts')
        self.assertEqual(PayoutBatch.objects.count(), 0)
        self.assertEqual(DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 1)

        # Details added → the held earnings go out on the next run.
        self.doctor.upi_vpa = 'rao@upi'
        self.doctor.save(update_fields=['upi_vpa'])
        call_command('run_daily_payouts')
        self.assertEqual(PayoutBatch.objects.get().total_amount, Decimal('200.00'))

    def test_uses_upi_when_vpa_present(self):
        self.make_world(status=Booking.COMPLETED, token='TW-P3')
        self.doctor.upi_vpa = 'rao@upi'
        self.doctor.save(update_fields=['upi_vpa'])
        call_command('run_daily_payouts')
        self.assertEqual(PayoutBatch.objects.get(doctor=self.doctor).payout_mode,
                         PayoutBatch.UPI)


# ─────────────────────────────────────────────────────────────────────────────
# Payout webhook (idempotent settlement)
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(CASHFREE_PAYOUT_CLIENT_SECRET='whsec_test')
class PayoutWebhookTests(BaseDataMixin, TestCase):
    def _post(self, payload):
        body = json.dumps(payload)
        ts   = '1700000000'
        sig  = base64.b64encode(
            hmac.new(b'whsec_test', f'{ts}{body}'.encode(), hashlib.sha256).digest()
        ).decode()
        return self.client.post('/api/payment/webhook/', data=body,
                                content_type='application/json',
                                HTTP_X_WEBHOOK_SIGNATURE=sig,
                                HTTP_X_WEBHOOK_TIMESTAMP=ts)

    def setUp(self):
        self.client = APIClient()
        self.make_world(status=Booking.COMPLETED, token='TW-W1')
        call_command('run_daily_payouts')
        self.batch = PayoutBatch.objects.get(doctor=self.doctor)

    def _processed_payload(self):
        return {'type': 'TRANSFER_SUCCESS',
                'data': {'cf_transfer_id': 'cft_x',
                         'transfer_id': self.batch.idempotency_key}}

    def test_bad_signature_rejected(self):
        body = json.dumps(self._processed_payload())
        r = self.client.post('/api/payment/webhook/', data=body,
                             content_type='application/json',
                             HTTP_X_WEBHOOK_SIGNATURE='deadbeef',
                             HTTP_X_WEBHOOK_TIMESTAMP='1700000000')
        self.assertEqual(r.status_code, 400)

    def test_processed_is_idempotent(self):
        r1 = self._post(self._processed_payload())
        self.assertEqual(r1.status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.PROCESSED)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.doctor_payout_status, Booking.PAYOUT_PAID)

        # Duplicate delivery — no second transition.
        r2 = self._post(self._processed_payload())
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()['status'], 'already_processed')

    def test_failed_releases_ledger_for_retry(self):
        payload = {'type': 'TRANSFER_FAILED',
                   'data': {'transfer_id': self.batch.idempotency_key}}
        self._post(payload)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.FAILED)
        # Ledger rows released (unbatched) for the next cycle.
        self.assertEqual(
            DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Multi-booking batching
# ─────────────────────────────────────────────────────────────────────────────
class MultiBookingPayoutTests(BaseDataMixin, TestCase):
    def test_two_completed_bookings_pay_out_as_one_batch(self):
        self.make_world(status=Booking.COMPLETED, token='TW-I2')
        bd = compute_fee_breakdown(Decimal('200'))
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

        # One batch for the doctor, carrying both bookings' full fees.
        self.assertEqual(DoctorLedger.objects.count(), 2)
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
