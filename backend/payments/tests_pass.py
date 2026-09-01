"""
The Appointment Pass — ₹35, two visits, 30 days.

Covers the four places it can go wrong with money:

  * the price splits back out of ₹35 exactly (no rounding leak into GST),
  * a credit is only ever spent once, and only while the pass is live,
  * a redemption is a ₹0 booking that never touches the gateway,
  * a cancellation gives a spent credit back — but cancelling the booking that
    BOUGHT the pass voids the rest of it, because that money is refunded.

Every test that reaches a booking view patches the notification thread: it
opens its own DB connection and outlives the test, and against the shared-cache
in-memory SQLite it fails a LATER, unrelated test with 'database table is
locked'. See CLAUDE.md → "Four traps that have already cost a session".

Run:  python manage.py test payments.tests_pass
"""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.fees import (
    compute_fee_breakdown, compute_pass_split, pass_eligible,
    PASS_BOOKINGS, PASS_PRICE, PASS_BUY, PASS_REDEEM,
)
from payments.models import AppointmentPass, Payment

User = get_user_model()

# Computed, never a literal — a hard-coded date silently rots past the booking
# cutoff and then starts failing for a reason that has nothing to do with passes.
FUTURE_DATE = str(timezone.localdate() + timedelta(days=3))


class PassWorldMixin:
    """A service-fee-only doctor (the only kind a pass works with) and a patient."""

    def make_actors(self, *, fee=200, mode=Doctor.COLLECT_SERVICE_ONLY):
        self.user = User.objects.create(username='pat', mobile='9000000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=fee, slots=['09:00 AM', '10:00 AM'],
            payment_collection_mode=mode)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        return self

    def give_pass(self, *, used=0, days=30, voided=False, user=None):
        return AppointmentPass.objects.create(
            user           = user or self.user,
            price          = PASS_PRICE,
            total_bookings = PASS_BOOKINGS,
            used_bookings  = used,
            expires_at     = timezone.now() + timedelta(days=days),
            voided_at      = timezone.now() if voided else None,
        )


# ─────────────────────────────────────────────────────────────────────────────
# The money
# ─────────────────────────────────────────────────────────────────────────────
class PassFeeMathTests(TestCase):
    def test_split_sums_to_exactly_the_price(self):
        s = compute_pass_split()
        self.assertEqual(s['platform_fee'] + s['gateway_fee'] + s['gst_amount'],
                         Decimal('35.00'))

    def test_split_is_the_documented_one(self):
        s = compute_pass_split()
        self.assertEqual(s['taxable_value'], Decimal('29.66'))
        self.assertEqual(s['platform_fee'],  Decimal('28.16'))
        self.assertEqual(s['gateway_fee'],   Decimal('1.50'))
        self.assertEqual(s['gst_amount'],    Decimal('5.34'))

    def test_buying_replaces_the_service_fee_not_the_doctor_fee(self):
        b = compute_fee_breakdown(200, 'SERVICE_ONLY', PASS_BUY)
        self.assertEqual(b['final_amount'], Decimal('35.00'))
        # The consultation fee is still payable at the clinic, untouched.
        self.assertEqual(b['offline_doctor_fee'], Decimal('200.00'))
        self.assertEqual(b['doctor_fee'], Decimal('0.00'))

    def test_redeeming_a_service_only_visit_costs_nothing(self):
        b = compute_fee_breakdown(200, 'SERVICE_ONLY', PASS_REDEEM)
        self.assertEqual(b['final_amount'], Decimal('0.00'))
        self.assertEqual(b['platform_fee'], Decimal('0.00'))
        self.assertEqual(b['gst_amount'],   Decimal('0.00'))

    def test_a_pass_is_cheaper_than_two_single_visits(self):
        single = compute_fee_breakdown(200, 'SERVICE_ONLY')['final_amount']
        self.assertEqual(single * 2, Decimal('50.74'))
        self.assertLess(PASS_PRICE, single * 2)

    def test_ordinary_pricing_is_unchanged(self):
        # The regression that matters most: adding pass_action must not move a
        # normal bill by a paisa.
        self.assertEqual(compute_fee_breakdown(200, 'FULL')['final_amount'],
                         Decimal('225.37'))
        self.assertEqual(compute_fee_breakdown(200, 'SERVICE_ONLY')['final_amount'],
                         Decimal('25.37'))

    def test_only_service_only_providers_are_eligible(self):
        self.assertTrue(pass_eligible('SERVICE_ONLY'))
        self.assertTrue(pass_eligible(''))          # blank ⇒ service only
        self.assertFalse(pass_eligible('FULL'))


