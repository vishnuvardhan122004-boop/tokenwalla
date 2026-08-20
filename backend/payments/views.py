"""
backend/payments/views.py

The accept-payment API (Razorpay), the admin reports/receipt endpoints, and the
manual doctor-payout endpoints.

Two things shape every handler here:

  * The client is NEVER trusted for an amount or for who was paid for. Prices
    come from payments/fees.py, and /verify/ re-derives the split and binds the
    booking to the server-written order tags (see VerifyPaymentView).

  * Reschedule fees live in their own ReschedulePayment model — Payment has a
    OneToOneField to Booking, so it can't hold a second payment for the same
    booking. Both plans are idempotency-checked before any handler runs.
"""

import uuid
import logging
import threading

from datetime import datetime
from notifications.whatsapp import send_booking_confirmation, send_hospital_new_booking
from notifications.push import push_booking_confirmed, push_new_booking_to_hospital
from django.conf import settings
from django.db import transaction, IntegrityError, connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from bookings.models import Booking
from bookings.serializers import BookingSerializer
# One definition of "can this slot take another booking", shared with the
# read-only availability endpoint. See CAPACITY.md §1 for why this has to be
# enforced here and not just in the UI.
from bookings.capacity import (
    SlotUnavailable, check_slot_available, check_slot_available_locked,
    check_scan_slot_available_locked,
)
from tokenwalla.permissions import IsAdmin
# Shared, single-source-of-truth Razorpay PG helpers (see payments/razorpay_utils.py).
from payments.razorpay_utils import (
    create_order, confirm_order_paid, plan_for_amount, VALID_PLAN_AMOUNTS,
    refund_payment,
)
# Server-side fee math — the client is never trusted for booking amounts.
from payments.fees import compute_fee_breakdown, SAC_CODE, GST_RATE

logger = logging.getLogger('tokenwalla')


def _refund_unfulfillable_booking(*, payment_id, amount_inr, breakdown, reason, user_id):
    """Refund a captured payment for a booking we could not create.

    Reached only when the slot filled between checkout opening and the payment
    being captured. Nothing was written — the transaction rolled back — so the
    patient has paid for an appointment that does not exist.

    The refund is the FULL amount captured, deliberately. Everywhere else the
    gateway fee and GST are not returned, because Razorpay does not give them
    back to us on a refund — but that rule exists for a patient who chose to
    cancel. Here the patient did nothing wrong and receives no service at all,
    so TokenWalla absorbs that loss rather than passing it on. The amounts are
    small and the alternative is charging someone for our own defect.

    Recorded in the log rather than the database: Payment requires a Booking,
    and no Booking exists. Grep `oversold_refund` to reconcile against
    Razorpay.
    """
    amount = breakdown['final_amount'] if breakdown else amount_inr
    # An unknown slot already returned 400 before this change (it just kept the
    # money, which was the bug). Keep that status so installed mobile clients
    # see exactly what they saw before — only the refund is new. The genuinely
    # new conditions, full and too-soon, get 409.
    status_code = 400 if reason.reason == 'invalid_slot' else 409
    try:
        result = refund_payment(
            payment_id, amount, payment_id,
            note=f'TokenWalla: slot unavailable ({reason.reason})',
        )
        logger.error(
            'oversold_refund OK payment_id=%s amount=%s user=%s reason=%s refund_id=%s',
            payment_id, amount, user_id, reason.reason, result.get('id'),
        )
        return Response({
            'success': False,
            'refunded': True,
            'message': (
                f'{reason.message} Your payment of ₹{amount} has been refunded '
                f'in full — it should reach your account in 5–7 working days.'
            ),
        }, status=status_code)
    except Exception as exc:
        # The gateway call failed. The money is still ours and the patient has
        # nothing. This must be loud: it needs a human to refund by hand.
        logger.error(
            'oversold_refund FAILED payment_id=%s amount=%s user=%s reason=%s err=%s '
            '— REFUND THIS BY HAND IN THE RAZORPAY DASHBOARD',
            payment_id, amount, user_id, reason.reason, exc,
        )
        return Response({
            'success': False,
            'refunded': False,
            'message': (
                f'{reason.message} Your payment could not be reversed '
                f'automatically — our team has been alerted and will refund you '
                f'within 24 hours.'
            ),
        }, status=status_code)


def _serialize_breakdown(b):
    """Render a fee breakdown (Decimals) as JSON-safe strings for the receipt."""
    return {
        'doctor_fee':    str(b['doctor_fee']),
        'offline_doctor_fee': str(b.get('offline_doctor_fee', '0')),
        'collection_mode':    b.get('collection_mode', 'FULL'),
        'platform_fee':  str(b['platform_fee']),
        'gateway_fee':   str(b['gateway_fee']),
        'taxable_value': str(b['taxable_value']),
        'gst_amount':    str(b['gst_amount']),
        'final_amount':  str(b['final_amount']),
        'gst_rate':      str(b['gst_rate']),
        'sac_code':      b['sac_code'],
    }


def _idempotent_booking_response(existing):
    """Idempotent success payload for a new-booking verify that has already been
    processed for this payment_id. Used both by the up-front duplicate check and
    the race-loser path (two concurrent /verify/ calls, one wins the unique
    payment_id constraint) so both return an identical shape to the client."""
    return Response({
        'success':      True,
        'token':        existing.token,
        'queue_access': existing.queue_access,
        'booking': {
            'id':           existing.id,
            'token':        existing.token,
            'doctorName':   existing.provider_name,
            'hospital':     existing.hospital.name,
            'date':         str(existing.date),
            'slot':         existing.slot,
            'paymentId':    existing.payment_id,
            'amount':       existing.amount,
            'queue_access': existing.queue_access,
        },
    })


