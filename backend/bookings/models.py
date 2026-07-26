from django.db import models
from django.contrib.auth import get_user_model
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class Booking(models.Model):
    STATUS = [
        ('waiting',     'Waiting'),
        ('held',        'On Hold'),
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
        ('cancelled',   'Cancelled'),
    ]
    user         = models.ForeignKey(User,     on_delete=models.CASCADE,  related_name='bookings')
    doctor       = models.ForeignKey(Doctor,   on_delete=models.PROTECT,  related_name='bookings')
    hospital     = models.ForeignKey(Hospital, on_delete=models.PROTECT,  related_name='bookings')
    date         = models.DateField()
    slot         = models.CharField(max_length=20)
    token        = models.CharField(max_length=30, unique=True)
    status       = models.CharField(max_length=20, choices=STATUS, default='waiting')
    payment_id   = models.CharField(max_length=100, blank=True)
    order_id     = models.CharField(max_length=100, blank=True)
    amount       = models.IntegerField(default=0)
    queue_access = models.BooleanField(default=False)
    # Payment for a *queue-access upgrade* on an already-created booking. Kept
    # separate from payment_id/order_id (the original booking payment) so an
    # upgrade never clobbers that record. The partial unique constraint below
    # makes one queue payment reusable on at most one booking, closing the
    # concurrent-reuse race in UpgradeQueueAccessView at the DB layer.
    queue_payment_id = models.CharField(max_length=100, blank=True)
    queue_order_id   = models.CharField(max_length=100, blank=True)
    reminder_sent = models.BooleanField(default=False)
    # Set True when the hospital marks the doctor unavailable — grants the
    # patient a ONE-TIME reschedule with the ₹5 fee waived. Consumed (reset to
    # False) once they reschedule.
    free_reschedule = models.BooleanField(default=False)
    # "Book for someone else": when the account holder books on behalf of another
    # person (a family member, etc.), the beneficiary's details are stored here.
    # Blank ⇒ the booking is for the account holder themselves. Notifications
    # still go to the account holder (booking.user); these fields only change who
    # the hospital sees the appointment is *for*.
    booked_for_name   = models.CharField(max_length=100, blank=True)
    booked_for_mobile = models.CharField(max_length=15,  blank=True)
    created      = models.DateTimeField(auto_now_add=True)

    @property
    def patient_display_name(self):
        """Name the appointment is for — the beneficiary if set, else the account holder."""
        return self.booked_for_name or self.user.first_name or self.user.username

    @property
    def patient_display_mobile(self):
        """Best contact number for the patient at the hospital — beneficiary's if given, else the account holder's."""
        return self.booked_for_mobile or self.user.mobile

    class Meta:
        ordering = ['-created']
        constraints = [
            # A single queue-upgrade payment can unlock at most one booking.
            # Partial (non-blank only) so the many bookings with no upgrade
            # payment ('') don't collide. Requires Postgres (partial index).
            models.UniqueConstraint(
                fields=['queue_payment_id'],
                condition=~models.Q(queue_payment_id=''),
                name='uniq_booking_queue_payment_id_nonblank',
            ),
        ]
        indexes = [
            # Most-used query: queue for a hospital on a date
            models.Index(fields=['hospital', 'date', 'status'], name='idx_booking_hosp_date_status'),
            # My bookings page
            models.Index(fields=['user', 'status'],             name='idx_booking_user_status'),
            # Queue position lookup
            models.Index(fields=['doctor', 'date', 'status'],  name='idx_booking_doc_date_status'),
            # Admin / reports
            models.Index(fields=['status'],                     name='idx_booking_status'),
            models.Index(fields=['created'],                    name='idx_booking_created'),
        ]

    def __str__(self):
        return f"{self.token} — {self.user.username}"