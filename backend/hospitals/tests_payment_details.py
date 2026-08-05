"""Tests for the hospital's own payout / settlement account endpoint."""

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from hospitals.models import Hospital

User = get_user_model()


class HospitalPaymentDetailsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.other = Hospital.objects.create(
            name='Rainbow', city='Hyd', mobile='9000000009', password='x')
        self.staff = User.objects.create(
            username='9000000002', mobile='9000000002', role='hospital',
            last_name=str(self.hospital.id))
        self.other_staff = User.objects.create(
            username='9000000009', mobile='9000000009', role='hospital',
            last_name=str(self.other.id))
        self.admin = User.objects.create(username='admin', mobile='9000000000', role='admin')

    def url(self, h=None):
        return f'/api/hospitals/{(h or self.hospital).id}/payment-details/'

    def test_owner_can_save_upi(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {
            'payment_method': 'UPI', 'upi_id': 'apollo@okhdfc'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.upi_vpa, 'apollo@okhdfc')
        self.assertEqual(self.hospital.payment_method, 'UPI')

    def test_owner_can_save_bank(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {
            'payment_method': 'BANK', 'account_holder_name': 'Apollo Clinic',
            'bank_name': 'HDFC', 'account_number': '000111222333',
            'ifsc_code': 'hdfc0001234'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.bank_account_number, '000111222333')
        self.assertEqual(self.hospital.ifsc, 'HDFC0001234')   # normalised upper

    def test_upi_requires_upi_id(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {'payment_method': 'UPI'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('upi_id', r.json()['errors'])

    def test_bank_requires_fields(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {'payment_method': 'BANK'}, format='json')
        self.assertEqual(r.status_code, 400)
        errs = r.json()['errors']
        self.assertIn('account_number', errs)
        self.assertIn('ifsc_code', errs)
        self.assertIn('account_holder_name', errs)

    def test_invalid_ifsc_rejected(self):
        self.client.force_authenticate(self.staff)
        r = self.client.put(self.url(), {
            'payment_method': 'BANK', 'account_holder_name': 'A',
            'account_number': '123', 'ifsc_code': 'bad'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ifsc_code', r.json()['errors'])

    def test_other_hospital_blocked(self):
        self.client.force_authenticate(self.other_staff)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.assertEqual(
            self.client.put(self.url(), {'payment_method': 'UPI', 'upi_id': 'x@y'},
                            format='json').status_code, 403)

    def test_admin_can_read(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url()).status_code, 200)

    def test_details_not_leaked_on_public_detail(self):
        self.hospital.bank_account_number = '000111222333'
        self.hospital.ifsc = 'HDFC0001234'
        self.hospital.upi_vpa = 'apollo@okhdfc'
        self.hospital.save()
        r = self.client.get(f'/api/hospitals/{self.hospital.id}/')   # public
        self.assertEqual(r.status_code, 200)
        body = r.content.decode()
        self.assertNotIn('000111222333', body)
        self.assertNotIn('HDFC0001234', body)
        self.assertNotIn('apollo@okhdfc', body)
