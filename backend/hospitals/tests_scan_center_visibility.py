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


class HybridProviderTests(TestCase):
    """One account, more than one thing sold.

    THE POINT OF THIS FILE'S SIBLING CLASSES is that a centre never leaks to a
    client that did not ask. The point of THIS one is the opposite risk: that in
    protecting that contract we made it impossible for a real business — a
    hospital with an in-house scanning wing — to be listed as what it is.

    Both must hold at once, which is why they are tested together.
    """
    URL = '/api/hospitals/'

    def setUp(self):
        self.client = APIClient()
        # A hospital that also runs a scanning wing. Note kind=HOSPITAL: its
        # IDENTITY is a hospital, and that is not a lie — what changed is that
        # identity no longer decides what it may sell.
        self.hybrid = Hospital.objects.create(
            name='Sri Sarwodhaya orthopaedic hospital', city='Hindupur',
            mobile='9000000601', status='active', password='x',
            kind=Hospital.HOSPITAL,
            svc_consultations=Hospital.CAP_ACTIVE,
            svc_scans=Hospital.CAP_ACTIVE)
        self.pure_centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur',
            mobile='9000000602', status='active', password='x',
            kind=Hospital.SCAN_CENTER, svc_scans=Hospital.CAP_ACTIVE)
        self.pure_hospital = Hospital.objects.create(
            name='City Care', city='Hindupur',
            mobile='9000000603', status='active', password='x')

    def names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) and 'results' in body else body
        return [r['name'] for r in rows]

    def test_a_hybrid_appears_in_both_lists(self):
        """The whole feature in one assertion."""
        self.assertIn('Sri Sarwodhaya orthopaedic hospital',
                      self.names(self.client.get(self.URL)))
        self.assertIn('Sri Sarwodhaya orthopaedic hospital',
                      self.names(self.client.get(self.URL, {'kind': 'SCAN_CENTER'})))

    def test_the_build_36_contract_still_holds(self):
        """A pure centre stays invisible to a client that sent no ?kind.

        The hybrid appearing there is correct and is NOT a leak: build 36 can
        book its doctors. What build 36 must never see is a provider whose only
        bookable unit is a Scan, because it has never heard of one.
        """
        default = self.names(self.client.get(self.URL))
        self.assertNotIn('Vijaya Diagnostics', default)
        self.assertIn('City Care', default)

    def test_a_hybrid_is_absent_from_a_segment_it_does_not_sell(self):
        self.assertNotIn('Sri Sarwodhaya orthopaedic hospital',
                         self.names(self.client.get(self.URL, {'kind': 'BLOOD_CENTER'})))

    def test_a_pending_capability_lists_the_provider_nowhere_new(self):
        """Self-serve to request, admin to approve — enforced by exclusion."""
        self.pure_hospital.svc_scans = Hospital.CAP_PENDING
        self.pure_hospital.save(update_fields=['svc_scans'])
        self.assertNotIn('City Care',
                         self.names(self.client.get(self.URL, {'kind': 'SCAN_CENTER'})))
        # ...and it keeps the list it already had.
        self.assertIn('City Care', self.names(self.client.get(self.URL)))

    def test_a_hybrid_may_own_scans(self):
        """The guard at scans.serializers asks the capability, not the kind."""
        from scans.serializers import ScanSerializer
        ser = ScanSerializer(data={'center': self.hybrid.id, 'name': 'MRI Brain',
                                   'price': 4500})
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_a_provider_selling_nothing_scan_shaped_may_not(self):
        from scans.serializers import ScanSerializer
        ser = ScanSerializer(data={'center': self.pure_hospital.id, 'name': 'MRI',
                                   'price': 4500})
        self.assertFalse(ser.is_valid())
        self.assertIn('center', ser.errors)

    def test_a_hybrids_scan_is_bookable(self):
        """payments.views checkout guard — miss it and the scan takes no money."""
        from scans.models import Scan
        scan = Scan.objects.create(center=self.hybrid, name='MRI Brain', price=4500,
                                   slots=['09:00 AM'], days=['Mon'])
        self.assertTrue(scan.center.sells_scans)
        rows = self.client.get('/api/scans/', {'center': self.hybrid.id}).json()
        rows = rows['results'] if isinstance(rows, dict) and 'results' in rows else rows
        self.assertEqual([r['name'] for r in rows], ['MRI Brain'])

    def test_kind_alone_no_longer_creates_a_silent_ghost(self):
        """Hospital.save() backstop: a row created the old way still works.

        Every caller predating svc_* — the admin add form, fixtures, management
        commands — passes only `kind`. Without the backstop those rows sell
        nothing and appear in no list at all, silently and with no error.
        """
        legacy = Hospital.objects.create(
            name='Legacy Centre', city='Hindupur', mobile='9000000604',
            status='active', password='x', kind=Hospital.SCAN_CENTER)
        self.assertTrue(legacy.offers(Hospital.SEG_SCAN))
        self.assertIn('Legacy Centre',
                      self.names(self.client.get(self.URL, {'kind': 'SCAN_CENTER'})))

    def test_the_backstop_never_overrides_an_explicit_choice(self):
        explicit = Hospital.objects.create(
            name='Explicit', city='Hindupur', mobile='9000000605',
            status='active', password='x', kind=Hospital.SCAN_CENTER,
            svc_blood=Hospital.CAP_ACTIVE)
        self.assertFalse(explicit.offers(Hospital.SEG_SCAN))
        self.assertTrue(explicit.offers(Hospital.SEG_BLOOD))

    def test_turning_everything_off_stays_off(self):
        """The backstop is insert-only — it must not resurrect a capability."""
        self.pure_centre.svc_scans = Hospital.CAP_OFF
        self.pure_centre.save(update_fields=['svc_scans'])
        self.pure_centre.refresh_from_db()
        self.assertEqual(self.pure_centre.svc_scans, Hospital.CAP_OFF)
        self.assertNotIn('Vijaya Diagnostics',
                         self.names(self.client.get(self.URL, {'kind': 'SCAN_CENTER'})))

    def test_an_unknown_segment_fails_closed(self):
        """in_segment() must never leak everyone when asked for nobody."""
        from hospitals.models import in_segment
        self.assertEqual(in_segment(Hospital.objects.all(), 'NOPE').count(), 0)

    def test_segments_are_serialised_for_the_clients(self):
        row = next(r for r in self.client.get(self.URL).json()
                   if r['name'].startswith('Sri Sarwodhaya'))
        self.assertCountEqual(row['segments'], ['CONSULT', 'SCAN'])
        # kind is still sent, and still says who they are rather than what they sell.
        self.assertEqual(row['kind'], 'HOSPITAL')


