"""
A facility that is not APPROVED must not have its providers listed publicly.

ROADMAP 21, found 2026-09-06 by /ship. `HospitalListView` has filtered
`status='active'` since it was written; `DoctorViewSet.get_queryset` and
`ScanViewSet.get_queryset` filtered `[TEST]` names and segment, and nothing
else. So a hospital sitting at 'pending' (registered, never approved) or
'rejected' kept EVERY one of its doctors in the public browse list, and a
pending centre kept every one of its scans. What made it hard to notice is that
the facility itself is correctly hidden from `/api/hospitals/`: the provider was
listed, its facility was not.

The negative assertions are the contract. The positive ones matter just as
much in the other direction: this filter is gated on the same staff/admin
predicate as the `[TEST]` rule, because `src/ADMIN/Hospitals.js` drives its
doctor list, edit and delete through this very queryset while listing pending
and rejected hospitals from `/hospitals/admin/all/`. Filtering flat would 404
an admin out of cleaning up a rejected facility's doctors.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from doctors.models import Doctor
from hospitals.models import Hospital
from scans.models import Scan

User = get_user_model()


class FacilityStatusWorldMixin:
    """One facility of each status, each with a bookable provider attached."""

    def make_world(self):
        self.active = Hospital.objects.create(
            name='Sri Sarwodhaya orthopaedic hospital', city='Hindupur',
            mobile='9000000801', status='active', password='x')
        self.pending = Hospital.objects.create(
            name='Awaiting Approval Clinic', city='Hindupur',
            mobile='9000000802', status='pending', password='x')
        self.rejected = Hospital.objects.create(
            name='Turned Down Clinic', city='Hindupur',
            mobile='9000000803', status='rejected', password='x')

        self.active_doc = Doctor.objects.create(
            name='Dr. Hari krishna', specialization='Orthopedic Surgeon',
            hospital=self.active, fee=200, available=True)
        self.pending_doc = Doctor.objects.create(
            name='Dr. Not Yet Approved', specialization='Neurologist',
            hospital=self.pending, fee=300, available=True)
        self.rejected_doc = Doctor.objects.create(
            name='Dr. Rejected', specialization='Cardiologist',
            hospital=self.rejected, fee=400, available=True)

        self.active_centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur',
            mobile='9000000804', status='active', password='x',
            kind=Hospital.SCAN_CENTER)
        self.pending_centre = Hospital.objects.create(
            name='Unapproved Diagnostics', city='Hindupur',
            mobile='9000000805', status='pending', password='x',
            kind=Hospital.SCAN_CENTER)

        self.active_scan = Scan.objects.create(
            center=self.active_centre, name='MRI Brain', modality='MRI',
            price=4500, slots=['09:00 AM'], days=['Mon'])
        self.pending_scan = Scan.objects.create(
            center=self.pending_centre, name='MRI Spine', modality='MRI',
            price=5500, slots=['09:00 AM'], days=['Mon'])

    def client_for(self, role):
        client = APIClient()
        if role is None:
            return client
        user = User.objects.create(
            username=f'{role}-status-user', mobile=f'900000081{len(role)}',
            role=role)
        token = str(RefreshToken.for_user(user).access_token)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client

    def names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) and 'results' in body else body
        return {r['name'] for r in rows}


class PublicDoctorFacilityStatusTests(FacilityStatusWorldMixin, TestCase):
    URL = '/api/doctors/'

    def setUp(self):
        self.make_world()

    def test_anonymous_never_sees_a_pending_facilitys_doctor(self):
        res = self.client_for(None).get(self.URL)
        self.assertEqual(res.status_code, 200)
        names = self.names(res)
        self.assertIn('Dr. Hari krishna', names)
        self.assertNotIn('Dr. Not Yet Approved', names)

    def test_anonymous_never_sees_a_rejected_facilitys_doctor(self):
        self.assertNotIn('Dr. Rejected', self.names(self.client_for(None).get(self.URL)))

    def test_a_patient_never_sees_them_either(self):
        names = self.names(self.client_for('patient').get(self.URL))
        self.assertNotIn('Dr. Not Yet Approved', names)
        self.assertNotIn('Dr. Rejected', names)

    def test_filtering_by_the_pending_hospital_id_still_returns_nothing(self):
        # The id is guessable, so hiding the row from the unfiltered list is
        # not enough — the filtered query has to be empty too.
        res = self.client_for(None).get(self.URL, {'hospital': self.pending.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.names(res), set())

    def test_fetching_the_doctor_by_id_404s(self):
        # get_object() runs through get_queryset(), so the detail route closes
        # with the list. This is what actually stops the booking: the clients
        # load a doctor by id before they can pay for one.
        res = self.client_for(None).get(f'{self.URL}{self.pending_doc.id}/')
        self.assertEqual(res.status_code, 404)

    def test_the_active_facilitys_doctor_is_untouched(self):
        res = self.client_for(None).get(f'{self.URL}{self.active_doc.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'Dr. Hari krishna')

    def test_an_admin_still_sees_them(self):
        # src/ADMIN/Hospitals.js lists doctors from this endpoint beside
        # /hospitals/admin/all/, which deliberately includes pending and
        # rejected facilities. Filtering flat would empty that screen.
        names = self.names(self.client_for('admin').get(self.URL))
        self.assertIn('Dr. Not Yet Approved', names)
        self.assertIn('Dr. Rejected', names)

    def test_an_admin_can_still_open_one_by_id(self):
        # The edit modal (openEdit) and the delete flow both fetch by id.
        res = self.client_for('admin').get(f'{self.URL}{self.rejected_doc.id}/')
        self.assertEqual(res.status_code, 200)


class PublicScanFacilityStatusTests(FacilityStatusWorldMixin, TestCase):
    URL = '/api/scans/'

    def setUp(self):
        self.make_world()

    def test_anonymous_never_sees_a_pending_centres_scan(self):
        res = self.client_for(None).get(self.URL)
        self.assertEqual(res.status_code, 200)
        names = self.names(res)
        self.assertIn('MRI Brain', names)
        self.assertNotIn('MRI Spine', names)

    def test_filtering_by_the_pending_centre_id_still_returns_nothing(self):
        res = self.client_for(None).get(self.URL, {'center': self.pending_centre.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.names(res), set())

    def test_fetching_the_scan_by_id_404s(self):
        res = self.client_for(None).get(f'{self.URL}{self.pending_scan.id}/')
        self.assertEqual(res.status_code, 404)

    def test_the_active_centres_scan_is_untouched(self):
        res = self.client_for(None).get(f'{self.URL}{self.active_scan.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['name'], 'MRI Brain')

    def test_an_admin_still_sees_them(self):
        self.assertIn('MRI Spine', self.names(self.client_for('admin').get(self.URL)))
