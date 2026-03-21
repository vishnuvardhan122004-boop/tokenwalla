from django.db import models
from bookings.models import Booking

class Payment(models.Model):
    booking    = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='payment')
    order_id   = models.CharField(max_length=100)
    payment_id = models.CharField(max_length=100, blank=True)
    signature  = models.CharField(max_length=300, blank=True)
    amount     = models.IntegerField()
    status     = models.CharField(max_length=20, default='pending')
    created    = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.payment_id} — ₹{self.amount}"
