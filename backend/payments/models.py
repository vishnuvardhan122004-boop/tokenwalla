from django.db import models
from bookings.models import Booking
from doctors.models import Doctor

class Payment(models.Model):
    # Lifecycle of the patient checkout payment.
    CREATED = 'CREATED'   # Razorpay order made, not yet paid/verified
    PAID    = 'PAID'      # server-confirmed with Razorpay, money captured
    FAILED  = 'FAILED'
    STATUS_CHOICES = [(CREATED, 'Created'), (PAID, 'Paid'), (FAILED, 'Failed')]

    booking    = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='payment')
    # order_id / payment_id are the Razorpay order & payment identifiers.
    order_id   = models.CharField(max_length=100)
    payment_id = models.CharField(max_length=100, blank=True)
    signature  = models.CharField(max_length=300, blank=True)
    # Legacy single total (₹, integer) kept for backward-compatible display and
    # existing reports. The authoritative, exact figures are the split fields
    # below — never read `amount` for money math.
    amount     = models.IntegerField()
    # ── Fee split (exact, 2dp) — never store just a lump total ────────────────
    # gst_amount = 18% × (platform_fee + gateway_fee); doctor_fee is GST-exempt.
    # final_amount = doctor_fee + platform_fee + gateway_fee + gst_amount.
    doctor_fee   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Consultation fee collected OFFLINE at the hospital (Service-Fee-Only mode).
    # In that mode the patient pays only the service fee online, so `doctor_fee`
    # (the online-captured amount) is 0 and the consultation fee is recorded here
    # instead. FULL-mode bookings leave this 0. Never routed through Razorpay.
    offline_doctor_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gateway_fee  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gst_amount   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    final_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default=CREATED)
    created    = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # A Razorpay payment_id settles exactly one booking. This is the
            # DB-level idempotency guard for the accept-payment API: two
            # concurrent /verify/ calls for the same payment can't both create a
            # Payment (and therefore a Booking) — the second violates this and is
            # rolled back, then served the already-created booking. Partial
            # (non-blank) so legacy/placeholder rows with an empty payment_id
            # don't collide. Mirrors ReschedulePayment.payment_id's unique guard.
            models.UniqueConstraint(
                fields=['payment_id'],
                condition=~models.Q(payment_id=''),
                name='uniq_payment_payment_id_nonblank',
            ),
        ]

    def __str__(self):
        return f"{self.payment_id} — ₹{self.final_amount} [{self.status}]"


class ReschedulePayment(models.Model):
    """
    Stores the ₹5 reschedule fee payment separately from the main Payment,
    because Payment has a OneToOneField → Booking and cannot be reused.
    A single booking can be rescheduled multiple times, so this is ForeignKey.
    """
    booking    = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='reschedule_payments',
    )
    order_id   = models.CharField(max_length=100)
    payment_id = models.CharField(max_length=100, unique=True)  # idempotency key
    signature  = models.TextField()
    amount     = models.PositiveIntegerField(default=5)          # ₹5 INR
    status     = models.CharField(max_length=20, default='success')
    created    = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ['-created']

    def __str__(self):
        return f'Reschedule ₹{self.amount} for Booking#{self.booking_id} [{self.payment_id}]'


# ─────────────────────────────────────────────────────────────────────────────
# Refunds
# ─────────────────────────────────────────────────────────────────────────────

class Refund(models.Model):
    """A cancellation refund against a booking's Payment.

    Only issued while the booking is still refundable (before COMPLETED). The
    refunded pool covers (doctor_fee + platform_fee) proportionally — gateway
    fee and GST are NOT returned by Razorpay, so they're never refunded. The
    split is recorded so each party's share of the loss is auditable.
    """
    payment            = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='refunds')
    refund_percentage  = models.DecimalField(max_digits=4,  decimal_places=2)
    doctor_loss        = models.DecimalField(max_digits=10, decimal_places=2)
    platform_loss      = models.DecimalField(max_digits=10, decimal_places=2)
    razorpay_refund_id = models.CharField(max_length=100, blank=True)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def refund_amount(self):
        return self.doctor_loss + self.platform_loss

    def __str__(self):
        return f'Refund {self.refund_percentage} on Payment#{self.payment_id}'


# ─────────────────────────────────────────────────────────────────────────────
# Doctor ledger + payout batches
# ─────────────────────────────────────────────────────────────────────────────