def _generate_token() -> str:
    """Generate a unique booking token with retry on collision."""
    for _ in range(5):
        ts    = datetime.now().strftime('%H%M%S')
        uid   = str(uuid.uuid4())[:6].upper()
        token = f'TW-{ts}-{uid}'
        if not Booking.objects.filter(token=token).exists():
            return token
    raise RuntimeError('Could not generate a unique token after 5 attempts.')


def _dispatch_booking_notifications(booking):
    """Fire WhatsApp + hospital-push alerts on a background thread.

    These are external HTTP calls (up to 10s each). Running them synchronously
    inside the verify request made the whole response take ~20s+, so the mobile
    client (25s axios timeout) — or Railway's proxy — dropped the connection and
    the patient saw "Network Error" AFTER a successful payment. Worse, when they
    lived inside transaction.atomic() a hang could roll the booking back even
    though money was taken.

    The booking is already committed by the time this runs, so both alerts are
    best-effort: any failure is logged and never surfaces to the user.
    """
    def _run():
        try:
            try:
                send_booking_confirmation(booking)
            except Exception as exc:
                logger.warning('WhatsApp confirmation send failed for booking %s: %s', booking.id, exc)
            try:
                push_booking_confirmed(booking)
            except Exception as exc:
                logger.warning('Push confirmation failed for booking %s: %s', booking.id, exc)
            try:
                send_hospital_new_booking(booking)
            except Exception as exc:
                logger.warning('WhatsApp hospital new-booking alert failed for booking %s: %s', booking.id, exc)
            try:
                push_new_booking_to_hospital(booking)
            except Exception as exc:
                logger.warning('Push new-booking alert failed for booking %s: %s', booking.id, exc)
        finally:
            # Threads get their own DB connection; close it so we don't leak.
            connection.close()

    threading.Thread(
        target=_run,
        name=f'booking-notify-{booking.id}',
        daemon=True,
    ).start()


def _notify_doctor_payout_async(batch):
    """Tell the doctor their payout was sent — background thread, same contract
    as _notify_booking_async: the PayoutBatch is already committed, so a failed
    or slow WhatsApp call is logged and never surfaces to the admin.
    """
    from notifications.push import push_payout_to_hospital
    from notifications.whatsapp import send_doctor_payout_paid

    def _run():
        try:
            # Hospital first: it's a push (fast, no external approval), and for a
            # salaried doctor the money lands in the hospital's account anyway.
            push_payout_to_hospital(batch)
        except Exception as exc:
            logger.warning('Hospital payout push failed for batch %s: %s', batch.id, exc)
        try:
            send_doctor_payout_paid(batch)
        except Exception as exc:
            logger.warning('Doctor payout WhatsApp failed for batch %s: %s', batch.id, exc)
        finally:
            connection.close()

    threading.Thread(
        target=_run,
        name=f'payout-notify-{batch.id}',
        daemon=True,
    ).start()


# ─────────────────────────────────────────────────────────────────────────────
# CreateOrderView  — full-fee booking orders + the ₹5 reschedule fee
# ─────────────────────────────────────────────────────────────────────────────

class CreateOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def _customer(self, request):
        """Razorpay customer_details for the logged-in user."""
        return {
            'id':    request.user.id,
            'phone': getattr(request.user, 'mobile', '') or '',
            'name':  request.user.first_name or request.user.username,
        }

    def post(self, request):
        # ── New-booking checkout: the FULL patient bill is computed server-side
        #    from the doctor's consultation fee. The client sends only doctorId
        #    and is never trusted for the amount. ───────────────────────────────
        doctor_id = request.data.get('doctorId') or request.data.get('doctor_id')
        if doctor_id:
            return self._create_booking_order(request, doctor_id)

        # Scan checkout. A separate branch, not a widened one: the doctor path
        # is live and carrying real money, and every installed app build sends
        # doctorId. Nothing above this line changes shape.
        scan_id = request.data.get('scanId') or request.data.get('scan_id')
        if scan_id:
            return self._create_scan_order(request, scan_id)

        # ── Fixed-amount plan (the ₹5 reschedule fee) ─────────────────────────
        #    The client sends `amount` in RUPEES now (Razorpay's unit), not paise.
        plan_info = plan_for_amount(request.data.get('amount', 0))
        if plan_info is None:
            allowed = [str(a) for a in VALID_PLAN_AMOUNTS]
            return Response(
                {'message': f'Invalid amount. Allowed values (₹): {allowed}'},
                status=400,
            )

        order_id = f'tw_{uuid.uuid4().hex}'
        try:
            order = create_order(
                order_id=order_id,
                amount_rupees=plan_info['fee'],
                customer=self._customer(request),
                tags={'user_id': str(request.user.id), 'plan': plan_info['plan']},
            )
        except Exception as exc:
            logger.error('Razorpay order creation failed: %s', exc)
            return Response({'message': 'Payment gateway error. Try again.'}, status=502)

        return Response({
            'order_id':  order['order_id'],
            'key':       order['key'],
            'amount':    str(plan_info['fee']),
            'currency':  'INR',
        })

    def _create_scan_order(self, request, scan_id):
        """Create a Razorpay order for a scan booking.

        Deliberately mirrors _create_booking_order — same slot pre-check, same
        fee engine, same tag-binding discipline — because the two must not be
        able to drift.

        BOTH collection modes are live, and a centre chooses per scan exactly
        as a doctor chooses per doctor. `fees.py` therefore treats a scan price
        the same way it treats a consultation fee: the provider's fee is
        GST-exempt and GST applies only to (platform + gateway). That is a
        deliberate decision to price a diagnostic service identically to a
        consultation — confirm it with the CA, because if a scan price is
        taxable the correction is in fees.py and applies to every FULL scan
        sold from here on.

        FULL means we hold the centre's money until payout, so the centre must
        have payout details on file — see payout_utils.ledger_owner.
        """
        from scans.models import Scan
        from hospitals.models import Hospital

        try:
            scan = Scan.objects.select_related('center').get(pk=scan_id)
        except (Scan.DoesNotExist, ValueError, TypeError):
            return Response({'message': 'Scan not found.'}, status=404)

        if scan.center.kind != Hospital.SCAN_CENTER:
            # The whole flow assumes the owner is a centre. Refuse rather than
            # take money against a row that cannot be served.
            return Response({'message': 'This scan is not bookable.'}, status=400)

        if not scan.available:
            return Response({'message': 'This scan is not available right now.'}, status=409)

        date_val = str(request.data.get('date', '') or '').strip()
        slot_val = str(request.data.get('slot', '') or '').strip()
        if date_val and slot_val:
            try:
                check_slot_available(scan, date_val, slot_val)
            except SlotUnavailable as exc:
                return Response({'message': exc.message}, status=409)

        collection_mode = scan.payment_collection_mode
        breakdown = compute_fee_breakdown(scan.price, collection_mode)
        order_id  = f'tw_{uuid.uuid4().hex}'
        try:
            order = create_order(
                order_id=order_id,
                amount_rupees=breakdown['final_amount'],
                customer=self._customer(request),
                tags={
                    'user_id':  str(request.user.id),
                    'plan':     'booking',
                    'scan_id':  str(scan.id),
                    # Reuses the `doctor_fee` tag key on purpose: verify already
                    # rebuilds the split from it, and a second key would mean a
                    # second code path through the most safety-critical
                    # arithmetic in the system. It holds the provider's fee —
                    # here, the scan price.
                    'doctor_fee': str(scan.price),
                    'collection_mode': collection_mode,
                },
            )
        except Exception as exc:
            logger.error('Razorpay scan-order creation failed: %s', exc)
            return Response({'message': 'Payment gateway error. Try again.'}, status=502)

        return Response({
            'order_id':  order['order_id'],
            'key':       order['key'],
            'amount':    str(breakdown['final_amount']),
            'currency':  'INR',
            'breakdown': _serialize_breakdown(breakdown),
        })

    def _create_booking_order(self, request, doctor_id):
        """Create a Razorpay order for the full patient bill of a new booking.

        Amount = doctor_fee + platform + gateway + GST, computed from the
        doctor's fee. The component split is returned so checkout can render an
        itemised receipt, and the quoted doctor_fee is stored in the order
        tags so verify can rebuild the exact same split and match the paid sum.
        """
        from doctors.models import Doctor
        try:
            doctor = Doctor.objects.get(pk=doctor_id)
        except (Doctor.DoesNotExist, ValueError, TypeError):
            return Response({'message': 'Doctor not found.'}, status=404)

        # Reject a full or expired slot BEFORE any money moves. `date`/`slot`
        # are optional so older clients (the mobile app ships on its own
        # release cycle) keep working unchanged — they just fall through to the
        # after-capture backstop in _handle_new_booking, which refunds. Sending
        # them turns nearly every collision into a clean "slot full" message
        # with no payment involved.
        date_val = str(request.data.get('date', '') or '').strip()
        slot_val = str(request.data.get('slot', '') or '').strip()
        if date_val and slot_val:
            try:
                check_slot_available(doctor, date_val, slot_val)
            except SlotUnavailable as exc:
                return Response({'message': exc.message}, status=409)

        collection_mode = doctor.payment_collection_mode
        breakdown = compute_fee_breakdown(doctor.fee, collection_mode)
        order_id  = f'tw_{uuid.uuid4().hex}'
        try:
            order = create_order(
                order_id=order_id,
                amount_rupees=breakdown['final_amount'],
                customer=self._customer(request),
                tags={
                    'user_id':    str(request.user.id),
                    'plan':       'booking',
                    'doctor_id':  str(doctor.id),
                    # The full consultation fee (verify re-derives the online vs
                    # offline split from `collection_mode`, so store the raw fee).
                    'doctor_fee': str(doctor.fee),
                    'collection_mode': collection_mode,
                },
            )
        except Exception as exc:
            logger.error('Razorpay booking-order creation failed: %s', exc)
            return Response({'message': 'Payment gateway error. Try again.'}, status=502)

        return Response({
            'order_id':   order['order_id'],
            'key':        order['key'],
            'amount':     str(breakdown['final_amount']),
            'currency':   'INR',
            'breakdown':  _serialize_breakdown(breakdown),
        })


# ─────────────────────────────────────────────────────────────────────────────
# VerifyPaymentView  — routes to new-booking or reschedule handler
# ─────────────────────────────────────────────────────────────────────────────

class VerifyPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Razorpay contract: the client sends only the order_id it checked out
        # with. The server confirms the payment with Razorpay — there is no
        # client-returned signature to trust.
        order_id = str(request.data.get('order_id', '') or '').strip()
        # 'booking' dict carries context for BOTH plans:
        #   new booking  → { doctorId, date, slot }
        #   reschedule   → { bookingId / booking_id, date, slot }
        booking_data = request.data.get('booking', {})

        if not order_id:
            return Response({'success': False, 'message': 'Missing order_id.'}, status=400)

        # ── 1. Confirm the payment with Razorpay (server-side) ────────────────
        try:
            paid, payment_ref, amount_rupees, tags = confirm_order_paid(order_id)
        except Exception as exc:
            logger.error('Failed to confirm Razorpay order %s: %s', order_id, exc)
            return Response({'success': False,
                             'message': 'Could not verify order with the payment gateway.'}, status=502)

        if not paid:
            logger.warning('Razorpay order %s is not PAID — verify rejected.', order_id)
            return Response({'success': False, 'message': 'Payment not completed.'}, status=400)

        # payment_ref (cf_payment_id) is the idempotency key everywhere the old
        # razorpay_payment_id was used. There is no signature under Razorpay.
        payment_id = payment_ref
        order_plan = tags.get('plan')
        plan_info  = plan_for_amount(amount_rupees)

        # New full-fee bookings carry plan='booking' in the order tags and a
        # dynamic amount. The ₹5 reschedule fee is the one remaining
        # fixed-amount plan, resolved by rupee amount.
        if order_plan == 'booking':
            effective_plan = 'booking'
        elif plan_info:
            effective_plan = plan_info['plan']
        else:
            logger.error('Unrecognised order %s: ₹%s, plan=%s', order_id, amount_rupees, order_plan)
            return Response({'success': False, 'message': 'Invalid payment amount.'}, status=400)

        # ── 2. Bind the redemption to the order that was actually paid ───────
        #    The order_tags are written server-side at create-order time and are
        #    the ONLY trustworthy record of who paid and what for. The client
        #    re-sends its own `booking` context on verify, so it must be checked
        #    against the tags, never trusted on its own: otherwise a patient
        #    could pay a ₹200 doctor's bill and redeem it against a ₹2000
        #    doctor, who would then be ledgered a payout out of someone else's
        #    consultation fee. Same for the payer — a leaked order_id must not
        #    be redeemable by a different account.
        tag_user = str(tags.get('user_id') or '')
        if tag_user and tag_user != str(request.user.id):
            logger.error('Order %s was paid by user %s; user %s tried to redeem it.',
                         order_id, tag_user, request.user.id)
            return Response({'success': False,
                             'message': 'This payment belongs to another account.'}, status=403)

        # ── 3. Idempotency — prevent duplicate processing for all plans ───────
        #    For new bookings:  check if a Booking already has this payment_id.
        #    For reschedules:   check if a ReschedulePayment already has it.
        if effective_plan == 'reschedule':
            from payments.models import ReschedulePayment
            if ReschedulePayment.objects.filter(payment_id=payment_id).exists():
                logger.warning('Duplicate reschedule verify attempt for payment_id %s', payment_id)
                # Find the affected booking and return its current state
                rp      = ReschedulePayment.objects.select_related('booking').get(payment_id=payment_id)
                booking = rp.booking
                return Response({
                    'success': True,
                    'message': 'Already rescheduled.',
                    'booking': {
                        'id':           booking.id,
                        'token':        booking.token,
                        'doctorName':   booking.provider_name,
                        'hospital':     booking.hospital.name,
                        'date':         str(booking.date),
                        'slot':         booking.slot,
                        'paymentId':    payment_id,
                        'amount':       plan_info['fee'],
                        'queue_access': booking.queue_access,
                    },
                })
        else:
            existing = (Booking.objects
                        .select_related('doctor', 'hospital')
                        .filter(payment_id=payment_id).first())
            if existing:
                logger.warning('Duplicate verify attempt for payment_id %s', payment_id)
                return _idempotent_booking_response(existing)

        # ── 4. Route to the correct handler ───────────────────────────────────
        if effective_plan == 'reschedule':
            return self._handle_reschedule(request, booking_data, payment_id, order_id, plan_info)

        # Everything else is a full-fee booking ('reschedule' returned above).
        # The doctor is whoever the ORDER was priced for — not whoever the
        # client names now. Reject a mismatch outright (rather than silently
        # substituting) so the patient isn't handed a booking with a doctor
        # they didn't choose, and pin doctorId to the tag either way.
        tag_doctor = str(tags.get('doctor_id') or '')
        claimed    = str(booking_data.get('doctorId') or '')
        if tag_doctor:
            if claimed and claimed != tag_doctor:
                logger.error('Order %s was paid for doctor %s but redeemed against %s.',
                             order_id, tag_doctor, claimed)
                return Response({'success': False,
                                 'message': 'Payment does not match the selected doctor.'},
                                status=400)
            booking_data = {**booking_data, 'doctorId': tag_doctor}

        # Same binding for a scan, and the same reason: the provider is whoever
        # the ORDER was priced for, never whoever the client names at redemption.
        # A scan order must also never be redeemed as a doctor booking — that
        # would attach a captured payment to a provider it was not priced for.
        tag_scan     = str(tags.get('scan_id') or '')
        claimed_scan = str(booking_data.get('scanId') or '')
        if tag_scan:
            if claimed_scan and claimed_scan != tag_scan:
                logger.error('Order %s was paid for scan %s but redeemed against %s.',
                             order_id, tag_scan, claimed_scan)
                return Response({'success': False,
                                 'message': 'Payment does not match the selected scan.'},
                                status=400)
            booking_data = {**booking_data, 'scanId': tag_scan, 'doctorId': None}
        elif claimed_scan:
            logger.error('Order %s carries no scan tag but was redeemed as scan %s.',
                         order_id, claimed_scan)
            return Response({'success': False,
                             'message': 'Payment does not match the selected scan.'},
                            status=400)

        breakdown = compute_fee_breakdown(
            tags.get('doctor_fee') or 0,
            tags.get('collection_mode') or 'FULL',
        )
        # The amount actually captured must match the split we computed —
        # otherwise the doctor's fee changed mid-checkout or the amount was
        # tampered with. Reject rather than store an inconsistent Payment.
        # Both sides are 2dp rupee Decimals, so this is an exact comparison.
        if breakdown['final_amount'] != amount_rupees:
            logger.error('Booking amount mismatch order %s: paid ₹%s vs computed ₹%s',
                         order_id, amount_rupees, breakdown['final_amount'])
            return Response({'success': False, 'message': 'Payment amount mismatch.'}, status=400)

        return self._handle_new_booking(
            request, booking_data, payment_id, order_id,
            amount_inr=int(round(float(breakdown['final_amount']))),
            # Every booking now includes live queue access — it's part of the
            # service fee, not a separate ₹15 upgrade any more.
            queue_access=True, breakdown=breakdown,
        )

    # ── Handler: new appointment booking ─────────────────────────────────────

    def _handle_new_booking(self, request, booking_data, payment_id, order_id,
                            amount_inr, queue_access, breakdown):
        from doctors.models import Doctor
        from payments.models import Payment
        from scans.models import Scan

        # One handler for both providers. Duplicating it would mean two copies
        # of the capacity backstop, the refund-on-failure path and the
        # idempotency guards — the three things in this file that most need to
        # stay identical.
        doctor_id = booking_data.get('doctorId')
        scan_id   = booking_data.get('scanId')
        if not doctor_id and not scan_id:
            return Response({'success': False, 'message': 'doctorId is required.'}, status=400)

        date_val = booking_data.get('date', '').strip()
        slot_val = booking_data.get('slot', '').strip()
        if not date_val or not slot_val:
            return Response({'success': False, 'message': 'Date and slot are required.'}, status=400)

        is_scan = bool(scan_id)
        try:
            if is_scan:
                provider = Scan.objects.select_related('center').get(pk=scan_id)
                hospital = provider.center
            else:
                provider = Doctor.objects.select_related('hospital').get(pk=doctor_id)
                hospital = provider.hospital
        except (Doctor.DoesNotExist, Scan.DoesNotExist):
            return Response({'success': False,
                             'message': 'Scan not found.' if is_scan else 'Doctor not found.'},
                            status=404)

        # "Book for someone else" — optional beneficiary details. Blank ⇒ self.
        booked_for_name   = str(booking_data.get('bookedForName', '')   or '').strip()[:100]
        booked_for_mobile = str(booking_data.get('bookedForMobile', '') or '').strip()[:15]
        # A mobile with no name is meaningless — treat it as booking for self.
        if not booked_for_name:
            booked_for_mobile = ''

        try:
            with transaction.atomic():
                # Capacity backstop. The money is already captured by the time
                # we get here, so this is the last line of defence against
                # overselling a slot — and the only one that survives a race.
                # Re-fetches the doctor under a row lock; see
                # bookings/capacity.py for why the lock is on the doctor and
                # not on the booking rows. Raising rolls this block back before
                # anything is created, and the handler below refunds.
                if is_scan:
                    provider = check_scan_slot_available_locked(provider.id, date_val, slot_val)
                    hospital = provider.center
                else:
                    provider = check_slot_available_locked(provider.id, date_val, slot_val)
                    hospital = provider.hospital

                token = _generate_token()

                new_booking = Booking.objects.create(
                    user         = request.user,
                    doctor       = None if is_scan else provider,
                    scan         = provider if is_scan else None,
                    hospital     = hospital,
                    date         = date_val,
                    slot         = slot_val,
                    token        = token,
                    payment_id   = payment_id,
                    order_id     = order_id,
                    amount       = amount_inr,
                    status       = 'CONFIRMED',
                    queue_access = queue_access,
                    booked_for_name   = booked_for_name,
                    booked_for_mobile = booked_for_mobile,
                )

                # Payment has a OneToOneField → booking, so one record per booking.
                # Store the exact component split for a full-fee booking; a legacy
                # flat booking (breakdown=None) records only the total.
                payment_kwargs = dict(
                    booking    = new_booking,
                    order_id   = order_id,
                    payment_id = payment_id,
                    amount     = amount_inr,
                    status     = Payment.PAID,
                )
                if breakdown is not None:
                    payment_kwargs.update(
                        doctor_fee   = breakdown['doctor_fee'],
                        offline_doctor_fee = breakdown.get('offline_doctor_fee', 0),
                        platform_fee = breakdown['platform_fee'],
                        gateway_fee  = breakdown['gateway_fee'],
                        gst_amount   = breakdown['gst_amount'],
                        final_amount = breakdown['final_amount'],
                    )
                else:
                    payment_kwargs['final_amount'] = amount_inr
                Payment.objects.create(**payment_kwargs)

            # Notifications fire only AFTER the booking + payment are durably
            # committed, and on a background thread so slow external APIs
            # (WhatsApp/push, up to 10s each) never delay this response or roll
            # the booking back. Fixes the "Network Error after payment" timeout.
            _dispatch_booking_notifications(new_booking)

            logger.info(
                'Booking %s created for user %s %s %s',
                new_booking.id, request.user.id,
                'scan' if is_scan else 'doctor', provider.id,
            )

            return Response({
                'success':      True,
                'token':        token,
                'queue_access': queue_access,
                'booking': {
                    'id':           new_booking.id,
                    'token':        token,
                    # Key kept for the installed app builds, which read
                    # doctorName. For a scan it carries the scan's name —
                    # mislabelled but legible, the same choice made in
                    # BookingViewSet._serialize_booking.
                    'doctorName':   provider.name,
                    'providerName': provider.name,
                    'providerKind': 'SCAN' if is_scan else 'DOCTOR',
                    'hospital':     hospital.name,
                    'date':         str(new_booking.date),
                    'slot':         new_booking.slot,
                    'paymentId':    payment_id,
                    'amount':       amount_inr,
                    'queue_access': queue_access,
                    'patientName':      new_booking.patient_display_name,
                    'bookedForName':    booked_for_name,
                    'bookedForMobile':  booked_for_mobile,
                    # Itemised fee split for the receipt (None for legacy flat bookings).
                    'breakdown':        _serialize_breakdown(breakdown) if breakdown else None,
                },
            })

        except SlotUnavailable as exc:
            # We took the patient's money and cannot give them the appointment.
            # Nothing was created (the atomic block rolled back), so refund and
            # say so plainly. Must be caught before the generic handler below.
            return _refund_unfulfillable_booking(
                payment_id=payment_id,
                amount_inr=amount_inr,
                breakdown=breakdown,
                reason=exc,
                user_id=request.user.id,
            )
        except IntegrityError as exc:
            # Most likely cause: a concurrent /verify/ for the SAME payment_id
            # won the race and already committed a Booking + Payment (the unique
            # payment_id constraint rolled this one back). That's not an error —
            # serve the booking the other request created, idempotently.
            existing = (Booking.objects
                        .select_related('doctor', 'hospital')
                        .filter(payment_id=payment_id).first())
            if existing:
                logger.info('Concurrent duplicate verify for payment_id %s — '
                            'returning already-created booking %s.',
                            payment_id, existing.id)
                return _idempotent_booking_response(existing)
            logger.error('Booking IntegrityError: %s', exc)
            return Response({'success': False, 'message': 'Booking conflict. Please try again.'}, status=409)
        except RuntimeError as exc:
            logger.error('Token generation failed: %s', exc)
            return Response({'success': False, 'message': 'Could not generate token.'}, status=500)
        except Exception as exc:
            logger.exception('Unexpected error in _handle_new_booking: %s', exc)
            return Response({'success': False, 'message': 'Internal error.'}, status=500)

    # ── Handler: reschedule an existing booking ───────────────────────────────

    def _handle_reschedule(self, request, booking_data, payment_id, order_id, plan_info):
        """
        Reschedule an existing 'CONFIRMED' booking after the ₹5 fee is verified.

        The mobile app sends:
            booking: { booking_id: <int>, date: "YYYY-MM-DD", slot: "HH:MM AM" }

        We accept both 'booking_id' (snake_case, preferred) and
        'bookingId' (camelCase, legacy) for compatibility.
        """
        from payments.models import ReschedulePayment

        # Accept both naming conventions from the app
        booking_id = (
            booking_data.get('booking_id')
            or booking_data.get('bookingId')
        )
        new_date = booking_data.get('date', '').strip()
        new_slot = booking_data.get('slot', '').strip()

        if not booking_id:
            return Response(
                {'success': False, 'message': 'booking_id is required for rescheduling.'},
                status=400,
            )
        if not new_date or not new_slot:
            return Response(
                {'success': False, 'message': 'New date and slot are required.'},
                status=400,
            )

        # Fetch the booking — must belong to the requesting user
        try:
            existing_booking = Booking.objects.select_related('doctor', 'hospital').get(
                pk=int(booking_id),
                user=request.user,
            )
        except (Booking.DoesNotExist, ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'Booking not found or does not belong to you.'},
                status=404,
            )

        if existing_booking.status != 'CONFIRMED':
            return Response(
                {
                    'success': False,
                    'message': f'Cannot reschedule a booking with status "{existing_booking.status}". '
                               f'Only confirmed bookings can be rescheduled.',
                },
                status=400,
            )

        # Validate the new slot against the doctor's configured slots
        doctor_slots = existing_booking.doctor.slots or []
        if new_slot not in doctor_slots:
            return Response(
                {'success': False, 'message': f'Slot "{new_slot}" is not available for this doctor.'},
                status=400,
            )

        try:
            with transaction.atomic():
                # Update the booking dates
                existing_booking.date = new_date
                existing_booking.slot = new_slot
                existing_booking.save(update_fields=['date', 'slot'])

                # Record in a separate table — Payment is OneToOne so we
                # cannot reuse it for the reschedule fee.
                ReschedulePayment.objects.create(
                    booking    = existing_booking,
                    order_id   = order_id,
                    payment_id = payment_id,
                    amount     = plan_info['fee'],   # ₹5 in INR
                    status     = 'success',
                )

            logger.info(
                'Booking %s rescheduled → %s %s by user %s (payment %s)',
                existing_booking.id, new_date, new_slot,
                request.user.id, payment_id,
            )

            return Response({
                'success': True,
                'message': f'Appointment rescheduled to {new_date} at {new_slot}.',
                'booking': {
                    'id':           existing_booking.id,
                    'token':        existing_booking.token,
                    'doctorName':   existing_booking.provider_name,
                    'hospital':     existing_booking.hospital.name,
                    'date':         new_date,
                    'slot':         new_slot,
                    'paymentId':    payment_id,
                    'amount':       plan_info['fee'],
                    'queue_access': existing_booking.queue_access,
                },
            })

        except Exception as exc:
            logger.exception('Unexpected error in _handle_reschedule: %s', exc)
            return Response({'success': False, 'message': 'Internal error during reschedule.'}, status=500)


