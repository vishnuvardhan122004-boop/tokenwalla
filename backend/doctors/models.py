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

    # ── Payment collection mode ───────────────────────────────────────────────
    # How the patient checkout is charged for this doctor. Set per doctor by the
    # hospital and read server-side at order time (payments.CreateOrderView):
    #   FULL          → patient pays doctor_fee + service fee online (default,
    #                   the existing behaviour). TokenWalla settles the doctor.
    #   SERVICE_ONLY  → patient pays ONLY the service fee online; the doctor's
    #                   consultation fee is collected offline at the hospital, so
    #                   no online doctor fee is captured and no payout is owed.
    COLLECT_FULL         = 'FULL'
    COLLECT_SERVICE_ONLY = 'SERVICE_ONLY'
    COLLECTION_MODE_CHOICES = [
        (COLLECT_FULL,         'Doctor Fee + Service Fee'),
        (COLLECT_SERVICE_ONLY, 'Service Fee Only'),
    ]
    payment_collection_mode = models.CharField(
        max_length=20, choices=COLLECTION_MODE_CHOICES, default=COLLECT_FULL,
    )

    # ── Payout routing (Cashfree Payouts) ────────────────────────────────────────────
    # Where the doctor's automated payout is sent. UPI is preferred when a VPA
    # is present; otherwise the bank account (IMPS) is used as fallback.
    # `payment_method` records which one the hospital chose as primary; the
    # column names below are the canonical storage the payout utils already read
    # (exposed to the hospital UI as upi_id / account_number / ifsc_code).
    UPI  = 'UPI'
    BANK = 'BANK'
    PAYMENT_METHOD_CHOICES = [(UPI, 'UPI'), (BANK, 'Bank Account')]
    payment_method      = models.CharField(max_length=10, choices=PAYMENT_METHOD_CHOICES, blank=True, default="")
    account_holder_name = models.CharField(max_length=200, blank=True, default="")
    bank_name           = models.CharField(max_length=200, blank=True, default="")
    payout_notes        = models.CharField(max_length=300, blank=True, default="")
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