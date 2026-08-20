"""
A Booking has EXACTLY ONE provider — a Doctor or a Scan.

`Booking.doctor` was NOT NULL until scanning centres arrived (item 8 slice 2).
Relaxing a NOT NULL on a live table is the kind of change that looks harmless in
the diff and goes wrong months later, so the guarantees are pinned here:

  * the database itself rejects neither-set and both-set,
  * every display site reads one property that is correct for both,
  * queue position and slot capacity never match ACROSS providers — the bug
    that `doctor=booking.doctor` would silently cause on a scan booking, where
    doctor is None and the filter degrades to `doctor__isnull=True` and matches
    every scan booking in the system,
  * the doctor_* API keys stay populated for a scan booking, because build 36
    reads them and cannot be updated on our schedule.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from bookings.models import Booking
from bookings.serializers import BookingSerializer, build_queue_map
from doctors.models import Doctor
from hospitals.models import Hospital
from scans.models import Scan

User = get_user_model()


class ProviderWorldMixin:
    def make_world(self):
        self.user = User.objects.create(
            username='patient', mobile='9000000401', first_name='Rahul')

        self.hospital = Hospital.objects.create(
            name='Sri Sarwodhaya', city='Hindupur',
            mobile='9000000402', status='active', password='x')
        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur',
            mobile='9000000403', status='active', password='x',
            kind=Hospital.SCAN_CENTER)

        self.doctor = Doctor.objects.create(
            name='Dr. Hari krishna', specialization='Orthopedic Surgeon',
            hospital=self.hospital, fee=200, max_per_slot=10,
            slots=['09:00 AM', '10:00 AM'])
        self.mri = Scan.objects.create(
            center=self.centre, name='MRI Brain', modality='MRI',
            price=4500, max_per_slot=1, slots=['09:00 AM', '10:00 AM'])
        self.cbc = Scan.objects.create(
            center=self.centre, name='Complete Blood Count', modality='Blood',
            price=300, max_per_slot=8, slots=['09:00 AM'])

        self.today = timezone.localdate()

    def book(self, *, doctor=None, scan=None, token, slot='09:00 AM', status=Booking.CONFIRMED):
        return Booking.objects.create(
            user=self.hospital and self.user, doctor=doctor, scan=scan,
            hospital=self.hospital if doctor else self.centre,
            date=self.today, slot=slot, token=token, status=status)


class ExactlyOneProviderTests(ProviderWorldMixin, TestCase):
    def setUp(self):
        self.make_world()

    def test_a_doctor_booking_is_valid(self):
        b = self.book(doctor=self.doctor, token='TW-D-1')
        self.assertFalse(b.is_scan)
        self.assertEqual(b.provider, self.doctor)

    def test_a_scan_booking_is_valid(self):
        b = self.book(scan=self.mri, token='TW-S-1')
        self.assertTrue(b.is_scan)
        self.assertEqual(b.provider, self.mri)

    def test_neither_provider_is_rejected_by_the_database(self):
        """The whole reason the nullable column is safe."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Booking.objects.create(
                    user=self.user, hospital=self.hospital,
                    date=self.today, slot='09:00 AM', token='TW-NONE')

    def test_both_providers_are_rejected_by_the_database(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Booking.objects.create(
                    user=self.user, doctor=self.doctor, scan=self.mri,
                    hospital=self.hospital,
                    date=self.today, slot='09:00 AM', token='TW-BOTH')


class ProviderAccessorTests(ProviderWorldMixin, TestCase):
    def setUp(self):
        self.make_world()

    def test_doctor_booking_accessors(self):
        b = self.book(doctor=self.doctor, token='TW-D-2')
        self.assertEqual(b.provider_name, 'Dr. Hari krishna')
        self.assertEqual(b.provider_detail, 'Orthopedic Surgeon')
        self.assertEqual(b.provider_fee, 200)
        self.assertEqual(b.provider_max_per_slot, 10)
        self.assertEqual(b.provider_slots, ['09:00 AM', '10:00 AM'])

    def test_scan_booking_accessors(self):
        b = self.book(scan=self.mri, token='TW-S-2')
        self.assertEqual(b.provider_name, 'MRI Brain')
        self.assertEqual(b.provider_detail, 'MRI')       # modality, not specialization
        self.assertEqual(b.provider_fee, 4500)
        self.assertEqual(b.provider_max_per_slot, 1)

    def test_provider_filter_keys_on_the_right_column(self):
        self.assertEqual(
            self.book(doctor=self.doctor, token='TW-D-3').provider_filter,
            {'doctor_id': self.doctor.id})
        self.assertEqual(
            self.book(scan=self.mri, token='TW-S-3').provider_filter,
            {'scan_id': self.mri.id})


class NoCrossProviderMatchingTests(ProviderWorldMixin, TestCase):
    """The bug `doctor=booking.doctor` would have caused, pinned shut."""

    def setUp(self):
        self.make_world()

    def test_a_scan_booking_does_not_queue_against_other_scans(self):
        mri_b = self.book(scan=self.mri, token='TW-S-10')
        self.book(scan=self.cbc, token='TW-S-11')
        self.book(scan=self.cbc, token='TW-S-12')

        same = Booking.objects.filter(**mri_b.provider_filter, date=self.today)
        self.assertEqual(list(same), [mri_b])

    def test_a_naive_doctor_filter_would_have_matched_every_scan(self):
        """Demonstrates WHY provider_filter exists, so nobody 'simplifies' it back."""
        self.book(scan=self.mri, token='TW-S-20')
        self.book(scan=self.cbc, token='TW-S-21')
        naive = Booking.objects.filter(doctor=None, date=self.today)
        self.assertEqual(naive.count(), 2)      # two unrelated centres' scans collide

    def test_build_queue_map_groups_per_scan_not_per_null_doctor(self):
        a = self.book(scan=self.mri, token='TW-S-30')
        b = self.book(scan=self.cbc, token='TW-S-31')
        c = self.book(scan=self.cbc, token='TW-S-32')

        qmap = build_queue_map(Booking.objects.filter(date=self.today))
        # Each scan queues independently: MRI's only patient is #1, and CBC's
        # two are #1 and #2. Grouping on doctor_id alone would have made these
        # 1, 2, 3 in one shared queue.
        self.assertEqual(qmap[a.id], 1)
        self.assertEqual(qmap[b.id], 1)
        self.assertEqual(qmap[c.id], 2)

    def test_doctor_queue_is_unaffected_by_scans(self):
        d1 = self.book(doctor=self.doctor, token='TW-D-30')
        d2 = self.book(doctor=self.doctor, token='TW-D-31')
        self.book(scan=self.mri, token='TW-S-33')

        qmap = build_queue_map(Booking.objects.filter(date=self.today))
        self.assertEqual(qmap[d1.id], 1)
        self.assertEqual(qmap[d2.id], 2)


class OldClientContractTests(ProviderWorldMixin, TestCase):
    """Build 36 reads doctor_name/specialization/doctor_fee and cannot be updated."""

    def setUp(self):
        self.make_world()

    def test_scan_booking_still_fills_the_doctor_keys(self):
        b = self.book(scan=self.mri, token='TW-S-40')
        data = BookingSerializer(b).data
        self.assertEqual(data['doctor_name'], 'MRI Brain')
        self.assertIsNone(data['doctor'])
        self.assertEqual(data['provider_name'], 'MRI Brain')
        self.assertEqual(data['provider_kind'], 'SCAN')

    def test_doctor_booking_serialises_exactly_as_before(self):
        b = self.book(doctor=self.doctor, token='TW-D-40')
        data = BookingSerializer(b).data
        self.assertEqual(data['doctor_name'], 'Dr. Hari krishna')
        self.assertEqual(data['doctor'], self.doctor.id)
        self.assertEqual(data['provider_kind'], 'DOCTOR')


class ScanLedgerRoutingTests(ProviderWorldMixin, TestCase):
    """A scan booking has no doctor, so its earnings are owed to the centre that
    owns the Scan. These pin the routing — the alternative failure is money
    owed to a centre that never appears on the payouts page."""

    def setUp(self):
        self.make_world()

    def _completed_scan_booking(self, *, doctor_fee, token):
        from payments.models import Payment
        b = self.book(scan=self.mri, token=token, status=Booking.COMPLETED)
        Payment.objects.create(
            booking=b, order_id=f'ord_{token}', amount=int(doctor_fee) or 25,
            doctor_fee=doctor_fee, status=Payment.PAID)
        return b

    def test_a_scan_booking_ledgers_to_its_centre(self):
        """FULL collection means we hold the centre's money, so the earning must
        land on a ledger row keyed to the CENTRE — not to a null doctor, and not
        nowhere at all."""
        from django.core.management import call_command
        from payments.models import DoctorLedger
        b = self._completed_scan_booking(doctor_fee=4500, token='TW-S-50')
        call_command('run_daily_payouts')
        b.refresh_from_db()
        self.assertEqual(b.doctor_payout_status, Booking.PAYOUT_PROCESSING)
        entry = DoctorLedger.objects.get(booking=b)
        self.assertEqual(entry.center_id, self.mri.center_id)
        self.assertIsNone(entry.doctor_id)
        self.assertEqual(entry.amount, Decimal('4500'))

    def test_ledger_row_needs_exactly_one_payee(self):
        """The database, not application code, is what makes the nullable
        `doctor` column safe. Both-set and neither-set must fail at the write."""
        from payments.models import DoctorLedger
        b = self._completed_scan_booking(doctor_fee=100, token='TW-S-52')
        for kwargs in ({}, {'doctor': self.doctor, 'center': self.mri.center}):
            with self.assertRaises(IntegrityError):
                with transaction.atomic():
                    DoctorLedger.objects.create(
                        booking=b, amount=Decimal('1'),
                        reason=DoctorLedger.BOOKING_COMPLETED, **kwargs)

    def test_a_scan_booking_owing_nothing_settles_normally(self):
        """SERVICE_ONLY is the default, so most scan bookings capture no
        provider fee at all. Nothing is owed, so nothing should be held open —
        marking these PAID is correct, not a leak."""
        from django.core.management import call_command
        b = self._completed_scan_booking(doctor_fee=0, token='TW-S-51')
        call_command('run_daily_payouts')
        b.refresh_from_db()
        self.assertEqual(b.doctor_payout_status, Booking.PAYOUT_PAID)

    def test_a_doctor_booking_still_ledgers(self):
        """Regression: the guard must not have broken the path that works."""
        from django.core.management import call_command
        from payments.models import DoctorLedger, Payment
        b = self.book(doctor=self.doctor, token='TW-D-50', status=Booking.COMPLETED)
        Payment.objects.create(
            booking=b, order_id='ord_d50', amount=200,
            doctor_fee=200, status=Payment.PAID)
        call_command('run_daily_payouts')
        b.refresh_from_db()
        self.assertEqual(b.doctor_payout_status, Booking.PAYOUT_PROCESSING)
        self.assertTrue(DoctorLedger.objects.filter(booking=b, doctor=self.doctor).exists())
