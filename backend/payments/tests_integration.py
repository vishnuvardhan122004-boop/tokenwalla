"""
Integration & regression tests for the accept-payment and payout APIs (Cashfree).

Complements payments/tests_payments.py (fee math, refund tiers, payout pipeline,
invoice, receipt) by exercising the HTTP endpoints end-to-end with Cashfree
mocked, plus targeted regressions for the concurrency/idempotency bugs:

  * BUG A — a late TRANSFER_FAILED after a batch is already PROCESSED must NOT
            release the ledger (would double-pay the doctor).
  * BUG B — the accept-payment API is idempotent at the DB layer: a duplicate
            /verify/ for the same payment reference never creates a 2nd booking.
  * BUG D — a PayoutBatch's total_amount always equals the sum of the ledger
            rows attached to it.

Cashfree seam (vs the old Razorpay handshake): the client sends only { order_id }
and the server confirms via confirm_order_paid() — there is no client signature,
and amounts are rupee Decimals, not paise.

Run:  python manage.py test payments
"""
import base64
import hashlib
import hmac
import json
import time
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db.models import Sum
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
from payments.cashfree_payouts_utils import create_payout

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures
# ─────────────────────────────────────────────────────────────────────────────
class WorldMixin:
    def make_actors(self, *, fee=200, upi=''):
        self.user = User.objects.create(username='pat', mobile='9000000001', role='patient')
        self.hospital = Hospital.objects.create(
            name='Apollo', city='Hyd', mobile='9000000002', password='x',
            commission_rate=Decimal('20'))
        self.doctor = Doctor.objects.create(
            hospital=self.hospital, name='Dr Rao', specialization='GP',
            mobile='9000000003', fee=fee, slots=['09:00 AM', '10:00 AM'],
            upi_vpa=upi,
            # Payout details present — without them the daily run holds the
            # ledger instead of batching (there'd be nowhere to send the money).
            bank_account_number='00111122233', ifsc='HDFC0000001')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        return self


