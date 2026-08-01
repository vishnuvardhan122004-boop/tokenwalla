"""
Regression tests for the security fixes applied in the security review.

Covers:
  1. Doctor write endpoints require authenticated hospital/admin (was AllowAny).
  2. Queue-access upgrade requires a server-confirmed Cashfree payment (was a
     free unlock).
  3. OTP is 6-digit CSPRNG and locks out after a capped number of wrong guesses.

Run:  python manage.py test tokenwalla.tests_security
"""
import datetime
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from hospitals.models import Hospital
from doctors.models import Doctor
from bookings.models import Booking

User = get_user_model()

# The project's default cache is a DB table (tw_cache_table) that isn't created
# by migrations, so tests use an in-memory cache. Global DRF throttles read the
# cache on every request, so this override is needed project-wide in tests.
LOCMEM_CACHE = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

# For the OTP lockout test we issue several verify calls in a row; raise the
# 'otp' throttle so the attempt-cap (not the rate limit) is what's exercised.
REST_FRAMEWORK_TEST = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '1000/minute', 'user': '1000/minute',
        'otp': '1000/minute', 'otp_verify': '1000/minute',
        'admin_setup': '1000/minute',
    },
}


def _auth(client, user):
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


@override_settings(CACHES=LOCMEM_CACHE)
class DoctorAccessControlTests(TestCase):
    """Vuln 1: only authenticated hospital/admin may write doctors."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()  # isolate DRF throttle counters from other test classes
        self.hospital = Hospital.objects.create(name='H1', city='Blr', mobile='9000000001', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Old', specialization='Gen',
            mobile='9000000002', fee=100, slots=['09:00 AM'],
        )
        self.patient = User.objects.create_user(
            username='9111111111', mobile='9111111111', password='pw', role='patient')
        self.hosp_user = User.objects.create_user(
            username='9222222222', mobile='9222222222', password='pw',
            role='hospital', last_name=str(self.hospital.id))

    def test_anonymous_cannot_create_doctor(self):
        res = self.client.post('/api/doctors/', {
            'hospital': self.hospital.id, 'name': 'Fake', 'specialization': 'X',
            'mobile': '9333333333', 'fee': 1,
        })
        self.assertIn(res.status_code, (401, 403))
        self.assertFalse(Doctor.objects.filter(name='Fake').exists())

    def test_anonymous_cannot_update_doctor(self):
        res = self.client.patch(f'/api/doctors/{self.doctor.id}/', {'fee': 0}, format='json')
        self.assertIn(res.status_code, (401, 403))
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.fee, 100)

    def test_anonymous_cannot_delete_doctor(self):
        res = self.client.delete(f'/api/doctors/{self.doctor.id}/')
        self.assertIn(res.status_code, (401, 403))
        self.assertTrue(Doctor.objects.filter(id=self.doctor.id).exists())

    def test_patient_cannot_write_doctor(self):
        _auth(self.client, self.patient)
        res = self.client.patch(f'/api/doctors/{self.doctor.id}/', {'fee': 0}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_public_can_still_list_doctors(self):
        res = self.client.get('/api/doctors/')
        self.assertEqual(res.status_code, 200)

    def test_hospital_staff_can_update_doctor(self):
        _auth(self.client, self.hosp_user)
        res = self.client.patch(f'/api/doctors/{self.doctor.id}/', {'available': False}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_hospital_cannot_update_another_hospitals_doctor(self):
        other_hosp = Hospital.objects.create(name='H2', city='Blr', mobile='9000000003', password='x')
        other_doc = Doctor.objects.create(
            hospital=other_hosp, name='Other', specialization='Gen',
            mobile='9000000004', fee=100, slots=['09:00 AM'])
        _auth(self.client, self.hosp_user)  # belongs to H1, not H2
        res = self.client.patch(f'/api/doctors/{other_doc.id}/', {'available': False}, format='json')
        self.assertEqual(res.status_code, 403)
        other_doc.refresh_from_db()
        self.assertTrue(other_doc.available)

    def test_hospital_cannot_delete_another_hospitals_doctor(self):
        other_hosp = Hospital.objects.create(name='H2', city='Blr', mobile='9000000007', password='x')
        other_doc = Doctor.objects.create(
            hospital=other_hosp, name='Other', specialization='Gen',
            mobile='9000000008', fee=100, slots=['09:00 AM'])
        _auth(self.client, self.hosp_user)
        res = self.client.delete(f'/api/doctors/{other_doc.id}/')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Doctor.objects.filter(id=other_doc.id).exists())

    def test_hospital_cannot_create_doctor_for_another_hospital(self):
        other_hosp = Hospital.objects.create(name='H2', city='Blr', mobile='9000000005', password='x')
        _auth(self.client, self.hosp_user)  # H1
        res = self.client.post('/api/doctors/', {
            'hospital': other_hosp.id, 'name': 'Sneak', 'specialization': 'Y',
            'mobile': '9000000006', 'fee': 1,
        })
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Doctor.objects.filter(name='Sneak').exists())

    def test_admin_can_update_any_hospitals_doctor(self):
        admin = User.objects.create_user(
            username='9333330000', mobile='9333330000', password='pw',
            role='admin', is_staff=True)
        _auth(self.client, admin)
        res = self.client.patch(f'/api/doctors/{self.doctor.id}/', {'available': False}, format='json')
        self.assertEqual(res.status_code, 200)


@override_settings(CACHES=LOCMEM_CACHE)
class QueueUpgradeTests(TestCase):
    """Vuln 2: queue upgrade must confirm the payment with Cashfree + amount."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()  # isolate DRF throttle counters from other test classes
        self.hospital = Hospital.objects.create(name='H1', city='Blr', mobile='9000000010', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='D', specialization='Gen',
            mobile='9000000011', fee=100, slots=['09:00 AM'])
        self.patient = User.objects.create_user(
            username='9111111112', mobile='9111111112', password='pw', role='patient')
        self.booking = Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=datetime.date.today(), slot='09:00 AM', token='TW-TEST-1',
            amount=10, queue_access=False)
        _auth(self.client, self.patient)

    def _upgrade(self, payload):
        return self.client.patch(f'/api/bookings/upgrade/{self.booking.id}/', payload, format='json')

    def test_unpaid_order_rejected(self):
        # Cashfree says the order is NOT paid → must not unlock.
        with patch('bookings.views.confirm_order_paid',
                   return_value=(False, '', Decimal('0'), {})):
            res = self._upgrade({'order_id': 'order_1'})
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)

    def test_missing_order_id_rejected(self):
        res = self._upgrade({})
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)

    def test_legacy_plain_payment_id_no_longer_unlocks(self):
        # The old exploit: a bare, unverified payment_id string (no order_id).
        res = self._upgrade({'payment_id': 'anything'})
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)

    # confirm_order_paid is a live network call, so mock it — the returned amount
    # is what the server trusts. These exercise the actual security fix: a PAID
    # order for the correct ₹15 unlocks; a wrong amount / reused id does not.
    @patch('bookings.views.confirm_order_paid',
           return_value=(True, 'pay_ok', Decimal('15'), {}))
    def test_valid_payment_unlocks_queue_access(self, _mock):
        res = self._upgrade({'order_id': 'order_ok'})
        self.assertEqual(res.status_code, 200)
        self.booking.refresh_from_db()
        self.assertTrue(self.booking.queue_access)
        self.assertEqual(self.booking.queue_payment_id, 'pay_ok')

    @patch('bookings.views.confirm_order_paid',
           return_value=(True, 'pay_low', Decimal('5'), {}))
    def test_wrong_amount_rejected(self, _mock):
        res = self._upgrade({'order_id': 'order_low'})
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)

    @patch('bookings.views.confirm_order_paid',
           return_value=(True, 'pay_dup', Decimal('15'), {}))
    def test_reused_payment_id_rejected(self, _mock):
        # A different booking already consumed this queue-upgrade payment.
        Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=datetime.date.today(), slot='09:00 AM', token='TW-TEST-2',
            amount=15, queue_access=True, queue_payment_id='pay_dup')
        res = self._upgrade({'order_id': 'order_dup'})
        self.assertEqual(res.status_code, 409)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)


