"""
Tests for GET /api/app-version/ — the mobile app's launch-time version gate.

The endpoint itself is trivial; what these lock down is the operational
contract the app depends on:

  * it is public (the app calls it before anyone logs in)
  * it never blocks by default (an empty APP_MIN_VERSION), because a blocking
    prompt is unrecoverable for the patient
  * changing the Railway env vars is enough to retarget it

Run:  python manage.py test tokenwalla.tests_app_version
"""
from django.test import TestCase, override_settings


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class AppVersionEndpointTests(TestCase):
    url = '/api/app-version/'

    def test_is_public(self):
        """No auth header — the app checks its version before login."""
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)

    def test_returns_the_four_keys_the_app_reads(self):
        res = self.client.get(self.url)
        self.assertEqual(
            set(res.json()),
            {'min_version', 'latest_version', 'store_url', 'message'},
        )

    @override_settings(APP_MIN_VERSION='', APP_LATEST_VERSION='')
    def test_blank_by_default_means_no_prompt(self):
        """The shipped default must not nag and must never block.

        A wrong value here reaches every install at once, so "off" is the
        only safe default.
        """
        body = self.client.get(self.url).json()
        self.assertEqual(body['min_version'], '')
        self.assertEqual(body['latest_version'], '')

    @override_settings(APP_MIN_VERSION='1.2.0', APP_LATEST_VERSION='1.3.0',
                       APP_UPDATE_MESSAGE='Please update to keep booking.')
    def test_reflects_the_configured_values(self):
        body = self.client.get(self.url).json()
        self.assertEqual(body['min_version'], '1.2.0')
        self.assertEqual(body['latest_version'], '1.3.0')
        self.assertEqual(body['message'], 'Please update to keep booking.')

    @override_settings(APP_STORE_URL='https://play.google.com/store/apps/details?id=com.example')
    def test_store_url_is_configurable(self):
        body = self.client.get(self.url).json()
        self.assertEqual(body['store_url'], 'https://play.google.com/store/apps/details?id=com.example')
