from django.urls import path
from .views import CreateOrderView, VerifyPaymentView, AdminReportsView

urlpatterns = [
    path('create-order/', CreateOrderView.as_view()),
    path('verify/',       VerifyPaymentView.as_view()),
    path('reports/',      AdminReportsView.as_view()),
]
