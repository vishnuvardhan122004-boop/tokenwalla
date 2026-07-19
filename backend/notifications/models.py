from django.conf import settings
from django.db import models
from bookings.models import Booking


class DeviceToken(models.Model):
    """
    An Expo push token registered by the mobile app for a signed-in user.

    A single physical device maps to one Expo token; the app re-registers it on
    every launch (idempotent upsert), so we key on `expo_token` and keep the
    `user` + `role` current. `role` lets us target patient- vs hospital-side
    pushes even though a device could, in theory, be used for both.
    """
    ROLE_CHOICES = [('patient', 'Patient'), ('hospital', 'Hospital')]

    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                   related_name='device_tokens')
    expo_token = models.CharField(max_length=255, unique=True)
    role       = models.CharField(max_length=20, choices=ROLE_CHOICES, default='patient')
    updated    = models.DateTimeField(auto_now=True)
    created    = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'role']),
        ]

    def __str__(self):
        return f'{self.user_id} [{self.role}] {self.expo_token[:24]}…'


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
