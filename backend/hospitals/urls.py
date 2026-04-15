from django.urls import path
from .views import (
    HospitalListView, HospitalRegisterView,
    HospitalLoginView, HospitalDetailView,
    HospitalResetPasswordView, HospitalAdminListView,
)

urlpatterns = [
    path('',                HospitalListView.as_view()),
    path('register/',       HospitalRegisterView.as_view()),
    path('login/',          HospitalLoginView.as_view()),
    path('reset-password/', HospitalResetPasswordView.as_view()),
    path('admin/all/',      HospitalAdminListView.as_view()),
    path('<int:pk>/',       HospitalDetailView.as_view()),
]