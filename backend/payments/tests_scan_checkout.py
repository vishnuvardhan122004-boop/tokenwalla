"""
Scan checkout — /create-order/ and /verify/ for a Scan instead of a Doctor.

Mirrors tests_integration.py's harness on purpose: the two provider paths share
the capacity backstop, the refund-on-failure path and the idempotency guards, so
they must be exercised the same way or they will drift.

Dates are computed from timezone.localdate(), never literals — a hard-coded date
in this suite rotted into the past once already and started failing the 2h
booking cutoff.

Every test here patches `_dispatch_booking_notifications`: /verify/ fires
WhatsApp + push on a background thread that opens its own DB connection and
outlives the test, and against the shared-cache in-memory SQLite it then
collides with a LATER, UNRELATED test's first write.
"""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.fees import compute_fee_breakdown
from payments.models import Payment
from scans.models import Scan

User = get_user_model()

FUTURE_DATE = str(timezone.localdate() + timedelta(days=3))
SLOT = '09:00 AM'


class ScanWorldMixin:
    def make_world(self, *, price=4500, mode=Scan.COLLECT_SERVICE_ONLY, max_per_slot=1):
        self.user = User.objects.create(
            username='patient', mobile='9000000701', first_name='Rahul')
        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur', mobile='9000000702',
            status='active', password='x', kind=Hospital.SCAN_CENTER)
        self.hospital = Hospital.objects.create(
            name='Sri Sarwodhaya', city='Hindupur', mobile='9000000703',
            status='active', password='x')
        self.scan = Scan.objects.create(
            center=self.centre, name='MRI Brain', modality='MRI', price=price,
            max_per_slot=max_per_slot, slots=[SLOT, '10:00 AM'],
            days=['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            payment_collection_mode=mode)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        return self


# ─────────────────────────────────────────────────────────────────────────────
# create-order
# ─────────────────────────────────────────────────────────────────────────────
class CreateScanOrderTests(ScanWorldMixin, TestCase):
    URL = '/api/payment/create-order/'

    def setUp(self):
        self.make_world()

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_scan', 'key': 'rzp_test_x'})
    def test_service_only_charges_only_the_service_fee(self, mock_create):
        r = self.client.post(self.URL, {'scanId': self.scan.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        # ₹25.37 — the ₹4500 scan price is settled at the centre, not online.
        self.assertEqual(r.json()['breakdown']['final_amount'], '25.37')
        self.assertEqual(mock_create.call_args.kwargs['amount_rupees'], Decimal('25.37'))
        self.assertEqual(r.json()['breakdown']['doctor_fee'], '0.00')

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_scan', 'key': 'rzp_test_x'})
    def test_the_order_is_tagged_with_the_scan(self, mock_create):
        self.client.post(self.URL, {'scanId': self.scan.id}, format='json')
        tags = mock_create.call_args.kwargs['tags']
        self.assertEqual(tags['scan_id'], str(self.scan.id))
        self.assertNotIn('doctor_id', tags)

    @mock.patch('payments.views.create_order')
    def test_full_collection_is_refused_until_scan_gst_is_confirmed(self, mock_create):
        """fees.py treats the provider fee as GST-exempt, which is correct for a
        consultation. Whether a diagnostic price is exempt the same way is
        unanswered, and guessing under-collects GST on every scan sold."""
        self.scan.payment_collection_mode = Scan.COLLECT_FULL
        self.scan.save(update_fields=['payment_collection_mode'])
        r = self.client.post(self.URL, {'scanId': self.scan.id}, format='json')
        self.assertEqual(r.status_code, 409)
        mock_create.assert_not_called()          # no order, no money, no gateway

    @mock.patch('payments.views.create_order')
    def test_a_scan_at_a_plain_hospital_is_not_bookable(self, mock_create):
        orphan = Scan.objects.create(
            center=self.hospital, name='Orphan X-Ray', price=100, slots=[SLOT])
        r = self.client.post(self.URL, {'scanId': orphan.id}, format='json')
        self.assertEqual(r.status_code, 400)
        mock_create.assert_not_called()

    @mock.patch('payments.views.create_order')
    def test_an_unavailable_scan_is_refused(self, mock_create):
        self.scan.available = False
        self.scan.save(update_fields=['available'])
        r = self.client.post(self.URL, {'scanId': self.scan.id}, format='json')
        self.assertEqual(r.status_code, 409)
        mock_create.assert_not_called()

    @mock.patch('payments.views.create_order')
    def test_a_full_slot_is_rejected_before_any_money_moves(self, mock_create):
        Booking.objects.create(
            user=self.user, scan=self.scan, hospital=self.centre,
            date=FUTURE_DATE, slot=SLOT, token='TW-FULL-1', status=Booking.CONFIRMED)
        r = self.client.post(
            self.URL, {'scanId': self.scan.id, 'date': FUTURE_DATE, 'slot': SLOT},
            format='json')
        self.assertEqual(r.status_code, 409)
        mock_create.assert_not_called()

    def test_missing_scan_is_404(self):
        r = self.client.post(self.URL, {'scanId': 999999}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_unauthenticated_rejected(self):
        r = APIClient().post(self.URL, {'scanId': self.scan.id}, format='json')
        self.assertIn(r.status_code, (401, 403))


# ─────────────────────────────────────────────────────────────────────────────
# verify
# ─────────────────────────────────────────────────────────────────────────────
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
class VerifyScanBookingTests(ScanWorldMixin, TestCase):
    URL = '/api/payment/verify/'

    def setUp(self):
        self.make_world()
        self.breakdown = compute_fee_breakdown(4500, 'SERVICE_ONLY')
        self.amount    = self.breakdown['final_amount']      # Decimal 25.37

    def _confirm(self, *, scan_id=None, ref='rzp_pay_scan_1'):
        return (True, ref, self.amount, {
            'plan': 'booking',
            'scan_id': str(self.scan.id if scan_id is None else scan_id),
            'doctor_fee': '4500',
            'collection_mode': 'SERVICE_ONLY',
            'user_id': str(self.user.id),
        })

    def _verify(self, booking=None, order_id='order_scan'):
        return self.client.post(self.URL, {
            'order_id': order_id,
            'booking': booking if booking is not None else {
                'scanId': self.scan.id, 'date': FUTURE_DATE, 'slot': SLOT},
        }, format='json')

    @mock.patch('payments.views.confirm_order_paid')
    def test_happy_path_creates_a_scan_booking(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self._verify()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['success'])

        b = Booking.objects.get(token=r.json()['token'])
        self.assertEqual(b.scan_id, self.scan.id)
        self.assertIsNone(b.doctor_id)              # the CheckConstraint's other half
        self.assertEqual(b.hospital_id, self.centre.id)
        self.assertEqual(b.provider_name, 'MRI Brain')

    @mock.patch('payments.views.confirm_order_paid')
    def test_the_payment_row_records_no_online_provider_fee(self, mock_confirm):
        """SERVICE_ONLY: the ₹4500 is settled at the centre, so nothing is owed
        as a payout and doctor_fee must be 0."""
        mock_confirm.return_value = self._confirm()
        r = self._verify()
        p = Payment.objects.get(booking__token=r.json()['token'])
        self.assertEqual(p.doctor_fee, Decimal('0.00'))
        self.assertEqual(p.offline_doctor_fee, Decimal('4500.00'))
        self.assertEqual(p.final_amount, Decimal('25.37'))

    @mock.patch('payments.views.confirm_order_paid')
    def test_the_response_keeps_doctorName_for_installed_apps(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        body = self._verify().json()['booking']
        self.assertEqual(body['doctorName'], 'MRI Brain')
        self.assertEqual(body['providerKind'], 'SCAN')

    @mock.patch('payments.views.confirm_order_paid')
    def test_redeeming_against_a_different_scan_is_rejected(self, mock_confirm):
        """The provider is whoever the ORDER was priced for, never whoever the
        client names at redemption."""
        other = Scan.objects.create(
            center=self.centre, name='CT Chest', price=3000, slots=[SLOT])
        mock_confirm.return_value = self._confirm()
        r = self._verify(booking={'scanId': other.id, 'date': FUTURE_DATE, 'slot': SLOT})
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Booking.objects.exists())

    @mock.patch('payments.views.confirm_order_paid')
    def test_a_doctor_order_cannot_be_redeemed_as_a_scan(self, mock_confirm):
        doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000704', fee=200, slots=[SLOT])
        mock_confirm.return_value = (True, 'rzp_pay_x', self.amount, {
            'plan': 'booking', 'doctor_id': str(doctor.id),
            'doctor_fee': '4500', 'collection_mode': 'SERVICE_ONLY',
            'user_id': str(self.user.id)})
        r = self._verify(booking={'scanId': self.scan.id, 'date': FUTURE_DATE, 'slot': SLOT})
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Booking.objects.exists())

    @mock.patch('payments.views.confirm_order_paid')
    def test_verifying_twice_is_idempotent(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        first  = self._verify()
        second = self._verify()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(first.json()['token'], second.json()['token'])

    @mock.patch('payments.views.refund_payment', return_value={'id': 'rfnd_scan'})
    @mock.patch('payments.views.confirm_order_paid')
    def test_a_slot_that_fills_after_capture_is_refunded(self, mock_confirm, mock_refund):
        """The capacity backstop. Money is already captured here, so the only
        correct outcome is a refund — never a booking against a full slot."""
        Booking.objects.create(
            user=self.user, scan=self.scan, hospital=self.centre,
            date=FUTURE_DATE, slot=SLOT, token='TW-TAKEN', status=Booking.CONFIRMED)
        mock_confirm.return_value = self._confirm(ref='rzp_pay_scan_2')
        r = self._verify()
        self.assertFalse(r.json().get('success'))
        mock_refund.assert_called_once()
        self.assertEqual(Booking.objects.filter(scan=self.scan).count(), 1)   # only the pre-existing one

    @mock.patch('payments.views.confirm_order_paid')
    def test_a_scan_booking_does_not_consume_a_doctors_capacity(self, mock_confirm):
        """Capacity is per provider. A full MRI must not close a doctor's slot."""
        doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000705', fee=200, max_per_slot=1, slots=[SLOT])
        Booking.objects.create(
            user=self.user, scan=self.scan, hospital=self.centre,
            date=FUTURE_DATE, slot=SLOT, token='TW-SCAN-X', status=Booking.CONFIRMED)

        from bookings.capacity import check_slot_available
        check_slot_available(doctor, FUTURE_DATE, SLOT)     # must not raise
