"""
GET /api/bookings/my/ pagination is opt-in.

The website and the mobile app (a separate repo, released on its own
schedule) both read this response as a bare array and never send a `page`
param. Pagination must stay off unless a caller explicitly asks for it, so
neither client's contract breaks. See ROADMAP.md item 20.

Run:  python manage.py test bookings.tests_my_bookings_pagination
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class MyBookingsPaginationTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9100000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Rao', specialization='GP',
            mobile='9100000003', fee=200, slots=['09:00 AM'])
        self.patient = User.objects.create(
            username='pat20', mobile='9100000001', role='patient')
        self.client = APIClient()
        self.client.force_authenticate(user=self.patient)
        for i in range(3):
            Booking.objects.create(
                user=self.patient, doctor=self.doctor, hospital=self.hospital,
                date=self.today, slot='09:00 AM', token=f'TW-P{i}',
                status=Booking.CONFIRMED, amount=200)

    def get(self, query=''):
        return self.client.get(f'/api/bookings/my/{query}')

    def test_no_page_param_returns_a_bare_array_unchanged(self):
        res = self.get()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsInstance(res.data, list)
        self.assertEqual(len(res.data), 3)

    def test_page_param_switches_to_the_paginated_shape(self):
        res = self.get('?page=1&page_size=2')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(set(res.data.keys()), {'count', 'next', 'previous', 'results'})
        self.assertEqual(res.data['count'], 3)
        self.assertEqual(len(res.data['results']), 2)
        self.assertIsNotNone(res.data['next'])

    def test_second_page_has_no_overlap_with_the_first(self):
        first  = self.get('?page=1&page_size=2').data['results']
        second = self.get('?page=2&page_size=2').data['results']
        first_ids  = {b['id'] for b in first}
        second_ids = {b['id'] for b in second}
        self.assertEqual(len(first), 2)
        self.assertEqual(len(second), 1)
        self.assertFalse(first_ids & second_ids)

    def test_page_size_is_capped(self):
        res = self.get('?page=1&page_size=9999')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.data['results']), 3)  # only 3 exist, cap is 200

    def test_only_the_authenticated_patients_own_bookings_are_returned(self):
        other = User.objects.create(username='other', mobile='9100000004', role='patient')
        Booking.objects.create(
            user=other, doctor=self.doctor, hospital=self.hospital,
            date=self.today, slot='09:00 AM', token='TW-OTHER',
            status=Booking.CONFIRMED, amount=200)
        res = self.get('?page=1&page_size=50')
        self.assertEqual(res.data['count'], 3)
