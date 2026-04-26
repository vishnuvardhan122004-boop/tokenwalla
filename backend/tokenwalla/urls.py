from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static
from users.auth_views import TempResetAdminView

def health_check(request):
    """Used by load balancers, uptime monitors, and CI pipelines."""
    return JsonResponse({'status': 'ok', 'version': '1.0.0'})


admin.site.site_header = 'TokenWalla Admin'
admin.site.site_title  = 'TokenWalla'
admin.site.index_title = 'Administration'

# Django will automatically add a trailing slash if APPEND_SLASH = True (default)
urlpatterns = [
    # ── Internal / infra ──────────────────────────────────────────────────────
    path('secure-admin-tw/',  admin.site.urls),
    path('health/',           health_check),
    path('tw-temp-reset/', TempResetAdminView.as_view()),

    # ── API routes ────────────────────────────────────────────────────────────
    path('api/auth/',         include('users.urls')),
    path('api/doctors/',      include('doctors.urls')),
    path('api/hospitals/',    include('hospitals.urls')),
    path('api/bookings/',     include('bookings.urls')),
    path('api/payment/',      include('payments.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)