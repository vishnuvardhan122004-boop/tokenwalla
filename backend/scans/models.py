from django.db import models

from hospitals.models import Hospital


class Scan(models.Model):
    """One diagnostic service a scanning centre offers, e.g. "MRI Brain".

    The analogue of Doctor, and deliberately NOT a Doctor row. Doctor carries
    name/specialization/experience and every patient-facing string in both
    front ends prefixes it with "Dr.", so an MRI stored as a Doctor would
    surface as "Dr. MRI Brain" in the queue, in the WhatsApp templates and —
    worst — in the app builds already installed on phones.

    A centre is a MENU, which is the one structural difference from a doctor: a
    doctor IS the service (one name, one fee, straight to slots), while a centre
    offers many services at many prices. So slots live HERE and not on the
    centre: an MRI is a 45-minute slot and a blood draw is 5, and they run
    concurrently on different machines.
    """
    # Only a Hospital with kind=SCAN_CENTER should own scans. Not enforced by a
    # DB constraint because kind is mutable — a centre mis-registered as a
    # hospital is fixed by flipping one column, and a constraint would make that
    # flip fail against existing rows. Enforced at the serializer instead
    # (slice 4), where it can return a usable error.
    center       = models.ForeignKey(
        Hospital, on_delete=models.CASCADE, related_name='scans',
    )
    name         = models.CharField(max_length=200)
    # Broad category, used for the modality filter on the listing page. Free
    # text rather than choices: the list of modalities a partner offers is not
    # ours to close, and a centre typing "PET-CT" should not need a migration.
    modality     = models.CharField(max_length=100, blank=True, default='')
    # Free-text search keywords, same idea as Doctor.keywords — a patient
    # searching "brain scan" should find "MRI Brain".
    keywords     = models.CharField(max_length=500, blank=True, default='')
    description  = models.TextField(blank=True, default='')

    # ── What the patient must do before arriving ──────────────────────────────
    # The highest-value scan-only field there is. A patient who arrives unfasted
    # for a lipid profile, or wearing metal for an MRI, has burned the slot and
    # the centre's machine time. Shown on the token screen AND sent in the
    # booking WhatsApp, not buried on the detail page.
    prep_instructions = models.TextField(blank=True, default='')

    price        = models.IntegerField(default=0)      # scan price in ₹
    # How long the machine is occupied. Drives nothing in code yet; it is shown
    # to the patient and it is what a centre reasons about when setting slots.
    duration_minutes = models.PositiveIntegerField(default=15)

    available    = models.BooleanField(default=True)
    # Same shapes as Doctor: ["09:00 AM", ...] and ["Mon", "Tue", ...].
    slots        = models.JSONField(default=list, blank=True)
    days         = models.JSONField(default=list, blank=True)
    max_per_slot = models.IntegerField(default=1)

    # ── Booking lead time ─────────────────────────────────────────────────────
    # How much notice this service needs before a slot starts. NULL means "use
    # the platform default" (tokenwalla.utils.BOOKING_CUTOFF_HOURS, 2h) — the
    # field is nullable rather than defaulting to 2 because 0 is a legitimate
    # setting, and a plain integer default could not tell "wants zero notice"
    # from "never chose". Resolve it through utils.cutoff_hours_for(), never by
    # reading this attribute directly.
    booking_cutoff_hours = models.PositiveSmallIntegerField(null=True, blank=True)


    # Ranking signal for popular-first ordering, mirroring Doctor.view_count.
    # A plain counter, never per-user analytics — we only need the ranking.
    view_count   = models.PositiveIntegerField(default=0, db_index=True)

    # ── Payment collection mode ───────────────────────────────────────────────
    # Identical semantics and identical default to Doctor.payment_collection_mode,
    # and for the identical reason: only an explicit FULL collects the scan price
    # online. Blank, missing, unknown and never-chosen all price as SERVICE_ONLY
    # (patient pays the service fee online, settles the scan price at the
    # centre, no payout owed). Never make FULL a default or a fallback — it
    # would have us holding a centre's money with no payout account on file.
    COLLECT_FULL         = 'FULL'
    COLLECT_SERVICE_ONLY = 'SERVICE_ONLY'
    COLLECTION_MODE_CHOICES = [
        (COLLECT_FULL,         'Scan Price + Service Fee'),
        (COLLECT_SERVICE_ONLY, 'Service Fee Only'),
    ]
    payment_collection_mode = models.CharField(
        max_length=20, choices=COLLECTION_MODE_CHOICES, default=COLLECT_SERVICE_ONLY,
    )

    image        = models.ImageField(upload_to='scans/', null=True, blank=True)
    created      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['center', 'available'], name='idx_scan_center_available'),
        ]

    def __str__(self):
        return f'{self.name} — {self.center.name}'


class ScanReport(models.Model):
    """A result file for a completed scan booking — the PDF the patient came for.

    This is the stage a doctor booking does not have. A consultation is over
    when the patient walks out; a scan is not, because the report comes back
    hours or days later. `COMPLETED` stays terminal — a report is a related row,
    not a new status, so nothing about the queue, refund or payout lifecycle
    moves.

    A ForeignKey rather than a OneToOne: a blood panel routinely comes back as
    several PDFs, and one row per file costs nothing today while a OneToOne
    would need a migration the first time a centre uploads two.

    PRIVACY — the reason this model has no public URL field. The file is medical
    PII. It is served ONLY by an authenticated, ownership-checked download view;
    the storage URL is never serialised, never sent over WhatsApp and never
    returned by the API. See scans.views.ScanReportDownloadView.
    """
    booking     = models.ForeignKey(
        'bookings.Booking', on_delete=models.CASCADE, related_name='reports')
    file        = models.FileField(upload_to='scan_reports/')
    # The name the provider's file had when they picked it, kept because the
    # storage does not keep it: Cloudinary strips the extension from the
    # public_id, so `file.name` comes back as "lab-slip_ubmrst" and a patient
    # saving that gets a file their phone cannot open. This is what the download
    # view names the attachment.
    original_name = models.CharField(max_length=255, blank=True, default='')
    title       = models.CharField(max_length=200, blank=True, default='')
    notes       = models.TextField(blank=True, default='')
    # Who uploaded it, for an audit trail. SET_NULL so removing a staff account
    # never deletes a patient's report.
    uploaded_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='uploaded_scan_reports')
    # Set once the patient has been told. Kept as a timestamp rather than a bool
    # so a re-send is visible and a failed notify is distinguishable from one
    # that never ran.
    notified_at = models.DateTimeField(null=True, blank=True)
    created     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']
        indexes = [
            models.Index(fields=['booking', 'created'], name='idx_scanreport_booking'),
        ]

    def __str__(self):
        return f'{self.title or "Report"} for booking {self.booking_id}'

    @property
    def display_title(self):
        return self.title or (self.booking.provider_name if self.booking_id else 'Report')
