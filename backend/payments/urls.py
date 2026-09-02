from django.urls import path
from .views import (
    CreateOrderView, VerifyPaymentView, AdminReportsView, BookingReceiptView,
    PendingPayoutsView, MarkPayoutPaidView, DailyOpsSummaryView,
    PassView, RedeemPassView,
)

urlpatterns = [
    path('create-order/',       CreateOrderView.as_view()),
    path('verify/',             VerifyPaymentView.as_view()),
    path('reports/',            AdminReportsView.as_view()),
    path('receipt/<int:pk>/',   BookingReceiptView.as_view()),
    # The Appointment Pass. Both additive — an installed app build that
    # doesn't know about them keeps paying the service fee per booking.
    path('pass/',               PassView.as_view()),
    path('pass/redeem/',        RedeemPassView.as_view()),
    path('payouts/pending/',    PendingPayoutsView.as_view()),
    path('payouts/mark-paid/',  MarkPayoutPaidView.as_view()),
    # Additive, admin-only, read-only. The mobile app never calls this, so it
    # carries no API-contract risk.
    path('daily-summary/',      DailyOpsSummaryView.as_view()),
]
