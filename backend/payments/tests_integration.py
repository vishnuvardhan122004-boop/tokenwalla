"""
Integration & regression tests for the accept-payment and payout APIs (Razorpay).

Complements payments/tests_payments.py (fee math, refund tiers, ledger pipeline,
manual-payout mark-paid flow, invoice, receipt) by exercising the HTTP endpoints
end-to-end with Razorpay mocked, plus targeted regressions for the concurrency/
idempotency bugs:

  * BUG B — the accept-payment API is idempotent at the DB layer: a duplicate
            /verify/ for the same payment reference never creates a 2nd booking.
  * BUG E — a paid order must bind the booking to the doctor it was PAID FOR.

Razorpay seam: the client sends only { order_id } and the server confirms via
confirm_order_paid() — we deliberately ignore Razorpay Checkout's client-side
signature and re-fetch the order + its payments server-side instead, so
amounts stay rupee Decimals (converted from paise only at the gateway
boundary) and the /verify/ contract never had to change from the old Cashfree
integration.

Run:  python manage.py test payments
"""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from doctors.models import Doctor
from hospitals.models import Hospital
from payments.models import (
    Payment, ReschedulePayment, DoctorLedger, PayoutBatch,
)
from payments.fees import compute_fee_breakdown
from payments.payout_utils import choose_mode, payout_target

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures
# ─────────────────────────────────────────────────────────────────────────────
class WorldMixin:
    def make_actors(self, *, fee=200, upi=''):
        self.user = User.objects.create(username='pat', mobile='9000000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x')
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=fee, slots=['09:00 AM', '10:00 AM'],
            upi_vpa=upi,
            # Payout details present — without them a manual mark-paid still
            # works (mode falls back to OTHER), see ManualPayoutTests.
            bank_account_number='00111122233', ifsc='HDFC0000001')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        return self

    def admin_client(self):
        import uuid
        suffix = uuid.uuid4().hex[:8]
        admin = User.objects.create(username=f'adm_{suffix}',
                                    mobile=f'8{uuid.uuid4().int % 10**9:09d}',
                                    role='admin', password='x')
        client = APIClient()
        client.force_authenticate(admin)
        return client


# ─────────────────────────────────────────────────────────────────────────────
# CreateOrderView — order creation (acceptance API step 1)
# ─────────────────────────────────────────────────────────────────────────────
class CreateOrderTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_book', 'key': 'rzp_test_x'})
    def test_booking_order_returns_itemised_breakdown(self, mock_create):
        r = self.client.post('/api/payment/create-order/', {'doctorId': self.doctor.id}, format='json')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['order_id'], 'order_book')
        self.assertEqual(data['key'], 'rzp_test_x')
        self.assertEqual(data['breakdown']['final_amount'], '225.37')
        # The amount handed to Razorpay is the server-computed full bill (rupees).
        self.assertEqual(mock_create.call_args.kwargs['amount_rupees'], Decimal('225.37'))
        self.assertEqual(mock_create.call_args.kwargs['tags']['plan'], 'booking')

    def test_doctor_not_found_is_404_without_gateway_call(self):
        r = self.client.post('/api/payment/create-order/', {'doctorId': 999999}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_invalid_fixed_amount_rejected(self):
        # No doctorId → legacy fixed-amount path; 999 is not an allowed plan.
        r = self.client.post('/api/payment/create-order/', {'amount': 999}, format='json')
        self.assertEqual(r.status_code, 400)

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_rs', 'key': 'rzp_test_x'})
    def test_legacy_reschedule_order(self, mock_create):
        # Rupees now (₹5), not paise.
        r = self.client.post('/api/payment/create-order/', {'amount': 5}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['order_id'], 'order_rs')
        self.assertEqual(mock_create.call_args.kwargs['tags']['plan'], 'reschedule')

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'order_m', 'key': 'rzp_test_key'})
    def test_checkout_key_is_served_with_the_session(self, _m):
        # The frontend needs the public key id to open Razorpay Checkout — it
        # comes from the order response so a key rotation only needs updating
        # here, not in a separate frontend build-time var.
        r = self.client.post('/api/payment/create-order/', {'doctorId': self.doctor.id}, format='json')
        self.assertEqual(r.json()['key'], 'rzp_test_key')

    def test_unauthenticated_rejected(self):
        anon = APIClient()
        r = anon.post('/api/payment/create-order/', {'doctorId': self.doctor.id}, format='json')
        self.assertIn(r.status_code, (401, 403))