# ─────────────────────────────────────────────────────────────────────────────
# CreateOrderView — order creation (acceptance API step 1)
# ─────────────────────────────────────────────────────────────────────────────
class CreateOrderTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)

    @mock.patch('payments.views.create_order',
                return_value={'order_id': 'tw_book', 'payment_session_id': 'sess_book'})
    def test_booking_order_returns_itemised_breakdown(self, mock_create):
        r = self.client.post('/api/payment/create-order/', {'doctorId': self.doctor.id}, format='json')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['order_id'], 'tw_book')
        self.assertEqual(data['payment_session_id'], 'sess_book')
        self.assertEqual(data['breakdown']['final_amount'], '225.37')
        # The amount handed to Cashfree is the server-computed full bill (rupees).
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
                return_value={'order_id': 'tw_rs', 'payment_session_id': 'sess_rs'})
    def test_legacy_reschedule_order(self, mock_create):
        # Rupees now (₹5), not paise.
        r = self.client.post('/api/payment/create-order/', {'amount': 5}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['order_id'], 'tw_rs')
        self.assertEqual(mock_create.call_args.kwargs['tags']['plan'], 'reschedule')

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

    def _confirm(self, *, paid=True, ref='cf_pay_1', amount=None, doctor_fee='200'):
        """Build a confirm_order_paid return tuple: (paid, payment_ref, amount, tags)."""
        return (paid, ref, (self.amount if amount is None else amount),
                {'plan': 'booking', 'doctor_fee': doctor_fee, 'user_id': str(self.user.id)})

    def _verify(self, **overrides):
        body = {
            'order_id': 'tw_book',
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

        booking = Booking.objects.get(payment_id='cf_pay_1')
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
        self.assertFalse(Booking.objects.filter(order_id='tw_book').exists())

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
        self.assertFalse(Booking.objects.filter(payment_id='cf_pay_1').exists())

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
        self.assertEqual(Booking.objects.filter(payment_id='cf_pay_1').count(), 1)
        self.assertEqual(Payment.objects.filter(payment_id='cf_pay_1').count(), 1)


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
        return (True, 'cf_pay_bind', self.amount, tags)

    @mock.patch('payments.views.confirm_order_paid')
    def test_cannot_redeem_a_paid_order_against_a_different_doctor(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'tw_book',
            # Paid for self.doctor (₹200) — claiming the ₹2000 doctor instead.
            'booking': {'doctorId': self.dear.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Booking.objects.filter(doctor=self.dear).exists())
        self.assertFalse(Payment.objects.filter(payment_id='cf_pay_bind').exists())

    @mock.patch('payments.views.confirm_order_paid')
    def test_matching_doctor_still_works(self, mock_confirm):
        mock_confirm.return_value = self._confirm()
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'tw_book',
            'booking': {'doctorId': self.doctor.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Booking.objects.get(payment_id='cf_pay_bind').doctor_id, self.doctor.id)

    @mock.patch('payments.views.confirm_order_paid')
    def test_another_users_order_cannot_be_redeemed(self, mock_confirm):
        # Someone else's paid order_id replayed by this user → refused, no booking.
        other = User.objects.create(username='mallory', mobile='9000000009', role='patient')
        mock_confirm.return_value = self._confirm(user_id=str(other.id))
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'tw_book',
            'booking': {'doctorId': self.doctor.id, 'date': '2026-08-01', 'slot': '09:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 403, r.content)
        self.assertFalse(Booking.objects.filter(payment_id='cf_pay_bind').exists())


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
            booking=self.booking, order_id='tw_rs', payment_id='cf_rs_1',
            signature='', amount=5, status='success')
        # Reschedule plan resolves by the ₹5 amount / tags.
        mock_confirm.return_value = (True, 'cf_rs_1', Decimal('5.00'), {'plan': 'reschedule'})
        r = self.client.post('/api/payment/verify/', {
            'order_id': 'tw_rs',
            'booking': {'booking_id': self.booking.id, 'date': '2026-08-02', 'slot': '10:00 AM'},
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['success'])
        self.assertEqual(ReschedulePayment.objects.filter(payment_id='cf_rs_1').count(), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Payout webhook — BUG A regression + batch integrity (BUG D)
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(CASHFREE_PAYOUT_CLIENT_SECRET='whsec_test')
class PayoutWebhookRegressionTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)
        self.booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-WH-1',
            status=Booking.COMPLETED, amount=200)
        bd = compute_fee_breakdown(200)
        Payment.objects.create(
            booking=self.booking, order_id='o', payment_id='pay_wh', amount=225,
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'], status=Payment.PAID)
        call_command('run_daily_payouts')
        self.batch = PayoutBatch.objects.get(doctor=self.doctor)

    def _post(self, payload):
        body = json.dumps(payload)
        ts   = '1700000000'
        sig  = base64.b64encode(
            hmac.new(b'whsec_test', f'{ts}{body}'.encode(), hashlib.sha256).digest()
        ).decode()
        return self.client.post('/api/payment/webhook/', data=body,
                                content_type='application/json',
                                HTTP_X_WEBHOOK_SIGNATURE=sig,
                                HTTP_X_WEBHOOK_TIMESTAMP=ts)

    def _event(self, event):
        return {'type': event, 'data': {'transfer_id': self.batch.idempotency_key}}

    def test_batch_total_equals_attached_ledger_sum(self):
        # BUG D invariant: total_amount is exactly the sum of the rows attached.
        attached = (DoctorLedger.objects.filter(payout_batch=self.batch)
                    .aggregate(s=Sum('amount'))['s'])
        self.assertEqual(self.batch.total_amount, attached)
        self.assertEqual(self.batch.total_amount, Decimal('176.40'))

    def test_late_failure_after_processed_does_not_double_pay(self):
        # BUG A: processed first, then a stray failed delivery.
        self.assertEqual(self._post(self._event('TRANSFER_SUCCESS')).status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.PROCESSED)

        r = self._post(self._event('TRANSFER_FAILED'))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['status'], 'already_processed')

        self.batch.refresh_from_db()
        # Must stay PROCESSED, ledger stays attached, booking stays PAID —
        # otherwise the next run would re-batch and pay the doctor twice.
        self.assertEqual(self.batch.status, PayoutBatch.PROCESSED)
        self.assertEqual(DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 0)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.doctor_payout_status, Booking.PAYOUT_PAID)

        # And a fresh run creates no new batch.
        call_command('run_daily_payouts')
        self.assertEqual(PayoutBatch.objects.count(), 1)

    def test_bad_signature_rejected(self):
        body = json.dumps(self._event('TRANSFER_SUCCESS'))
        r = self.client.post('/api/payment/webhook/', data=body,
                             content_type='application/json',
                             HTTP_X_WEBHOOK_SIGNATURE='deadbeef',
                             HTTP_X_WEBHOOK_TIMESTAMP='1700000000')
        self.assertEqual(r.status_code, 400)

    def test_reversed_is_recorded_as_reversed(self):
        # Was mapped to FAILED because the check compared against the Razorpay
        # event name ('payout.reversed'), which Cashfree never sends.
        self.assertEqual(self._post(self._event('TRANSFER_REVERSED')).status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.REVERSED)
        self.assertEqual(DoctorLedger.objects.filter(payout_batch=self.batch).count(), 0)

    def test_rejected_releases_the_ledger_for_retry(self):
        # TRANSFER_REJECTED used to fall through to 'ignored', leaving the batch
        # QUEUED forever — the doctor would never be paid and never retried.
        r = self._post(self._event('TRANSFER_REJECTED'))
        self.assertEqual(r.status_code, 200)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.FAILED)
        self.assertEqual(DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 2)

    def test_v1_format_success_still_settles_the_batch(self):
        # If the dashboard webhook is configured V1, transfer events arrive with
        # no x-webhook-* headers and the signature inside the body. Acking those
        # away would leave every batch QUEUED and every doctor unpaid.
        payload = {'event': 'TRANSFER_SUCCESS',
                   'transferId': self.batch.idempotency_key,
                   'referenceId': '123456'}
        concat = ''.join(str(v) for _, v in sorted(payload.items()) if str(v))
        payload['signature'] = base64.b64encode(
            hmac.new(b'whsec_test', concat.encode(), hashlib.sha256).digest()).decode()

        r = self.client.post('/api/payment/webhook/', data=json.dumps(payload),
                             content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.PROCESSED)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.doctor_payout_status, Booking.PAYOUT_PAID)

    def test_v1_format_bad_signature_rejected(self):
        r = self.client.post('/api/payment/webhook/', data=json.dumps(
            {'event': 'TRANSFER_SUCCESS', 'transferId': self.batch.idempotency_key,
             'signature': 'not-it'}), content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.status, PayoutBatch.QUEUED)


