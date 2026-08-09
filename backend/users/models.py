from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import IntegrityError, models, transaction
from django.utils import timezone


class RateCounter(models.Model):
    """A counter that is atomic no matter which cache backend is configured.

    The OTP attempt cap and the daily SMS-send cap used to live in the cache and
    rely on ``cache.incr()`` being atomic. That is only true on Redis —
    ``DatabaseCache`` inherits ``BaseCache.incr``, which is a read-modify-write:

        value = self.get(key); self.set(key, value + delta)

    It didn't matter while gunicorn ran a single sync worker, because requests
    were strictly serialised and the race was impossible. Moving to 3 workers ×
    4 threads made 12 requests concurrent, so parallel wrong guesses could each
    read the same count before any of them wrote back and slip past the cap.

    Keeping this in the database instead of the cache means the guarantee no
    longer depends on which backend happens to be configured — these caps are a
    security control and should not quietly weaken because an env var changed.

    Rows are keyed per subject (one per phone number), so the table stays small
    and self-limiting; a window that has expired is reset in place rather than
    accumulating new rows.
    """

    key        = models.CharField(max_length=200, unique=True)
    count      = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=['expires_at'], name='idx_ratecounter_expires')]

    def __str__(self):
        return f'{self.key} = {self.count} (until {self.expires_at:%Y-%m-%d %H:%M})'

    @classmethod
    def bump(cls, key, *, limit, window_seconds):
        """Count one event against `key`. Returns (allowed, count_after).

        `allowed` is False once the count for the current window exceeds
        `limit`. The row is locked with select_for_update() for the read and the
        write, so concurrent callers are serialised and cannot both observe the
        same pre-increment value.

        The window is rolling from the FIRST event, not refreshed on later ones
        — matching the previous cache-timeout behaviour, so a caller cannot hold
        themselves out of a reset by continuing to hammer the endpoint.
        """
        now     = timezone.now()
        expires = now + timedelta(seconds=window_seconds)

        # Two attempts: a concurrent create can lose the unique-key race, in
        # which case the row now exists and the second pass takes the lock path.
        for _ in range(2):
            try:
                with transaction.atomic():
                    obj, created = cls.objects.get_or_create(
                        key=key, defaults={'count': 1, 'expires_at': expires},
                    )
                    if created:
                        return 1 <= limit, 1

                    locked = cls.objects.select_for_update().get(pk=obj.pk)
                    if locked.expires_at <= now:
                        # Window elapsed — start a fresh one.
                        locked.count, locked.expires_at = 1, expires
                    else:
                        locked.count += 1
                    locked.save(update_fields=['count', 'expires_at'])
                    return locked.count <= limit, locked.count
            except IntegrityError:
                continue

        # Both passes lost the race, which should not happen. Fail CLOSED: a
        # counter that can't be read is not a reason to allow the request.
        return False, limit + 1

    @classmethod
    def reset(cls, key):
        cls.objects.filter(key=key).delete()

    @classmethod
    def purge_expired(cls):
        """Housekeeping — safe to call from anywhere, deletes nothing in use."""
        return cls.objects.filter(expires_at__lte=timezone.now()).delete()[0]


class User(AbstractUser):
    mobile = models.CharField(max_length=15, unique=True)
    role   = models.CharField(max_length=20,
               choices=[('patient','Patient'),('hospital','Hospital'),('admin','Admin')],
               default='patient')
    status = models.CharField(max_length=20, default='active')
    whatsapp_opt_in = models.BooleanField(default=True)
    USERNAME_FIELD  = 'mobile'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return f"{self.username} ({self.mobile})"
