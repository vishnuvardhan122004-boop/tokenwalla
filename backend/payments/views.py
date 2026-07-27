"""
backend/payments/views.py  — CORRECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUGS FIXED:
  1. Payment.booking is OneToOneField → creating a 2nd Payment for a reschedule
     crashes with IntegrityError.  Fixed: reschedule payments go into a NEW
     model  ReschedulePayment  (see migration note at bottom of this file).
     If you cannot add a new model yet, the fallback (update existing Payment)
     is also shown as a commented-out alternative.

  2. VALID_AMOUNTS_PAISE allowed 500 paise for "reschedule" → the same
     CreateOrderView accepted ₹5 orders but then VerifyPaymentView tried to
     create a Booking with a plan named 'reschedule', which has no doctor /
     slot data → KeyError crash.  Fixed: reschedule is routed to
     _handle_reschedule(); new-booking route only fires for 'queue_view'.

  3. _handle_reschedule() called Payment.objects.create(booking=...) which
     would violate the OneToOne constraint for any booking that already has a
     payment (every real booking does).  Fixed: uses ReschedulePayment model.

  4. Idempotency check (existing = Booking.objects.filter(payment_id=...))
     only ran for new bookings.  A retried reschedule verify would fall through
     to _handle_reschedule() and try to reschedule again.  Fixed: idempotency
     is checked first for both plans.

  5. booking_data.get('bookingId') — the mobile app sends 'booking_id'
     (snake_case) not 'bookingId'.  Fixed: read both keys.

  6. ReschedulePayment.objects.create() inside _handle_reschedule received
     `plan_info['fee']` which is ₹5 (INR), but Payment.amount stores INR
     integers so that is correct; noted explicitly for clarity.

MIGRATION NOTE:
  After dropping this file, run:
      python manage.py makemigrations payments
      python manage.py migrate
  to create the ReschedulePayment table.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import uuid
import logging
import threading

from datetime import datetime
from notifications.whatsapp import send_booking_confirmation, send_hospital_new_booking
from notifications.push import push_new_booking_to_hospital
from django.conf import settings
from django.db import transaction, IntegrityError, connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from bookings.models import Booking
from bookings.serializers import BookingSerializer
from tokenwalla.permissions import IsAdmin
# Shared, single-source-of-truth Razorpay helpers (see payments/razorpay_utils.py).
from payments.razorpay_utils import VALID_AMOUNTS_PAISE, verify_signature, get_client
# Server-side fee math — the client is never trusted for booking amounts.
from payments.fees import compute_fee_breakdown, to_paise, SAC_CODE, GST_RATE

logger = logging.getLogger('tokenwalla')


def _serialize_breakdown(b):
    """Render a fee breakdown (Decimals) as JSON-safe strings for the receipt."""
    return {
        'doctor_fee':    str(b['doctor_fee']),
        'platform_fee':  str(b['platform_fee']),
        'gateway_fee':   str(b['gateway_fee']),
        'taxable_value': str(b['taxable_value']),
        'gst_amount':    str(b['gst_amount']),
        'final_amount':  str(b['final_amount']),
        'gst_rate':      str(b['gst_rate']),
        'sac_code':      b['sac_code'],
    }


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


# ─────────────────────────────────────────────────────────────────────────────
# CreateOrderView  — full-fee booking orders + legacy fixed-amount plans
# ─────────────────────────────────────────────────────────────────────────────

class CreateOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ── New-booking checkout: the FULL patient bill is computed server-side
        #    from the doctor's consultation fee. The client sends only doctorId
        #    and is never trusted for the amount. ───────────────────────────────
        doctor_id = request.data.get('doctorId') or request.data.get('doctor_id')
        if doctor_id:
            return self._create_booking_order(request, doctor_id)

        # ── Legacy fixed-amount plans (₹5 reschedule / ₹15 queue upgrade) ──────
        try:
            amount_paise = int(request.data.get('amount', 0))
        except (ValueError, TypeError):
            return Response({'message': 'Invalid amount.'}, status=400)

        if amount_paise not in VALID_AMOUNTS_PAISE:
            return Response(
                {'message': f'Invalid amount. Allowed values (paise): {list(VALID_AMOUNTS_PAISE.keys())}'},
                status=400,
            )

        try:
            order = get_client().order.create({
                'amount':          amount_paise,
                'currency':        'INR',
                'payment_capture': 1,
                'notes': {
                    'user_id': str(request.user.id),
                    'plan':    VALID_AMOUNTS_PAISE[amount_paise]['plan'],
                },
            })
            return Response({
                'order_id': order['id'],
                'amount':   order['amount'],
                'currency': order['currency'],
                # Return the public key so the frontend checkout ALWAYS uses the
                # same key (mode) the order was created with. Prevents test/live
                # mismatch — the order and checkout must be in the same mode.
                'key_id':   settings.RAZORPAY_KEY_ID,
            })
        except Exception as exc:
            logger.error('Razorpay order creation failed: %s', exc)
            return Response({'message': 'Payment gateway error. Try again.'}, status=502)

    def _create_booking_order(self, request, doctor_id):
        """Create a Razorpay order for the full patient bill of a new booking.

        Amount = doctor_fee + platform + gateway + GST, computed from the
        doctor's fee. The component split is returned so checkout can render an
        itemised receipt, and the quoted doctor_fee is stored in the order
        notes so verify can rebuild the exact same split and match the paid sum.
        """
        from doctors.models import Doctor
        try:
            doctor = Doctor.objects.get(pk=doctor_id)
        except (Doctor.DoesNotExist, ValueError, TypeError):
            return Response({'message': 'Doctor not found.'}, status=404)

        breakdown    = compute_fee_breakdown(doctor.fee)
        amount_paise = to_paise(breakdown['final_amount'])
        try:
            order = get_client().order.create({
                'amount':          amount_paise,
                'currency':        'INR',
                'payment_capture': 1,
                'notes': {
                    'user_id':    str(request.user.id),
                    'plan':       'booking',
                    'doctor_id':  str(doctor.id),
                    'doctor_fee': str(breakdown['doctor_fee']),
                },
            })
        except Exception as exc:
            logger.error('Razorpay booking-order creation failed: %s', exc)
            return Response({'message': 'Payment gateway error. Try again.'}, status=502)

        return Response({
            'order_id':  order['id'],
            'amount':    order['amount'],
            'currency':  order['currency'],
            'key_id':    settings.RAZORPAY_KEY_ID,
            'breakdown': _serialize_breakdown(breakdown),
        })


# ─────────────────────────────────────────────────────────────────────────────
# VerifyPaymentView  — routes to new-booking or reschedule handler
# ─────────────────────────────────────────────────────────────────────────────

class VerifyPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        order_id   = request.data.get('razorpay_order_id',   '').strip()
        payment_id = request.data.get('razorpay_payment_id', '').strip()
        sig        = request.data.get('razorpay_signature',  '').strip()
        # 'booking' dict carries context for BOTH plans:
        #   new booking  → { doctorId, date, slot }
        #   reschedule   → { bookingId / booking_id, date, slot }
        booking_data = request.data.get('booking', {})

        if not all([order_id, payment_id, sig]):
            return Response({'success': False, 'message': 'Missing payment fields.'}, status=400)

        # ── 1. Signature verification (always first) ──────────────────────────
        if not verify_signature(order_id, payment_id, sig):
            logger.warning('Invalid Razorpay signature for order %s', order_id)
            return Response({'success': False, 'message': 'Invalid payment signature.'}, status=400)

        # ── 2. Fetch & validate order from Razorpay ───────────────────────────
        try:
            order_details = get_client().order.fetch(order_id)
        except Exception as exc:
            logger.error('Failed to fetch Razorpay order %s: %s', order_id, exc)
            return Response({'success': False, 'message': 'Could not verify order with Razorpay.'}, status=502)

        amount_paise = int(order_details.get('amount', 0))
        notes        = order_details.get('notes', {}) or {}
        order_plan   = notes.get('plan')
        plan_info    = VALID_AMOUNTS_PAISE.get(amount_paise)

        # New full-fee bookings carry plan='booking' in the order notes and a
        # dynamic amount (not in VALID_AMOUNTS_PAISE). Legacy fixed-amount plans
        # ('reschedule', or the old ₹15 'queue_view' booking) are still resolved
        # by amount so older deployed clients keep working unchanged.
        if order_plan == 'booking':
            effective_plan = 'booking'
        elif plan_info:
            effective_plan = plan_info['plan']
        else:
            logger.error('Unrecognised order %s: %s paise, plan=%s', order_id, amount_paise, order_plan)
            return Response({'success': False, 'message': 'Invalid payment amount.'}, status=400)

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
                        'doctorName':   booking.doctor.name,
                        'hospital':     booking.hospital.name,
                        'date':         str(booking.date),
                        'slot':         booking.slot,
                        'paymentId':    payment_id,
                        'amount':       plan_info['fee'],
                        'queue_access': booking.queue_access,
                    },
                })
        else:
            existing = Booking.objects.filter(payment_id=payment_id).first()
            if existing:
                logger.warning('Duplicate verify attempt for payment_id %s', payment_id)
                return Response({
                    'success':      True,
                    'token':        existing.token,
                    'queue_access': existing.queue_access,
                    'booking': {
                        'id':           existing.id,
                        'token':        existing.token,
                        'doctorName':   existing.doctor.name,
                        'hospital':     existing.hospital.name,
                        'date':         str(existing.date),
                        'slot':         existing.slot,
                        'paymentId':    existing.payment_id,
                        'amount':       existing.amount,
                        'queue_access': existing.queue_access,
                    },
                })

        # ── 4. Route to the correct handler ───────────────────────────────────
        if effective_plan == 'reschedule':
            return self._handle_reschedule(request, booking_data, payment_id, order_id, sig, plan_info)

        # New full-fee booking, or legacy flat ₹15 'queue_view' booking.
        if effective_plan == 'booking':
            breakdown = compute_fee_breakdown(notes.get('doctor_fee') or 0)
            # The amount actually captured must match the split we computed —
            # otherwise the doctor's fee changed mid-checkout or the amount was
            # tampered with. Reject rather than store an inconsistent Payment.
            if to_paise(breakdown['final_amount']) != amount_paise:
                logger.error('Booking amount mismatch order %s: paid %s vs computed %s',
                             order_id, amount_paise, to_paise(breakdown['final_amount']))
                return Response({'success': False, 'message': 'Payment amount mismatch.'}, status=400)
            amount_inr   = int(round(float(breakdown['final_amount'])))
            queue_access = True
        else:  # legacy 'queue_view'
            breakdown    = None
            amount_inr   = plan_info['fee']
            queue_access = plan_info['queue_access']

        return self._handle_new_booking(
            request, booking_data, payment_id, order_id, sig,
            amount_inr=amount_inr, queue_access=queue_access, breakdown=breakdown,
        )

    # ── Handler: new appointment booking ─────────────────────────────────────

    def _handle_new_booking(self, request, booking_data, payment_id, order_id, sig,
                            amount_inr, queue_access, breakdown):
        from doctors.models import Doctor
        from payments.models import Payment

        doctor_id = booking_data.get('doctorId')
        if not doctor_id:
            return Response({'success': False, 'message': 'doctorId is required.'}, status=400)

        date_val = booking_data.get('date', '').strip()
        slot_val = booking_data.get('slot', '').strip()
        if not date_val or not slot_val:
            return Response({'success': False, 'message': 'Date and slot are required.'}, status=400)

        try:
            doctor   = Doctor.objects.select_related('hospital').get(pk=doctor_id)
            hospital = doctor.hospital
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=404)

        if slot_val not in (doctor.slots or []):
            return Response({'success': False, 'message': 'Invalid slot for this doctor.'}, status=400)

        # "Book for someone else" — optional beneficiary details. Blank ⇒ self.
        booked_for_name   = str(booking_data.get('bookedForName', '')   or '').strip()[:100]
        booked_for_mobile = str(booking_data.get('bookedForMobile', '') or '').strip()[:15]
        # A mobile with no name is meaningless — treat it as booking for self.
        if not booked_for_name:
            booked_for_mobile = ''

        try:
            with transaction.atomic():
                token = _generate_token()

                new_booking = Booking.objects.create(
                    user         = request.user,
                    doctor       = doctor,
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
                    signature  = sig,
                    amount     = amount_inr,
                    status     = Payment.PAID,
                )
                if breakdown is not None:
                    payment_kwargs.update(
                        doctor_fee   = breakdown['doctor_fee'],
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
                'Booking %s created for user %s doctor %s',
                new_booking.id, request.user.id, doctor.id,
            )

            return Response({
                'success':      True,
                'token':        token,
                'queue_access': queue_access,
                'booking': {
                    'id':           new_booking.id,
                    'token':        token,
                    'doctorName':   doctor.name,
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

        except IntegrityError as exc:
            logger.error('Booking IntegrityError: %s', exc)
            return Response({'success': False, 'message': 'Booking conflict. Please try again.'}, status=409)
        except RuntimeError as exc:
            logger.error('Token generation failed: %s', exc)
            return Response({'success': False, 'message': 'Could not generate token.'}, status=500)
        except Exception as exc:
            logger.exception('Unexpected error in _handle_new_booking: %s', exc)
            return Response({'success': False, 'message': 'Internal error.'}, status=500)

    # ── Handler: reschedule an existing booking ───────────────────────────────

    def _handle_reschedule(self, request, booking_data, payment_id, order_id, sig, plan_info):
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
                    signature  = sig,
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
                    'doctorName':   existing_booking.doctor.name,
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
        from payments.models import Payment
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
                'doctor':    booking.doctor.name,
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