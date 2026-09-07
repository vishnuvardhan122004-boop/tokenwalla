"""send_doctor_delay_alert: param order, opt-out, and the 15-minute
idempotency window that stops a receptionist's repeated nudge (10 -> 15 -> 20
minutes) from re-texting the same patient every time."""
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from notifications.models import WhatsAppLog
from notifications.whatsapp import send_doctor_delay_alert
from users.models import User

SENT = {'success': True, 'message_id': 'wamid.TEST', 'error': None}


class SendDoctorDelayAlertTests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000401', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Anita Rao', specialization='GP',
            mobile='9000000402', fee=200, slots=['09:00 AM'])
        self.patient = User.objects.create(
            username='9000000403', mobile='9000000403', first_name='Rahul',
            role='patient')
        self.booking = Booking.objects.create(
            user=self.patient, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-TEST-1',
            status=Booking.CONFIRMED,
        )

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_sends_the_four_params_in_order(self, send):
        send_doctor_delay_alert(self.booking, 15, '09:15 AM')

        _, kwargs = send.call_args
        self.assertEqual(kwargs['template_name'], 'doctor_running_late')
        self.assertEqual(kwargs['to_mobile'], '9000000403')
        self.assertEqual(kwargs['params'], ['Rahul', 'Anita Rao', '15', '09:15 AM'])

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_logs_a_sent_row_against_the_booking(self, send):
        send_doctor_delay_alert(self.booking, 15, '09:15 AM')

        log = WhatsAppLog.objects.get(booking=self.booking, event_type='doctor_delay')
        self.assertEqual(log.status, 'sent')
        self.assertEqual(log.wa_message_id, 'wamid.TEST')

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_opted_out_patient_is_skipped(self, send):
        self.patient.whatsapp_opt_in = False
        self.patient.save(update_fields=['whatsapp_opt_in'])

        send_doctor_delay_alert(self.booking, 15, '09:15 AM')

        send.assert_not_called()
        self.assertFalse(WhatsAppLog.objects.filter(booking=self.booking).exists())

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_second_nudge_within_15_minutes_does_not_re_send(self, send):
        send_doctor_delay_alert(self.booking, 15, '09:15 AM')
        send_doctor_delay_alert(self.booking, 20, '09:20 AM')  # bumped moments later

        send.assert_called_once()
        self.assertEqual(
            WhatsAppLog.objects.filter(booking=self.booking, event_type='doctor_delay').count(), 1)

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_nudge_after_the_window_sends_again(self, send):
        send_doctor_delay_alert(self.booking, 15, '09:15 AM')
        WhatsAppLog.objects.filter(booking=self.booking).update(
            created=timezone.now() - timedelta(minutes=16))

        send_doctor_delay_alert(self.booking, 20, '09:20 AM')

        self.assertEqual(send.call_count, 2)

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_previously_failed_send_also_blocks_a_resend_inside_the_window(self, send):
        """The guard is 'don't spam', not 'retry until it lands' — a failed
        attempt (e.g. dev mode, no access token) still counts against the
        window rather than hammering Meta on every dashboard click."""
        WhatsAppLog.objects.create(booking=self.booking, event_type='doctor_delay', status='failed')

        send_doctor_delay_alert(self.booking, 15, '09:15 AM')

        send.assert_not_called()

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_another_bookings_alert_is_unaffected_by_this_bookings_window(self, send):
        other_patient = User.objects.create(
            username='9000000404', mobile='9000000404', role='patient')
        other_booking = Booking.objects.create(
            user=other_patient, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-TEST-2',
            status=Booking.CONFIRMED,
        )
        send_doctor_delay_alert(self.booking, 15, '09:15 AM')

        send_doctor_delay_alert(other_booking, 15, '09:15 AM')

        self.assertEqual(send.call_count, 2)
