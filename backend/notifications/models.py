from django.db import models
from bookings.models import Booking


class WhatsAppLog(models.Model):
    EVENT_CHOICES = [
        ('booking_confirmation', 'Booking Confirmation'),
        ('appointment_reminder', 'Appointment Reminder'),
    ]
    STATUS_CHOICES = [
        ('sent',   'Sent'),
        ('failed', 'Failed'),
    ]

    booking       = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='whatsapp_logs')
    event_type    = models.CharField(max_length=30, choices=EVENT_CHOICES)
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES)
    wa_message_id = models.CharField(max_length=120, blank=True)
    error         = models.TextField(blank=True)
    created       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']
        indexes = [
            models.Index(fields=['booking', 'event_type']),
        ]

    def __str__(self):
        return f'{self.event_type} -> booking {self.booking_id} [{self.status}]'
