"""
Walk-in clinics: doctors with no bookable slots, landline-only contacts, and
announcements that stop showing by themselves.

The driving case is a one-doctor hospital that cannot commit to fixed slot
times and has a landline rather than a mobile. TokenWalla still has to list
them so patients can see the hours and the holiday notice and simply call.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class WalkInDoctorTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Sai Clinic', city='Rajahmundry', mobile='9000000101', password='x')
        self.staff = User.objects.create(
            username='9000000101', mobile='9000000101', role='hospital',
            last_name=str(self.hospital.id))
        self.client.force_authenticate(self.staff)

    def payload(self, **over):
        data = {
            'hospital': self.hospital.id,
            'name': 'Dr Sai',
            'specialization': 'General Physician',
            'mobile': '9000000102',
            'fee': 200,
            'slots': '[]',
            'days': '["Mon"]',
        }
        data.update(over)
        return data

    def test_doctor_saves_with_zero_slots(self):
        """A walk-in doctor has no slot times to publish — that is a valid
        listing, not a misconfiguration."""
        r = self.client.post('/api/doctors/', self.payload(), format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Doctor.objects.get(pk=r.json()['id']).slots, [])

    def test_landline_only_doctor_saves(self):
        r = self.client.post('/api/doctors/', self.payload(
            mobile='', landline='08812-234567'), format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        doc = Doctor.objects.get(pk=r.json()['id'])
        self.assertEqual(doc.mobile, '')
        self.assertEqual(doc.landline, '08812-234567')

    def test_doctor_needs_at_least_one_number(self):
        r = self.client.post('/api/doctors/', self.payload(mobile=''), format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('mobile', r.json()['errors'])

    def test_a_mobile_in_the_landline_field_is_rejected(self):
        """Keeping the two apart is the whole point — `mobile` is the only
        number WhatsApp is ever sent to."""
        r = self.client.post('/api/doctors/', self.payload(
            mobile='', landline='9000000102'), format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('landline', r.json()['errors'])

    def test_landline_formats(self):
        from tokenwalla.utils import is_valid_landline, is_valid_mobile

        for good in ('08812234567', '08812-234567', '040 27890123', '01123456789'):
            self.assertTrue(is_valid_landline(good), good)
        for bad in ('9000000102', '08812', '00812234567', '8812234567', ''):
            self.assertFalse(is_valid_landline(bad), bad)
        self.assertTrue(is_valid_mobile('9000000102'))
        self.assertFalse(is_valid_mobile('08812234567'))

    def test_existing_doctor_keeps_saving_without_resending_a_number(self):
        """A PATCH that touches only the fee must not trip the contact rule."""
        doc = Doctor.objects.create(
            hospital=self.hospital, name='Dr Old', specialization='GP',
            mobile='9000000103', fee=100)
        r = self.client.patch(f'/api/doctors/{doc.id}/', {'fee': 150}, format='json')
        self.assertEqual(r.status_code, 200, r.content)


class HospitalContactAndAnnouncementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Sai Clinic', city='Rajahmundry', mobile='9000000201', password='x')
        self.staff = User.objects.create(
            username='9000000201', mobile='9000000201', role='hospital',
            last_name=str(self.hospital.id))
        self.url = f'/api/hospitals/{self.hospital.id}/'

    def test_owner_saves_a_landline(self):
        self.client.force_authenticate(self.staff)
        r = self.client.patch(self.url, {'landline': '08812-234567'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.landline, '08812-234567')
        # And it reaches patients on the public read.
        self.assertEqual(self.client.get(self.url).json()['landline'], '08812-234567')

    def test_junk_landline_is_rejected(self):
        self.client.force_authenticate(self.staff)
        r = self.client.patch(self.url, {'landline': '12345'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.landline, '')

    def test_a_landline_never_becomes_the_login_number(self):
        self.client.force_authenticate(self.staff)
        self.client.patch(self.url, {'landline': '08812-234567'}, format='json')
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.mobile, '9000000201')

    def test_announcement_expires_on_its_own(self):
        today = timezone.localdate()
        self.hospital.announcement = 'Closed for Sankranti'
        self.hospital.announcement_until = today - timedelta(days=1)
        self.hospital.save()
        self.assertFalse(self.client.get(self.url).json()['announcement_active'])

        self.hospital.announcement_until = today
        self.hospital.save()
        self.assertTrue(self.client.get(self.url).json()['announcement_active'])

    def test_announcement_without_a_date_shows_indefinitely(self):
        self.hospital.announcement = 'Free BP check this week'
        self.hospital.save()
        body = self.client.get(self.url).json()
        self.assertTrue(body['announcement_active'])
        self.assertIsNone(body['announcement_until'])

    def test_blank_announcement_is_never_active(self):
        self.assertFalse(self.client.get(self.url).json()['announcement_active'])

    def test_owner_sets_and_clears_the_expiry_date(self):
        self.client.force_authenticate(self.staff)
        until = (timezone.localdate() + timedelta(days=3)).isoformat()
        r = self.client.patch(
            self.url, {'announcement': 'Closed Friday', 'announcement_until': until},
            format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['announcement_until'], until)

        r2 = self.client.patch(self.url, {'announcement_until': ''}, format='json')
        self.assertEqual(r2.status_code, 200, r2.content)
        self.hospital.refresh_from_db()
        self.assertIsNone(self.hospital.announcement_until)

    def test_invalid_expiry_date_is_rejected(self):
        self.client.force_authenticate(self.staff)
        r = self.client.patch(self.url, {'announcement_until': 'friday'}, format='json')
        self.assertEqual(r.status_code, 400)