# ─────────────────────────────────────────────────────────────────────────────
# The live Cashfree Payouts transfer — the call that actually moves money.
# Verified against the sandbox once (auth OK, blocked only by IP whitelisting);
# these pin the request shape so it can't drift silently.
# ─────────────────────────────────────────────────────────────────────────────
@override_settings(CASHFREE_PAYOUTS_ENABLED=True, CASHFREE_ENV='SANDBOX',
                   CASHFREE_PAYOUT_CLIENT_ID='cid', CASHFREE_PAYOUT_CLIENT_SECRET='csec')
class LivePayoutTransferTests(WorldMixin, TestCase):
    def setUp(self):
        self.make_actors(fee=200)

    @staticmethod
    def _resp(status_code=200, payload=None):
        r = mock.Mock(status_code=status_code, text='')
        r.json.return_value = payload if payload is not None else {
            'transfer_id': 'k', 'cf_transfer_id': '778899', 'status': 'RECEIVED'}
        return r

    @mock.patch('requests.post')
    def test_bank_transfer_body_and_url(self, post):
        post.return_value = self._resp()
        out = create_payout(self.doctor, Decimal('176.40'), 'IMPS', 'payout_1_2026-08-01')

        url  = post.call_args.args[0]
        body = post.call_args.kwargs['json']
        self.assertEqual(url, 'https://sandbox.cashfree.com/payout/transfers')
        # transfer_id IS the idempotency key — this is what stops a double payout.
        self.assertEqual(body['transfer_id'], 'payout_1_2026-08-01')
        self.assertEqual(body['transfer_amount'], 176.40)     # rupees, not paise
        self.assertEqual(body['transfer_mode'], 'imps')
        bene = body['beneficiary_details']
        self.assertEqual(bene['beneficiary_id'], f'tw_doctor_{self.doctor.id}')
        self.assertEqual(bene['beneficiary_instrument_details'],
                         {'bank_account_number': '00111122233', 'bank_ifsc': 'HDFC0000001'})
        self.assertEqual(post.call_args.kwargs['headers']['x-client-id'], 'cid')
        self.assertEqual(out['id'], '778899')

    @mock.patch('requests.post')
    def test_upi_sends_only_the_vpa(self, post):
        # A stale bank account riding along with a good VPA is a rejection waiting
        # to happen — only the instrument for the chosen mode goes out.
        self.doctor.upi_vpa = 'rao@upi'
        self.doctor.save(update_fields=['upi_vpa'])
        post.return_value = self._resp()
        create_payout(self.doctor, Decimal('10.00'), 'UPI', 'k1')
        bene = post.call_args.kwargs['json']['beneficiary_details']
        self.assertEqual(bene['beneficiary_instrument_details'], {'vpa': 'rao@upi'})

    @mock.patch('requests.post')
    def test_no_signature_header_when_no_public_key(self, post):
        # Default: IP-whitelisting only, header absent.
        post.return_value = self._resp()
        create_payout(self.doctor, Decimal('10.00'), 'IMPS', 'k0')
        self.assertNotIn('X-Cf-Signature', post.call_args.kwargs['headers'])

    @mock.patch('requests.post')
    def test_signature_header_decrypts_to_client_id_and_timestamp(self, post):
        # 2FA for dynamic-IP hosts. Generate a throwaway keypair, hand the public
        # half to the setting, and decrypt what we send with the private half —
        # proving the header is real RSA-OAEP over "<client_id>.<epoch>" rather
        # than merely present.
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa

        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo).decode()

        # The key gets pasted in three shapes in practice, and all must work:
        # a full PEM, a PEM whose newlines an env-var UI turned into literal
        # "\n", and the bare base64 body with no BEGIN/END armor (what you get
        # copying from the Cashfree dashboard — this one used to crash).
        bare = ''.join(l for l in pem.splitlines() if not l.startswith('-----'))
        for label, value in (('full PEM', pem),
                             ('escaped newlines', pem.replace('\n', '\\n')),
                             ('bare base64', bare)):
            with self.subTest(key_format=label):
                post.reset_mock()
                post.return_value = self._resp()
                with override_settings(CASHFREE_PAYOUT_PUBLIC_KEY=value):
                    create_payout(self.doctor, Decimal('10.00'), 'IMPS', 'k3')

                header = post.call_args.kwargs['headers']['X-Cf-Signature']
                plain = private.decrypt(base64.b64decode(header), padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA1()),
                    algorithm=hashes.SHA1(), label=None)).decode()
                client_id, _, epoch = plain.partition('.')
                self.assertEqual(client_id, 'cid')
                self.assertAlmostEqual(int(epoch), int(time.time()), delta=60)

    @mock.patch('requests.post')
    def test_gateway_error_raises_so_the_batch_is_marked_failed(self, post):
        post.return_value = self._resp(403, {'message': 'IP not whitelisted'})
        with self.assertRaises(RuntimeError) as ctx:
            create_payout(self.doctor, Decimal('10.00'), 'IMPS', 'k2')
        self.assertIn('IP not whitelisted', str(ctx.exception))

    @mock.patch('requests.post')
    def test_daily_run_marks_batch_failed_and_releases_ledger_on_error(self, post):
        # The run must never leave a batch QUEUED against a transfer that was
        # refused — the rows go back to unbatched for the next cycle.
        post.return_value = self._resp(500, {'message': 'boom'})
        booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token='TW-LIVE-1',
            status=Booking.COMPLETED, amount=200)
        bd = compute_fee_breakdown(200)
        Payment.objects.create(
            booking=booking, order_id='o', payment_id='pay_live', amount=225,
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'], status=Payment.PAID)

        call_command('run_daily_payouts')
        self.assertEqual(PayoutBatch.objects.get().status, PayoutBatch.FAILED)
        self.assertEqual(DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Payout pipeline — negative-net edge case + next-cycle retry after failure
# ─────────────────────────────────────────────────────────────────────────────
class PayoutEdgeCaseTests(WorldMixin, TestCase):
    def _complete_booking(self, token):
        booking = Booking.objects.create(
            user=self.user, doctor=self.doctor, hospital=self.hospital,
            date=timezone.localdate(), slot='09:00 AM', token=token,
            status=Booking.COMPLETED, amount=200)
        bd = compute_fee_breakdown(200)
        Payment.objects.create(
            booking=booking, order_id='o', payment_id=f'pay_{token}', amount=225,
            doctor_fee=bd['doctor_fee'], platform_fee=bd['platform_fee'],
            gateway_fee=bd['gateway_fee'], gst_amount=bd['gst_amount'],
            final_amount=bd['final_amount'], status=Payment.PAID)
        return booking

    def test_negative_net_leaves_rows_unbatched(self):
        self.make_actors(fee=200)
        self._complete_booking('TW-NEG-1')
        # A prior clawback bigger than this cycle's earnings → net ≤ 0.
        DoctorLedger.objects.create(doctor=self.doctor, amount=Decimal('-300.00'),
                                    reason=DoctorLedger.ABSENCE_REFUND)
        call_command('run_daily_payouts')
        self.assertEqual(PayoutBatch.objects.count(), 0)
        self.assertEqual(DoctorLedger.objects.filter(payout_batch__isnull=True).count(), 3)

    def test_failed_batch_retries_on_next_cycle(self):
        self.make_actors(fee=200)
        self._complete_booking('TW-RTY-1')
        call_command('run_daily_payouts')
        batch = PayoutBatch.objects.get()

        # Payout provider reports failure → ledger released for retry.
        batch.status = PayoutBatch.FAILED
        batch.save(update_fields=['status'])
        DoctorLedger.objects.filter(payout_batch=batch).update(payout_batch=None)

        # Next cycle (a different run_date → different idempotency_key) re-batches.
        tomorrow = timezone.localdate() + timedelta(days=1)
        with mock.patch('payments.management.commands.run_daily_payouts.timezone.localdate',
                        return_value=tomorrow):
            call_command('run_daily_payouts')

        retried = PayoutBatch.objects.exclude(pk=batch.pk)
        self.assertEqual(retried.count(), 1)
        self.assertEqual(retried.first().total_amount, Decimal('176.40'))