# ─────────────────────────────────────────────────────────────────────────────
# VerifyPaymentView — new booking (acceptance API step 2)
# ─────────────────────────────────────────────────────────────────────────────
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
class VerifyNewBookingTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)
        self.breakdown = compute_fee_breakdown(200)
        self.amount    = self.breakdown['final_amount']   # Decimal 225.37

    def _confirm(self, *, paid=True, ref='rzp_pay_1', amount=None, doctor_fee='200'):
        """Build a confirm_order_paid return tuple: (paid, payment_ref, amount, tags)."""
        return (paid, ref, (self.amount if amount is None else amount),
                {'plan': 'booking', 'doctor_fee': doctor_fee, 'user_id': str(self.user.id)})

    def _verify(self, **overrides):
        body = {
            'order_id': 'order_book',
            'booking': {'doctorId': self.doctor.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }
        body.update(overrides)
        return self.client.post('/api/payment/verify/', body, format='json')

    @mock.patch('payments.views.confirm_order_paid')
    def test_happy_path_creates_booking_and_split_payment(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self._verify()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['success'])

        booking = Booking.objects.get(payment_id='rzp_pay_1')
        self.assertEqual(booking.status, 'CONFIRMED')
        self.assertTrue(booking.queue_access)
        pay = booking.payment
        self.assertEqual(pay.status, Payment.PAID)
        self.assertEqual(pay.doctor_fee,   Decimal('200.00'))
        self.assertEqual(pay.platform_fee, Decimal('20.00'))
        self.assertEqual(pay.final_amount, Decimal('225.37'))

    @mock.patch('payments.views.confirm_order_paid')
    def test_unpaid_order_rejected(self, mock_confirm):
        mock_confirm.return_value = self._confirm(paid=False, ref='')
        r = self._verify()
        self.assertEqual(r.status_code, 400)
        self.assertIn('not completed', r.json()['message'].lower())
        self.assertFalse(Booking.objects.filter(order_id='order_book').exists())

    def test_missing_order_id_rejected(self):
        r = self._verify(order_id='')
        self.assertEqual(r.status_code, 400)

    @mock.patch('payments.views.confirm_order_paid')
    def test_amount_tamper_is_rejected(self, mock_confirm):
        # Order paid for less than the server-computed bill → reject.
        mock_confirm.return_value = self._confirm(amount=self.amount - Decimal('1.00'))
        r = self._verify()
        self.assertEqual(r.status_code, 400)
        self.assertIn('mismatch', r.json()['message'].lower())
        self.assertFalse(Booking.objects.filter(payment_id='rzp_pay_1').exists())

    @mock.patch('payments.views.confirm_order_paid')
    def test_invalid_slot_rejected(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self._verify(booking={'doctorId': self.doctor.id, 'date': '2026-08-01', 'slot': '11:59 PM'})
        self.assertEqual(r.status_code, 400)

    @mock.patch('payments.views.confirm_order_paid')
    def test_duplicate_verify_is_idempotent(self, mock_confirm):
        # BUG B: two /verify/ calls for the same payment ref → exactly one booking.
        mock_confirm.return_value = self._confirm()
        r1 = self._verify()
        r2 = self._verify()
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.json()['success'])
        self.assertEqual(Booking.objects.filter(payment_id='rzp_pay_1').count(), 1)
        self.assertEqual(Payment.objects.filter(payment_id='rzp_pay_1').count(), 1)


# ─────────────────────────────────────────────────────────────────────────────
# BUG E — the paid order must bind the booking to the doctor it was PAID FOR
#
# The order tags are written server-side at create-order time and are the only
# trustworthy record of which doctor the patient paid for. /verify/ used to read
# the doctor from the client-supplied `booking` dict instead, so a patient could
# pay a cheap doctor's bill and redeem it against an expensive one — the
# expensive doctor's payout would be ledgered from the cheap doctor's fee.
# ─────────────────────────────────────────────────────────────────────────────
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
class VerifyOrderBindingTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)                       # self.doctor — the ₹200 one
        self.dear = Doctor.objects.create(
            hospital=self.hospital, name='Dr Expensive', specialization='Cardio',
            mobile='9000000004', fee=2000, slots=['09:00 AM'])
        self.amount = compute_fee_breakdown(200)['final_amount']

    def _confirm(self, **tag_overrides):
        tags = {'plan': 'booking', 'doctor_fee': '200',
                'doctor_id': str(self.doctor.id), 'user_id': str(self.user.id)}
        tags.update(tag_overrides)
        return (True, 'rzp_pay_bind', self.amount, tags)

    @mock.patch('payments.views.confirm_order_paid')
    def test_cannot_redeem_a_paid_order_against_a_different_doctor(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'order_book',
            # Paid for self.doctor (₹200) — claiming the ₹2000 doctor instead.
            'booking': {'doctorId': self.dear.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Booking.objects.filter(doctor=self.dear).exists())
        self.assertFalse(Payment.objects.filter(payment_id='rzp_pay_bind').exists())

    @mock.patch('payments.views.confirm_order_paid')
    def test_matching_doctor_still_works(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'order_book',
            'booking': {'doctorId': self.doctor.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Booking.objects.get(payment_id='rzp_pay_bind').doctor_id, self.doctor.id)

    @mock.patch('payments.views.confirm_order_paid')
    def test_another_users_order_cannot_be_redeemed(self, mock_confirm):
        # Someone else's paid order_id replayed by this user → refused, no booking.
        other = User.objects.create(username='mallory', mobile='9000000009', role='patient')
        mock_confirm.return_value = self._confirm(user_id=str(other.id))
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'order_book',
            'booking': {'doctorId': self.doctor.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 403, r.content)
        self.assertFalse(Booking.objects.filter(payment_id='rzp_pay_bind').exists())


# ─────────────────────────────────────────────────────────────────────────────
# BUG B at the DB layer — the unique constraint actually exists
# ─────────────────────────────────────────────────────────────────────────────
class PaymentIdempotencyConstraintTests(WorldMixin, TestCase):
    def test_duplicate_nonblank_payment_id_is_rejected_by_db(self):
        from django.db import IntegrityError, transaction
        self.make_actors()
        b1 = Booking.objects.create(user=self.user, doctor=self.doctor, hospital=self.hospital,
                                    date=timezone.localdate(), slot='09:00 AM', token='TW-DUP-1')
        b2 = Booking.objects.create(user=self.user, doctor=self.doctor, hospital=self.hospital,
                                    date=timezone.localdate(), slot='09:00 AM', token='TW-DUP-2')
        Payment.objects.create(booking=b1, order_id='o', payment_id='pay_x', amount=1,
                               final_amount=1, status=Payment.PAID)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Payment.objects.create(booking=b2, order_id='o', payment_id='pay_x', amount=1,
                                       final_amount=1, status=Payment.PAID)

    def test_blank_payment_ids_do_not_collide(self):
        # The constraint is partial (non-blank only), so placeholder rows are fine.
        self.make_actors()
        b1 = Booking.objects.create(user=self.user, doctor=self.doctor, hospital=self.hospital,
                                    date=timezone.localdate(), slot='09:00 AM', token='TW-BLK-1')
        b2 = Booking.objects.create(user=self.user, doctor=self.doctor, hospital=self.hospital,
                                    date=timezone.localdate(), slot='09:00 AM', token='TW-BLK-2')
        Payment.objects.create(booking=b1, order_id='o', payment_id='', amount=1, final_amount=1)
        Payment.objects.create(booking=b2, order_id='o', payment_id='', amount=1, final_amount=1)
        self.assertEqual(Payment.objects.filter(payment_id='').count(), 2)


# ─────────────────────────────────────────────────────────────────────────────
# VerifyPaymentView — reschedule idempotency
# ─────────────────────────────────────────────────────────────────────────────
class VerifyRescheduleTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors()
        self.booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-RS-1',
            status='CONFIRMED')

    @mock.patch('payments.views.confirm_order_paid')
    def test_duplicate_reschedule_is_idempotent(self, mock_confirm):
        # A reschedule already recorded for this payment ref → no second reschedule.
        ReschedulePayment.objects.create(
            booking=self.booking, order_id='order_rs', payment_id='rzp_rs_1',
            signature='', amount=5, status='success')
        # Reschedule plan resolves by the ₹5 amount / tags.
        mock_confirm.return_value = (True, 'rzp_rs_1', Decimal('5.00'), {'plan': 'reschedule'})
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'order_rs',
            'booking': {'booking_id': self.booking.id, 'date': '2026-08-02', 'slot': '10:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['success'])
        self.assertEqual(ReschedulePayment.objects.filter(payment_id='rzp_rs_1').count(), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Salaried doctors — the payout goes to the HOSPITAL's account
# ─────────────────────────────────────────────────────────────────────────────
class SalariedDoctorPayoutTests(WorldMixin, TestCase):
    """A salaried doctor doesn't collect their own fees; the hospital does.
    `Doctor.payout_to_hospital` redirects the money WITHOUT moving the ledger:
    earnings stay attributable per doctor, only the destination account (and
    which rail payments.payout_utils.choose_mode picks) changes.
    """
    def setUp(self):
        self.make_actors(fee=200)
        self.hospital.upi_vpa = 'apollo@upi'
        self.hospital.account_holder_name = 'Apollo Hospitals Pvt Ltd'
        self.hospital.save(update_fields=['upi_vpa', 'account_holder_name'])

    def _complete_booking(self, token, doctor=None):
        booking = Booking.objects.create(
            user=self.user, doctor=doctor or self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token=token,
            status=Booking.COMPLETED, amount=200)
        bd = compute_fee_breakdown(200)
        Payment.objects.create(
            booking=booking, order_id='o', payment_id=f'pay_{token}', amount=225,
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'], status=Payment.PAID)
        return booking

    def _salaried(self):
        self.doctor.payout_to_hospital = True
        self.doctor.save(update_fields=['payout_to_hospital'])

    def test_target_is_the_doctor_by_default(self):
        self.assertEqual(payout_target(self.doctor), self.doctor)

    def test_target_is_the_hospital_when_salaried(self):
        self._salaried()
        self.assertEqual(payout_target(self.doctor), self.hospital)

    def test_mode_comes_from_the_hospital_not_the_doctor(self):
        # The doctor has only a bank account (IMPS); the hospital has a VPA.
        # Routing to the hospital must pick UPI — reading the doctor's rail here
        # would send an IMPS transfer to an account we never looked up.
        self._salaried()
        self._complete_booking('TW-SAL-1')
        call_command('run_daily_payouts')
        self.admin_client().post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        self.assertEqual(PayoutBatch.objects.get().payout_mode, PayoutBatch.UPI)

    def test_ledger_and_batch_stay_keyed_to_the_doctor(self):
        # The money goes to the hospital, but the AUDIT TRAIL must still say
        # which doctor earned it — otherwise a hospital with several salaried
        # doctors has one undifferentiated lump.
        self._salaried()
        booking = self._complete_booking('TW-SAL-2')
        call_command('run_daily_payouts')
        self.assertEqual(DoctorLedger.objects.get(booking=booking).doctor, self.doctor)
        self.admin_client().post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        self.assertEqual(PayoutBatch.objects.get().doctor, self.doctor)

    def test_two_salaried_doctors_share_one_beneficiary_but_not_one_batch(self):
        self._salaried()
        other = Doctor.objects.create(
            hospital=self.hospital, name='Dr Iyer', specialization='ENT',
            mobile='9000000009', fee=200, slots=['09:00 AM'],
            payout_to_hospital=True)
        self._complete_booking('TW-SAL-3')
        self._complete_booking('TW-SAL-4', doctor=other)
        call_command('run_daily_payouts')
        client = self.admin_client()
        client.post('/api/payment/payouts/mark-paid/', {'doctor_id': self.doctor.id})
        client.post('/api/payment/payouts/mark-paid/', {'doctor_id': other.id})

        # One batch each (per-doctor accounting), both paid into one account.
        self.assertEqual(PayoutBatch.objects.count(), 2)
        self.assertEqual(
            {payout_target(d).id for d in (self.doctor, other)}, {self.hospital.id})
        # `other` has no payout details of their own — routing is what makes
        # them payable at all.
        self.assertEqual(choose_mode(other), None)
        self.assertEqual(choose_mode(payout_target(other)), 'UPI')

    def test_salaried_doctor_pending_view_shows_the_hospital_as_recipient(self):
        self._salaried()
        self._complete_booking('TW-SAL-5')
        call_command('run_daily_payouts')
        r = self.admin_client().get('/api/payment/payouts/pending/')
        row = r.json()['payouts'][0]
        self.assertEqual(row['pay_to'], 'hospital')
        self.assertEqual(row['recipient_name'], 'Apollo Hospitals Pvt Ltd')


# ─────────────────────────────────────────────────────────────────────────────
# Rail selection — the dashboard's explicit choice must win
# ─────────────────────────────────────────────────────────────────────────────
class ChooseModeTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)          # bank account set, no VPA

    def test_bank_only_uses_imps(self):
        self.assertEqual(choose_mode(self.doctor), 'IMPS')

    def test_vpa_wins_when_no_method_chosen(self):
        self.doctor.upi_vpa = 'rao@upi'
        self.assertEqual(choose_mode(self.doctor), 'UPI')

    def test_explicit_bank_beats_a_stale_vpa(self):
        # The hospital deliberately picked Bank. A UPI ID left over from an
        # earlier setup must NOT silently redirect the money to a VPA.
        self.doctor.upi_vpa = 'stale@upi'
        self.doctor.payment_method = 'BANK'
        self.assertEqual(choose_mode(self.doctor), 'IMPS')

    def test_explicit_upi_is_honoured(self):
        self.doctor.upi_vpa = 'rao@upi'
        self.doctor.payment_method = 'UPI'
        self.assertEqual(choose_mode(self.doctor), 'UPI')

    def test_chosen_rail_with_no_details_falls_back_to_what_exists(self):
        # Legacy row: method says UPI but no VPA was ever saved. Paying via the
        # bank account on file beats holding the money forever.
        self.doctor.payment_method = 'UPI'
        self.assertEqual(choose_mode(self.doctor), 'IMPS')

    def test_no_details_at_all_is_none(self):
        self.doctor.bank_account_number = ''
        self.doctor.ifsc = ''
        self.assertIsNone(choose_mode(self.doctor))
