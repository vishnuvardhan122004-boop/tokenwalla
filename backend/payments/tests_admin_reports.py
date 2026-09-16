"""
AdminReportsView (`GET /api/payment/reports/`) — the counts, and the
bookings-by-location breakdown that tells the admin which city is actually
generating volume.

Run:  python manage.py test payments.tests_admin_reports
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class AdminReportsLocationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create(
            username='boss', mobile='9000006000', role='admin')
        self.patient = User.objects.create(
            username='pat-loc', mobile='9000006001', role='patient')

        self.hyd = Hospital.objects.create(
            name='Apollo Hyd', city='Hyderabad', mobile='9000006002', password='x')
        self.blr = Hospital.objects.create(
            name='Rainbow Blr', city='Bengaluru', mobile='9000006003', password='x')

        self.doc_hyd = Doctor.objects.create(
            hospital=self.hyd, name='Rao', specialization='GP',
            mobile='9000006004', fee=200, slots=['09:00 AM'])
        self.doc_blr = Doctor.objects.create(
            hospital=self.blr, name='Iyer', specialization='GP',
            mobile='9000006005', fee=200, slots=['09:00 AM'])

        self.client.force_authenticate(self.admin)

    def book(self, doctor, hospital, n=1):
        today = timezone.localdate()
        for i in range(n):
            Booking.objects.create(
                user=self.patient, doctor=doctor, hospital=hospital,
                date=today, slot='09:00 AM', token=f'TW-LOC-{hospital.id}-{i}',
                status=Booking.CONFIRMED,
            )

    def test_by_location_groups_and_ranks_by_volume(self):
        self.book(self.doc_hyd, self.hyd, n=3)
        self.book(self.doc_blr, self.blr, n=1)

        r = self.client.get('/api/payment/reports/')
        self.assertEqual(r.status_code, 200, r.content)
        by_location = r.data['by_location']

        self.assertEqual(r.data['total'], 4)
        # Ranked, busiest city first.
        self.assertEqual(by_location[0]['city'], 'Hyderabad')
        self.assertEqual(by_location[0]['count'], 3)
        self.assertEqual(by_location[1]['city'], 'Bengaluru')
        self.assertEqual(by_location[1]['count'], 1)

    def test_fractions_sum_to_one(self):
        self.book(self.doc_hyd, self.hyd, n=3)
        self.book(self.doc_blr, self.blr, n=1)

        r = self.client.get('/api/payment/reports/')
        total_fraction = sum(row['fraction'] for row in r.data['by_location'])
        self.assertAlmostEqual(total_fraction, 1.0, places=3)

    def test_no_bookings_returns_empty_breakdown_without_dividing_by_zero(self):
        r = self.client.get('/api/payment/reports/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['total'], 0)
        self.assertEqual(r.data['by_location'], [])

    def test_hospital_with_blank_city_is_labelled_unknown(self):
        blank_city_hospital = Hospital.objects.create(
            name='No City Clinic', city='', mobile='9000006006', password='x')
        doc = Doctor.objects.create(
            hospital=blank_city_hospital, name='Blank', specialization='GP',
            mobile='9000006007', fee=200, slots=['09:00 AM'])
        self.book(doc, blank_city_hospital, n=1)

        r = self.client.get('/api/payment/reports/')
        cities = [row['city'] for row in r.data['by_location']]
        self.assertIn('Unknown', cities)
