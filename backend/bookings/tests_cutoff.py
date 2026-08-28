"""Per-provider booking lead time.

The platform default is 2 hours. A doctor or a scan may override it — including
to 0, which is why the column is nullable: 0 means "bookable until it starts"
and NULL means "never chose, use the default". A plain integer default could
not tell those apart, and that distinction is the whole feature.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from bookings.capacity import SlotUnavailable, check_slot_available
from doctors.models import Doctor
from hospitals.models import Hospital
from scans.models import Scan
from tokenwalla.utils import BOOKING_CUTOFF_HOURS, cutoff_hours_for


def slot_in(hours):
    """A (date, slot) pair `hours` from now, on the hour so it round-trips."""
    when = timezone.localtime(timezone.now() + timedelta(hours=hours))
    return when.date(), when.strftime('%I:%M %p').lstrip('0').rjust(8, '0')


class CutoffResolutionTests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name='Cutoff Clinic', city='Hindupur', mobile='9000001200',
            status='active', password='x')

    def doctor(self, cutoff):
        return Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000001201', fee=200, slots=[], max_per_slot=5,
            booking_cutoff_hours=cutoff)

    def test_unset_falls_back_to_the_platform_default(self):
        self.assertEqual(cutoff_hours_for(self.doctor(None)), BOOKING_CUTOFF_HOURS)

    def test_zero_is_honoured_and_not_treated_as_unset(self):
        """The bug this design exists to avoid: `hours or DEFAULT` would turn a
        deliberate 0 back into 2."""
        self.assertEqual(cutoff_hours_for(self.doctor(0)), 0)

    def test_a_custom_value_wins(self):
        self.assertEqual(cutoff_hours_for(self.doctor(6)), 6)

    def test_a_provider_without_the_attribute_still_resolves(self):
        """cutoff_hours_for is called with whatever `provider` capacity was
        handed; it must not explode on an object that predates the field."""
        self.assertEqual(cutoff_hours_for(object()), BOOKING_CUTOFF_HOURS)


class CutoffEnforcementTests(TestCase):
    """The gate every booking passes through — bookings.capacity."""

    def setUp(self):
        self.hospital = Hospital.objects.create(
            name='Cutoff Clinic', city='Hindupur', mobile='9000001210',
            status='active', password='x')

    def doctor_with(self, cutoff, slot):
        return Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000001211', fee=200, slots=[slot], max_per_slot=5,
            booking_cutoff_hours=cutoff)

    def assertBookable(self, provider, date_val, slot_val):
        check_slot_available(provider, date_val, slot_val)   # must not raise

    def assertTooSoon(self, provider, date_val, slot_val):
        with self.assertRaises(SlotUnavailable) as caught:
            check_slot_available(provider, date_val, slot_val)
        self.assertEqual(caught.exception.reason, 'too_soon')

    def test_default_still_blocks_a_slot_one_hour_out(self):
        date_val, slot_val = slot_in(1)
        self.assertTooSoon(self.doctor_with(None, slot_val), date_val, slot_val)

    def test_a_short_notice_doctor_accepts_what_the_default_would_reject(self):
        date_val, slot_val = slot_in(1)
        self.assertBookable(self.doctor_with(0, slot_val), date_val, slot_val)

    def test_a_long_notice_doctor_rejects_what_the_default_would_accept(self):
        """24h notice: a slot 3 hours out clears the platform's 2h but not this
        doctor's own rule."""
        date_val, slot_val = slot_in(3)
        self.assertTooSoon(self.doctor_with(24, slot_val), date_val, slot_val)

    def test_zero_notice_still_refuses_a_slot_that_has_passed(self):
        """0 means "until it starts", never "after it started"."""
        date_val, slot_val = slot_in(-1)
        doctor = self.doctor_with(0, slot_val)
        self.assertTooSoon(doctor, date_val, slot_val)

    def test_a_scan_carries_its_own_lead_time(self):
        """Same rule, same code path — a fasting blood test wants more notice."""
        date_val, slot_val = slot_in(3)
        centre = Hospital.objects.create(
            name='Lab', city='Hindupur', mobile='9000001212',
            status='active', password='x', kind=Hospital.BLOOD_CENTER)
        scan = Scan.objects.create(
            center=centre, name='Lipid Profile', price=500,
            slots=[slot_val], max_per_slot=2, booking_cutoff_hours=12)
        self.assertTooSoon(scan, date_val, slot_val)
