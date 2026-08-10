"""
The OTP caps hold under concurrency.

These caps are the defence against brute-forcing a 6-digit OTP and against
flooding a phone number with paid SMS. They used to be counted in the cache with
``cache.add`` + ``cache.incr``, which is only atomic on Redis — DatabaseCache
inherits ``BaseCache.incr``, a read-modify-write.

That was harmless while gunicorn ran a single sync worker, because requests were
strictly serialised. Moving to 3 workers x 4 threads made twelve requests
concurrent, at which point parallel attempts could each read the same count
before any of them wrote back and slip past the cap. Counting in the database
under a row lock makes the guarantee independent of the cache backend.

Run:  python manage.py test users.tests_rate_counter
"""
import threading
import unittest
from datetime import timedelta

from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from users.auth_views import (
    OTP_MAX_ATTEMPTS, OTP_MAX_SENDS_PER_DAY, _register_otp_failure,
    _reserve_otp_send,
)
from users.models import RateCounter


class RateCounterTests(TestCase):

    def test_counts_up_and_stops_at_the_limit(self):
        results = [RateCounter.bump('k', limit=3, window_seconds=60)
                   for _ in range(5)]
        self.assertEqual([allowed for allowed, _ in results],
                         [True, True, True, False, False])
        self.assertEqual([count for _, count in results], [1, 2, 3, 4, 5])

    def test_a_limit_of_one_allows_exactly_one(self):
        self.assertTrue(RateCounter.bump('k', limit=1, window_seconds=60)[0])
        self.assertFalse(RateCounter.bump('k', limit=1, window_seconds=60)[0])

    def test_keys_are_independent(self):
        RateCounter.bump('a', limit=1, window_seconds=60)
        self.assertTrue(RateCounter.bump('b', limit=1, window_seconds=60)[0])

    def test_an_expired_window_starts_fresh(self):
        RateCounter.bump('k', limit=1, window_seconds=60)
        self.assertFalse(RateCounter.bump('k', limit=1, window_seconds=60)[0])

        RateCounter.objects.filter(key='k').update(
            expires_at=timezone.now() - timedelta(seconds=1))

        allowed, count = RateCounter.bump('k', limit=1, window_seconds=60)
        self.assertTrue(allowed)
        self.assertEqual(count, 1)

    def test_the_window_is_not_extended_by_further_attempts(self):
        """Rolling from the FIRST event. Otherwise someone could hold their own
        counter open indefinitely by continuing to hammer the endpoint."""
        RateCounter.bump('k', limit=10, window_seconds=60)
        first_expiry = RateCounter.objects.get(key='k').expires_at
        RateCounter.bump('k', limit=10, window_seconds=60)
        self.assertEqual(RateCounter.objects.get(key='k').expires_at, first_expiry)

    def test_reset_clears_the_counter(self):
        RateCounter.bump('k', limit=1, window_seconds=60)
        RateCounter.reset('k')
        self.assertTrue(RateCounter.bump('k', limit=1, window_seconds=60)[0])

    def test_one_row_per_key_no_matter_how_many_events(self):
        for _ in range(20):
            RateCounter.bump('k', limit=100, window_seconds=60)
        self.assertEqual(RateCounter.objects.filter(key='k').count(), 1)

    def test_purge_removes_only_expired_rows(self):
        RateCounter.bump('live', limit=5, window_seconds=60)
        RateCounter.bump('dead', limit=5, window_seconds=60)
        RateCounter.objects.filter(key='dead').update(
            expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(RateCounter.purge_expired(), 1)
        self.assertTrue(RateCounter.objects.filter(key='live').exists())


class OtpCapTests(TestCase):
    MOBILE = '9999900001'

    def test_daily_send_cap_blocks_the_flood(self):
        for _ in range(OTP_MAX_SENDS_PER_DAY):
            self.assertTrue(_reserve_otp_send(self.MOBILE))
        self.assertFalse(_reserve_otp_send(self.MOBILE))

    def test_wrong_guesses_burn_the_code_at_the_cap(self):
        from django.core.cache import cache
        cache.set(f'otp_session:{self.MOBILE}', '123456', timeout=300)

        for _ in range(OTP_MAX_ATTEMPTS - 1):
            _register_otp_failure(self.MOBILE)
        self.assertIsNotNone(cache.get(f'otp_session:{self.MOBILE}'))

        _register_otp_failure(self.MOBILE)
        self.assertIsNone(cache.get(f'otp_session:{self.MOBILE}'))

    def test_a_successful_login_does_not_reset_the_spend_ceiling(self):
        """Clearing OTP state must not hand back free SMS. If it did, an
        attacker could reset the daily cap by logging in once."""
        from users.auth_views import _clear_otp_state
        for _ in range(OTP_MAX_SENDS_PER_DAY):
            _reserve_otp_send(self.MOBILE)

        _clear_otp_state(self.MOBILE)

        self.assertFalse(_reserve_otp_send(self.MOBILE))

    def test_clearing_state_does_reset_the_attempt_counter(self):
        for _ in range(OTP_MAX_ATTEMPTS - 1):
            _register_otp_failure(self.MOBILE)
        from users.auth_views import _clear_otp_state
        _clear_otp_state(self.MOBILE)
        self.assertFalse(
            RateCounter.objects.filter(key=f'otp_attempts:{self.MOBILE}').exists())


# The base class is chosen at import time, not merely skipped. Real threads need
# committed transactions, so this must be a TransactionTestCase on Postgres. CI
# runs SQLite, where the class can never execute anyway, and a TransactionTestCase
# there only adds a destructive table flush on teardown for no benefit.
_ConcurrencyBase = (TransactionTestCase if connection.vendor == 'postgresql'
                    else TestCase)


@unittest.skipUnless(
    connection.vendor == 'postgresql',
    'Needs Postgres. SQLite in shared-cache mode raises "database table is '
    'locked" instead of making the second writer wait, so concurrency here '
    'would be testing the harness, not the lock. Production is Postgres — run '
    'this against it with DATABASE_URL=postgres://... before trusting the cap.'
)
class ConcurrentCapTests(_ConcurrencyBase):
    """The regression this whole change exists for.

    TransactionTestCase, not TestCase: real threads need real committed
    transactions, and TestCase wraps each test in one the threads cannot see.

    The guarantee is SELECT ... FOR UPDATE on the counter row: the second caller
    blocks until the first commits, so it can never read a stale count. The
    invariant asserted is simply that no more than `limit` callers are told yes,
    whatever the interleaving.
    """

    def test_parallel_attempts_cannot_exceed_the_cap(self):
        limit, threads = 5, 20
        results, lock = [], threading.Lock()

        def attempt():
            from django.db import connection
            try:
                allowed, _ = RateCounter.bump(
                    'concurrent', limit=limit, window_seconds=60)
                with lock:
                    results.append(allowed)
            finally:
                connection.close()

        workers = [threading.Thread(target=attempt) for _ in range(threads)]
        for w in workers:
            w.start()
        for w in workers:
            w.join(timeout=30)

        self.assertEqual(len(results), threads, 'a thread failed to finish')
        # The invariant: at most `limit` yeses, no matter the interleaving.
        self.assertLessEqual(sum(results), limit)
        # And it isn't trivially passing by rejecting everyone.
        self.assertGreater(sum(results), 0)
        self.assertEqual(RateCounter.objects.get(key='concurrent').count, threads)

    def test_parallel_otp_sends_cannot_exceed_the_daily_cap(self):
        mobile, results, lock = '9999900002', [], threading.Lock()

        def send():
            from django.db import connection
            try:
                ok = _reserve_otp_send(mobile)
                with lock:
                    results.append(ok)
            finally:
                connection.close()

        workers = [threading.Thread(target=send)
                   for _ in range(OTP_MAX_SENDS_PER_DAY * 2)]
        for w in workers:
            w.start()
        for w in workers:
            w.join(timeout=30)

        self.assertLessEqual(sum(results), OTP_MAX_SENDS_PER_DAY)
