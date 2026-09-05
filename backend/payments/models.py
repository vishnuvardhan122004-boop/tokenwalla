from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from bookings.models import Booking
from doctors.models import Doctor
from payments.fees import PASS_BOOKINGS, PASS_DAYS, PASS_PRICE

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


class AppointmentPass(models.Model):
    """₹35, two visits, 30 days — a prepaid wallet of SERVICE-fee credits.

    Bought as an upgrade at checkout: the patient pays ₹35 instead of that one
    booking's ₹25.37 service fee, and the second visit's service fee is already
    paid for. It never covers a doctor's consultation fee, so v1 only sells and
    spends it where nothing else is charged online (fees.pass_eligible) — which
    makes every redemption a ₹0 booking: no gateway call, no split to verify and
    no payout owed.

    price / total_bookings / expires_at are COLUMNS, not constants read back at
    display time. Changing the price or the window later must not retroactively
    rewrite what somebody already bought.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='appointment_passes')
    # The booking whose checkout bought this pass. It also consumes the first
    # credit, so it appears in `bookings` too — this field is what tells the two
    # apart when it is cancelled (see pass_utils.on_booking_cancelled).
    source_booking = models.OneToOneField(Booking, on_delete=models.SET_NULL,
                                          null=True, blank=True,
                                          related_name='pass_purchased')
    price          = models.DecimalField(max_digits=10, decimal_places=2, default=PASS_PRICE)
    total_bookings = models.PositiveSmallIntegerField(default=PASS_BOOKINGS)
    used_bookings  = models.PositiveSmallIntegerField(default=0)
    expires_at     = models.DateTimeField()
    # Set when the purchasing booking is cancelled and refunded: the money went
    # back, so the unused credits must not survive. Voiding rather than deleting
    # keeps the history readable.
    voided_at      = models.DateTimeField(null=True, blank=True)
    # The 3-days-before nudge has been sent. A flag rather than a log query so
    # the cron can run every hour without ever sending twice.
    expiry_reminder_sent = models.BooleanField(default=False)
    # Cancelling a visit after the pass has lapsed hands the credit back and
    # reopens the window once (pass_utils.on_booking_cancelled). Stamped so it
    # can happen at most once — otherwise book-and-cancel keeps a pass alive
    # forever, which is exactly the expiry the promo's economics rely on.
    expiry_extended_at = models.DateTimeField(null=True, blank=True)
    created        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']

    @staticmethod
    def default_expiry():
        return timezone.now() + timedelta(days=PASS_DAYS)

    @property
    def remaining(self) -> int:
        return max(0, self.total_bookings - self.used_bookings)

    def is_active(self) -> bool:
        """Spendable right now. Checked again under select_for_update before a
        credit is actually taken — this is the cheap read, not the guarantee."""
        return (self.voided_at is None
                and self.remaining > 0
                and self.expires_at > timezone.now())

    def __str__(self):
        return (f'Pass#{self.pk} user={self.user_id} '
                f'{self.used_bookings}/{self.total_bookings} → {self.expires_at:%Y-%m-%d}')


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

def financial_rows_for(*, hospital=None, doctor=None, user=None):
    """Money records a HARD delete of this provider would destroy.

    `Booking.doctor` and `Booking.hospital` are PROTECT (bookings migration
    0004, whose own comment says it exists so "deleting a doctor/hospital
    doesn't silently wipe patient booking history"). The force-delete endpoints
    bypass that by deleting the Bookings first — and every money model behind a
    Booking is still CASCADE:

        Payment.booking             CASCADE
        Refund.payment              CASCADE  (reached via Payment)
        ReschedulePayment.booking   CASCADE
        DoctorLedger.doctor/center  CASCADE
        PayoutBatch.doctor/center   CASCADE

    So one admin click erased every Payment row for that provider — including
    the GST charged to patients on it — every Refund, and every PROCESSED
    PayoutBatch carrying a hand-entered UTR. Silently, with a success response,
    and with the admin reports and daily totals simply dropping by that amount.

    Returns {label: count} for whatever is non-empty, so the caller can refuse
    and name what it would have destroyed. Empty dict means the provider carries
    no financial history and is safe to remove — which is the case the
    force-delete endpoints actually exist for (test fixtures and abandoned
    registrations).
    """
    if hospital is not None:
        booking_q  = {'booking__hospital': hospital}
        ledger_q   = {'center': hospital}
    elif doctor is not None:
        booking_q  = {'booking__doctor': doctor}
        ledger_q   = {'doctor': doctor}
    else:
        # A patient. `Booking.user` is CASCADE while doctor and hospital are
        # PROTECT, so deleting the account takes their Payment, Refund and
        # ReschedulePayment rows — and the GST charged on them — with it. The
        # ledger is keyed on the PROVIDER, not the patient, so no ledger rows
        # hang off a patient; the {} keeps the two counts honest rather than
        # inventing a filter that would match everything.
        booking_q  = {'booking__user': user}
        ledger_q   = None

    counts = {
        'payments':          Payment.objects.filter(**booking_q).count(),
        'refunds':           Refund.objects.filter(
                                 payment__in=Payment.objects.filter(**booking_q)).count(),
        'reschedule fees':   ReschedulePayment.objects.filter(**booking_q).count(),
    }
    if ledger_q is not None:
        counts['ledger entries'] = DoctorLedger.objects.filter(**ledger_q).count()
        counts['payout batches'] = PayoutBatch.objects.filter(**ledger_q).count()
    return {k: v for k, v in counts.items() if v}
