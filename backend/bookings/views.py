import logging
import threading

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db import connection, transaction
from django.shortcuts import get_object_or_404

from .models import Booking
from .serializers import BookingSerializer, build_queue_map
from tokenwalla.permissions import IsAdmin, IsHospitalStaff
from payments.refunds import (
    process_cancellation_refund, record_absence_refund, RefundNotAllowed,
)
from notifications.push import (
    push_booking_cancelled,
    push_booking_in_progress,
    push_booking_no_show,
    push_booking_on_hold,
    push_cancellation_to_hospital,
)
from notifications.whatsapp import send_booking_cancelled, send_booking_no_show

logger = logging.getLogger('tokenwalla')


def _whatsapp_async(send, booking, label):
    """Run one WhatsApp sender on a background thread.

    Same contract as payments.views._notify_booking_async: a Meta call can take
    up to 10s, and the booking state it describes is already committed — so it
    must never sit inside the request (the cancel view already pays for a
    synchronous Razorpay refund) and never fail it.
    """
    def _run():
        try:
            send(booking)
        except Exception as exc:
            logger.warning('%s WhatsApp failed for booking %s: %s', label, booking.id, exc)
        finally:
            # Threads get their own DB connection; close it so we don't leak.
            connection.close()

    threading.Thread(target=_run, name=f'{label}-{booking.id}', daemon=True).start()


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
                base.filter(status='CONFIRMED').order_by('created'),
                many=True, context={'request': request}
            ).data,
            'onHold':     BookingSerializer(
                base.filter(status='ON_HOLD').order_by('created'),
                many=True, context={'request': request}
            ).data,
            'inProgress': BookingSerializer(
                base.filter(status='IN_PROGRESS').order_by('created'),
                many=True, context={'request': request}
            ).data,
            'completed':  BookingSerializer(
                base.filter(status='COMPLETED').order_by('-created')[:50],
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

        if booking.status != 'CONFIRMED':
            return Response(
                {'message': f'Cannot call a booking with status "{booking.status}".'},
                status=400
            )

        booking.status = 'IN_PROGRESS'
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

        if booking.status not in ('CONFIRMED', 'IN_PROGRESS'):
            return Response(
                {'message': f'Cannot complete a booking with status "{booking.status}".'},
                status=400
            )

        booking.status = 'COMPLETED'
        booking.save(update_fields=['status'])
        logger.info('Booking %s completed by hospital %s', pk, user_hospital_id)
        return Response(BookingSerializer(booking, context={'request': request}).data)


# ── Hospital: mark no-show (hospital staff only) ─────────────────────────────
class NoShowView(APIView):
    """
    Patient never turned up — drop them from the queue without completing.

    Distinct from CancelBookingView, which is the patient cancelling their own
    booking (it filters on user=request.user, so hospital staff get a 404 there).
    Recorded as NO_SHOW — a terminal, non-refundable state distinct from a
    patient-initiated CANCELLED (which may carry a partial refund).
    """
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking          = get_object_or_404(Booking, pk=pk)
        user_hospital_id = _get_user_hospital_id(request.user)

        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        if booking.status not in ('CONFIRMED', 'IN_PROGRESS'):
            return Response(
                {'message': f'Cannot mark a booking with status "{booking.status}" as no-show.'},
                status=400
            )

        booking.status = Booking.NO_SHOW
        booking.save(update_fields=['status'])
        logger.info('Booking %s marked no-show by hospital %s', pk, user_hospital_id)
        push_booking_no_show(booking)
        _whatsapp_async(send_booking_no_show, booking, 'no-show')
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

        if booking.status == 'CONFIRMED':
            booking.status = 'ON_HOLD'
        elif booking.status == 'ON_HOLD':
            booking.status = 'CONFIRMED'
        else:
            return Response(
                {'message': f'Cannot hold/resume a booking with status "{booking.status}".'},
                status=400
            )

        booking.save(update_fields=['status'])
        logger.info('Booking %s set to %s by hospital %s', pk, booking.status, user_hospital_id)
        # Only the hold direction needs an alert — a resume is followed by the
        # existing "you're next" push when staff actually call them.
        if booking.status == 'ON_HOLD':
            push_booking_on_hold(booking)
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


# ── Cancel booking ────────────────────────────────────────────────────────────
class CancelBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk, user=request.user)

        if booking.status != 'CONFIRMED':
            return Response(
                {'message': f'Cannot cancel a booking with status "{booking.status}".'},
                status=400
            )

        # Issue the tiered refund BEFORE flipping to CANCELLED. If the gateway
        # refund fails we abort so the booking is never cancelled without the
        # patient being refunded — they can retry.
        try:
            _, refund_info = process_cancellation_refund(booking)
        except RefundNotAllowed as exc:
            return Response({'message': str(exc)}, status=400)
        except Exception as exc:
            logger.exception('Refund failed while cancelling booking %s: %s', pk, exc)
            return Response(
                {'message': 'Could not process the refund. Please try again.'},
                status=502,
            )

        booking.status = 'CANCELLED'
        booking.save(update_fields=['status'])
        logger.info('Booking %s cancelled by user %s (refund: %s)', pk, request.user.id, refund_info)

        # All best-effort: the cancellation + refund are already committed, so a
        # notification failure must never turn a successful cancellation into an
        # error. Pushes are local and cheap; the WhatsApp call is threaded.
        push_booking_cancelled(booking, refund_info)   # patient: what was refunded
        push_cancellation_to_hospital(booking)         # hospital: slot is free again
        _whatsapp_async(
            lambda b: send_booking_cancelled(b, refund_info), booking, 'cancellation')
        return Response({
            'message': 'Booking cancelled successfully.',
            'refund':  refund_info,
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })


# ── Hospital/Admin: doctor-absence refund on an already-completed booking ─────
class AbsenceRefundView(APIView):
    """Doctor didn't show but the booking was already marked COMPLETED.

    Writes a negative adjustment to the doctor's ledger (netted against their
    next payout) instead of reversing an already-sent payout. Hospital staff for
    the booking's hospital, or an admin, may trigger it.
    """
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def post(self, request, pk):
        booking          = get_object_or_404(Booking, pk=pk)
        user_hospital_id = _get_user_hospital_id(request.user)
        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        try:
            _, info = record_absence_refund(booking)
        except RefundNotAllowed as exc:
            return Response({'message': str(exc)}, status=400)

        logger.info('Absence refund recorded for booking %s by user %s', pk, request.user.id)
        return Response({'message': 'Absence adjustment recorded.', 'adjustment': info})


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

        if booking.status != 'CONFIRMED':
            return Response(
                {'message': 'Only confirmed bookings can be rescheduled.'},
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

        # Don't let a reschedule overflow a slot's capacity. Mirror the same
        # definition slot_availability uses (waiting + in_progress vs
        # doctor.max_per_slot), and do the count → save atomically so two
        # simultaneous reschedules can't both slip past a nearly-full slot.
        # Exclude this booking itself so re-picking its current slot is a no-op.
        with transaction.atomic():
            booked = (
                Booking.objects
                .select_for_update()
                .filter(
                    doctor=booking.doctor,
                    date=new_date,
                    slot=new_slot,
                    status__in=['CONFIRMED', 'IN_PROGRESS'],
                )
                .exclude(pk=booking.pk)
                .count()
            )
            if booked >= booking.doctor.max_per_slot:
                return Response(
                    {'message': f'Slot "{new_slot}" on {new_date} is full. Please pick another slot.'},
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
        if booking.status == 'CONFIRMED':
            queue_position = (
                Booking.objects
                .filter(
                    doctor_id=booking.doctor_id,
                    date=booking.date,
                    slot=booking.slot,
                    status='CONFIRMED',
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
 
        already_done = booking.status in ('IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
 
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
 
        # ── Guard: cancelled / no-show bookings cannot be attended ──
        if booking.status in ('CANCELLED', 'NO_SHOW'):
            msg = ('This booking was cancelled.' if booking.status == 'CANCELLED'
                   else 'This booking was marked no-show.')
            return Response(
                {'success': False, 'message': msg},
                status=400,
            )
 
        # ── Guard: already attended ──
        if booking.status in ('IN_PROGRESS', 'COMPLETED'):
            msg = (
                'Patient is already In Consultation.'
                if booking.status == 'IN_PROGRESS'
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
        booking.status = 'IN_PROGRESS'
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
 