class CapabilityEndpointTests(TestCase):
    """Self-serve to request, admin to approve — over the wire."""
    def setUp(self):
        from users.models import User
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='City Care', city='Hindupur', mobile='9000000701',
            status='active', password='x')
        self.other = Hospital.objects.create(
            name='Rival Care', city='Hindupur', mobile='9000000702',
            status='active', password='x')
        # Hospital staff carry their hospital id in last_name, the same link
        # HospitalLoginView writes.
        self.staff = User.objects.create(
            username='9000000701', mobile='9000000701', role='hospital',
            first_name='City Care', last_name=str(self.hospital.id))
        self.admin = User.objects.create(
            username='admin1', mobile='9000000799', role='admin')

    def url(self, h=None):
        return f'/api/hospitals/{(h or self.hospital).id}/capabilities/'

    def test_a_provider_request_is_pending_not_live(self):
        self.client.force_authenticate(self.staff)
        res = self.client.post(self.url(), {'segment': 'SCAN'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['state'], 'PENDING')
        self.hospital.refresh_from_db()
        self.assertFalse(self.hospital.offers(Hospital.SEG_SCAN))

    def test_an_admin_approves_it(self):
        self.hospital.svc_scans = Hospital.CAP_PENDING
        self.hospital.save(update_fields=['svc_scans'])
        self.client.force_authenticate(self.admin)
        res = self.client.patch(self.url(),
                                {'segment': 'SCAN', 'action': 'approve'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.hospital.refresh_from_db()
        self.assertTrue(self.hospital.offers(Hospital.SEG_SCAN))

    def test_a_provider_cannot_approve_itself(self):
        """The whole point of the gate."""
        self.client.force_authenticate(self.staff)
        res = self.client.patch(self.url(),
                                {'segment': 'SCAN', 'action': 'approve'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.hospital.refresh_from_db()
        self.assertFalse(self.hospital.offers(Hospital.SEG_SCAN))

    def test_a_provider_cannot_touch_another_provider(self):
        self.client.force_authenticate(self.staff)
        res = self.client.post(self.url(self.other), {'segment': 'SCAN'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_disabling_needs_no_approval(self):
        """Nobody needs permission to stop offering something."""
        self.hospital.svc_scans = Hospital.CAP_ACTIVE
        self.hospital.save(update_fields=['svc_scans'])
        self.client.force_authenticate(self.staff)
        res = self.client.post(self.url(), {'segment': 'SCAN', 'action': 'disable'},
                               format='json')
        self.assertEqual(res.status_code, 200)
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.svc_scans, Hospital.CAP_OFF)

    def test_disabling_keeps_the_price_list(self):
        """A provider pausing for a month must not lose their scans."""
        from scans.models import Scan
        self.hospital.svc_scans = Hospital.CAP_ACTIVE
        self.hospital.save(update_fields=['svc_scans'])
        Scan.objects.create(center=self.hospital, name='MRI Brain', price=4500)
        self.client.force_authenticate(self.staff)
        self.client.post(self.url(), {'segment': 'SCAN', 'action': 'disable'},
                         format='json')
        self.assertEqual(self.hospital.scans.count(), 1)

    def test_an_unknown_segment_is_rejected(self):
        self.client.force_authenticate(self.staff)
        res = self.client.post(self.url(), {'segment': 'DENTAL'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_anonymous_gets_nowhere(self):
        res = self.client.post(self.url(), {'segment': 'SCAN'}, format='json')
        self.assertIn(res.status_code, (401, 403))


class RegistrationCapabilityTests(TestCase):
    """Capabilities chosen at registration are live once the account is."""
    def setUp(self):
        self.client = APIClient()

    def _register(self, mobile, **extra):
        cache.set(f'otp_verified:{mobile}', True, 300)
        return self.client.post('/api/hospitals/register/', {
            'name': 'Multi Care', 'mobile': mobile, 'password': 'Test@1234',
            'city': 'Hindupur', **extra,
        }, format='json')

    def test_also_offers_activates_extra_segments(self):
        res = self._register('9111100101', kind='HOSPITAL', also_offers=['SCAN', 'BLOOD'])
        self.assertIn(res.status_code, (200, 201), res.content)
        h = Hospital.objects.get(mobile='9111100101')
        self.assertCountEqual(h.active_segments, ['CONSULT', 'SCAN', 'BLOOD'])
        self.assertEqual(h.kind, 'HOSPITAL')   # identity unchanged

    def test_the_picked_card_is_always_on(self):
        res = self._register('9111100102', kind='BLOOD_CENTER')
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(
            Hospital.objects.get(mobile='9111100102').active_segments, ['BLOOD'])

    def test_junk_in_also_offers_is_ignored_not_fatal(self):
        res = self._register('9111100103', kind='HOSPITAL',
                             also_offers=['SCAN', 'DENTAL', '', None])
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertCountEqual(
            Hospital.objects.get(mobile='9111100103').active_segments,
            ['CONSULT', 'SCAN'])
