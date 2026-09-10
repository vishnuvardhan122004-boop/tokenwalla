"""
The otp_token fix for the otp_verified race (ROADMAP item 17).

The bearer flag `otp_verified:<mobile>` has no binding to a caller — whoever
hits the consumer endpoint first inside the window wins, not necessarily
whoever passed the OTP. /otp/verify/ now also issues a single-use otp_token;
hospital endpoints (web-only, no stale app install to break) REQUIRE it and
drop the flag fallback entirely, closing the race outright. Patient endpoints
keep the flag as an OPTIONAL fallback until a mobile app release sends the
token too.

Run:  python manage.py test users.tests_otp_token
"""
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from hospitals.models import Hospital
from users.auth_views import check_otp_proof, clear_otp_proof, issue_otp_token

User = get_user_model()

LOCMEM_CACHE = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM_CACHE)
class OtpProofHelperTests(TestCase):
    """Unit-level self-check for check_otp_proof / issue_otp_token / clear_otp_proof."""

    def setUp(self):
        cache.clear()

    def test_no_proof_at_all_fails_both_modes(self):
        self.assertFalse(check_otp_proof('9000000900'))
        self.assertFalse(check_otp_proof('9000000900', required=True))

    def test_flag_alone_satisfies_optional_but_not_required(self):
        cache.set('otp_verified:9000000901', True, timeout=60)
        self.assertTrue(check_otp_proof('9000000901'))
        self.assertFalse(check_otp_proof('9000000901', required=True))

    def test_valid_token_satisfies_both_modes(self):
        token = issue_otp_token('9000000902')
        self.assertTrue(check_otp_proof('9000000902', token))
        self.assertTrue(check_otp_proof('9000000902', token, required=True))

    def test_wrong_token_satisfies_neither(self):
        issue_otp_token('9000000903')
        self.assertFalse(check_otp_proof('9000000903', 'not-the-real-token'))
        self.assertFalse(check_otp_proof('9000000903', 'not-the-real-token', required=True))

    def test_clear_otp_proof_removes_both_keys(self):
        cache.set('otp_verified:9000000904', True, timeout=60)
        issue_otp_token('9000000904')
        clear_otp_proof('9000000904')
        self.assertFalse(check_otp_proof('9000000904'))
        self.assertIsNone(cache.get('otp_token:9000000904'))


@override_settings(CACHES=LOCMEM_CACHE)
class VerifyOTPIssuesTokenTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    @override_settings(TWOFACTOR_API_KEY='')
    def test_verify_response_carries_a_usable_token(self):
        mobile = '9111333001'
        self.client.post('/api/auth/otp/request/', {'mobile': mobile}, format='json')
        real = cache.get(f'otp_session:{mobile}')
        res = self.client.post(
            '/api/auth/otp/verify/', {'mobile': mobile, 'otp': real}, format='json',
        )
        token = res.json().get('otp_token')
        self.assertTrue(token)
        self.assertEqual(cache.get(f'otp_token:{mobile}'), token)


@override_settings(CACHES=LOCMEM_CACHE)
class HospitalEndpointsRequireTokenTests(TestCase):
    """The 3 hospital consumers: no fallback, so the bare flag can't satisfy them."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def test_register_rejects_the_bare_flag(self):
        mobile = '9111333010'
        cache.set(f'otp_verified:{mobile}', True, timeout=60)  # attacker's race window
        res = self.client.post('/api/hospitals/register/', {
            'name': 'Race Clinic', 'mobile': mobile, 'password': 'Clinic-Str0ng-2026',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Hospital.objects.filter(mobile=mobile).exists())

    def test_register_succeeds_with_a_real_token(self):
        mobile = '9111333011'
        token = issue_otp_token(mobile)
        res = self.client.post('/api/hospitals/register/', {
            'name': 'Real Clinic', 'mobile': mobile, 'password': 'Clinic-Str0ng-2026',
            'otp_token': token,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(Hospital.objects.filter(mobile=mobile).exists())

    def test_token_is_single_use(self):
        mobile = '9111333012'
        token = issue_otp_token(mobile)
        self.client.post('/api/hospitals/register/', {
            'name': 'First', 'mobile': mobile, 'password': 'Clinic-Str0ng-2026',
            'otp_token': token,
        }, format='json')
        # Same token, a second mobile — reuse must fail even though the first
        # registration succeeded.
        mobile2 = '9111333013'
        res = self.client.post('/api/hospitals/register/', {
            'name': 'Replay', 'mobile': mobile2, 'password': 'Clinic-Str0ng-2026',
            'otp_token': token,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Hospital.objects.filter(mobile=mobile2).exists())


@override_settings(CACHES=LOCMEM_CACHE)
class PatientEndpointsKeepFallbackTests(TestCase):
    """The 3 patient consumers: token is optional, flag fallback is unchanged."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def test_reset_password_still_works_via_the_bare_flag(self):
        mobile = '9111333020'
        User.objects.create_user(
            username=mobile, mobile=mobile, password='0ld-Str0ng-2026', role='patient',
        )
        cache.set(f'otp_verified:{mobile}', True, timeout=60)
        res = self.client.post('/api/auth/reset-password/', {
            'mobile': mobile, 'otp': '000000', 'password': 'New-Str0ng-2026',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.content)

    def test_reset_password_also_accepts_a_real_token(self):
        mobile = '9111333021'
        User.objects.create_user(
            username=mobile, mobile=mobile, password='0ld-Str0ng-2026', role='patient',
        )
        token = issue_otp_token(mobile)
        res = self.client.post('/api/auth/reset-password/', {
            'mobile': mobile, 'otp': '000000', 'password': 'New-Str0ng-2026',
            'otp_token': token,
        }, format='json')
        self.assertEqual(res.status_code, 200, res.content)
