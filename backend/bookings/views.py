import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.pagination import PageNumberPagination
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404

from .models import Booking
from .serializers import BookingSerializer, build_queue_map
from tokenwalla.permissions import IsAdmin, IsHospitalStaff
from payments.razorpay_utils import (
    verify_signature,
    fetch_order_amount_paise,
    QUEUE_UPGRADE_AMOUNT_PAISE,
)
from notifications.push import push_booking_in_progress

logger = logging.getLogger('tokenwalla')


class StandardPagination(PageNumberPagination):
    page_size             = 50
    page_size_query_param = 'page_size'
    max_page_size         = 200


def _get_user_hospital_id(user):
    try:
        return int(user.last_name)
    except (ValueError, TypeError, AttributeError):
        return None


# ── Patient: own bookings only ────────────────────────────────────────────────
class MyBookingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        bookings = (
            Booking.objects
            .filter(user=request.user)
            .select_related('doctor', 'hospital', 'user')
            .order_by('-created')
        )
        queue_map  = build_queue_map(bookings)
        serializer = BookingSerializer(
            bookings, many=True,
            context={'request': request, 'queue_map': queue_map}
        )
        return Response(serializer.data)


# ── Hospital: queue for own hospital only ─────────────────────────────────────
class HospitalQueueView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def get(self, request, hospital_id):
        user_hospital_id = _get_user_hospital_id(request.user)

        if user_hospital_id != int(hospital_id) and request.user.role != 'admin':
            return Response(
                {'message': 'You do not have access to this hospital queue.'},
                status=403
            )

        base = (
            Booking.objects
            .filter(hospital_id=hospital_id)
            .select_related('doctor', 'user')
        )

        return Response({
            'waiting':    BookingSerializer(
                base.filter(status='waiting').order_by('created'),
                many=True, context={'request': request}
            ).data,
            'onHold':     BookingSerializer(
                base.filter(status='held').order_by('created'),
                many=True, context={'request': request}
            ).data,
            'inProgress': BookingSerializer(
                base.filter(status='in_progress').order_by('created'),
                many=True, context={'request': request}
            ).data,
            'completed':  BookingSerializer(
                base.filter(status='completed').order_by('-created')[:50],
                many=True, context={'request': request}
            ).data,
        })


# ── Hospital: call next (hospital staff only) ─────────────────────────────────
class CallNextView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking          = get_object_or_404(Booking, pk=pk)
        user_hospital_id = _get_user_hospital_id(request.user)

        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        if booking.status != 'waiting':
            return Response(
                {'message': f'Cannot call a booking with status "{booking.status}".'},
                status=400
            )

        booking.status = 'in_progress'
        booking.save(update_fields=['status'])
        logger.info('Booking %s called by hospital %s', pk, user_hospital_id)
        push_booking_in_progress(booking)  # patient "you're next" alert
        return Response(BookingSerializer(booking, context={'request': request}).data)


# ── Hospital: complete booking (hospital staff only) ──────────────────────────
class CompleteBookingView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking          = get_object_or_404(Booking, pk=pk)
        user_hospital_id = _get_user_hospital_id(request.user)

        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        if booking.status not in ('waiting', 'in_progress'):
            return Response(
                {'message': f'Cannot complete a booking with status "{booking.status}".'},
                status=400
            )

        booking.status = 'completed'
        booking.save(update_fields=['status'])
        logger.info('Booking %s completed by hospital %s', pk, user_hospital_id)
        return Response(BookingSerializer(booking, context={'request': request}).data)


# ── Hospital: mark no-show (hospital staff only) ─────────────────────────────
class NoShowView(APIView):
    """
    Patient never turned up — drop them from the queue without completing.

    Distinct from CancelBookingView, which is the patient cancelling their own
    booking (it filters on user=request.user, so hospital staff get a 404 there).
    Recorded as 'cancelled'; there is no separate no-show status yet.
    """
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking          = get_object_or_404(Booking, pk=pk)
        user_hospital_id = _get_user_hospital_id(request.user)

        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        if booking.status not in ('waiting', 'in_progress'):
            return Response(
                {'message': f'Cannot mark a booking with status "{booking.status}" as no-show.'},
                status=400
            )

        booking.status = 'cancelled'
        booking.save(update_fields=['status'])
        logger.info('Booking %s marked no-show by hospital %s', pk, user_hospital_id)
        return Response(BookingSerializer(booking, context={'request': request}).data)


