"""
Regression tests for the security fixes applied in the security review.

Covers:
  1. Doctor write endpoints require authenticated hospital/admin (was AllowAny).
  2. Queue-access upgrade requires a valid Razorpay signature (was a free unlock).
  3. OTP is 6-digit CSPRNG and locks out after a capped number of wrong guesses.

Run:  python manage.py test tokenwalla.tests_security
"""
import datetime
import hashlib
import hmac

from django.test import TestCase, override_settings
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from hospitals.models import Hospital
from doctors.models import Doctor
from bookings.models import Booking

User = get_user_model()

TEST_SECRET = 'test_razorpay_secret'

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
        'anon': '1000/minute', 'user': '1000/minute', 'otp': '1000/minute',
    },
}


def _auth(client, user):
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


def _sign(order_id, payment_id, secret=TEST_SECRET):
    return hmac.new(
        secret.encode(), f'{order_id}|{payment_id}'.encode(), hashlib.sha256
    ).hexdigest()


@override_settings(CACHES=LOCMEM_CACHE)
class DoctorAccessControlTests(TestCase):
    """Vuln 1: only authenticated hospital/admin may write doctors."""

    def setUp(self):
        self.client = APIClient()
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


@override_settings(RAZORPAY_KEY_SECRET=TEST_SECRET, RAZORPAY_KEY_ID='rzp_test_x', CACHES=LOCMEM_CACHE)
class QueueUpgradeTests(TestCase):
    """Vuln 2: queue upgrade must verify the Razorpay signature + amount."""

    def setUp(self):
        self.client = APIClient()
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

    def test_forged_signature_rejected(self):
        res = self._upgrade({
            'razorpay_order_id': 'order_1',
            'razorpay_payment_id': 'pay_1',
            'razorpay_signature': 'deadbeef',
        })
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)

    def test_missing_fields_rejected(self):
        res = self._upgrade({'razorpay_payment_id': 'pay_1'})
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)

    def test_legacy_plain_payment_id_no_longer_unlocks(self):
        # The old exploit: a bare, unverified payment_id string.
        res = self._upgrade({'payment_id': 'anything'})
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertFalse(self.booking.queue_access)


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

    @override_settings(TWOFACTOR_API_KEY='')
    def test_correct_otp_verifies(self):
        mobile = '9111111115'
        self.client.post('/api/auth/otp/request/', {'mobile': mobile}, format='json')
        real = cache.get(f'otp_session:{mobile}')
        r = self.client.post('/api/auth/otp/verify/', {'mobile': mobile, 'otp': real}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json().get('verified'))
