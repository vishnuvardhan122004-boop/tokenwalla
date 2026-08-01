from django.db import models
from bookings.models import Booking
from doctors.models import Doctor

class Payment(models.Model):
    # Lifecycle of the patient checkout payment.
    CREATED = 'CREATED'   # Cashfree order made, not yet paid/verified
    PAID    = 'PAID'      # signature verified, money captured
    FAILED  = 'FAILED'
    STATUS_CHOICES = [(CREATED, 'Created'), (PAID, 'Paid'), (FAILED, 'Failed')]

    booking    = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='payment')
    # order_id / payment_id are the Cashfree order & payment identifiers.
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
    # instead. FULL-mode bookings leave this 0. Never routed through Cashfree.
    offline_doctor_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gateway_fee  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gst_amount   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    final_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default=CREATED)
    created    = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # A Cashfree payment_id settles exactly one booking. This is the
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
    fee and GST are NOT returned by Cashfree, so they're never refunded. The
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
    """One automated payout to a doctor, aggregating that doctor's unbatched
    ledger entries for a cycle into a single Cashfree Payouts payout."""
    QUEUED    = 'QUEUED'
    PROCESSED = 'PROCESSED'
    FAILED    = 'FAILED'
    REVERSED  = 'REVERSED'
    STATUS_CHOICES = [
        (QUEUED, 'Queued'), (PROCESSED, 'Processed'),
        (FAILED, 'Failed'), (REVERSED, 'Reversed'),
    ]
    UPI  = 'UPI'
    IMPS = 'IMPS'
    MODE_CHOICES = [(UPI, 'UPI'), (IMPS, 'IMPS')]

    doctor             = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='payout_batches')
    total_amount       = models.DecimalField(max_digits=10, decimal_places=2)
    razorpay_payout_id = models.CharField(max_length=100, blank=True)
    payout_mode        = models.CharField(max_length=10, choices=MODE_CHOICES)
    status             = models.CharField(max_length=20, choices=STATUS_CHOICES, default=QUEUED)
    # Reused idempotency discipline: f"payout_{doctor.id}_{date}" — a UNIQUE
    # constraint makes a re-run of the daily task a no-op instead of a double pay.
    idempotency_key    = models.CharField(max_length=100, unique=True)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Payout ₹{self.total_amount} → {self.doctor_id} [{self.status}]'


class DoctorLedger(models.Model):
    """Double-sided running ledger of what TokenWalla owes each doctor.

    Positive rows are earnings — the FULL online consultation fee for a
    completed booking. TokenWalla deducts nothing; our revenue is the patient's
    service fee. Negative rows are absence-refund clawbacks netted against a
    FUTURE payout (we never reverse a payout that already went out). The daily
    task groups all unbatched rows per doctor into one PayoutBatch.
    """
    BOOKING_COMPLETED   = 'BOOKING_COMPLETED'
    ABSENCE_REFUND      = 'ABSENCE_REFUND'
    REASON_CHOICES = [
        (BOOKING_COMPLETED,   'Booking Completed'),
        (ABSENCE_REFUND,      'Absence Refund'),
    ]

    doctor       = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='ledger_entries')
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
        ]

    def __str__(self):
        return f'{self.reason} ₹{self.amount} → doctor {self.doctor_id}'