# ── Hospital: hold / resume a waiting patient (hospital staff only) ───────────
class HoldBookingView(APIView):
    """
    Toggle a patient between the active queue and 'On Hold'.

    Use when a waiting patient isn't ready (stepped out) — Hold skips them so
    staff can call the next person, without cancelling the booking. Resume puts
    them back in the waiting line. This is NOT a no-show (which cancels).
        waiting -> held   (hold / skip)
        held    -> waiting (resume)
    """
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking          = get_object_or_404(Booking, pk=pk)
        user_hospital_id = _get_user_hospital_id(request.user)

        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        if booking.status == 'waiting':
            booking.status = 'held'
        elif booking.status == 'held':
            booking.status = 'waiting'
        else:
            return Response(
                {'message': f'Cannot hold/resume a booking with status "{booking.status}".'},
                status=400
            )

        booking.save(update_fields=['status'])
        logger.info('Booking %s set to %s by hospital %s', pk, booking.status, user_hospital_id)
        return Response(BookingSerializer(booking, context={'request': request}).data)


# ── Admin: all bookings (admin only) ─────────────────────────────────────────
class AllBookingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        paginator = StandardPagination()
        qs = (
            Booking.objects
            .all()
            .select_related('doctor', 'hospital', 'user')
            .order_by('-created')
        )
        page       = paginator.paginate_queryset(qs, request)
        serializer = BookingSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


# ── Upgrade queue access ──────────────────────────────────────────────────────
class UpgradeQueueAccessView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk, user=request.user)

        if booking.queue_access:
            return Response({'message': 'Queue access already active.'}, status=400)

        # ── Verify the payment BEFORE unlocking the paid feature ──────────────
        # Previously this endpoint trusted a client-supplied `payment_id` string
        # with no verification, so any user could unlock queue access for free.
        # We now require the full Razorpay handshake and validate it exactly like
        # payments.VerifyPaymentView: HMAC signature + server-side amount check.
        order_id   = request.data.get('razorpay_order_id',   '').strip()
        payment_id = request.data.get('razorpay_payment_id', '').strip()
        sig        = request.data.get('razorpay_signature',  '').strip()

        if not all([order_id, payment_id, sig]):
            return Response(
                {'message': 'razorpay_order_id, razorpay_payment_id and '
                            'razorpay_signature are required to upgrade queue access.'},
                status=400,
            )

        if not verify_signature(order_id, payment_id, sig):
            logger.warning('Invalid Razorpay signature on queue upgrade for booking %s', pk)
            return Response({'message': 'Invalid payment signature.'}, status=400)

        # Confirm the order with Razorpay and that it was paid for the right amount.
        try:
            amount_paise = fetch_order_amount_paise(order_id)
        except Exception as exc:
            logger.error('Queue upgrade: failed to fetch Razorpay order %s: %s', order_id, exc)
            return Response({'message': 'Could not verify order with Razorpay.'}, status=502)

        if amount_paise != QUEUE_UPGRADE_AMOUNT_PAISE:
            logger.warning('Queue upgrade: wrong amount for order %s: %s paise',
                           order_id, amount_paise)
            return Response({'message': 'Invalid payment amount for queue access.'}, status=400)

        # Record the upgrade payment in its OWN fields (never touching the
        # booking's original payment_id/order_id/amount) and let the partial
        # unique index on queue_payment_id be the source of truth for reuse.
        # The pre-check gives a friendly 409; the IntegrityError catch closes
        # the concurrent-race window the pre-check alone can't.
        try:
            with transaction.atomic():
                if Booking.objects.filter(queue_payment_id=payment_id).exists():
                    return Response({'message': 'This payment has already been used.'}, status=409)
                booking.queue_access     = True
                booking.queue_payment_id = payment_id
                booking.queue_order_id   = order_id
                booking.save(update_fields=['queue_access', 'queue_payment_id', 'queue_order_id'])
        except IntegrityError:
            logger.warning('Queue upgrade: payment %s already used (unique index)', payment_id)
            return Response({'message': 'This payment has already been used.'}, status=409)
        logger.info('Queue access unlocked for booking %s by user %s', pk, request.user.id)

        return Response({
            'success': True,
            'message': 'Queue access unlocked!',
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })


