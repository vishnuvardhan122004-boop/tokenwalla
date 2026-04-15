from django.db import models
from django.contrib.auth import get_user_model
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class Booking(models.Model):
    STATUS = [
        ('waiting',     'Waiting'),
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
    created      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']
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