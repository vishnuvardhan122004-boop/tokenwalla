"""
Regression tests for the security fixes applied in the security review.

Covers:
  1. Doctor write endpoints require authenticated hospital/admin (was AllowAny).
  2. OTP is 6-digit CSPRNG and locks out after a capped number of wrong guesses.

(The queue-access-upgrade tests were removed with the endpoint itself — every
booking now includes queue access as part of the full fee.)

Run:  python manage.py test tokenwalla.tests_security
"""
import datetime
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
        # Mirror settings.py — the real class also enforces User.status.
        'tokenwalla.permissions.StatusAwareJWTAuthentication',
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


# Toggling a doctor to unavailable fires _notify_doctor_unavailable on a
# background thread that opens its own DB connection and outlives the test —
# the same trap as _dispatch_booking_notifications. See "Four traps" in
# CLAUDE.md.
@patch('doctors.views._notify_doctor_unavailable', lambda doctor_id: None)
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
            payment_collection_mode=Doctor.COLLECT_FULL,
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
            mobile='9000000031', fee=100, slots=['09:00 AM'],
            payment_collection_mode=Doctor.COLLECT_FULL,)
        self.patient = User.objects.create_user(
            username='9111111130', mobile='9111111130', password='pw', role='patient')
        self.patient.first_name = 'Account Holder'
        self.patient.save(update_fields=['first_name'])
        _auth(self.client, self.patient)

    def _verify(self, booking_extra):
        """POST a new-booking verify with the Razorpay confirmation mocked."""
        from payments.fees import compute_fee_breakdown
        booking = {
            'doctorId': self.doctor.id,
            'doctorName': self.doctor.name,
            'hospital': self.hospital.name,
            # Far enough out to clear BOOKING_CUTOFF_HOURS, now enforced
            # server-side on checkout (bookings/capacity.py). Today's 09:00 AM
            # is in the past by the time this suite runs.
            'date': str(datetime.date.today() + datetime.timedelta(days=3)),
            'slot': '09:00 AM',
            'queue_access': True,
        }
        booking.update(booking_extra)
        # confirm_order_paid is mocked as a PAID full-fee booking order: the
        # server-written tags name the doctor and their fee, and the captured
        # amount is the full bill the server would have priced.
        total = compute_fee_breakdown(self.doctor.fee, 'FULL')['final_amount']
        tags = {
            'plan':       'booking',
            'doctor_fee': str(self.doctor.fee),
            'doctor_id':  str(self.doctor.id),
            'user_id':    str(self.patient.id),
        }
        with patch('payments.views.confirm_order_paid',
                   return_value=(True, 'pay_x', total, tags)), \
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
            'password': 'Adm1n-Str0ng-2026', 'name': 'Admin',
        }, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertFalse(User.objects.filter(mobile='9800000000').exists())

    def test_correct_setup_key_creates_admin(self):
        res = self.client.post('/api/auth/create-admin/', {
            'setup_key': 'super-secret-setup-key', 'mobile': '9800000001',
            'password': 'Adm1n-Str0ng-2026', 'name': 'Admin',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        user = User.objects.get(mobile='9800000001')
        self.assertEqual(user.role, 'admin')
        self.assertTrue(user.is_superuser)


# ── Second security review (2026-08-21) ───────────────────────────────────────

@override_settings(CACHES=LOCMEM_CACHE, REST_FRAMEWORK=REST_FRAMEWORK_TEST)
class OTPPathInjectionTests(TestCase):
    """Vuln: a non-numeric OTP reached the 2Factor URL path, and `../` in it
    was normalised client-side — letting the caller pick which 2Factor endpoint
    decided the auth outcome (account takeover via /auth/login/)."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    @override_settings(TWOFACTOR_API_KEY='fake-key')
    def test_traversal_otp_never_reaches_the_network(self):
        from users.auth_views import verify_otp
        mobile = '9111222301'
        cache.set(f'otp_session:{mobile}', 'session-abc', timeout=300)
        with patch('requests.get') as mock_get:
            self.assertFalse(
                verify_otp(mobile, '../../VERIFY3/9999999999/123456')
            )
        mock_get.assert_not_called()

    @override_settings(TWOFACTOR_API_KEY='fake-key')
    def test_legitimate_code_is_sent_url_encoded(self):
        from users.auth_views import verify_otp
        mobile = '9111222302'
        cache.set(f'otp_session:{mobile}', 'session/abc', timeout=300)
        with patch('requests.get') as mock_get:
            mock_get.return_value.json.return_value = {
                'Status': 'Success', 'Details': 'OTP Matched',
            }
            self.assertTrue(verify_otp(mobile, '123456'))
        url = mock_get.call_args[0][0]
        self.assertTrue(url.endswith('/SMS/VERIFY/session%2Fabc/123456'), url)


@override_settings(CACHES=LOCMEM_CACHE, REST_FRAMEWORK=REST_FRAMEWORK_TEST)
class RegistrationOwnershipTests(TestCase):
    """Vuln: registration bound an account to a mobile nobody had proven they
    owned, so an attacker could squat a stranger's number — and that person's
    own OTP login would then land inside the attacker's account."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def test_register_rejected_without_verified_otp(self):
        res = self.client.post('/api/auth/register/', {
            'name': 'Squatter', 'mobile': '9111222303', 'password': 'pw123456',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(mobile='9111222303').exists())

    def test_register_succeeds_after_otp_and_consumes_the_flag(self):
        mobile = '9111222304'
        cache.set(f'otp_verified:{mobile}', True, timeout=600)
        res = self.client.post('/api/auth/register/', {
            'name': 'Real User', 'mobile': mobile, 'password': 'pw123456',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(cache.get(f'otp_verified:{mobile}'))

    def test_hospital_register_rejected_without_verified_otp(self):
        res = self.client.post('/api/hospitals/register/', {
            'name': 'Fake Clinic', 'mobile': '9111222305', 'password': 'pw123456',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Hospital.objects.filter(mobile='9111222305').exists())


@override_settings(CACHES=LOCMEM_CACHE, REST_FRAMEWORK=REST_FRAMEWORK_TEST)
class TenantReassignmentTests(TestCase):
    """Vuln: `hospital`/`center` were writable on update, and the ownership
    check ran against the row's CURRENT owner — so a partner could push its own
    doctor (payout account and all) into someone else's listing."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.mine   = Hospital.objects.create(name='Mine',   mobile='9111222306', status='approved')
        self.theirs = Hospital.objects.create(name='Theirs', mobile='9111222307', status='approved')
        self.staff  = User.objects.create_user(
            username='9111222306', mobile='9111222306', password='pw123456',
            role='hospital', last_name=str(self.mine.id),
        )
        self.doctor = Doctor.objects.create(
            name='Dr Own', specialization='GP', hospital=self.mine, mobile='9111222308',
        )
        self.client.force_authenticate(user=self.staff)

    def test_cannot_move_doctor_to_another_hospital(self):
        res = self.client.patch(
            f'/api/doctors/{self.doctor.id}/',
            {'hospital': self.theirs.id}, format='json',
        )
        self.assertEqual(res.status_code, 400)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.hospital_id, self.mine.id)

    def test_resending_the_same_hospital_still_works(self):
        res = self.client.patch(
            f'/api/doctors/{self.doctor.id}/',
            {'hospital': self.mine.id, 'name': 'Dr Renamed'}, format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.name, 'Dr Renamed')

    def test_cannot_move_scan_to_another_centre(self):
        """Same hole, same shape — and both dashboards re-send the centre id on
        every scan edit, so the 'unchanged is fine' half matters here too."""
        from scans.models import Scan
        for h in (self.mine, self.theirs):
            h.kind = Hospital.SCAN_CENTER
            h.save(update_fields=['kind'])
        scan = Scan.objects.create(center=self.mine, name='MRI Brain', price=4500)

        res = self.client.patch(
            f'/api/scans/{scan.id}/', {'center': self.theirs.id}, format='json',
        )
        self.assertEqual(res.status_code, 400)
        scan.refresh_from_db()
        self.assertEqual(scan.center_id, self.mine.id)

        res = self.client.patch(
            f'/api/scans/{scan.id}/',
            {'center': self.mine.id, 'name': 'MRI Spine'}, format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        scan.refresh_from_db()
        self.assertEqual(scan.name, 'MRI Spine')


@override_settings(CACHES=LOCMEM_CACHE, REST_FRAMEWORK=REST_FRAMEWORK_TEST)
class BlockRevokesSessionTests(TestCase):
    """Vuln: blocking only set `status`, which nothing but LoginView reads — so
    the blocked user's existing JWT kept working and /token/refresh/ kept
    rotating a fresh 14-day refresh token."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.admin  = User.objects.create_user(
            username='9111222309', mobile='9111222309', password='pw123456', role='admin',
        )
        self.victim = User.objects.create_user(
            username='9111222310', mobile='9111222310', password='pw123456',
        )

    def _block(self, user):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(
            f'/api/auth/users/{user.id}/block/', {'status': 'blocked'}, format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.client.force_authenticate(user=None)

    def test_block_invalidates_the_refresh_token(self):
        refresh = str(RefreshToken.for_user(self.victim))
        self._block(self.victim)
        res = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_block_invalidates_the_access_token(self):
        access = str(RefreshToken.for_user(self.victim).access_token)
        self._block(self.victim)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)

    def test_blocking_does_not_approve_a_pending_hospital(self):
        """is_active is the hospital-approval flag, not the moderation flag —
        blocking and unblocking must leave admin approval exactly as it was."""
        pending = User.objects.create_user(
            username='9111222311', mobile='9111222311', password='pw123456',
            role='hospital', is_active=False,
        )
        self._block(pending)
        self.client.force_authenticate(user=self.admin)
        self.client.patch(
            f'/api/auth/users/{pending.id}/block/', {'status': 'active'}, format='json',
        )
        pending.refresh_from_db()
        self.assertFalse(pending.is_active)


@override_settings(CACHES=LOCMEM_CACHE, REST_FRAMEWORK=REST_FRAMEWORK_TEST)
class PasswordStrengthTests(TestCase):
    """Vuln: AUTH_PASSWORD_VALIDATORS only bind where validate_password() is
    called, and nothing called it — so the API enforced a 6-char minimum and
    nothing else. A patient's own phone number passed as their password."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def _verified(self, mobile):
        cache.set(f'otp_verified:{mobile}', True, timeout=600)
        return mobile

    def test_register_rejects_the_mobile_as_its_own_password(self):
        mobile = self._verified('9111222401')
        res = self.client.post('/api/auth/register/', {
            'name': 'Phone Password', 'mobile': mobile, 'password': mobile,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('password', res.json())
        self.assertFalse(User.objects.filter(mobile=mobile).exists())

    def test_register_rejects_a_common_password(self):
        mobile = self._verified('9111222402')
        res = self.client.post('/api/auth/register/', {
            'name': 'Common', 'mobile': mobile, 'password': 'password123',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(mobile=mobile).exists())

    def test_register_accepts_a_strong_password(self):
        mobile = self._verified('9111222403')
        res = self.client.post('/api/auth/register/', {
            'name': 'Strong', 'mobile': mobile, 'password': 'Pat1ent-Str0ng-2026',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)

    def test_reset_rejects_a_weak_password_and_keeps_the_old_one(self):
        mobile = '9111222404'
        user = User.objects.create_user(
            username=mobile, mobile=mobile, password='Pat1ent-Str0ng-2026',
        )
        self._verified(mobile)
        res = self.client.post('/api/auth/reset-password/', {
            'mobile': mobile, 'otp': '123456', 'password': 'password123',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Pat1ent-Str0ng-2026'))

    def test_hospital_register_rejects_a_weak_password(self):
        mobile = self._verified('9111222405')
        res = self.client.post('/api/hospitals/register/', {
            'name': 'Weak Clinic', 'mobile': mobile, 'password': 'secret123',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Hospital.objects.filter(mobile=mobile).exists())
        self.assertFalse(User.objects.filter(mobile=mobile).exists())