# ─────────────────────────────────────────────────────────────────────────────
# AdminReportsView  — unchanged
# ─────────────────────────────────────────────────────────────────────────────

class AdminReportsView(APIView):
    """
    Admin-only reports endpoint.
    Returns a flat (non-paginated) response so the frontend can read
    data.total, data.completed, data.waiting, data.bookings directly.
    Limited to last 500 bookings for performance.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        all_b = (
            Booking.objects
            .all()
            .select_related('doctor', 'hospital', 'user')
            .order_by('-created')
        )

        total     = all_b.count()
        completed = all_b.filter(status='COMPLETED').count()
        waiting   = all_b.filter(status='CONFIRMED').count()

        recent   = all_b[:500]
        bookings = BookingSerializer(recent, many=True, context={'request': request}).data

        return Response({
            'total':     total,
            'completed': completed,
            'waiting':   waiting,
            'bookings':  bookings,
        })


# ─────────────────────────────────────────────────────────────────────────────
# BookingReceiptView  — GST-compliant per-booking receipt
# ─────────────────────────────────────────────────────────────────────────────

class BookingReceiptView(APIView):
    """Structured, GST-compliant receipt for a paid booking.

    Shows taxable value and GST separately, the SAC code for the taxable
    service lines, and marks the doctor consultation fee as a GST-exempt
    healthcare service. Readable by the booking's patient, the hospital's staff,
    or an admin. This is the data source for any PDF/printable receipt.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        booking = (Booking.objects
                   .select_related('doctor', 'hospital', 'user', 'payment')
                   .filter(pk=pk).first())
        if booking is None:
            return Response({'message': 'Booking not found.'}, status=404)

        # Access: owner, the booking's hospital staff, or admin.
        is_owner = booking.user_id == request.user.id
        is_admin = getattr(request.user, 'role', '') == 'admin'
        try:
            staff_hospital = int(request.user.last_name)
        except (ValueError, TypeError, AttributeError):
            staff_hospital = None
        if not (is_owner or is_admin or staff_hospital == booking.hospital_id):
            return Response({'message': 'Access denied.'}, status=403)

        payment = getattr(booking, 'payment', None)
        if payment is None:
            return Response({'message': 'No payment on this booking.'}, status=404)

        gst_pct = f'{(GST_RATE * 100).normalize()}%'
        taxable = payment.platform_fee + payment.gateway_fee
        line_items = [
            {
                'description':   'Doctor Consultation Fee',
                'sac_code':      None,
                'taxable_value': str(payment.doctor_fee),
                'gst_rate':      '0%',
                'gst_amount':    '0.00',
                'note':          'Healthcare service — GST exempt',
            },
            {
                'description':   'Platform Fee',
                'sac_code':      SAC_CODE,
                'taxable_value': str(payment.platform_fee),
                'gst_rate':      gst_pct,
                'gst_amount':    None,   # GST is charged on the combined taxable value below
            },
            {
                'description':   'Payment Gateway Fee',
                'sac_code':      SAC_CODE,
                'taxable_value': str(payment.gateway_fee),
                'gst_rate':      gst_pct,
                'gst_amount':    None,
            },
        ]

        return Response({
            'seller': {
                'name':  'TokenWalla',
                'gstin': settings.TOKENWALLA_GSTIN or None,
            },
            'receipt_no':  f'TW-{payment.id:06d}',
            'issued_at':   payment.created.strftime('%d %b %Y, %I:%M %p'),
            'payment_id':  payment.payment_id,
            'order_id':    payment.order_id,
            'status':      payment.status,
            'booking': {
                'id':        booking.id,
                'token':     booking.token,
                'doctor':    booking.provider_name,
                'hospital':  booking.hospital.name,
                'date':      str(booking.date),
                'slot':      booking.slot,
                'patient':   booking.patient_display_name,
            },
            'line_items':    line_items,
            'taxable_value': str(taxable),          # GST-taxable portion (platform + gateway)
            'gst': {
                'rate':   gst_pct,
                'amount': str(payment.gst_amount),
            },
            'total': str(payment.final_amount),
        })


