"""
/api/scans/ — public read, centre-staff write, own-centre only.

Mirrors the doctor endpoint's rules deliberately. The tests worth keeping an eye
on are the ones that are NOT just CRUD:

  * a scan whose centre is not (or is no longer) a scanning centre is unlistable,
  * one centre cannot create or edit another's scans,
  * slot availability counts per SCAN, not per centre — an MRI being full must
    not close the blood-draw slot running at the same time on another machine,
  * the price preview comes from payments/fees.py, so it cannot drift from what
    checkout will actually charge.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bookings.models import Booking
from hospitals.models import TEST_HOSPITAL_PREFIX, Hospital
from scans.models import Scan

User = get_user_model()
URL = '/api/scans/'


class ScanApiMixin:
    def make_world(self):
        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hindupur', mobile='9000000501',
            status='active', password='x', kind=Hospital.SCAN_CENTER)
        self.other_centre = Hospital.objects.create(
            name='Lucid Diagnostics', city='Hindupur', mobile='9000000502',
            status='active', password='x', kind=Hospital.SCAN_CENTER)
        self.hospital = Hospital.objects.create(
            name='Sri Sarwodhaya', city='Hindupur', mobile='9000000503',
            status='active', password='x')
        self.demo_centre = Hospital.objects.create(
            name=f'{TEST_HOSPITAL_PREFIX} Demo Diagnostics', city='Hindupur',
            mobile='9000000504', status='active', password='x',
            kind=Hospital.SCAN_CENTER)

        self.mri = Scan.objects.create(
            center=self.centre, name='MRI Brain', modality='MRI', price=4500,
            max_per_slot=1, slots=['09:00 AM', '10:00 AM'], days=['Mon'])
        self.cbc = Scan.objects.create(
            center=self.centre, name='Complete Blood Count', modality='Blood',
            price=300, max_per_slot=8, slots=['09:00 AM'], days=['Mon'])
        self.other_scan = Scan.objects.create(
            center=self.other_centre, name='CT Chest', modality='CT', price=3000)
        self.demo_scan = Scan.objects.create(
            center=self.demo_centre, name='Demo Scan', modality='MRI', price=1)

    def centre_client(self, centre):
        """A logged-in centre account. The managed hospital id lives in
        User.last_name, the same convention hospital login uses."""
        user = User.objects.create(
            username=f'centre-{centre.id}', mobile=f'90000006{centre.id:02d}',
            role='hospital', last_name=str(centre.id))
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return c

    def names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) and 'results' in body else body
        return [r['name'] for r in rows]


class PublicReadTests(ScanApiMixin, TestCase):
    def setUp(self):
        self.make_world()
        self.client = APIClient()

    def test_anonymous_can_list_scans(self):
        names = self.names(self.client.get(URL))
        self.assertIn('MRI Brain', names)
        self.assertIn('CT Chest', names)

    def test_filter_by_centre(self):
        names = self.names(self.client.get(URL, {'center': self.centre.id}))
        self.assertCountEqual(names, ['MRI Brain', 'Complete Blood Count'])

    def test_filter_by_modality(self):
        names = self.names(self.client.get(URL, {'modality': 'mri'}))   # case-insensitive
        self.assertEqual(names, ['MRI Brain'])

    def test_demo_centre_scans_are_hidden_from_patients(self):
        self.assertNotIn('Demo Scan', self.names(self.client.get(URL)))

    def test_a_scan_at_a_plain_hospital_is_not_listed(self):
        """The mis-registration case: the whole patient flow assumes the owner
        is a centre, so a scan hanging off a hospital is unbookable and must not
        be advertised."""
        Scan.objects.create(center=self.hospital, name='Orphan X-Ray', price=100)
        self.assertNotIn('Orphan X-Ray', self.names(self.client.get(URL)))

    def test_a_centre_flipped_back_to_hospital_delists_its_scans(self):
        self.assertIn('MRI Brain', self.names(self.client.get(URL)))
        self.centre.kind = Hospital.HOSPITAL
        self.centre.save(update_fields=['kind'])
        self.assertNotIn('MRI Brain', self.names(self.client.get(URL)))

    def test_price_preview_comes_from_the_fee_engine(self):
        """The preview must be the same arithmetic checkout runs, or the patient
        is quoted one number and charged another."""
        from payments.fees import compute_fee_breakdown
        body = self.client.get(f'{URL}{self.mri.id}/').json()
        expected = compute_fee_breakdown(4500, self.mri.payment_collection_mode)
        self.assertEqual(body['fee_breakdown']['final_amount'], str(expected['final_amount']))
        # SERVICE_ONLY is the default, so the ₹4500 is settled at the centre and
        # only the service fee is taken online.
        self.assertEqual(body['fee_breakdown']['collection_mode'], 'SERVICE_ONLY')
        self.assertEqual(body['fee_breakdown']['doctor_fee'], '0.00')


class WritePermissionTests(ScanApiMixin, TestCase):
    def setUp(self):
        self.make_world()

    def test_anonymous_cannot_create(self):
        res = APIClient().post(URL, {'center': self.centre.id, 'name': 'X-Ray', 'price': 200})
        self.assertIn(res.status_code, (401, 403))

    def test_anonymous_cannot_delete(self):
        res = APIClient().delete(f'{URL}{self.mri.id}/')
        self.assertIn(res.status_code, (401, 403))
        self.assertTrue(Scan.objects.filter(pk=self.mri.pk).exists())

    def test_a_centre_can_create_its_own_scan(self):
        res = self.centre_client(self.centre).post(
            URL, {'center': self.centre.id, 'name': 'X-Ray Chest',
                  'modality': 'X-Ray', 'price': 400}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(Scan.objects.filter(center=self.centre, name='X-Ray Chest').exists())

    def test_a_centre_cannot_create_for_another_centre(self):
        res = self.centre_client(self.centre).post(
            URL, {'center': self.other_centre.id, 'name': 'Sneaky', 'price': 1},
            format='json')
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Scan.objects.filter(name='Sneaky').exists())

    def test_a_centre_cannot_edit_another_centres_scan(self):
        res = self.centre_client(self.centre).patch(
            f'{URL}{self.other_scan.id}/', {'price': 1}, format='json')
        self.assertEqual(res.status_code, 403)
        self.other_scan.refresh_from_db()
        self.assertEqual(self.other_scan.price, 3000)

    def test_a_scan_cannot_be_attached_to_a_plain_hospital(self):
        res = self.centre_client(self.hospital).post(
            URL, {'center': self.hospital.id, 'name': 'MRI', 'price': 100},
            format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('center', res.json().get('errors', {}))


class SlotAvailabilityTests(ScanApiMixin, TestCase):
    def setUp(self):
        self.make_world()
        self.client = APIClient()
        self.user = User.objects.create(username='p1', mobile='9000000590')
        self.date = timezone.localdate() + timezone.timedelta(days=7)

    def _book(self, scan, slot, token):
        return Booking.objects.create(
            user=self.user, scan=scan, hospital=self.centre,
            date=self.date, slot=slot, token=token, status=Booking.CONFIRMED)

    def test_date_is_required(self):
        self.assertEqual(self.client.get(f'{URL}{self.mri.id}/slot-availability/').status_code, 400)

    def test_counts_are_per_scan_not_per_centre(self):
        """The MRI has one machine and fills at one booking. The blood draw runs
        at the same time on different equipment and must stay open."""
        self._book(self.mri, '09:00 AM', 'TW-A-1')

        mri = self.client.get(f'{URL}{self.mri.id}/slot-availability/',
                              {'date': str(self.date)}).json()
        cbc = self.client.get(f'{URL}{self.cbc.id}/slot-availability/',
                              {'date': str(self.date)}).json()

        self.assertTrue(mri['09:00 AM']['full'])
        self.assertEqual(mri['09:00 AM']['booked'], 1)
        self.assertFalse(cbc['09:00 AM']['full'])
        self.assertEqual(cbc['09:00 AM']['booked'], 0)

    def test_a_doctor_booking_never_counts_against_a_scan(self):
        from doctors.models import Doctor
        doc = Doctor.objects.create(
            name='Dr. X', specialization='Radiology', hospital=self.hospital,
            fee=200, max_per_slot=5, slots=['09:00 AM'])
        Booking.objects.create(
            user=self.user, doctor=doc, hospital=self.hospital,
            date=self.date, slot='09:00 AM', token='TW-D-1', status=Booking.CONFIRMED)

        mri = self.client.get(f'{URL}{self.mri.id}/slot-availability/',
                              {'date': str(self.date)}).json()
        self.assertEqual(mri['09:00 AM']['booked'], 0)


class RecordViewTests(ScanApiMixin, TestCase):
    def setUp(self):
        self.make_world()
        self.client = APIClient()

    def test_view_count_increments_and_is_not_client_settable(self):
        self.assertEqual(self.client.post(f'{URL}{self.mri.id}/view/').status_code, 204)
        self.mri.refresh_from_db()
        self.assertEqual(self.mri.view_count, 1)

        # Read-only on the serializer: a write must not be able to rank itself up.
        self.centre_client(self.centre).patch(
            f'{URL}{self.mri.id}/', {'view_count': 9999}, format='json')
        self.mri.refresh_from_db()
        self.assertEqual(self.mri.view_count, 1)
