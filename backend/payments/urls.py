from django.urls import path
from .views import (
    CreateOrderView, VerifyPaymentView, AdminReportsView, BookingReceiptView,
)
from .webhooks import RazorpayWebhookView

urlpatterns = [
    path('create-order/',       CreateOrderView.as_view()),
    path('verify/',             VerifyPaymentView.as_view()),
    path('reports/',            AdminReportsView.as_view()),
    path('receipt/<int:pk>/',   BookingReceiptView.as_view()),
    path('webhook/',            RazorpayWebhookView.as_view()),
]
