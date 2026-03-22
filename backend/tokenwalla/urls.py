from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/',         admin.site.urls),
    path('api/auth/',      include('users.urls')),
    path('api/hospitals/', include('hospitals.urls')),
    path('api/doctors/',   include('doctors.urls')),
    path('api/bookings/',  include('bookings.urls')),
    path('api/payment/',   include('payments.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