# ─────────────────────────────────────────────────────────────────────────────
# Doctor payouts — MANUAL. Staff wire the money themselves (own bank account)
# and mark it paid here; there is no gateway payout API involved.
# ─────────────────────────────────────────────────────────────────────────────

def _payout_row(provider_name, hospital_name, target, pay_to, amount, *,
                doctor_id=None, center_id=None):
    """One row of the admin payouts table.

    `target` is whoever the money is actually wired to — a Doctor, the hospital
    employing them, or a scanning centre. All three carry identically named
    payout fields, which is why this function does not care which it got.

    `payee_key` exists because `doctor_id` is null on a centre row: the admin
    page needs one stable identifier to key the table and to disable the button
    it just clicked.
    """
    from decimal import Decimal, ROUND_HALF_UP
    from payments.payout_utils import choose_mode

    mode = choose_mode(target)
    return {
        'payee_key':      f'center:{center_id}' if center_id else f'doctor:{doctor_id}',
        'doctor_id':      doctor_id,
        'center_id':      center_id,
        # Kept as `doctor_name` so the existing admin table keeps rendering; for
        # a centre row it holds the centre's name, which is what that column
        # means there.
        'doctor_name':    provider_name,
        'hospital_name':  hospital_name,
        'pay_to':         pay_to,
        'recipient_name': target.account_holder_name or target.name,
        'mode':           mode,
        # Where to actually send it — staff wire this by hand, so the page has
        # to show the account, not just the rail.
        'upi_vpa':        (target.upi_vpa or '').strip() if mode == 'UPI' else '',
        'bank_name':      (target.bank_name or '').strip() if mode == 'IMPS' else '',
        'account_number': (target.bank_account_number or '').strip() if mode == 'IMPS' else '',
        'ifsc':           (target.ifsc or '').strip() if mode == 'IMPS' else '',
        'pending_amount': str(amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
    }


class PendingPayoutsView(APIView):
    """Admin-only: which providers currently have money owed to them.

    Aggregates unbatched DoctorLedger rows (earnings minus any absence-refund
    clawbacks) for BOTH payee kinds — doctors and scanning centres. Only
    positive net balances are shown: a provider whose clawbacks currently
    exceed their earnings owes nothing yet.

    The two groupings are separate `values()` queries rather than one, because a
    single grouping on both columns would emit a `(None, None)`-shaped key for
    whichever side is null and silently merge unrelated providers.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from django.db.models import Sum
        from doctors.models import Doctor
        from hospitals.models import Hospital
        from payments.models import DoctorLedger
        from payments.payout_utils import payout_target

        unbatched = DoctorLedger.objects.filter(payout_batch__isnull=True).order_by()
        rows = []

        doctor_totals = (unbatched.filter(doctor__isnull=False)
                         .values('doctor_id').annotate(pending_amount=Sum('amount')))
        for row in doctor_totals:
            amount = row['pending_amount']
            if amount is None or amount <= 0:
                continue
            doctor = (Doctor.objects.select_related('hospital')
                      .get(pk=row['doctor_id']))
            target = payout_target(doctor)
            rows.append(_payout_row(
                doctor.name,
                doctor.hospital.name if doctor.hospital_id else None,
                target,
                'hospital' if target is not doctor else 'doctor',
                amount,
                doctor_id=doctor.id,
            ))

        # A scanning centre is its own payout target: Hospital already carries
        # the payout fields, and there is no centre equivalent of a salaried
        # doctor's payout_to_hospital redirect.
        center_totals = (unbatched.filter(center__isnull=False)
                         .values('center_id').annotate(pending_amount=Sum('amount')))
        for row in center_totals:
            amount = row['pending_amount']
            if amount is None or amount <= 0:
                continue
            center = Hospital.objects.get(pk=row['center_id'])
            rows.append(_payout_row(
                center.name, None, center, 'center', amount, center_id=center.id,
            ))

        rows.sort(key=lambda r: r['doctor_name'])
        return Response({'payouts': rows})


class MarkPayoutPaidView(APIView):
    """Admin-only: record that a provider's pending balance was paid manually.

    Takes `doctor_id` OR `center_id` — a scanning centre is paid the same way a
    doctor is, from the same ledger. Locks and batches that payee's
    currently-unbatched ledger rows into one PayoutBatch(PROCESSED), and marks
    every booking behind those rows as payout-PAID. `reference` (optional) is a
    UTR / transaction note for reconciliation — nothing is sent anywhere; this
    only records that the transfer already happened outside the app.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        from decimal import Decimal
        from django.utils import timezone
        from doctors.models import Doctor
        from hospitals.models import Hospital
        from payments.models import DoctorLedger, PayoutBatch
        from payments.payout_utils import payout_target, choose_mode

        doctor_id = request.data.get('doctor_id')
        center_id = request.data.get('center_id')
        # Exactly one, mirroring the ledger's own constraint. Accepting both
        # would have to pick a winner, and picking the wrong one pays the wrong
        # account and closes out the other's ledger rows.
        if bool(doctor_id) == bool(center_id):
            return Response(
                {'message': 'Send exactly one of doctor_id or center_id.'}, status=400)

        doctor = center = None
        if doctor_id:
            try:
                doctor = Doctor.objects.select_related('hospital').get(pk=doctor_id)
            except (Doctor.DoesNotExist, ValueError, TypeError):
                return Response({'message': 'Doctor not found.'}, status=404)
            target   = payout_target(doctor)
            payee_q  = {'doctor_id': doctor.id}
            batch_kw = {'doctor': doctor}
            idem_key = f'doctor_{doctor.id}'
        else:
            try:
                center = Hospital.objects.get(pk=center_id, kind=Hospital.SCAN_CENTER)
            except (Hospital.DoesNotExist, ValueError, TypeError):
                return Response({'message': 'Scanning centre not found.'}, status=404)
            target   = center
            payee_q  = {'center_id': center.id}
            batch_kw = {'center': center}
            idem_key = f'center_{center.id}'

        reference = str(request.data.get('reference', '') or '').strip()[:100]

        with transaction.atomic():
            rows = list(
                DoctorLedger.objects
                .select_for_update()
                .filter(payout_batch__isnull=True, **payee_q)
            )
            total = sum((r.amount for r in rows), Decimal('0'))
            if not rows or total <= 0:
                return Response({'message': 'This provider has no pending payout.'}, status=400)

            mode = choose_mode(target) or PayoutBatch.OTHER
            idem = f'manual_{idem_key}_{timezone.now():%Y%m%d%H%M%S}'

            batch = PayoutBatch.objects.create(
                total_amount=total, payout_mode=mode,
                status=PayoutBatch.PROCESSED,
                razorpay_payout_id=reference,
                idempotency_key=idem,
                **batch_kw,
            )
            entry_ids = [r.id for r in rows]
            DoctorLedger.objects.filter(id__in=entry_ids).update(payout_batch=batch)

            booking_ids = [r.booking_id for r in rows if r.booking_id]
            Booking.objects.filter(id__in=booking_ids).update(
                doctor_payout_status=Booking.PAYOUT_PAID)

        logger.info('Payout batch %s: %s paid ₹%s manually (ref=%s)',
                    batch.id, batch.payee_label, total, reference or '—')

        # Tell the provider their money went out. Best-effort and off the
        # request thread: the payout is already recorded, so a slow or failing
        # Meta call must never fail the admin's "mark paid" action.
        # The FKs are attached from objects already fetched here so the
        # background thread doesn't lazy-load them on its own connection.
        batch.doctor = doctor
        batch.center = center
        _notify_doctor_payout_async(batch)

        return Response({
            'success': True,
            'batch_id': batch.id,
            'doctor_id': doctor.id if doctor else None,
            'center_id': center.id if center else None,
            'amount_paid': str(total),
        })

# ─────────────────────────────────────────────────────────────────────────────
# Daily ops summary — the one screen checked before deciding what to do today
# ─────────────────────────────────────────────────────────────────────────────

class DailyOpsSummaryView(APIView):
    """Admin-only, READ-ONLY snapshot of today: bookings, money collected,
    what's owed to doctors, and anything that needs a human.

    Payouts are manual by design, so this exists to make the daily human check
    fast — it never moves money and never writes a row. The heavy lifting is in
    payments/daily_ops.py so the numbers are testable without HTTP.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from payments.daily_ops import build_daily_summary
        return Response(build_daily_summary())
