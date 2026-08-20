from django.db import models

# Hospitals whose name starts with this marker are internal fixtures for
# demoing and manual testing. They must never appear in a patient-facing list.
#
# This is a name convention rather than a column on purpose: the convention
# already exists in the data and in the mobile app's own filter, so matching it
# needs no migration and no touch of live rows. A real `is_test` flag would be
# better, but it would mean editing production data to set it, which is not
# something a session should do. Revisit when there's a reason to.
TEST_HOSPITAL_PREFIX = '[TEST]'


def exclude_test_hospitals(qs, field='name'):
    """Drop internal test hospitals from a queryset.

    `field` is the path to the hospital's name, so this works on Hospital
    itself ('name') and on anything related to it ('hospital__name').
    """
    return qs.exclude(**{f'{field}__istartswith': TEST_HOSPITAL_PREFIX})


def exclude_scan_centers(qs, field='kind'):
    """Drop scanning centres from a queryset built for hospital-shaped clients.

    THIS IS AN API-CONTRACT GUARD, not a preference. Build 36 is live on the
    Play Store and calls `/api/hospitals/` and `/api/doctors/`; those installs
    cannot be updated on our schedule. A scanning centre in either response
    renders there as a hospital with a Book button that leads nowhere, because
    the bookable unit for a centre is a Scan and build 36 has never heard of
    one. So centres are invisible by default and a new client opts in with
    `?kind=SCAN_CENTER`.

    Same shape as exclude_test_hospitals: `field` is the path to the kind, so
    this works on Hospital itself ('kind') and on anything related to it
    ('hospital__kind').

    Deliberately LIST-only. Do not apply this to the detail endpoint — a centre
    fetches itself by id to render its own dashboard and profile, and filtering
    detail would lock it out of its own account.
    """
    return qs.exclude(**{field: Hospital.SCAN_CENTER})


def show_test_hospitals_to(user) -> bool:
    """Only signed-in hospital staff and admins see the test fixtures.

    Everyone else — anonymous visitors and patients — gets the filtered list.
    Staff keep seeing them so the demo hospital stays usable from the
    dashboard, which is the whole reason it exists.
    """
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and getattr(user, 'role', None) in ('hospital', 'admin')
    )


class Hospital(models.Model):
    # ── Provider kind ─────────────────────────────────────────────────────────
    # A scanning centre (MRI/CT/X-ray/blood) is a Hospital row, not a separate
    # model: it needs name, city, address, coordinates, mobile, landline,
    # photos, hours, an approval status, a login and a payout account — all of
    # which already live here. A second provider model would duplicate
    # registration, login, approval, profile, gallery and payout details to
    # gain nothing.
    #
    # HOSPITAL is the default and must stay so: every row that existed before
    # this column, and every client that never sends it, means a hospital.
    # What differs is the bookable unit — a hospital has Doctors, a centre has
    # Scans (see the `scans` app).
    HOSPITAL    = 'HOSPITAL'
    SCAN_CENTER = 'SCAN_CENTER'
    KIND_CHOICES = [
        (HOSPITAL,    'Hospital / Clinic'),
        (SCAN_CENTER, 'Scanning Centre'),
    ]
    kind     = models.CharField(
        max_length=20, choices=KIND_CHOICES, default=HOSPITAL, db_index=True,
    )
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
    # ── Registration / licence number ─────────────────────────────────────────
    # The registration a centre operates under (states differ: Clinical
    # Establishments Act, AERB for CT/PET, a lab's NABL id). NOT asked for at
    # registration and NOT required to approve — verification happens on a phone
    # call, and staff record the number here afterwards. Written only from
    # Django admin, which is why it is blank-able and unvalidated: the format is
    # not one we get to define.
    #
    # Never serialised publicly: it identifies the business, patients have no
    # use for it, and it is the field an impersonator would want to read.
    license_number = models.CharField(max_length=60, blank=True, default='')
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
