"""
Scanning centres must never reach a client that has not opted in.

THE POINT OF THIS FILE: build 36 is live on the Play Store and calls
`/api/hospitals/` and `/api/doctors/`. Those installs cannot be updated on our
schedule and have never heard of a Scan. A scanning centre appearing in either
response renders there as a hospital with a Book button that leads nowhere.

This is the same failure mode as the `[TEST]` hospital leak found in production
on 2026-08-11 (see tests_test_hospital_visibility.py), which is why the guard is
built the same way and tested at least as hard. These tests are the reason the
website can ship scanning centres BEFORE any app release.

The negative assertions here matter more than the positive ones: proving a
centre is absent from the default response is the contract. Deleting one of
these tests to make a change pass is never the right move.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from doctors.models import Doctor
from hospitals.models import Hospital
from scans.models import Scan


class ScanCenterWorldMixin:
    def make_world(self):
        self.hospital = Hospital.objects.create(
            name='Sri Sarwodhaya orthopaedic hospital', city='Hindupur',
            mobile='9000000301', status='active', password='x')
        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur',
            mobile='9000000302', status='active', password='x',
            kind=Hospital.SCAN_CENTER)

        self.doctor = Doctor.objects.create(
            name='Dr. Hari krishna', specialization='Orthopedic Surgeon',
            hospital=self.hospital, fee=200, available=True)
        # A doctor row attached to a CENTRE. This should not normally exist —
        # it is the mis-registration case the filter is defence against.
        self.stray_doctor = Doctor.objects.create(
            name='Dr. Should Not Appear', specialization='Radiologist',
            hospital=self.centre, fee=500, available=True)

        self.scan = Scan.objects.create(
            center=self.centre, name='MRI Brain', modality='MRI',
            price=4500, duration_minutes=45,
            slots=['09:00 AM', '10:00 AM'], days=['Mon', 'Tue'])

    def names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) and 'results' in body else body
        return [r['name'] for r in rows]


class HospitalListVisibilityTests(ScanCenterWorldMixin, TestCase):
    URL = '/api/hospitals/'

    def setUp(self):
        self.make_world()
        self.client = APIClient()

    def test_default_response_hides_scan_centres(self):
        """The contract: an old client sends no ?kind and must see no centres."""
        names = self.names(self.client.get(self.URL))
        self.assertIn('Sri Sarwodhaya orthopaedic hospital', names)
        self.assertNotIn('Vijaya Diagnostics', names)

    def test_kind_opt_in_returns_only_centres(self):
        names = self.names(self.client.get(self.URL, {'kind': 'SCAN_CENTER'}))
        self.assertEqual(names, ['Vijaya Diagnostics'])

    def test_unknown_kind_value_does_not_widen_the_list(self):
        """A typo must fail closed, never leak centres to an old client."""
        for bad in ('scan_center', 'SCANCENTER', 'ALL', '', 'HOSPITAL'):
            with self.subTest(kind=bad):
                names = self.names(self.client.get(self.URL, {'kind': bad}))
                self.assertNotIn('Vijaya Diagnostics', names)

    def test_detail_still_serves_a_scan_centre(self):
        """LIST is filtered, DETAIL is not — a centre fetches itself by id to
        render its own dashboard and profile. Filtering detail would lock a
        paying partner out of its own account."""
        res = self.client.get(f'{self.URL}{self.centre.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'Vijaya Diagnostics')


class DoctorListVisibilityTests(ScanCenterWorldMixin, TestCase):
    URL = '/api/doctors/'

    def setUp(self):
        self.make_world()
        self.client = APIClient()

    def test_doctors_at_a_scan_centre_are_hidden(self):
        names = self.names(self.client.get(self.URL))
        self.assertIn('Dr. Hari krishna', names)
        self.assertNotIn('Dr. Should Not Appear', names)


class DefaultsTests(TestCase):
    """The two defaults that must never drift."""

    def test_a_hospital_created_without_kind_is_a_hospital(self):
        """Every row that predates the column, and every client that never
        sends it, means HOSPITAL."""
        h = Hospital.objects.create(
            name='No Kind Given', city='Hindupur',
            mobile='9000000399', status='active', password='x')
        self.assertEqual(h.kind, Hospital.HOSPITAL)

    def test_a_scan_defaults_to_service_only(self):
        """Same money rule as Doctor: only an explicit FULL collects the price
        online. A default of FULL would have us holding a centre's money with
        no payout account on file."""
        centre = Hospital.objects.create(
            name='Defaults Diagnostics', city='Hindupur',
            mobile='9000000398', status='active', password='x',
            kind=Hospital.SCAN_CENTER)
        scan = Scan.objects.create(center=centre, name='CBC', price=300)
        self.assertEqual(scan.payment_collection_mode, Scan.COLLECT_SERVICE_ONLY)
