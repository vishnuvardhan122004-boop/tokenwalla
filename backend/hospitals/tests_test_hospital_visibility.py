"""
Internal `[TEST]` hospitals must never reach a patient-facing list.

Found live in production on 2026-08-11: `/api/doctors/` was returning the demo
hospital's doctor to anonymous callers, alongside the real ones. That doctor is
the only row in the system with payment_collection_mode='FULL', so a patient
could have been charged the full consultation fee for an appointment that does
not exist — and TokenWalla would then have owed a payout against it.

Staff and admins keep seeing them; the demo hospital is useful from the
dashboard, which is why it exists.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from doctors.models import Doctor
from hospitals.models import Hospital, TEST_HOSPITAL_PREFIX

User = get_user_model()


class TestHospitalVisibilityMixin:
    def make_world(self):
        self.real = Hospital.objects.create(
            name='Sri Sarwodhaya orthopaedic hospital', city='Hindupur',
            mobile='9000000101', status='active', password='x')
        self.demo = Hospital.objects.create(
            name=f'{TEST_HOSPITAL_PREFIX} Demo Hospital', city='Hindupur',
            mobile='9000000102', status='active', password='x')

        self.real_doc = Doctor.objects.create(
            name='Dr. Hari krishna', specialization='Orthopedic Surgeon',
            hospital=self.real, fee=200, available=True)
        # Mirrors the live row: the demo doctor is the one on FULL collection.
        self.demo_doc = Doctor.objects.create(
            name='Heyi', specialization='Neurologist',
            hospital=self.demo, fee=363, available=True,
            payment_collection_mode='FULL')

    def client_for(self, role):
        client = APIClient()
        if role is None:
            return client
        user = User.objects.create(
            username=f'{role}-user', mobile=f'900000020{len(role)}', role=role)
        token = str(RefreshToken.for_user(user).access_token)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client


class PublicDoctorListTests(TestHospitalVisibilityMixin, TestCase):
    URL = '/api/doctors/'

    def setUp(self):
        self.make_world()

    def _names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) else body
        return {r['name'] for r in rows}

    def test_anonymous_never_sees_the_demo_doctor(self):
        res = self.client_for(None).get(self.URL)
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('Dr. Hari krishna', names)
        self.assertNotIn('Heyi', names)

    def test_a_patient_never_sees_the_demo_doctor(self):
        res = self.client_for('patient').get(self.URL)
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('Heyi', self._names(res))

    def test_filtering_by_the_demo_hospital_id_still_returns_nothing(self):
        # The id is guessable, so hiding it from the unfiltered list is not
        # enough — the filtered query has to be empty too.
        res = self.client_for(None).get(self.URL, {'hospital': self.demo.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._names(res), set())

    def test_hospital_staff_still_see_it(self):
        res = self.client_for('hospital').get(self.URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn('Heyi', self._names(res))

    def test_admin_still_sees_it(self):
        res = self.client_for('admin').get(self.URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn('Heyi', self._names(res))

    def test_the_marker_is_matched_case_insensitively(self):
        Hospital.objects.filter(pk=self.demo.pk).update(name='[test] lowercase demo')
        res = self.client_for(None).get(self.URL)
        self.assertNotIn('Heyi', self._names(res))

    def test_a_real_hospital_merely_mentioning_test_is_untouched(self):
        # The marker is a prefix, not a substring — a real name containing the
        # word must not be swept up.
        keep = Hospital.objects.create(
            name='Hindupur TEST Tube Baby Centre', city='Hindupur',
            mobile='9000000103', status='active', password='x')
        Doctor.objects.create(name='Dr. Real', specialization='IVF',
                              hospital=keep, fee=500, available=True)
        res = self.client_for(None).get(self.URL)
        self.assertIn('Dr. Real', self._names(res))


class PublicHospitalListTests(TestHospitalVisibilityMixin, TestCase):
    URL = '/api/hospitals/'

    def setUp(self):
        self.make_world()

    def _names(self, res):
        body = res.json()
        rows = body['results'] if isinstance(body, dict) else body
        return {r['name'] for r in rows}

    def test_anonymous_never_sees_the_demo_hospital(self):
        res = self.client_for(None).get(self.URL)
        self.assertEqual(res.status_code, 200)
        names = self._names(res)
        self.assertIn('Sri Sarwodhaya orthopaedic hospital', names)
        self.assertNotIn(f'{TEST_HOSPITAL_PREFIX} Demo Hospital', names)

    def test_admin_still_sees_the_demo_hospital(self):
        res = self.client_for('admin').get(self.URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn(f'{TEST_HOSPITAL_PREFIX} Demo Hospital', self._names(res))
