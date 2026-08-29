"""The centre-shaped WhatsApp templates — sections 12-14 of WHATSAPP_TEMPLATES.md.

Every one of these guards a mismatch that only shows up in production: Meta
approves a template by its exact body and param COUNT, so a sender that picks
the wrong name, or sends a doctor's four params to a centre's three-variable
body, fails at send time against a real customer. The template names themselves
are unapproved until someone fills in the form — an unapproved template is inert
(send_template logs and returns), never an exception.
"""
from decimal import Decimal
from unittest import mock

from django.test import TestCase

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.models import PayoutBatch
from scans.models import Scan
from users.models import User
from notifications.whatsapp import (
    one_line, send_appointment_prep, send_centre_payout_paid,
    send_doctor_payout_paid, send_hospital_new_booking,
)

SENT = {'success': True, 'message_id': 'wamid.TEST', 'error': None}


class OneLineTests(TestCase):
    """Meta rejects a body param with a newline, a tab or 4+ spaces."""

    def test_newlines_and_runs_of_space_are_flattened(self):
        self.assertEqual(
            one_line('Fast for 8 hours.\n\nWater    is fine.\tNo food.'),
            'Fast for 8 hours. Water is fine. No food.',
        )

    def test_a_sentence_stop_is_added_because_the_body_continues(self):
        self.assertEqual(one_line('Fast for 8 hours'), 'Fast for 8 hours.')
        self.assertEqual(one_line('Fasting?'), 'Fasting?')

    def test_long_text_is_truncated_not_rejected(self):
        out = one_line('x ' * 400, limit=50)
        self.assertEqual(len(out), 50)
        self.assertTrue(out.endswith('…'))

    def test_blank_stays_blank_so_the_sender_can_skip(self):
        self.assertEqual(one_line('   \n\t '), '')


class CentrePayoutTests(TestCase):
    def setUp(self):
        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hyd', mobile='9000000010',
            password='x', kind=Hospital.SCAN_CENTER,
        )
        self.hospital = Hospital.objects.create(
            name='City Care', city='Hyd', mobile='9000000011', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Anita Rao', specialization='GP',
            mobile='9000000012', fee=200, slots=['09:00 AM'])

    def _batch(self, **kw):
        return PayoutBatch.objects.create(
            total_amount=Decimal('4250.00'), status=PayoutBatch.PROCESSED, **kw)

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_centre_gets_three_params_not_the_doctors_four(self, send):
        send_centre_payout_paid(self._batch(center=self.centre))

        _, kwargs = send.call_args
        self.assertEqual(kwargs['template_name'], 'centre_payout')
        self.assertEqual(kwargs['to_mobile'], '9000000010')
        # A centre is its own business — there is no hospital to name.
        self.assertEqual(kwargs['params'], ['Vijaya Diagnostics', '4250.00', 'NA'])

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_doctor_batch_is_not_sent_the_centre_body(self, send):
        # Guards the pairing in _notify_doctor_payout_async: both senders run on
        # every batch and exactly one of them may act. (A batch with NEITHER
        # payee cannot be built — payoutbatch_exactly_one_payee refuses it.)
        send_centre_payout_paid(self._batch(doctor=self.doctor))
        send.assert_not_called()

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_centre_batch_is_not_sent_the_doctor_body(self, send):
        send_doctor_payout_paid(self._batch(center=self.centre))
        send.assert_not_called()

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_centre_with_no_mobile_is_skipped(self, send):
        self.centre.mobile = ''
        self.centre.save(update_fields=['mobile'])
        send_centre_payout_paid(self._batch(center=self.centre))
        send.assert_not_called()


class CentreBookingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(
            username='pat', first_name='Rahul', mobile='9000000020', role='patient')
        self.centre = Hospital.objects.create(
            name='Vijaya Diagnostics', city='Hyd', mobile='9000000021',
            password='x', kind=Hospital.BLOOD_CENTER,
        )
        self.scan = Scan.objects.create(
            center=self.centre, name='Complete Blood Count', modality='LAB',
            price=Decimal('300.00'), slots=['08:00 AM'],
            prep_instructions='Fast for 8 hours.\nWater is fine.',
        )
        self.booking = Booking.objects.create(
            user=self.user, scan=self.scan, hospital=self.centre,
            date='2026-09-02', slot='08:00 AM', token='TW-TEST-0001',
            status=Booking.CONFIRMED, amount=Decimal('300.00'),
        )

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_a_scan_booking_alerts_the_centre_with_the_centre_body(self, send):
        send_hospital_new_booking(self.booking)

        _, kwargs = send.call_args
        # Same seven params as the hospital body; only the name differs.
        self.assertEqual(kwargs['template_name'], 'centre_new_booking')
        self.assertEqual(len(kwargs['params']), 7)
        self.assertEqual(kwargs['params'][3], 'Complete Blood Count')

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_prep_is_flattened_and_carries_the_reference(self, send):
        send_appointment_prep(self.booking)

        _, kwargs = send.call_args
        self.assertEqual(kwargs['template_name'], 'appointment_prep')
        self.assertEqual(kwargs['to_mobile'], '9000000020')
        self.assertEqual(kwargs['params'], [
            'Rahul', 'Complete Blood Count', 'Vijaya Diagnostics',
            '2026-09-02', 'Fast for 8 hours. Water is fine.', 'TW-TEST-0001',
        ])
        # The whole point of one_line(): Meta rejects either of these outright.
        self.assertNotIn('\n', kwargs['params'][4])
        self.assertNotIn('    ', kwargs['params'][4])

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_no_prep_on_file_sends_nothing(self, send):
        self.scan.prep_instructions = ''
        self.scan.save(update_fields=['prep_instructions'])
        send_appointment_prep(self.booking)
        send.assert_not_called()

    @mock.patch('notifications.whatsapp.send_template', return_value=SENT)
    def test_prep_respects_the_patients_opt_out(self, send):
        self.user.whatsapp_opt_in = False
        self.user.save(update_fields=['whatsapp_opt_in'])
        send_appointment_prep(self.booking)
        send.assert_not_called()
