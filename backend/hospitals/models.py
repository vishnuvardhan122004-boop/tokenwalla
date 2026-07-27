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
    # Working hours in 24h "HH:MM" (blank = not set)
    open_time    = models.CharField(max_length=5, blank=True)
    close_time   = models.CharField(max_length=5, blank=True)
    password = models.CharField(max_length=128)
    status   = models.CharField(max_length=20, default='active')
    # TokenWalla's per-hospital commission BASE (₹), negotiated per hospital and
    # deducted from the doctor's payout (never routed through Razorpay Checkout).
    # Gross commission = commission_rate + 18% GST (see payments.fees).
    commission_rate = models.DecimalField(max_digits=10, decimal_places=2, default=20)
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
