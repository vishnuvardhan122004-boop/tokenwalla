from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .auth_views import (
    CreateAdminView, RegisterView, LoginView, LogoutView,
    MeView, RequestOTPView, VerifyOTPView,
    AllUsersView, BlockUserView, ResetPasswordView,
)

urlpatterns = [
    path('register/',             RegisterView.as_view()),
    path('login/',                LoginView.as_view()),
    path('logout/',               LogoutView.as_view()),
    path('token/refresh/',        TokenRefreshView.as_view()),
    path('otp/request/',          RequestOTPView.as_view()),
    path('otp/verify/',           VerifyOTPView.as_view()),
    path('me/',                   MeView.as_view()),
    path('users/',                AllUsersView.as_view()),
    path('users/<int:pk>/block/', BlockUserView.as_view()),
    path('reset-password/',       ResetPasswordView.as_view()),
    path('create-admin/',         CreateAdminView.as_view()), 
]