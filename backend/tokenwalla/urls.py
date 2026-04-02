from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/',       admin.site.urls),
    path('api/auth/',    include('users.urls')),
    path('api/doctors/', include('doctors.urls')),
    path('api/hospitals/', include('hospitals.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/payment/', include('payments.urls')),
]