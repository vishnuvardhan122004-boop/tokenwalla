from django.urls import path
from .views import (
    HospitalListView,
    HospitalRegisterView,
    HospitalLoginView,
    HospitalDetailView,
    HospitalResetPasswordView,
    HospitalAdminListView,
    HospitalApproveView,
    HospitalBookingSummaryView,   # NEW
    HospitalForceDeleteView,      # NEW
)
 
urlpatterns = [
    path('',                           HospitalListView.as_view()),
    path('register/',                  HospitalRegisterView.as_view()),
    path('login/',                     HospitalLoginView.as_view()),
    path('reset-password/',            HospitalResetPasswordView.as_view()),
    path('admin/all/',                 HospitalAdminListView.as_view()),
    path('<int:pk>/',                  HospitalDetailView.as_view()),
    path('<int:pk>/approve/',          HospitalApproveView.as_view()),
    path('<int:pk>/booking-summary/',  HospitalBookingSummaryView.as_view()),  # NEW
    path('<int:pk>/force-delete/',     HospitalForceDeleteView.as_view()),     # NEW
]