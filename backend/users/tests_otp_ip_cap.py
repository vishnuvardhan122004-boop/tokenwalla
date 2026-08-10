"""
The per-IP daily ceiling on OTP sends.

Why this exists: the per-number cap (10/day) is blind to one host walking a
list of a thousand different numbers — each number spends one send and none of
them trip it. The per-minute throttle bounds the rate, not the day's total, so
5/minute still allowed ~7,200 paid SMS a day from a single address.

That burst was also raised (5 -> 20/minute) because carrier-grade NAT puts many
real users behind one public IP and a promotion 429'd legitimate signups. These
tests pin the ceiling that makes the looser burst safe.

The burst throttle itself is patched out here — it's DRF's, it has its own
tests, and 200 requests to exercise the daily cap would trip it first.

Run:  python manage.py test users.tests_otp_ip_cap
"""
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from users.auth_views import OTPRateThrottle
from users.models import RateCounter


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
    OTP_MAX_SENDS_PER_IP_PER_DAY=3,
)
class OTPPerIPDailyCapTests(TestCase):
    url = '/api/auth/otp/request/'

    def setUp(self):
        cache.clear()
        # Real SMS costs money; never let the suite reach the provider.
        p = mock.patch('users.auth_views.send_otp', return_value='session-123')
        self.send_otp = p.start()
        self.addCleanup(p.stop)
        # The per-minute burst is DRF's own and would fire before the daily cap.
        b = mock.patch.object(OTPRateThrottle, 'allow_request', return_value=True)
        b.start()
        self.addCleanup(b.stop)

    def _request(self, mobile, ip='203.0.113.7'):
        return self.client.post(self.url, {'mobile': mobile}, REMOTE_ADDR=ip)

    def test_different_numbers_from_one_ip_share_the_ceiling(self):
        """The attack the per-number cap cannot see."""
        for i in range(3):
            res = self._request(f'98765432{10 + i}')
            self.assertEqual(res.status_code, 200, res.content)

        blocked = self._request('9876543299')
        self.assertEqual(blocked.status_code, 429)
        self.assertIn('network', blocked.json()['message'].lower())
        # And no fourth SMS was paid for.
        self.assertEqual(self.send_otp.call_count, 3)

    def test_a_different_ip_is_unaffected(self):
        for i in range(3):
            self._request(f'98765432{10 + i}')
        self.assertEqual(self._request('9876543299').status_code, 429)

        other = self._request('9876543298', ip='198.51.100.4')
        self.assertEqual(other.status_code, 200, other.content)

    def test_being_blocked_by_ip_does_not_spend_the_number_budget(self):
        """A blocked host must not burn a real number's 10/day allowance.

        This is why the IP check runs before the per-number one.
        """
        for i in range(3):
            self._request(f'98765432{10 + i}')

        victim = '9876543277'
        self.assertEqual(self._request(victim).status_code, 429)
        self.assertFalse(
            RateCounter.objects.filter(key=f'otp_sends:{victim}').exists(),
            'the victim number was charged for a send that never happened',
        )

    def test_the_ceiling_is_configurable(self):
        with override_settings(OTP_MAX_SENDS_PER_IP_PER_DAY=1):
            self.assertEqual(self._request('9812345670').status_code, 200)
            self.assertEqual(self._request('9812345671').status_code, 429)
