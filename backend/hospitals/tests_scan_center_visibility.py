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
from django.core.cache import cache
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


class RegistrationKindTests(TestCase):
    """`kind` arrives on a PUBLIC, unauthenticated endpoint and decides which
    patient-facing list a row lands in, so it is whitelisted, not trusted."""

    URL = '/api/hospitals/register/'

    def _register(self, mobile, **extra):
        # Registration now requires the mobile to have been OTP-verified (the
        # clients already do this first); stand in for that step.
        cache.set(f'otp_verified:{mobile}', True, timeout=600)
        return APIClient().post(self.URL, {
            'name': f'Provider {mobile}', 'mobile': mobile,
            'password': 'Clinic-Str0ng-2026', 'city': 'Hindupur', **extra,
        }, format='json')

    def test_registering_as_a_scan_centre_works(self):
        res = self._register('9111100001', kind='SCAN_CENTER')
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(
            Hospital.objects.get(mobile='9111100001').kind, Hospital.SCAN_CENTER)

    def test_a_centre_registers_without_a_licence_number(self):
        """Verification is a phone call before approval, NOT a form field.
        Demanding the number here only costs us partners who do not have it to
        hand, so a centre must register — and be approvable — without one."""
        res = self._register('9111100020', kind='SCAN_CENTER')
        self.assertIn(res.status_code, (200, 201), res.content)
        centre = Hospital.objects.get(mobile='9111100020')
        self.assertEqual(centre.license_number, '')

    def test_a_licence_number_is_stored_when_sent(self):
        """Optional, not ignored — staff record what the call turns up."""
        res = self._register('9111100021', kind='SCAN_CENTER',
                             license_number='AP/CEA/2026/1188')
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(
            Hospital.objects.get(mobile='9111100021').license_number, 'AP/CEA/2026/1188')

    def test_omitting_kind_registers_a_hospital(self):
        self._register('9111100002')
        self.assertEqual(
            Hospital.objects.get(mobile='9111100002').kind, Hospital.HOSPITAL)

    def test_an_unrecognised_kind_falls_back_to_hospital(self):
        """Fails safe: a typo or a hostile value must not place a row somewhere
        it was never approved to appear."""
        for i, bad in enumerate(['scan_center', 'ADMIN', 'x', '', 'SCAN CENTER']):
            mobile = f'91111001{i:02d}'
            with self.subTest(kind=bad):
                self._register(mobile, kind=bad)
                self.assertEqual(
                    Hospital.objects.get(mobile=mobile).kind, Hospital.HOSPITAL)


class LoginPayloadTests(TestCase):
    """The dashboard decides Doctors-tab vs Scans-tab from the login payload.

    Caught in a browser, not by a test: every backend test passed while the
    centre dashboard still showed a Doctors tab, because `kind` was simply
    absent from the embedded hospital object.
    """

    def test_login_payload_carries_the_kind(self):
        from django.contrib.auth.hashers import make_password
        centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur', mobile='9222200001',
            status='active', password=make_password('secret123'),
            kind=Hospital.SCAN_CENTER)
        res = APIClient().post('/api/hospitals/login/',
                               {'mobile': '9222200001', 'password': 'secret123'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['user']['hospital']['kind'], Hospital.SCAN_CENTER)
        self.assertEqual(centre.kind, Hospital.SCAN_CENTER)

    def test_a_hospital_login_still_reports_hospital(self):
        from django.contrib.auth.hashers import make_password
        Hospital.objects.create(
            name='Sri Sarwodhaya', city='Hindupur', mobile='9222200002',
            status='active', password=make_password('secret123'))
        res = APIClient().post('/api/hospitals/login/',
                               {'mobile': '9222200002', 'password': 'secret123'},
                               format='json')
        self.assertEqual(res.json()['user']['hospital']['kind'], Hospital.HOSPITAL)


class BloodCenterTests(TestCase):
    """A blood centre is a SECOND centre kind on the SAME pipeline.

    Two things must hold at once, and they pull in opposite directions:

    1. It is a centre — so it is hidden from build 36 exactly like a scanning
       centre, and a Scan row may be attached to it.
    2. It is NOT a scanning centre — so it must not appear in the SCAN_CENTER
       listing, and vice versa. The two tabs are separate lists.

    The second is the one that would silently regress if someone "simplified"
    the listing filter to a boolean is-a-centre check.
    """
    URL = '/api/hospitals/'

    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Sri Sarwodhaya orthopaedic hospital', city='Hindupur',
            mobile='9000000401', status='active', password='x')
        self.scan_centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur',
            mobile='9000000402', status='active', password='x',
            kind=Hospital.SCAN_CENTER)
        self.blood_centre = Hospital.objects.create(
            name='Lotus Pathology Lab', city='Hindupur',
            mobile='9000000403', status='active', password='x',
            kind=Hospital.BLOOD_CENTER)

    def names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) and 'results' in body else body
        return [r['name'] for r in rows]

    def test_hidden_from_clients_that_did_not_opt_in(self):
        """The build-36 contract, extended to the new kind."""
        names = self.names(self.client.get(self.URL))
        self.assertIn('Sri Sarwodhaya orthopaedic hospital', names)
        self.assertNotIn('Lotus Pathology Lab', names)

    def test_opt_in_returns_only_blood_centres(self):
        names = self.names(self.client.get(self.URL, {'kind': 'BLOOD_CENTER'}))
        self.assertEqual(names, ['Lotus Pathology Lab'])

    def test_the_two_centre_kinds_do_not_bleed_into_each_other(self):
        """Separate tabs mean separate lists — a lab is not an MRI centre."""
        self.assertNotIn(
            'Lotus Pathology Lab',
            self.names(self.client.get(self.URL, {'kind': 'SCAN_CENTER'})))
        self.assertNotIn(
            'Vijaya Diagnostics',
            self.names(self.client.get(self.URL, {'kind': 'BLOOD_CENTER'})))

    def test_a_test_can_be_listed_at_a_blood_centre(self):
        """The reason this is a kind and not a new model: Scan just works."""
        Scan.objects.create(
            center=self.blood_centre, name='Complete Blood Count',
            modality='Blood Test', price=350, duration_minutes=5,
            prep_instructions='12 hours fasting required.',
            slots=['09:00 AM'], days=['Mon'])
        rows = self.client.get('/api/scans/', {'center': self.blood_centre.id}).json()
        rows = rows['results'] if isinstance(rows, dict) and 'results' in rows else rows
        self.assertEqual([r['name'] for r in rows], ['Complete Blood Count'])

    def test_a_test_cannot_be_listed_at_a_plain_hospital(self):
        """The centre guard still refuses hospitals — it widened, not opened."""
        from scans.serializers import ScanSerializer
        ser = ScanSerializer(data={'center': self.hospital.id, 'name': 'CBC',
                                   'price': 350})
        self.assertFalse(ser.is_valid())
        self.assertIn('center', ser.errors)

    def test_registration_accepts_the_new_kind(self):
        cache.set('otp_verified:9111100050', True, 300)
        res = self.client.post('/api/hospitals/register/', {
            'name': 'New Lab', 'mobile': '9111100050', 'password': 'Test@1234',
            'city': 'Hindupur', 'kind': 'BLOOD_CENTER',
        }, format='json')
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(
            Hospital.objects.get(mobile='9111100050').kind, Hospital.BLOOD_CENTER)
