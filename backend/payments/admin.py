from django.contrib import admin
from .models import (
    AppointmentPass, Payment, ReschedulePayment, Refund, DoctorLedger, PayoutBatch,
)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('payment_id', 'booking', 'final_amount', 'doctor_fee',
                    'platform_fee', 'gst_amount', 'status', 'created')
    list_filter  = ('status',)
    search_fields = ('payment_id', 'order_id')


@admin.register(AppointmentPass)
class AppointmentPassAdmin(admin.ModelAdmin):
    """Read-mostly. Editing used_bookings by hand hands out free visits, so the
    counters are display-only — cancel the booking instead, which settles the
    pass through the same code path a patient's cancellation does."""
    list_display  = ('id', 'user', 'used_bookings', 'total_bookings',
                     'price', 'expires_at', 'voided_at', 'created')
    list_filter   = ('voided_at',)
    search_fields = ('user__username', 'user__mobile')
    readonly_fields = ('used_bookings', 'total_bookings', 'price',
                       'source_booking', 'created')


@admin.register(ReschedulePayment)
class ReschedulePaymentAdmin(admin.ModelAdmin):
    list_display = ('payment_id', 'booking', 'amount', 'status', 'created')
    search_fields = ('payment_id', 'order_id')


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ('id', 'payment', 'refund_percentage', 'doctor_loss',
                    'platform_loss', 'razorpay_refund_id', 'created_at')
    search_fields = ('razorpay_refund_id', 'payment__payment_id')


@admin.register(DoctorLedger)
class DoctorLedgerAdmin(admin.ModelAdmin):
    list_display = ('id', 'doctor', 'reason', 'amount', 'booking',
                    'payout_batch', 'created_at')
    list_filter  = ('reason',)
    search_fields = ('doctor__name',)
    raw_id_fields = ('booking', 'payout_batch')


@admin.register(PayoutBatch)
class PayoutBatchAdmin(admin.ModelAdmin):
    list_display = ('id', 'doctor', 'total_amount', 'payout_mode', 'status',
                    'razorpay_payout_id', 'idempotency_key', 'created_at')
    list_filter  = ('status', 'payout_mode')
    search_fields = ('idempotency_key', 'razorpay_payout_id', 'doctor__name')
