from django.db import models

class Hospital(models.Model):
    name     = models.CharField(max_length=200)
    city     = models.CharField(max_length=100)
    address  = models.TextField(blank=True)
    # Optional map link (e.g. Google Maps URL) or landmark, shown to patients
    location = models.CharField(max_length=500, blank=True)
    # Geocoded coordinates (from the location autocomplete) — power accurate
    # map pins, directions and "near me" distance. Null when not picked yet.
    latitude  = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    mobile   = models.CharField(max_length=15, unique=True)
    # Optional landline (e.g. "08812-234567"). Display / call-me-back only —
    # `mobile` stays the login identity and the only number we ever text.
    landline = models.CharField(max_length=20, blank=True, default='')
    email    = models.EmailField(blank=True)
    image    = models.ImageField(upload_to='hospitals/', blank=True)          # banner
    logo     = models.ImageField(upload_to='hospital_logos/', null=True, blank=True)
    # Social / web presence shown to patients on the doctor page
    instagram = models.CharField(max_length=300, blank=True)
    youtube   = models.CharField(max_length=300, blank=True)
    facebook  = models.CharField(max_length=300, blank=True)
    # List of services the hospital offers (e.g. ["X-Ray", "Pharmacy", "ICU"])
    services  = models.JSONField(default=list, blank=True)
    # About the hospital, shown to patients on the doctor page
    description  = models.TextField(blank=True)
    # Short notice shown to patients (e.g. "Dr. X on leave Friday")
    announcement = models.CharField(max_length=300, blank=True)
    # Last day the announcement is shown. Null = show until the hospital clears
    # it. A holiday notice nobody remembers to delete is worse than none, so the
    # hospital can set the date it stops mattering.
    announcement_until = models.DateField(null=True, blank=True)
    # Working hours in 24h "HH:MM" (blank = not set)
    open_time    = models.CharField(max_length=5, blank=True)
    close_time   = models.CharField(max_length=5, blank=True)
    password = models.CharField(max_length=128)
    status   = models.CharField(max_length=20, default='active')

    # ── Payout / settlement account ───────────────────────────────────────────
    # Where TokenWalla settles the hospital's share. Managed by the hospital
    # itself from its Profile page and served ONLY by the owner/admin-gated
    # payment-details endpoint — these are NEVER exposed on the public
    # HospitalSerializer. `payment_method` records the preferred rail (UPI when
    # a VPA is present, else the bank account via IMPS).
    UPI  = 'UPI'
    BANK = 'BANK'
    PAYMENT_METHOD_CHOICES = [(UPI, 'UPI'), (BANK, 'Bank Account')]
    payment_method      = models.CharField(max_length=10, choices=PAYMENT_METHOD_CHOICES, blank=True, default='')
    upi_vpa             = models.CharField(max_length=100, blank=True, default='')
    account_holder_name = models.CharField(max_length=200, blank=True, default='')
    bank_name           = models.CharField(max_length=200, blank=True, default='')
    bank_account_number = models.CharField(max_length=30,  blank=True, default='')
    ifsc                = models.CharField(max_length=15,  blank=True, default='')
    payout_notes        = models.CharField(max_length=300, blank=True, default='')

    created  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class HospitalPhoto(models.Model):
    """A facility photo in a hospital's gallery, shown to patients."""
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='photos')
    image    = models.ImageField(upload_to='hospital_gallery/')
    created  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return f'Photo #{self.id} for {self.hospital_id}'