# ─────────────────────────────────────────────────────────────────────────────
# Buying one at checkout
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(PASS_ENABLED=True)
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
class BuyPassTests(PassWorldMixin, TestCase):
    def setUp(self):
        self.make_actors()

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_pass', 'key': 'rzp_test_x'})
    def test_order_is_for_the_pass_price_and_tagged(self, mock_create):
        r = self.client.post('/api/payment/create-order/',
                             {'doctorId': self.doctor.id, 'buyPass': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['breakdown']['final_amount'], '35.00')
        self.assertEqual(mock_create.call_args.kwargs['amount_rupees'], Decimal('35.00'))
        self.assertEqual(mock_create.call_args.kwargs['tags']['pass'], 'buy')

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_plain', 'key': 'rzp_test_x'})
    def test_without_the_flag_nothing_changes(self, mock_create):
        r = self.client.post('/api/payment/create-order/',
                             {'doctorId': self.doctor.id}, format='json')
        self.assertEqual(r.json()['breakdown']['final_amount'], '25.37')
        self.assertEqual(mock_create.call_args.kwargs['tags']['pass'], '')

    @mock.patch('payments.views.create_order')
    def test_full_doctor_cannot_sell_a_pass(self, mock_create):
        self.doctor.payment_collection_mode = Doctor.COLLECT_FULL
        self.doctor.save(update_fields=['payment_collection_mode'])
        r = self.client.post('/api/payment/create-order/',
                             {'doctorId': self.doctor.id, 'buyPass': True}, format='json')
        self.assertEqual(r.status_code, 400)
        mock_create.assert_not_called()

    @override_settings(PASS_ENABLED=False)
    @mock.patch('payments.views.create_order')
    def test_kill_switch_stops_sales(self, mock_create):
        r = self.client.post('/api/payment/create-order/',
                             {'doctorId': self.doctor.id, 'buyPass': True}, format='json')
        self.assertEqual(r.status_code, 400)
        mock_create.assert_not_called()

    def _confirm(self, *, tags=None):
        base = {'plan': 'booking', 'doctor_fee': '200', 'user_id': str(self.user.id),
                'collection_mode': 'SERVICE_ONLY', 'pass': 'buy'}
        base.update(tags or {})
        return (True, 'rzp_pay_pass', Decimal('35.00'), base)

    def _verify(self):
        return self.client.post('/api/payment/verify/', {
            'order_id': 'order_pass',
            'booking': {'doctorId': self.doctor.id, 'date': FUTURE_DATE, 'slot': '09:00 AM'},
        }, format='json')

    @mock.patch('payments.views.confirm_order_paid')
    def test_verify_mints_the_pass_with_the_first_visit_spent(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self._verify()
        self.assertEqual(r.status_code, 200, r.content)

        ap = AppointmentPass.objects.get()
        self.assertEqual(ap.used_bookings, 1)
        self.assertEqual(ap.total_bookings, 2)
        self.assertEqual(ap.remaining, 1)
        self.assertEqual(ap.price, Decimal('35.00'))
        # A snapshot at purchase, not a constant read back later.
        self.assertGreater(ap.expires_at, timezone.now() + timedelta(days=29))
        self.assertLess(ap.expires_at, timezone.now() + timedelta(days=31))

        booking = Booking.objects.get()
        self.assertEqual(ap.source_booking_id, booking.id)
        self.assertEqual(booking.appointment_pass_id, ap.id)
        self.assertEqual(booking.payment.final_amount, Decimal('35.00'))
        self.assertEqual(booking.payment.platform_fee, Decimal('28.16'))
        self.assertEqual(r.json()['pass']['remaining'], 1)

    @mock.patch('payments.views.confirm_order_paid')
    def test_a_client_cannot_claim_a_pass_the_order_never_bought(self, mock_confirm):
        # The tag is the only record that matters. An order paid at the single
        # -visit price stays a single visit however the client asks.
        mock_confirm.return_value = (True, 'rzp_pay_x', Decimal('25.37'),
                                     {'plan': 'booking', 'doctor_fee': '200',
                                      'user_id': str(self.user.id),
                                      'collection_mode': 'SERVICE_ONLY', 'pass': ''})
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'order_plain', 'buyPass': True,
            'booking': {'doctorId': self.doctor.id, 'date': FUTURE_DATE,
                        'slot': '09:00 AM', 'buyPass': True},
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(AppointmentPass.objects.exists())
        self.assertIsNone(r.json()['pass'])

    @mock.patch('payments.views.confirm_order_paid')
    def test_amount_must_match_the_pass_price(self, mock_confirm):
        paid_less = list(self._confirm())
        paid_less[2] = Decimal('25.37')          # paid single-visit, tagged as a pass
        mock_confirm.return_value = tuple(paid_less)
        r = self._verify()
        self.assertEqual(r.status_code, 400)
        self.assertFalse(AppointmentPass.objects.exists())
        self.assertFalse(Booking.objects.exists())


# ─────────────────────────────────────────────────────────────────────────────
# Spending it
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(PASS_ENABLED=True)
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
class RedeemPassTests(PassWorldMixin, TestCase):
    def setUp(self):
        self.make_actors()

    def _redeem(self, **overrides):
        body = {'doctorId': self.doctor.id, 'date': FUTURE_DATE, 'slot': '09:00 AM'}
        body.update(overrides)
        return self.client.post('/api/payment/pass/redeem/', body, format='json')

    @mock.patch('payments.views.create_order')
    @mock.patch('payments.views.confirm_order_paid')
    def test_redeeming_books_for_free_without_the_gateway(self, mock_confirm, mock_create):
        ap = self.give_pass(used=1)
        r  = self._redeem()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['success'])

        booking = Booking.objects.get()
        self.assertEqual(booking.status, 'CONFIRMED')
        self.assertTrue(booking.queue_access)
        self.assertEqual(booking.appointment_pass_id, ap.id)
        self.assertEqual(booking.amount, 0)
        self.assertEqual(booking.payment_id, '')

        pay = booking.payment
        self.assertEqual(pay.status, Payment.PAID)
        self.assertEqual(pay.final_amount, Decimal('0.00'))
        self.assertEqual(pay.platform_fee, Decimal('0.00'))
        # The consultation fee is still payable at the clinic.
        self.assertEqual(pay.offline_doctor_fee, Decimal('200.00'))

        ap.refresh_from_db()
        self.assertEqual(ap.used_bookings, 2)
        self.assertEqual(r.json()['pass']['remaining'], 0)
        mock_create.assert_not_called()
        mock_confirm.assert_not_called()

    def test_a_credit_is_spent_once(self):
        self.give_pass(used=1)
        self.assertEqual(self._redeem().status_code, 200)
        second = self._redeem(slot='10:00 AM')
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Booking.objects.count(), 1)

    def test_no_pass_at_all_is_refused(self):
        self.assertEqual(self._redeem().status_code, 409)
        self.assertFalse(Booking.objects.exists())

    def test_expired_pass_is_refused(self):
        self.give_pass(used=1, days=-1)
        self.assertEqual(self._redeem().status_code, 409)
        self.assertFalse(Booking.objects.exists())

    def test_voided_pass_is_refused(self):
        self.give_pass(used=1, voided=True)
        self.assertEqual(self._redeem().status_code, 409)

    def test_another_patients_pass_is_not_yours(self):
        other = User.objects.create(username='other', mobile='9000000009', role='patient')
        self.give_pass(used=1, user=other)
        self.assertEqual(self._redeem().status_code, 409)

    def test_full_doctor_cannot_be_redeemed_against(self):
        self.give_pass(used=1)
        self.doctor.payment_collection_mode = Doctor.COLLECT_FULL
        self.doctor.save(update_fields=['payment_collection_mode'])
        r = self._redeem()
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Booking.objects.exists())

    def test_a_full_slot_does_not_burn_the_credit(self):
        # The booking rolls back; the credit must roll back with it.
        ap = self.give_pass(used=1)
        with mock.patch('payments.views.check_slot_available_locked',
                        side_effect=__import__('bookings.capacity', fromlist=['x'])
                        .SlotUnavailable('Slot is full.', reason='full')):
            r = self._redeem()
        self.assertEqual(r.status_code, 409)
        ap.refresh_from_db()
        self.assertEqual(ap.used_bookings, 1)
        self.assertFalse(Booking.objects.exists())

    @override_settings(PASS_ENABLED=False)
    def test_kill_switch_stops_redemptions(self):
        self.give_pass(used=1)
        self.assertEqual(self._redeem().status_code, 400)

    def test_unauthenticated_rejected(self):
        anon = APIClient()
        r = anon.post('/api/payment/pass/redeem/',
                      {'doctorId': self.doctor.id, 'date': FUTURE_DATE, 'slot': '09:00 AM'},
                      format='json')
        self.assertIn(r.status_code, (401, 403))


