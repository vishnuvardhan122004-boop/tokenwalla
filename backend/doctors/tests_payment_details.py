"""
Tests for the hospital-facing Doctor Payments feature:
  * SERVICE_ONLY vs FULL fee-breakdown calculation
  * payment-details GET/PUT (owner/admin gated, validation, non-leakage)
  * payment-summary aggregation
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from hospitals.models import Hospital
from doctors.models import Doctor
from bookings.models import Booking
from payments.models import Payment, DoctorLedger, PayoutBatch
from payments.fees import compute_fee_breakdown

User = get_user_model()


class FeeBreakdownModeTests(TestCase):
    def test_full_mode_matches_default(self):
        self.assertEqual(
            compute_fee_breakdown(200, 'FULL')['final_amount'],
            compute_fee_breakdown(200)['final_amount'],
        )

    def test_service_only_excludes_doctor_fee_online(self):
        bd = compute_fee_breakdown(200, 'SERVICE_ONLY')
        self.assertEqual(bd['doctor_fee'], Decimal('0.00'))         # nothing online
        self.assertEqual(bd['offline_doctor_fee'], Decimal('200.00'))
        # Online total is just service fee + GST (no consultation fee).
        self.assertEqual(bd['final_amount'], Decimal('25.37'))


class PaymentDetailsEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x',
            commission_rate=Decimal('20'))
        self.other_hospital = Hospital.objects.create(
            name='Rainbow', city='Hyd', mobile='9000000009', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=200)
        # Hospital staff user — the managed hospital id lives in last_name.
        self.staff = User.objects.create(
            username='9000000002', mobile='9000000002', role='hospital',
            last_name=str(self.hospital.id))
        self.other_staff = User.objects.create(
            username='9000000009', mobile='9000000009', role='hospital',
            last_name=str(self.other_hospital.id))
        self.admin = User.objects.create(
            username='admin', mobile='9000000000', role='admin')

    def url(self, doc=None):
        return f'/api/doctors/{(doc or self.doctor).id}/payment-details/'

    def test_owner_can_update_upi_details(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {
            'payment_method': 'UPI',
            'upi_id': 'apollo@okhdfc',
            'account_holder_name': 'Apollo Clinic',
            'payment_collection_mode': 'SERVICE_ONLY',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.upi_vpa, 'apollo@okhdfc')
        self.assertEqual(self.doctor.payment_collection_mode, 'SERVICE_ONLY')

    def test_upi_method_requires_upi_id(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {'payment_method': 'UPI'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('upi_id', r.json()['errors'])

    def test_bank_method_requires_bank_fields(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {'payment_method': 'BANK'}, format='json')
        self.assertEqual(r.status_code, 400)
        errs = r.json()['errors']
        self.assertIn('account_number', errs)
        self.assertIn('ifsc_code', errs)

    def test_invalid_ifsc_rejected(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {
            'payment_method': 'BANK', 'account_holder_name': 'A',
            'account_number': '123456', 'ifsc_code': 'nope'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ifsc_code', r.json()['errors'])

    def test_other_hospital_cannot_read_or_write(self):
        self.client.force_authenticate(self.other_staff)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(
            self.client.put(self.url(), {'payment_method': 'UPI', 'upi_id': 'x@y'},
                            format='json').status_code, 403)

    def test_admin_can_read(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url()).status_code, 200)

    def test_bank_details_not_leaked_on_public_list(self):
        self.doctor.bank_account_number = '000111222333'
        self.doctor.ifsc = 'HDFC0001234'
        self.doctor.save()
        # Public, unauthenticated doctor list must never expose bank details.
        r = self.client.get(f'/api/doctors/?hospital={self.hospital.id}')
        self.assertEqual(r.status_code, 200)
        body = r.content.decode()
        self.assertNotIn('000111222333', body)
        self.assertNotIn('HDFC0001234', body)


class PaymentSummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x',
            commission_rate=Decimal('20'))
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=200)
        self.user = User.objects.create(username='pat', mobile='9000000001', role='patient')
        self.staff = User.objects.create(
            username='9000000002', mobile='9000000002', role='hospital',
            last_name=str(self.hospital.id))
        # One paid, completed booking.
        booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-1',
            status=Booking.COMPLETED, amount=200)
        bd = compute_fee_breakdown(200)
        Payment.objects.create(
            booking=booking, order_id='o1', payment_id='p1', amount=int(bd['final_amount']),
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'], status=Payment.PAID)
        # A processed payout of ₹176.40.
        batch = PayoutBatch.objects.create(
            doctor=self.doctor, total_amount=Decimal('176.40'), payout_mode='IMPS',
            status=PayoutBatch.PROCESSED, idempotency_key='k1')
        DoctorLedger.objects.create(
            doctor=self.doctor, booking=booking, amount=Decimal('176.40'),
            reason=DoctorLedger.BOOKING_COMPLETED, payout_batch=batch)
        # An unbatched (pending) earning of ₹50.
        DoctorLedger.objects.create(
            doctor=self.doctor, amount=Decimal('50'),
            reason=DoctorLedger.BOOKING_COMPLETED)

    def test_summary_aggregates_per_doctor(self):
        self.client.force_authenticate(self.staff)
        r = self.client.get(f'/api/doctors/payment-summary/?hospital={self.hospital.id}')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        row = data['doctors'][0]
        self.assertEqual(row['appointments'], 1)
        self.assertEqual(Decimal(row['service_revenue']), Decimal('20.00'))
        self.assertEqual(Decimal(row['doctor_fees_collected']), Decimal('200.00'))
        self.assertEqual(Decimal(row['pending_payout']), Decimal('50'))
        self.assertEqual(Decimal(row['paid_amount']), Decimal('176.40'))
        self.assertIsNotNone(row['last_payout_date'])
        self.assertEqual(Decimal(data['totals']['service_revenue']), Decimal('20.00'))

    def test_offline_doctor_fee_counted_in_totals(self):
        # A Service-Fee-Only booking: doctor_fee captured online is 0, but the
        # ₹300 consultation fee is collected at the hospital (offline).
        booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='10:00 AM', token='TW-2',
            status=Booking.COMPLETED, amount=25)
        bd = compute_fee_breakdown(300, 'SERVICE_ONLY')
        Payment.objects.create(
            booking=booking, order_id='o2', payment_id='p2', amount=int(bd['final_amount']),
            doctor_fee=bd['doctor_fee'], offline_doctor_fee=bd['offline_doctor_fee'],
            platform_fee=bd['platform_fee'], gateway_fee=bd['gateway_fee'],
            gst_amount=bd['gst_amount'], final_amount=bd['final_amount'], status=Payment.PAID)

        self.client.force_authenticate(self.staff)
        data = self.client.get(
            f'/api/doctors/payment-summary/?hospital={self.hospital.id}').json()
        row = data['doctors'][0]
        # ₹300 collected at hospital surfaces in the offline field…
        self.assertEqual(Decimal(row['offline_doctor_fee']), Decimal('300.00'))
        # …and is rolled into doctor fees (200 online + 300 offline)…
        self.assertEqual(Decimal(row['doctor_fees_collected']), Decimal('500.00'))
        # …and into the grand total (225.37 online + 25.37 online + 300 offline).
        self.assertEqual(Decimal(row['total_collected']),
                         bd['final_amount'] + compute_fee_breakdown(200)['final_amount'] + Decimal('300.00'))
        self.assertEqual(Decimal(data['totals']['doctor_fees_collected']), Decimal('500.00'))

    def test_summary_requires_hospital_param(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(
            self.client.get('/api/doctors/payment-summary/').status_code, 400)

    def test_summary_blocks_other_hospital(self):
        other = User.objects.create(
            username='z', mobile='9000000077', role='hospital', last_name='99999')
        self.client.force_authenticate(other)
        r = self.client.get(f'/api/doctors/payment-summary/?hospital={self.hospital.id}')
        self.assertEqual(r.status_code, 403)