class PayoutBatch(models.Model):
    """One MANUAL payout to a doctor, created when admin staff mark that
    doctor's unbatched ledger entries as paid (payments.views.
    MarkPayoutPaidView) after wiring the money themselves. Always created
    directly as PROCESSED — there is no gateway call, so QUEUED/FAILED/
    REVERSED are unused today but kept for schema compatibility."""
    QUEUED    = 'QUEUED'
    PROCESSED = 'PROCESSED'
    FAILED    = 'FAILED'
    REVERSED  = 'REVERSED'
    STATUS_CHOICES = [
        (QUEUED, 'Queued'), (PROCESSED, 'Processed'),
        (FAILED, 'Failed'), (REVERSED, 'Reversed'),
    ]
    UPI   = 'UPI'
    IMPS  = 'IMPS'
    OTHER = 'OTHER'   # paid manually with no UPI/bank on file (e.g. cash)
    MODE_CHOICES = [(UPI, 'UPI'), (IMPS, 'IMPS'), (OTHER, 'Other')]

    # EXACTLY ONE of doctor / center. A payout is owed either to a doctor or to
    # a scanning centre, and the same nullable-but-constrained shape as
    # Booking's provider columns is used for the same reason: a routing bug
    # fails at the write instead of stranding somebody's money in a row nothing
    # can resolve.
    doctor             = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='payout_batches',
                                           null=True, blank=True)
    center             = models.ForeignKey('hospitals.Hospital', on_delete=models.CASCADE,
                                           related_name='payout_batches', null=True, blank=True)
    total_amount       = models.DecimalField(max_digits=10, decimal_places=2)
    # Optional UTR / transaction reference the admin enters for reconciliation
    # when marking the doctor paid — no gateway ever writes this now.
    razorpay_payout_id = models.CharField(max_length=100, blank=True)
    payout_mode        = models.CharField(max_length=10, choices=MODE_CHOICES)
    status             = models.CharField(max_length=20, choices=STATUS_CHOICES, default=QUEUED)
    # f"manual_{doctor.id}_{timestamp}" — unique per mark-paid action.
    idempotency_key    = models.CharField(max_length=100, unique=True)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(doctor__isnull=False, center__isnull=True)
                    | models.Q(doctor__isnull=True,  center__isnull=False)
                ),
                name='payoutbatch_exactly_one_payee',
            ),
        ]

    def __str__(self):
        return f'Payout ₹{self.total_amount} → {self.payee_label} [{self.status}]'

    @property
    def payee_label(self):
        return f'centre {self.center_id}' if self.center_id else f'doctor {self.doctor_id}'


class DoctorLedger(models.Model):
    """Double-sided running ledger of what TokenWalla owes each doctor.

    Positive rows are earnings — the FULL online consultation fee for a
    completed booking. TokenWalla deducts nothing; our revenue is the patient's
    service fee. Negative rows are absence-refund clawbacks netted against a
    FUTURE payout (we never reverse a payout that already went out). Marking a
    doctor paid (payments.views.MarkPayoutPaidView) groups all their unbatched
    rows into one PayoutBatch.
    """
    BOOKING_COMPLETED   = 'BOOKING_COMPLETED'
    ABSENCE_REFUND      = 'ABSENCE_REFUND'
    REASON_CHOICES = [
        (BOOKING_COMPLETED,   'Booking Completed'),
        (ABSENCE_REFUND,      'Absence Refund'),
    ]

    # EXACTLY ONE of doctor / center, enforced by the constraint below. A scan
    # booking has no doctor, so its earnings are owed to the centre that owns
    # the Scan. Route with payout_utils.ledger_owner(booking) rather than
    # reaching for `booking.doctor` — that is None on every scan booking and an
    # ORM filter on it silently matches EVERY scan booking in the system.
    doctor       = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='ledger_entries',
                                     null=True, blank=True)
    center       = models.ForeignKey('hospitals.Hospital', on_delete=models.CASCADE,
                                     related_name='ledger_entries', null=True, blank=True)
    booking      = models.ForeignKey(Booking, null=True, on_delete=models.SET_NULL, related_name='ledger_entries')
    amount       = models.DecimalField(max_digits=10, decimal_places=2)  # + earning, − adjustment
    reason       = models.CharField(max_length=30, choices=REASON_CHOICES)
    payout_batch = models.ForeignKey(PayoutBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name='ledger_entries')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # The daily payout task's core query: this doctor's unbatched rows.
            models.Index(fields=['doctor', 'payout_batch'], name='idx_ledger_doctor_batch'),
            # Same query for a scanning centre.
            models.Index(fields=['center', 'payout_batch'], name='idx_ledger_center_batch'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(doctor__isnull=False, center__isnull=True)
                    | models.Q(doctor__isnull=True,  center__isnull=False)
                ),
                name='ledger_exactly_one_payee',
            ),
        ]

    def __str__(self):
        payee = f'centre {self.center_id}' if self.center_id else f'doctor {self.doctor_id}'
        return f'{self.reason} ₹{self.amount} → {payee}'