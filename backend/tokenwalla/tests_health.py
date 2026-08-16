"""
The /health/ cache probe.

Added to make the Redis cutover verifiable. DRF's throttles are global, so
every request touches the cache — a cache that is configured but unreachable
breaks the entire API, and until now the only way to tell which backend was
actually live was to infer it from Postgres write metrics.

The contract these lock down is mostly about what health checks must NOT do.

Run:  python manage.py test tokenwalla.tests_health
"""
from unittest import mock

from django.test import TestCase, override_settings

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
REDIS = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                     'LOCATION': 'redis://127.0.0.1:6379/0'}}


@override_settings(CACHES=LOCMEM)
class HealthProbeTests(TestCase):
    url = '/health/'

    def test_reports_a_working_cache(self):
        body = self.client.get(self.url).json()
        self.assertEqual(body['status'], 'ok')
        self.assertTrue(body['cache']['ok'])

    def test_still_reports_the_existing_fields(self):
        """Monitors and CI already read these — the probe is additive."""
        body = self.client.get(self.url).json()
        self.assertEqual(body['status'], 'ok')
        self.assertEqual(body['version'], '1.0.0')

    def test_names_the_backend_so_a_cutover_can_be_confirmed(self):
        self.assertEqual(self.client.get(self.url).json()['cache']['backend'], 'database')

        with override_settings(CACHES=REDIS):
            # Labelled from configuration, so it reports 'redis' even when the
            # server is unreachable — which is exactly the case you need to see.
            with mock.patch('tokenwalla.urls.cache.set', side_effect=ConnectionError('down')):
                body = self.client.get(self.url).json()
        self.assertEqual(body['cache']['backend'], 'redis')

    def test_an_unreachable_cache_does_not_500_or_flip_status(self):
        """The important one.

        Railway restarts the service when the healthcheck fails, and restarting
        does not fix an unreachable Redis — it would turn a degraded API into a
        restart loop. So: still 200, still status 'ok', with cache.ok False.
        """
        with mock.patch('tokenwalla.urls.cache.set', side_effect=ConnectionError('down')):
            res = self.client.get(self.url)

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['status'], 'ok')
        self.assertFalse(body['cache']['ok'])

    def test_a_silently_wrong_cache_reads_as_not_ok(self):
        """set() succeeding but get() returning nothing still counts as broken."""
        with mock.patch('tokenwalla.urls.cache.get', return_value=None):
            body = self.client.get(self.url).json()
        self.assertFalse(body['cache']['ok'])

    @override_settings(GIT_COMMIT='4648fe91')
    def test_reports_the_deployed_commit(self):
        """So a deploy can be confirmed instead of inferred.

        The two deploys before this were only verifiable because they happened
        to add an endpoint to probe; one that adds no HTTP surface left "the
        service is up" standing in for "the new code is live".
        """
        self.assertEqual(self.client.get(self.url).json()['commit'], '4648fe91')

    @override_settings(GIT_COMMIT='')
    def test_a_missing_commit_is_empty_not_an_error(self):
        """Locally and in tests Railway's variable is absent.

        An unset value must degrade to '' — never raise, and never make the
        healthcheck look unhealthy, or Railway would restart the service over a
        cosmetic field.
        """
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['commit'], '')
        self.assertEqual(body['status'], 'ok')
