from django.urls import path
from .views import (
    MyBookingsView, HospitalQueueView,
    CallNextView, CompleteBookingView,
    AllBookingsView, UpgradeQueueAccessView,
    CancelBookingView, RescheduleBookingView,
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
]