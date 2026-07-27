from django.db import models
from hospitals.models import Hospital


class Doctor(models.Model):
    hospital       = models.ForeignKey(
        Hospital, on_delete=models.CASCADE, related_name="doctors"
    )
    name           = models.CharField(max_length=200)
    specialization = models.CharField(max_length=200)
    # Free-text search keywords (comma/space separated) hospitals enter so the
    # doctor surfaces for patient searches beyond just name/specialization,
    # e.g. "child fever vaccination" for a pediatrician.
    keywords       = models.CharField(max_length=500, blank=True, default="")
    experience     = models.IntegerField(default=0)
    mobile         = models.CharField(max_length=15)
    available      = models.BooleanField(default=True)
    fee            = models.IntegerField(default=0)          # consultation fee in ₹
    # Must be JSONField — stores ["09:00 AM", "09:30 AM", ...]
    slots          = models.JSONField(default=list, blank=True)
    # Available days of the week, e.g. ["Mon", "Tue", "Wed"]
    days           = models.JSONField(default=list, blank=True)
    max_per_slot   = models.IntegerField(default=10)
    city           = models.CharField(max_length=100, blank=True)
    # ── Payout routing (RazorpayX) ────────────────────────────────────────────
    # Where the doctor's automated payout is sent. UPI is preferred when a VPA
    # is present; otherwise the bank account (IMPS) is used as fallback.
    upi_vpa             = models.CharField(max_length=100, blank=True, default="")
    bank_account_number = models.CharField(max_length=30,  blank=True, default="")
    ifsc                = models.CharField(max_length=15,  blank=True, default="")
    image          = models.ImageField(upload_to="doctors/",          null=True, blank=True)
    hospital_image = models.ImageField(upload_to="hospital_banners/", null=True, blank=True)
    created        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} — {self.specialization}"