# ── Cancel booking ────────────────────────────────────────────────────────────
class CancelBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk, user=request.user)

        if booking.status != 'waiting':
            return Response(
                {'message': f'Cannot cancel a booking with status "{booking.status}".'},
                status=400
            )

        booking.status = 'cancelled'
        booking.save(update_fields=['status'])
        logger.info('Booking %s cancelled by user %s', pk, request.user.id)
        return Response({
            'message': 'Booking cancelled successfully.',
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })


# ── Reschedule booking (FREE path) ────────────────────────────────────────────
class RescheduleBookingView(APIView):
    """
    Free, no-payment reschedule. Only permitted when the booking was flagged
    `free_reschedule` — which happens when the hospital marks the doctor
    unavailable (see doctors.views.DoctorViewSet.partial_update). Every other
    reschedule goes through the paid ₹5 flow (payments._handle_reschedule), so
    this endpoint can't be used to dodge that fee. The flag is consumed on use.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk, user=request.user)

        if booking.status != 'waiting':
            return Response(
                {'message': 'Only waiting bookings can be rescheduled.'},
                status=400
            )

        if not booking.free_reschedule:
            return Response(
                {'message': 'This booking is not eligible for a free reschedule.'},
                status=403
            )

        new_date = request.data.get('date', '').strip()
        new_slot = request.data.get('slot', '').strip()

        if not new_date:
            return Response({'message': 'Date is required.'}, status=400)
        if not new_slot:
            return Response({'message': 'Slot is required.'}, status=400)

        doctor_slots = booking.doctor.slots or []
        if new_slot not in doctor_slots:
            return Response(
                {'message': f'Slot "{new_slot}" is not available for this doctor.'},
                status=400
            )

        booking.date = new_date
        booking.slot = new_slot
        booking.free_reschedule = False  # one-time waiver, consumed
        booking.save(update_fields=['date', 'slot', 'free_reschedule'])
        logger.info('Booking %s free-rescheduled by user %s', pk, request.user.id)

        return Response({
            'message': 'Appointment rescheduled successfully.',
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })


# ── QR Scan — FIXED ──────────────────────────────────────────────────────────
class ScanQRView(APIView):
    """
    GET  /api/bookings/scan/<token>/  → verify QR, return booking details
    POST /api/bookings/scan/<token>/  → mark booking as in_progress (attended)
 
    Both require: authenticated hospital staff (or admin).
    """
    permission_classes = [IsAuthenticated, IsHospitalStaff]
 
    # Explicitly allow both methods — DRF only allows methods with handlers
    http_method_names = ['get', 'post', 'head', 'options']
 
    # ── Internal helpers ──────────────────────────────────────────────────────
 
    @staticmethod
    def _get_hospital_id(user):
        """
        Hospital ID is stored as a string in user.last_name.
        Set there by HospitalRegisterView and HospitalLoginView.
        Returns int or None.
        """
        try:
            return int(user.last_name)
        except (ValueError, TypeError, AttributeError):
            return None
 
    @staticmethod
    def _serialize_booking(booking):
        """Consistent payload used by both GET and POST responses."""
        # Queue position: how many patients are ahead (incl. this one) for the
        # same doctor + date + slot who are still waiting. Helps hospital staff
        # understand where the patient stands. None once no longer waiting.
        queue_position = None
        if booking.status == 'waiting':
            queue_position = (
                Booking.objects
                .filter(
                    doctor_id=booking.doctor_id,
                    date=booking.date,
                    slot=booking.slot,
                    status='waiting',
                    created__lte=booking.created,
                )
                .count()
            )

        return {
            'id':             booking.id,
            'token':          booking.token,
            'status':         booking.status,
            # Who the appointment is for — the beneficiary when booked for
            # someone else, else the account holder.
            'patient_name':   booking.patient_display_name,
            'patient_mobile': booking.patient_display_mobile,
            'booked_by_name': booking.user.first_name or booking.user.username,
            'is_for_other':   bool(booking.booked_for_name),
            'doctor_name':    booking.doctor.name,
            'specialization': booking.doctor.specialization,
            'doctor_fee':     booking.doctor.fee,
            'hospital_name':  booking.hospital.name,
            'date':           str(booking.date),
            'slot':           booking.slot,
            'amount':         booking.amount,
            'queue_position': queue_position,
            'queue_access':   booking.queue_access,
            'payment_id':     booking.payment_id or '',
            'created':        booking.created.strftime('%d %b %Y, %I:%M %p'),
        }
 
    def _fetch_booking(self, token):
        """Fetch booking with all related objects in one query."""
        try:
            return (
                Booking.objects
                .select_related('user', 'doctor', 'hospital')
                .get(token=token)
            ), None
        except Booking.DoesNotExist:
            return None, Response(
                {'valid': False, 'message': f'No booking found for token "{token}".'},
                status=404,
            )
 
    def _check_access(self, request, booking):
        """Returns None if allowed, a 403 Response if denied."""
        if request.user.role == 'admin':
            return None   # admins can scan any hospital
        hospital_id = self._get_hospital_id(request.user)
        if hospital_id is None or hospital_id != booking.hospital_id:
            return Response(
                {'valid': False, 'message': 'This token belongs to a different hospital.'},
                status=403,
            )
        return None
 
    # ── GET ───────────────────────────────────────────────────────────────────
 
    def get(self, request, token):
        """
        Look up a booking by token. No status change.
        Frontend uses this to display booking info before confirming attendance.
 
        Response 200:
          { valid: true, already_done: bool, booking: {...} }
        Response 404:
          { valid: false, message: "..." }
        Response 403:
          { valid: false, message: "..." }
        """
        booking, err = self._fetch_booking(token)
        if err:
            return err
 
        access_err = self._check_access(request, booking)
        if access_err:
            return access_err
 
        already_done = booking.status in ('in_progress', 'completed', 'cancelled')
 
        return Response({
            'valid':        True,
            'already_done': already_done,
            'booking':      self._serialize_booking(booking),
        })
 
    # ── POST ──────────────────────────────────────────────────────────────────
 
    def post(self, request, token):
        """
        Mark booking as in_progress (patient has arrived).
 
        Response 200:
          { success: true, message: "...", booking: {...} }
        Response 409 (already attended):
          { success: false, already_done: true, message: "...", booking: {...} }
        Response 400 (cancelled):
          { success: false, message: "..." }
        Response 404 / 403:
          { success: false, message: "..." }
        """
        booking, err = self._fetch_booking(token)
        if err:
            return err
 
        access_err = self._check_access(request, booking)
        if access_err:
            return access_err
 
        # ── Guard: cancelled bookings cannot be attended ──
        if booking.status == 'cancelled':
            return Response(
                {'success': False, 'message': 'This booking was cancelled.'},
                status=400,
            )
 
        # ── Guard: already attended ──
        if booking.status in ('in_progress', 'completed'):
            msg = (
                'Patient is already In Consultation.'
                if booking.status == 'in_progress'
                else 'This patient has already completed their visit.'
            )
            return Response(
                {
                    'success':      False,
                    'already_done': True,
                    'message':      msg,
                    'booking':      self._serialize_booking(booking),
                },
                status=409,
                            )
 
        # ── Mark as in_progress ──
        booking.status = 'in_progress'
        booking.save(update_fields=['status'])

        logger.info(
            'QR scan: booking %s → in_progress by user %s (hospital %s)',
            booking.id, request.user.id, self._get_hospital_id(request.user),
        )
        push_booking_in_progress(booking)  # patient "you're next" alert
 
        patient = booking.patient_display_name
        return Response({
            'success': True,
            'message': f'✅ {patient} marked as In Consultation.',
            'booking': self._serialize_booking(booking),
        })
 


