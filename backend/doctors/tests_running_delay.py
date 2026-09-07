"""Doctor Running Late: the set-delay endpoint (permissions, bounds, recipient
filtering) and the nightly reset. The notification content itself (WhatsApp
template, idempotency window) is covered in notifications/tests_doctor_delay.py.
"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital

User = get_user_model()


class SetDelayPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000101', password='x')
        self.other_hospital = Hospital.objects.create(
            name='Rainbow', city='Hyd', mobile='9000000102', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000103', fee=200, slots=['09:00 AM'])
        self.staff = User.objects.create(
            username='9000000101', mobile='9000000101', role='hospital',
            last_name=str(self.hospital.id))
        self.other_staff = User.objects.create(
            username='9000000102', mobile='9000000102', role='hospital',
            last_name=str(self.other_hospital.id))
        self.admin = User.objects.create(
            username='admin', mobile='9000000100', role='admin')

    def url(self, doc=None):
        return f'/api/doctors/{(doc or self.doctor).id}/set-delay/'

    @mock.patch('doctors.views._dispatch_doctor_delay_notifications', lambda *a: None)
    def test_owning_hospital_staff_can_set_delay(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post(self.url(), {'delay_minutes': 15}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.running_delay_minutes, 15)
        self.assertIsNotNone(self.doctor.delay_updated_at)

    @mock.patch('doctors.views._dispatch_doctor_delay_notifications', lambda *a: None)
    def test_admin_can_set_delay(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(self.url(), {'delay_minutes': 30}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_other_hospitals_staff_cannot_set_delay(self):
        self.client.force_authenticate(self.other_staff)
        r = self.client.post(self.url(), {'delay_minutes': 15}, format='json')
        self.assertEqual(r.status_code, 403, r.content)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.running_delay_minutes, 0)

    def test_anonymous_is_rejected(self):
        r = self.client.post(self.url(), {'delay_minutes': 15}, format='json')
        self.assertIn(r.status_code, (401, 403))

    def test_patient_role_is_rejected(self):
        patient = User.objects.create(
            username='9000000199', mobile='9000000199', role='patient')
        self.client.force_authenticate(patient)
        r = self.client.post(self.url(), {'delay_minutes': 15}, format='json')
        self.assertEqual(r.status_code, 403, r.content)


class SetDelayValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000201', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000202', fee=200, slots=['09:00 AM'])
        self.staff = User.objects.create(
            username='9000000201', mobile='9000000201', role='hospital',
            last_name=str(self.hospital.id))
        self.client.force_authenticate(self.staff)

    def url(self):
        return f'/api/doctors/{self.doctor.id}/set-delay/'

    @mock.patch('doctors.views._dispatch_doctor_delay_notifications', lambda *a: None)
    def test_every_allowed_value_is_accepted(self):
        for minutes in (0, 10, 15, 20, 30, 45, 60):
            with self.subTest(minutes=minutes):
                r = self.client.post(self.url(), {'delay_minutes': minutes}, format='json')
                self.assertEqual(r.status_code, 200, r.content)

    def test_value_outside_the_whitelist_is_rejected(self):
        for minutes in (5, 25, 90, 120, -10):
            with self.subTest(minutes=minutes):
                r = self.client.post(self.url(), {'delay_minutes': minutes}, format='json')
                self.assertEqual(r.status_code, 400, r.content)

    def test_missing_delay_minutes_is_rejected(self):
        r = self.client.post(self.url(), {}, format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_non_numeric_delay_minutes_is_rejected(self):
        r = self.client.post(self.url(), {'delay_minutes': 'soon'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)

    @mock.patch('doctors.views._dispatch_doctor_delay_notifications', lambda *a: None)
    def test_clear_delay_resets_to_zero(self):
        self.client.post(self.url(), {'delay_minutes': 20}, format='json')
        r = self.client.post(self.url(), {'delay_minutes': 0}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.running_delay_minutes, 0)


class SetDelayRecipientFilteringTests(TestCase):
    """notified_count and the dispatch trigger must see only today's CONFIRMED
    bookings for THIS doctor — the whole reason the endpoint returns a count is
    so the dashboard can tell the receptionist how many people were reached."""

    def setUp(self):
        self.client = APIClient()
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000301', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000302', fee=200, slots=['09:00 AM', '09:30 AM'])
        self.other_doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Iyer', specialization='ENT',
            mobile='9000000303', fee=200, slots=['09:00 AM'])
        self.staff = User.objects.create(
            username='9000000301', mobile='9000000301', role='hospital',
            last_name=str(self.hospital.id))
        self.client.force_authenticate(self.staff)
        self.today = timezone.localdate()
        self.tomorrow = self.today + timedelta(days=1)
        self._n = 0

    def _patient(self):
        self._n += 1
        return User.objects.create(
            username=f'patient{self._n}', mobile=f'900000040{self._n}', role='patient')

    def _booking(self, doctor=None, date=None, status=Booking.CONFIRMED, slot='09:00 AM'):
        self._n += 1
        return Booking.objects.create(
            user=self._patient(), doctor=doctor or self.doctor,
            hospital=self.hospital, date=date or self.today, slot=slot,
            token=f'TW-TEST-{self._n}', status=status,
        )

    def url(self, doc=None):
        return f'/api/doctors/{(doc or self.doctor).id}/set-delay/'

    def test_counts_only_todays_confirmed_bookings_for_this_doctor(self):
        self._booking()                                              # counted
        self._booking()                                              # counted
        self._booking(status=Booking.CANCELLED)                      # wrong status
        self._booking(status=Booking.COMPLETED)                      # wrong status
        self._booking(date=self.tomorrow)                            # wrong date
        self._booking(doctor=self.other_doctor)                      # wrong doctor

        with mock.patch('doctors.views._dispatch_doctor_delay_notifications') as dispatch:
            r = self.client.post(self.url(), {'delay_minutes': 15}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['notified_count'], 2)
        dispatch.assert_called_once_with(self.doctor.id, 15)

    def test_clearing_to_zero_never_dispatches(self):
        self._booking()
        with mock.patch('doctors.views._dispatch_doctor_delay_notifications') as dispatch:
            r = self.client.post(self.url(), {'delay_minutes': 0}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['notified_count'], 0)
        dispatch.assert_not_called()

    def test_no_eligible_bookings_skips_the_dispatch(self):
        with mock.patch('doctors.views._dispatch_doctor_delay_notifications') as dispatch:
            r = self.client.post(self.url(), {'delay_minutes': 15}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['notified_count'], 0)
        dispatch.assert_not_called()


class RunDailyPayoutsResetsDelayTests(TestCase):
    """The nightly ledger cron doubles as the daily reset for the delay flag."""

    def setUp(self):
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000501', password='x')

    def _doctor(self, delay):
        self._n = getattr(self, '_n', 0) + 1
        return Doctor.objects.create(
            hospital=self.hospital, name=f'Dr {self._n}', specialization='GP',
            mobile=f'900000060{self._n}', fee=200,
            running_delay_minutes=delay, delay_updated_at=timezone.now(),
        )

    def test_delayed_doctors_are_reset_to_zero(self):
        delayed = self._doctor(20)
        untouched = self._doctor(0)

        call_command('run_daily_payouts')

        delayed.refresh_from_db()
        untouched.refresh_from_db()
        self.assertEqual(delayed.running_delay_minutes, 0)
        self.assertEqual(untouched.running_delay_minutes, 0)

    def test_a_reset_failure_does_not_break_the_ledger_run(self):
        self._doctor(20)
        with mock.patch(
            'payments.management.commands.run_daily_payouts.Doctor.objects.filter',
            side_effect=RuntimeError('boom'),
        ):
            call_command('run_daily_payouts')   # must not raise
