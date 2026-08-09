from django.urls import path
from .views import (
    CreateOrderView, VerifyPaymentView, AdminReportsView, BookingReceiptView,
    PendingPayoutsView, MarkPayoutPaidView, DailyOpsSummaryView,
)

urlpatterns = [
    path('create-order/',       CreateOrderView.as_view()),
    path('verify/',             VerifyPaymentView.as_view()),
    path('reports/',            AdminReportsView.as_view()),
    path('receipt/<int:pk>/',   BookingReceiptView.as_view()),
    path('payouts/pending/',    PendingPayoutsView.as_view()),
    path('payouts/mark-paid/',  MarkPayoutPaidView.as_view()),
    # Additive, admin-only, read-only. The mobile app never calls this, so it
    # carries no API-contract risk.
    path('daily-summary/',      DailyOpsSummaryView.as_view()),
]
