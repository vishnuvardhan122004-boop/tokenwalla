from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    """Used by load balancers and uptime monitors."""
    return JsonResponse({'status': 'ok'})


# Obfuscate the admin URL — change 'secure-admin-tw/' to something only you know
admin.site.site_header = 'TokenWalla Admin'
admin.site.site_title  = 'TokenWalla'
admin.site.index_title = 'Administration'

urlpatterns = [
    path('secure-admin-tw/',   admin.site.urls),
    path('health/',            health_check),
    path('api/auth/',          include('users.urls')),
    path('api/doctors/',       include('doctors.urls')),
    path('api/hospitals/',     include('hospitals.urls')),
    path('api/bookings/',      include('bookings.urls')),
    path('api/payment/',       include('payments.urls')),
]