# ─────────────────────────────────────────────────────────────────────────────
# What checkout reads
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(PASS_ENABLED=True)
class PassStatusTests(PassWorldMixin, TestCase):
    def setUp(self):
        self.make_actors()

    def test_offer_is_served_even_with_no_pass(self):
        r = self.client.get('/api/payment/pass/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data['enabled'])
        self.assertEqual(data['price'], '35.00')
        self.assertEqual(data['bookings'], 2)
        self.assertEqual(data['days'], 30)
        self.assertIsNone(data['pass'])

    def test_active_pass_is_reported(self):
        self.give_pass(used=1)
        data = self.client.get('/api/payment/pass/').json()
        self.assertEqual(data['pass']['remaining'], 1)
        self.assertEqual(data['pass']['used'], 1)

    def test_spent_and_expired_passes_are_not_reported(self):
        self.give_pass(used=2)
        self.give_pass(used=0, days=-1)
        self.assertIsNone(self.client.get('/api/payment/pass/').json()['pass'])

    @override_settings(PASS_ENABLED=False)
    def test_kill_switch_shows_in_the_offer(self):
        self.assertFalse(self.client.get('/api/payment/pass/').json()['enabled'])


# ─────────────────────────────────────────────────────────────────────────────
# Cancellation — the exploit this closes
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(PASS_ENABLED=True)
@mock.patch('bookings.views._whatsapp_async', lambda fn, b, label: None)
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
class PassCancellationTests(PassWorldMixin, TestCase):
    def setUp(self):
        self.make_actors()

    def _booking(self, ap, *, source=False, days_ahead=3):
        b = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate() + timedelta(days=days_ahead), slot='09:00 AM',
            token=f'TW-T{Booking.objects.count()}', status='CONFIRMED',
            amount=0, appointment_pass=ap)
        Payment.objects.create(booking=b, order_id='', payment_id='', amount=0,
                               status=Payment.PAID, final_amount=Decimal('0.00'))
        if source:
            ap.source_booking = b
            ap.save(update_fields=['source_booking'])
        return b

    def test_cancelling_a_redeemed_visit_gives_the_credit_back(self):
        ap = self.give_pass(used=2)
        b  = self._booking(ap)
        r  = self.client.patch(f'/api/bookings/cancel/{b.id}/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['pass'], 'credit_restored')
        ap.refresh_from_db()
        self.assertEqual(ap.used_bookings, 1)
        self.assertTrue(ap.is_active())

    def test_cancelling_the_purchase_voids_the_rest_of_the_pass(self):
        # Otherwise: buy for ₹35, cancel, take the refund, keep a free visit.
        ap = self.give_pass(used=1)
        b  = self._booking(ap, source=True)
        r  = self.client.patch(f'/api/bookings/cancel/{b.id}/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['pass'], 'voided')
        ap.refresh_from_db()
        self.assertIsNotNone(ap.voided_at)
        self.assertFalse(ap.is_active())

    def test_cancelling_an_ordinary_booking_is_unaffected(self):
        b = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate() + timedelta(days=3), slot='09:00 AM',
            token='TW-PLAIN', status='CONFIRMED', amount=25)
        Payment.objects.create(booking=b, order_id='o', payment_id='p', amount=25,
                               status=Payment.PAID, final_amount=Decimal('25.37'),
                               platform_fee=Decimal('20.00'))
        with mock.patch('payments.razorpay_utils.refund_payment', return_value={'id': 'rf_1'}):
            r = self.client.patch(f'/api/bookings/cancel/{b.id}/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()['pass'])

    def test_a_free_booking_refunds_nothing_through_the_gateway(self):
        ap = self.give_pass(used=2)
        b  = self._booking(ap)
        with mock.patch('payments.razorpay_utils.refund_payment') as mock_refund:
            r = self.client.patch(f'/api/bookings/cancel/{b.id}/', {}, format='json')
        self.assertEqual(r.status_code, 200)
        mock_refund.assert_not_called()
