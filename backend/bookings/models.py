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
        ('cancelled',   'Cancelled')
    ]
    user         = models.ForeignKey(User,     on_delete=models.CASCADE, related_name='bookings')
    doctor       = models.ForeignKey(Doctor,   on_delete=models.CASCADE, related_name='bookings')
    hospital     = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='bookings')
    date         = models.DateField()
    slot         = models.CharField(max_length=20)
    token        = models.CharField(max_length=30, unique=True)
    status       = models.CharField(max_length=20, choices=STATUS, default='waiting')
    payment_id   = models.CharField(max_length=100, blank=True)
    order_id     = models.CharField(max_length=100, blank=True)
    amount       = models.IntegerField(default=0)
    # NEW FIELD
    queue_access = models.BooleanField(default=False)
    created      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return f"{self.token} — {self.user.username}"