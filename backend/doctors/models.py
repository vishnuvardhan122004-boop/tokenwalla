from django.db import models
from hospitals.models import Hospital


class Doctor(models.Model):
    hospital       = models.ForeignKey(
        Hospital, on_delete=models.CASCADE, related_name="doctors"
    )
    name           = models.CharField(max_length=200)
    specialization = models.CharField(max_length=200)
    experience     = models.IntegerField(default=0)
    mobile         = models.CharField(max_length=15)
    available      = models.BooleanField(default=True)
    fee            = models.IntegerField(default=0)          # consultation fee in ₹
    # Must be JSONField — stores ["09:00 AM", "09:30 AM", ...]
    slots          = models.JSONField(default=list, blank=True)
    max_per_slot   = models.IntegerField(default=10)
    city           = models.CharField(max_length=100, blank=True)
    image          = models.ImageField(upload_to="doctors/",          null=True, blank=True)
    hospital_image = models.ImageField(upload_to="hospital_banners/", null=True, blank=True)
    created        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"Dr. {self.name} — {self.specialization}"