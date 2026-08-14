import logging

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static
from django.core.cache import cache

logger = logging.getLogger('tokenwalla')


def _cache_probe():
    """Round-trip the cache so switching backends can be confirmed, not assumed.

    Every request already touches the cache (DRF's throttles are global), so a
    cache that looks configured but doesn't answer breaks the whole API. Before
    this, the only way to tell which backend was live was to infer it from
    Postgres write metrics.

    The backend label is deliberately coarse — 'redis' or 'database', never the
    URL — since /health/ is public.
    """
    backend = (
        'redis'
        if settings.CACHES['default']['BACKEND'].endswith('RedisCache')
        else 'database'
    )
    try:
        cache.set('health_probe', 'ok', timeout=10)
        ok = cache.get('health_probe') == 'ok'
    except Exception:
        # A health endpoint must never raise: a 500 here reads as "the whole
        # service is down" to anything watching, which is a worse signal than
        # "the cache is unreachable".
        logger.exception('Cache probe failed on /health/')
        ok = False
    return {'backend': backend, 'ok': ok}


def health_check(request):
    """Used by load balancers, uptime monitors, and CI pipelines.

    `status` stays 'ok' even when the cache probe fails, and the response stays
    200. Railway's healthcheck restarts the service on a failure, and restarting
    does not fix an unreachable Redis — it would turn a degraded API into a
    restart loop with no API at all. Read `cache.ok` to judge that.
    """
    return JsonResponse({
        'status':  'ok',
        'version': '1.0.0',
        'cache':   _cache_probe(),
    })


def app_version(request):
    """What the mobile app should do about its own version, on launch.

    Public and read-only: the app calls this before anyone logs in, and it
    leaks nothing an installed APK doesn't already contain. Driven entirely by
    Railway env vars (see settings), so the prompt can be turned on, retargeted
    or turned off without a store release.

    An empty `min_version` means "never block" and is the default — a blocking
    prompt is unrecoverable for the patient, so it has to be switched on
    deliberately.
    """
    return JsonResponse({
        'min_version':    settings.APP_MIN_VERSION,
        'latest_version': settings.APP_LATEST_VERSION,
        'store_url':      settings.APP_STORE_URL,
        'message':        settings.APP_UPDATE_MESSAGE,
    })


admin.site.site_header = 'TokenWalla Admin'
admin.site.site_title  = 'TokenWalla'
admin.site.index_title = 'Administration'

# Django will automatically add a trailing slash if APPEND_SLASH = True (default)
urlpatterns = [
    # ── Internal / infra ──────────────────────────────────────────────────────
    path('secure-admin-tw/',  admin.site.urls),
    path('health/',           health_check),

    # Public, read-only. Additive: installed apps that never call it are
    # unaffected, so this is safe to deploy ahead of any app release.
    path('api/app-version/',  app_version),

    # ── API routes ────────────────────────────────────────────────────────────
    path('api/auth/',         include('users.urls')),
    path('api/doctors/',      include('doctors.urls')),
    path('api/hospitals/',    include('hospitals.urls')),
    path('api/bookings/',     include('bookings.urls')),
    path('api/payment/',      include('payments.urls')),
    path('api/notifications/', include('notifications.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)