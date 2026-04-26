# backend/bookings/urls.py
# ─────────────────────────────────────────────────────────────────────────────
# Drop-in replacement for your existing bookings/urls.py
# Key fix: ScanQRView needs separate URL entries for GET (lookup) and POST
# (mark attended) — both use the same <str:token> path parameter.
# ─────────────────────────────────────────────────────────────────────────────

from django.urls import path
from .views import (
    MyBookingsView,
    HospitalQueueView,
    CallNextView,
    CompleteBookingView,
    AllBookingsView,
    UpgradeQueueAccessView,
    CancelBookingView,
    RescheduleBookingView,
    ScanQRView,
)

urlpatterns = [
    path('',                         AllBookingsView.as_view()),
    path('my/',                      MyBookingsView.as_view()),
    path('queue/<int:hospital_id>/', HospitalQueueView.as_view()),
    path('call/<int:pk>/',           CallNextView.as_view()),
    path('complete/<int:pk>/',       CompleteBookingView.as_view()),
    path('upgrade/<int:pk>/',        UpgradeQueueAccessView.as_view()),
    path('cancel/<int:pk>/',         CancelBookingView.as_view()),
    path('reschedule/<int:pk>/',     RescheduleBookingView.as_view()),

    # ── QR Scanner endpoints ──────────────────────────────────────────────────
    # GET  /api/bookings/scan/<token>/  → look up booking info
    # POST /api/bookings/scan/<token>/  → mark booking as in_progress
    path('scan/<str:token>/',        ScanQRView.as_view()),
]