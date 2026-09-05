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


def _proxy_probe(request):
    """What the throttles think the caller's address is — echoed to the caller.

    NUM_PROXIES decides whether every per-IP limit in the product works, and it
    cannot be verified from the code: it depends on how many proxies sit in
    front in the real deployment. Guessing it wrong is asymmetric — too high and
    the limits are spoofable again, too low and everyone shares one bucket and
    gets 429s, which is the silent, self-confirming failure this codebase has
    already been bitten by twice (see the OTP rate comments in settings.py).

    So: curl /health/ from a phone on mobile data and read `resolved_ident`. If
    it is that phone's public address, NUM_PROXIES is right. If it is something
    else — a CDN egress, or a private 10.x — it is too low and real users are
    being grouped together.

    Discloses nothing: `resolved_ident` is the CALLER'S OWN address, derived
    from the caller's own request, exactly as any echo service returns it. No
    other user's data is involved, and the raw header is deliberately NOT
    echoed — the count is what diagnoses the setting.
    """
    from rest_framework.throttling import BaseThrottle

    xff = request.META.get('HTTP_X_FORWARDED_FOR') or ''
    return {
        'num_proxies':    settings.REST_FRAMEWORK.get('NUM_PROXIES'),
        'chain_length':   len([p for p in xff.split(',') if p.strip()]),
        'resolved_ident': BaseThrottle().get_ident(request),
    }


def health_check(request):
    """Used by load balancers, uptime monitors, and CI pipelines.

    `status` stays 'ok' even when the cache probe fails, and the response stays
    200. Railway's healthcheck restarts the service on a failure, and restarting
    does not fix an unreachable Redis — it would turn a degraded API into a
    restart loop with no API at all. Read `cache.ok` to judge that.

    `commit` is the short SHA this container was built from, so a deploy can be
    confirmed by comparing it to `git rev-parse --short main` instead of hunting
    for a behaviour change to probe. Empty locally and in tests, where Railway's
    variable is absent — an empty string means "unknown", never "not deployed".
    """
    return JsonResponse({
        'status':  'ok',
        'version': '1.0.0',
        'commit':  settings.GIT_COMMIT,
        'cache':   _cache_probe(),
        # See _proxy_probe: the one setting that decides whether the rate
        # limits work, and the only way to confirm it against the real
        # deployment rather than assuming.
        'proxy':   _proxy_probe(request),
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
    # Additive: nothing installed calls this, so it carries no contract risk.
    path('api/scans/',        include('scans.urls')),
    path('api/bookings/',     include('bookings.urls')),
    path('api/payment/',      include('payments.urls')),
    path('api/notifications/', include('notifications.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)