@override_settings(CACHES=LOCMEM_CACHE)
class BookForOtherTests(TestCase):
    """Feature: "book for someone else" — the beneficiary's name/mobile are
    stored on the booking and surfaced as the patient, while the booking still
    belongs to the account holder (who receives notifications)."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.hospital = Hospital.objects.create(name='H1', city='Blr', mobile='9000000030', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='D', specialization='Gen',
            mobile='9000000031', fee=100, slots=['09:00 AM'])
        self.patient = User.objects.create_user(
            username='9111111130', mobile='9111111130', password='pw', role='patient')
        self.patient.first_name = 'Account Holder'
        self.patient.save(update_fields=['first_name'])
        _auth(self.client, self.patient)

    def _verify(self, booking_extra):
        """POST a new-booking verify with the Cashfree confirmation mocked."""
        booking = {
            'doctorId': self.doctor.id,
            'doctorName': self.doctor.name,
            'hospital': self.hospital.name,
            'date': str(datetime.date.today()),
            'slot': '09:00 AM',
            'amount': 15,
            'queue_access': True,
        }
        booking.update(booking_extra)
        # confirm_order_paid is mocked: a PAID order for ₹15 with no 'booking'
        # tag resolves to the legacy flat queue_view plan the server trusts.
        with patch('payments.views.confirm_order_paid',
                   return_value=(True, 'pay_x', Decimal('15'), {})), \
             patch('payments.views._dispatch_booking_notifications'):
            return self.client.post('/api/payment/verify/', {
                'order_id': 'order_x',
                'booking': booking,
            }, format='json')

    def test_booking_for_other_stores_beneficiary(self):
        res = self._verify({'bookedForName': 'Rahul Kumar', 'bookedForMobile': '9876543210'})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])
        b = Booking.objects.get(payment_id='pay_x')
        # Booking belongs to the account holder…
        self.assertEqual(b.user, self.patient)
        # …but records the beneficiary and surfaces them as the patient.
        self.assertEqual(b.booked_for_name, 'Rahul Kumar')
        self.assertEqual(b.booked_for_mobile, '9876543210')
        self.assertEqual(b.patient_display_name, 'Rahul Kumar')
        self.assertEqual(b.patient_display_mobile, '9876543210')

    def test_booking_for_self_falls_back_to_account_holder(self):
        res = self._verify({})
        self.assertEqual(res.status_code, 200)
        b = Booking.objects.get(payment_id='pay_x')
        self.assertEqual(b.booked_for_name, '')
        self.assertEqual(b.booked_for_mobile, '')
        self.assertEqual(b.patient_display_name, 'Account Holder')
        self.assertEqual(b.patient_display_mobile, self.patient.mobile)

    def test_mobile_without_name_is_ignored(self):
        # A mobile with no name is meaningless → treated as booking for self.
        res = self._verify({'bookedForMobile': '9876543210'})
        self.assertEqual(res.status_code, 200)
        b = Booking.objects.get(payment_id='pay_x')
        self.assertEqual(b.booked_for_name, '')
        self.assertEqual(b.booked_for_mobile, '')

    def test_serializer_exposes_is_for_other(self):
        from bookings.serializers import BookingSerializer
        self._verify({'bookedForName': 'Rahul Kumar', 'bookedForMobile': '9876543210'})
        b = Booking.objects.get(payment_id='pay_x')
        data = BookingSerializer(b).data
        self.assertTrue(data['is_for_other'])
        self.assertEqual(data['patient_name'], 'Rahul Kumar')


@override_settings(CACHES=LOCMEM_CACHE, REST_FRAMEWORK=REST_FRAMEWORK_TEST)
class OTPHardeningTests(TestCase):
    """Vuln 3: 6-digit CSPRNG OTP + attempt cap."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    @override_settings(TWOFACTOR_API_KEY='')
    def test_otp_is_six_digits(self):
        res = self.client.post('/api/auth/otp/request/', {'mobile': '9111111113'}, format='json')
        self.assertEqual(res.status_code, 200)
        stored = cache.get('otp_session:9111111113')
        self.assertIsNotNone(stored)
        self.assertRegex(str(stored), r'^\d{6}$')

    @override_settings(TWOFACTOR_API_KEY='')
    def test_otp_locks_out_after_repeated_wrong_guesses(self):
        # Exercise the attempt-cap control directly (the HTTP layer's separate
        # per-IP throttle is tested by DRF itself and would otherwise mask this).
        from users.auth_views import verify_otp, OTP_MAX_ATTEMPTS

        mobile = '9111111114'
        cache.set(f'otp_session:{mobile}', '654321', timeout=300)

        for _ in range(OTP_MAX_ATTEMPTS):
            self.assertFalse(verify_otp(mobile, '000000'))

        # Code is now burned — even the correct OTP must fail afterwards.
        self.assertIsNone(cache.get(f'otp_session:{mobile}'))
        self.assertFalse(verify_otp(mobile, '654321'))

    def test_daily_send_cap_blocks_sms_flood(self):
        # Exercise the per-number daily send cap directly (the 60s cooldown and
        # the per-IP DRF throttle would otherwise mask it at the HTTP layer).
        from users.auth_views import _reserve_otp_send, OTP_MAX_SENDS_PER_DAY

        mobile = '9111111116'
        # The first OTP_MAX_SENDS_PER_DAY sends are all allowed …
        for _ in range(OTP_MAX_SENDS_PER_DAY):
            self.assertTrue(_reserve_otp_send(mobile))
        # … and every send past the cap is refused for the rest of the window.
        self.assertFalse(_reserve_otp_send(mobile))
        self.assertFalse(_reserve_otp_send(mobile))

    @override_settings(TWOFACTOR_API_KEY='')
    def test_correct_otp_verifies(self):
        mobile = '9111111115'
        self.client.post('/api/auth/otp/request/', {'mobile': mobile}, format='json')
        real = cache.get(f'otp_session:{mobile}')
        r = self.client.post('/api/auth/otp/verify/', {'mobile': mobile, 'otp': real}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json().get('verified'))


@override_settings(ADMIN_SETUP_KEY='super-secret-setup-key', CACHES=LOCMEM_CACHE)
class AdminSetupTests(TestCase):
    """Vuln: /auth/create-admin/ must reject a wrong setup key (constant-time)."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def test_wrong_setup_key_rejected(self):
        res = self.client.post('/api/auth/create-admin/', {
            'setup_key': 'wrong-key', 'mobile': '9800000000',
            'password': 'password123', 'name': 'Admin',
        }, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertFalse(User.objects.filter(mobile='9800000000').exists())

    def test_correct_setup_key_creates_admin(self):
        res = self.client.post('/api/auth/create-admin/', {
            'setup_key': 'super-secret-setup-key', 'mobile': '9800000001',
            'password': 'password123', 'name': 'Admin',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        user = User.objects.get(mobile='9800000001')
        self.assertEqual(user.role, 'admin')
        self.assertTrue(user.is_superuser)
