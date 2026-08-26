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


def in_segment(qs, segment, prefix=''):
    """Narrow `qs` to providers LIVE in `segment`.

    `prefix` is the path to the Hospital, so this works on Hospital itself ('')
    and on anything related to it ('hospital__', 'center__').

    Replaces the old exclude_scan_centers()/exclude_centers(), which asked about
    `kind`. The question was always really "does this provider sell X" — that is
    a capability, and asking `kind` stopped being able to answer it the moment
    one provider could sell more than one thing.

    THE BUILD-36 CONTRACT LIVES HERE. Build 36 is on the Play Store, calls
    `/api/hospitals/` and `/api/doctors/` with no ?kind=, and has never heard of
    a Scan. Those callers resolve to SEG_CONSULT, so:

      - a hospital appears, exactly as it always has
      - a pure centre does not, exactly as it always has
      - a HYBRID appears — and correctly so: it has doctors build 36 can book.
        Its scans stay invisible there, which is also correct, because build 36
        cannot book a Scan.

    PENDING is excluded everywhere by construction: only ACTIVE matches.
    """
    field = Hospital.SEGMENT_FIELD.get(segment)
    if not field:
        # An unknown segment must fail CLOSED. Returning the unfiltered queryset
        # would leak every provider into a list that asked for one kind of them.
        return qs.none()
    return qs.filter(**{f'{prefix}{field}': Hospital.CAP_ACTIVE})


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
    HOSPITAL     = 'HOSPITAL'
    SCAN_CENTER  = 'SCAN_CENTER'
    # A pathology lab — CBC, lipid profile, thyroid, "full body checkup". It is
    # a CENTRE, not a third kind of thing: the bookable unit is still a Scan
    # row (a named test, a price, a slot, prep instructions), the token, queue,
    # QR check-in, report upload and payout all behave identically. The only
    # reason it is not simply a SCAN_CENTER is discovery in both directions — a
    # patient looking for a blood test does not tap "Scan Centres", and a lab
    # registering does not pick "Scanning Centre". So: separate label, separate
    # listing, one shared pipeline.
    BLOOD_CENTER = 'BLOOD_CENTER'
    KIND_CHOICES = [
        (HOSPITAL,     'Hospital / Clinic'),
        (SCAN_CENTER,  'Scanning Centre'),
        (BLOOD_CENTER, 'Blood Centre / Pathology Lab'),
    ]
    # Every kind whose bookable unit is a Scan rather than a Doctor. Still the
    # right thing to read when the question is about IDENTITY — the badge, the
    # registration card, which label to print. It is NOT the right thing to read
    # when the question is "does this provider sell scans?"; that is a
    # capability now, see the svc_* fields below.
    CENTER_KINDS = (SCAN_CENTER, BLOOD_CENTER)
    kind     = models.CharField(
        max_length=20, choices=KIND_CHOICES, default=HOSPITAL, db_index=True,
    )

    # ── What the provider actually sells ──────────────────────────────────────
    # `kind` answers "who are you". These answer "what do you sell", and a real
    # business is often more than one thing: a hospital with an in-house
    # scanning wing and a pathology lab is one building, one owner, one bank
    # account. With only `kind` it had to register three times — three mobile
    # numbers (mobile is unique AND the login identity), three approvals, three
    # payout accounts — and patients saw three unrelated listings for one
    # address. Providers were already working around it by putting their
    # services in the business NAME ("Sri venakteshwara clinic and bharathi
    # lab"), which is the clearest possible signal the model was wrong.
    #
    # Three flat fields rather than a capability table: it matches the rest of
    # this model (payout_*, announcement_*), it queries portably on SQLite and
    # Postgres alike (a JSON `contains` lookup does not), and it needs no join
    # on the hot patient-facing list queries. A fourth segment later costs one
    # migration, which is rare enough to be the cheaper trade.
    #
    # Each is a small state machine, not a boolean, because a capability added
    # AFTER registration is admin-approved: a clinic must not be able to start
    # advertising blood tests unreviewed. Capabilities chosen AT registration
    # go straight to ACTIVE — the whole account is already gated by the admin
    # approval that turns status into 'active'.
    CAP_OFF     = 'OFF'
    CAP_PENDING = 'PENDING'
    CAP_ACTIVE  = 'ACTIVE'
    CAP_CHOICES = [
        (CAP_OFF,     'Not offered'),
        (CAP_PENDING, 'Requested — awaiting approval'),
        (CAP_ACTIVE,  'Live'),
    ]

    # Named svc_* rather than the obvious `scans`, because `hospital.scans` is
    # already the reverse manager from Scan.center (related_name='scans').
    svc_consultations = models.CharField(
        max_length=10, choices=CAP_CHOICES, default=CAP_OFF, db_index=True,
        help_text='Doctors and OPD slots — the Doctors tab.')
    svc_scans = models.CharField(
        max_length=10, choices=CAP_CHOICES, default=CAP_OFF, db_index=True,
        help_text='MRI, CT, X-ray, ultrasound — the Scans tab.')
    svc_blood = models.CharField(
        max_length=10, choices=CAP_CHOICES, default=CAP_OFF, db_index=True,
        help_text='Blood tests and health packages — the Blood Tests tab.')

    # Segment keys. These are what `?kind=` on the public list resolves to, and
    # what the front ends put in the `segments` array.
    SEG_CONSULT = 'CONSULT'
    SEG_SCAN    = 'SCAN'
    SEG_BLOOD   = 'BLOOD'
    # segment -> the field holding its state.
    SEGMENT_FIELD = {
        SEG_CONSULT: 'svc_consultations',
        SEG_SCAN:    'svc_scans',
        SEG_BLOOD:   'svc_blood',
    }
    # The legacy `?kind=` values the clients already send, mapped onto segments,
    # so the wire contract does not change. A shipped app keeps asking for
    # `?kind=SCAN_CENTER` and now gets everyone who sells scans.
    KIND_TO_SEGMENT = {
        HOSPITAL:     SEG_CONSULT,
        SCAN_CENTER:  SEG_SCAN,
        BLOOD_CENTER: SEG_BLOOD,
    }
    # Segments whose bookable unit is a Scan. The capability-level counterpart
    # of CENTER_KINDS, and what ownership/checkout/payout guards should ask.
    SCAN_SEGMENTS = (SEG_SCAN, SEG_BLOOD)

    def offers(self, segment) -> bool:
        """True only when this provider SELLS `segment` right now.

        PENDING is not offering. A capability awaiting approval must not put the
        provider in a patient-facing list, or the approval gate is decorative.
        """
        field = self.SEGMENT_FIELD.get(segment)
        return bool(field) and getattr(self, field, self.CAP_OFF) == self.CAP_ACTIVE

    @property
    def sells_scans(self) -> bool:
        """Whether a Scan row may be listed, booked and paid out here."""
        return any(self.offers(seg) for seg in self.SCAN_SEGMENTS)

    @property
    def active_segments(self) -> list:
        """Segment keys this provider is live in — serialised for the clients."""
        return [seg for seg in self.SEGMENT_FIELD if self.offers(seg)]

    def save(self, *args, **kwargs):
        """A brand-new row with no capabilities gets the one its `kind` implies.

        Without this, `Hospital.objects.create(kind=SCAN_CENTER)` produces a
        provider that sells nothing and therefore appears in NO patient list —
        silently, with no error. Every caller that predates the svc_* fields
        does exactly that: the admin's add form, fixtures, management commands,
        every existing test. Making them all pass capabilities explicitly would
        be a lot of edits to say the thing `kind` already said.

        Deliberately narrow, so it can never fight an explicit choice:
          - on INSERT only. A provider who later switches everything off stays
            off; this must not resurrect a capability they turned away.
          - only when all three are OFF. Any explicit capability at creation
            means the caller has an opinion, and it wins.
        """
        if self._state.adding and not kwargs.get('update_fields'):
            fields = list(self.SEGMENT_FIELD.values())
            if all(getattr(self, f, self.CAP_OFF) == self.CAP_OFF for f in fields):
                implied = self.SEGMENT_FIELD.get(self.KIND_TO_SEGMENT.get(self.kind))
                if implied:
                    setattr(self, implied, self.CAP_ACTIVE)
        super().save(*args, **kwargs)
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
