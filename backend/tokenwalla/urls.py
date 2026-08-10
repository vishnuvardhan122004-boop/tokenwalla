from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static


def health_check(request):
    """Used by load balancers, uptime monitors, and CI pipelines."""
    return JsonResponse({'status': 'ok', 'version': '1.0.0'})


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