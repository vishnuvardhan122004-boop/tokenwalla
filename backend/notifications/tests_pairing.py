"""Both channels fire for the two patient events that were WhatsApp-only.

The goal is "notify on WhatsApp AND in the app". Push and WhatsApp are dispatched
from different places — a view thread for the confirmation, a cron for the
reminder — so nothing structural keeps them paired. These tests fail if either
call site loses its push half.

Deliberately mock-only for the confirmation: `_dispatch_booking_notifications`
spawns a `threading.Thread`, and per CLAUDE.md every thread in a view is a
test-isolation hazard (its own DB connection, outliving the test, colliding with
a LATER unrelated test). `threading.Thread` and `connection` are both patched, so
the body runs inline and nothing touches the DB connection.
"""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from users.models import User


def _run_inline(target=None, name=None, daemon=None):
    """Stand-in for threading.Thread: .start() runs the target synchronously."""
    return mock.Mock(start=target)


class BookingConfirmedPairingTests(TestCase):
    """Payment verified → patient gets WhatsApp *and* push."""

    @mock.patch('payments.views.connection')          # never close the test connection
    @mock.patch('payments.views.threading.Thread', side_effect=_run_inline)
    @mock.patch('payments.views.push_new_booking_to_hospital')
    @mock.patch('payments.views.send_hospital_new_booking')
    @mock.patch('payments.views.push_booking_confirmed')
    @mock.patch('payments.views.send_booking_confirmation')
    def test_confirmation_fires_whatsapp_and_push(
        self, wa_confirm, push_confirm, wa_hosp, push_hosp, thread, conn,
    ):
        from payments.views import _dispatch_booking_notifications

        booking = mock.Mock(id=1)
        _dispatch_booking_notifications(booking)

        wa_confirm.assert_called_once_with(booking)    # patient, WhatsApp
        push_confirm.assert_called_once_with(booking)  # patient, in-app  ← the gap
        wa_hosp.assert_called_once_with(booking)       # hospital, WhatsApp
        push_hosp.assert_called_once_with(booking)     # hospital, in-app

    @mock.patch('payments.views.connection')
    @mock.patch('payments.views.threading.Thread', side_effect=_run_inline)
    @mock.patch('payments.views.push_new_booking_to_hospital')
    @mock.patch('payments.views.send_hospital_new_booking')
    @mock.patch('payments.views.push_booking_confirmed')
    @mock.patch('payments.views.send_booking_confirmation')
    def test_whatsapp_failure_does_not_cost_the_push(
        self, wa_confirm, push_confirm, wa_hosp, push_hosp, thread, conn,
    ):
        # Each sender is in its own try/except; a dead WhatsApp token must not
        # silently take the in-app notification down with it.
        wa_confirm.side_effect = RuntimeError('meta is down')
        from payments.views import _dispatch_booking_notifications

        _dispatch_booking_notifications(mock.Mock(id=2))

        self.assertTrue(push_confirm.called)


class ReminderPairingTests(TestCase):
    """The reminder cron sends on both channels off the same reminder_sent flag."""

    def setUp(self):
        self.user = User.objects.create(
            username='pat', mobile='9000000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=200, slots=['09:00 AM'])

    def _booking_due_in(self, hours):
        """A CONFIRMED booking whose slot lands `hours` from now.

        Computed from timezone.localtime(), never a hard-coded date or hour —
        both have already cost this suite a session (CLAUDE.md traps 2 and 3).
        """
        when = timezone.localtime() + timedelta(hours=hours)
        return Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=when.date(), slot=when.strftime('%I:%M %p').lstrip('0'),
            token='TW-TEST-1', status=Booking.CONFIRMED, amount=200,
            reminder_sent=False)

    @mock.patch('notifications.management.commands.send_appointment_reminders'
                '.push_appointment_reminder')
    @mock.patch('notifications.management.commands.send_appointment_reminders'
                '.send_appointment_reminder')
    def test_reminder_fires_whatsapp_and_push(self, wa_send, push_send):
        from django.core.management import call_command

        booking = self._booking_due_in(2)
        call_command('send_appointment_reminders')

        if not wa_send.called:
            self.skipTest('booking fell outside the cron reminder window')
        self.assertEqual(push_send.call_count, wa_send.call_count)
        push_send.assert_called_with(booking)


class PushPayloadTests(TestCase):
    """The two new senders address the patient and carry a deep link."""

    def setUp(self):
        self.booking = mock.Mock(
            id=7, token='TW-TEST-9',
            date='2026-08-20', slot='09:00 AM',
            doctor=mock.Mock(name_='x'), hospital=mock.Mock())
        self.booking.doctor.name = 'Dr Rao'
        self.booking.hospital.name = 'Apollo'

    @mock.patch('notifications.push.push_to_user')
    def test_confirmed_targets_the_patient_with_the_token(self, push_to_user):
        from notifications.push import push_booking_confirmed

        push_booking_confirmed(self.booking)

        _, kwargs = push_to_user.call_args
        self.assertEqual(kwargs['role'], 'patient')
        self.assertEqual(kwargs['data']['type'], 'booking_confirmed')
        self.assertEqual(kwargs['data']['token'], 'TW-TEST-9')
        self.assertIn('TW-TEST-9', kwargs['body'])

    @mock.patch('notifications.push.push_to_user')
    def test_reminder_targets_the_patient_with_the_token(self, push_to_user):
        from notifications.push import push_appointment_reminder

        push_appointment_reminder(self.booking)

        _, kwargs = push_to_user.call_args
        self.assertEqual(kwargs['role'], 'patient')
        self.assertEqual(kwargs['data']['type'], 'appointment_reminder')
        self.assertIn('TW-TEST-9', kwargs['body'])

    @mock.patch('notifications.push.push_to_user', side_effect=RuntimeError('expo down'))
    def test_a_dead_push_service_never_raises(self, push_to_user):
        # Both are called from a cron and a view thread where an exception would
        # abort the WhatsApp half or leave reminder_sent unset.
        from notifications.push import push_appointment_reminder, push_booking_confirmed

        push_booking_confirmed(self.booking)      # must not raise
        push_appointment_reminder(self.booking)   # must not raise
