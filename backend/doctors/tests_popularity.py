"""Popularity ranking: the view counter and the ordering it drives."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class RecordViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000301', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000302', fee=200)

    def url(self, doc=None):
        return f'/api/doctors/{(doc or self.doctor).id}/view/'

    def test_anonymous_patient_can_record_a_view(self):
        """Most browsing happens before login — if this needed auth we would
        rank only the doctors that logged-in patients looked at."""
        r = self.client.post(self.url())
        self.assertEqual(r.status_code, 204, r.content)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.view_count, 1)

    def test_views_accumulate(self):
        for _ in range(5):
            self.client.post(self.url())
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.view_count, 5)

    def test_increment_is_a_single_atomic_update(self):
        """F() means the database does the arithmetic. A read-modify-write in
        Python would lose counts when two patients open the same page at once —
        both read N, both write N+1."""
        self.doctor.view_count = 41
        self.doctor.save(update_fields=['view_count'])
        with self.assertNumQueries(1):
            self.client.post(self.url())
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.view_count, 42)

    def test_unknown_doctor_is_404_not_a_crash(self):
        self.assertEqual(self.client.post('/api/doctors/999999/view/').status_code, 404)

    def test_get_is_not_allowed(self):
        """POST only. A GET that mutates would be counted by every crawler and
        every browser prefetch."""
        self.assertEqual(self.client.get(self.url()).status_code, 405)

    def test_reading_the_doctor_does_not_count_a_view(self):
        """retrieve() is polled by the hospital dashboard and the admin screens.
        Counting there would rank whichever doctor STAFF open most."""
        self.client.get(f'/api/doctors/{self.doctor.id}/')
        self.client.get('/api/doctors/')
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.view_count, 0)

    def test_view_count_is_read_only_over_the_api(self):
        """A client must not be able to rank itself to the top."""
        staff = User.objects.create(
            username='9000000301', mobile='9000000301', role='hospital',
            last_name=str(self.hospital.id))
        self.client.force_authenticate(staff)
        r = self.client.patch(f'/api/doctors/{self.doctor.id}/',
                              {'view_count': 9999}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.view_count, 0)


class PopularOrderingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000401', password='x')
        self.quiet = Doctor.objects.create(
            hospital=self.hospital, name='Dr Quiet', specialization='GP',
            mobile='9000000402', fee=100)
        self.popular = Doctor.objects.create(
            hospital=self.hospital, name='Dr Popular', specialization='GP',
            mobile='9000000403', fee=100, view_count=25)

    def names(self):
        body = self.client.get('/api/doctors/').json()
        rows = body if isinstance(body, list) else body.get('results', [])
        return [d['name'] for d in rows]

    def test_popular_doctor_comes_first(self):
        self.assertEqual(self.names()[0], 'Dr Popular')

    def test_order_is_total_so_pagination_is_stable(self):
        """Ties break on id. Ordering by view_count alone lets equal-count rows
        shuffle between pages while a patient is paging through them."""
        Doctor.objects.update(view_count=7)
        first = self.names()
        self.assertEqual(first, self.names())
        self.assertEqual(first, ['Dr Quiet', 'Dr Popular'])   # by id

    def test_view_count_is_exposed_so_clients_can_rank(self):
        body = self.client.get('/api/doctors/').json()
        rows = body if isinstance(body, list) else body.get('results', [])
        self.assertIn('view_count', rows[0])
