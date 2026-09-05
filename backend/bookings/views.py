import logging
import threading

from datetime import timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Booking
from .serializers import BookingSerializer, build_queue_map
from tokenwalla.permissions import IsAdmin, IsHospitalStaff
from payments.refunds import (
    process_cancellation_refund, record_absence_refund, RefundNotAllowed,
)
from payments.pass_utils import on_booking_cancelled
from notifications.push import (
    push_booking_cancelled,
    push_booking_in_progress,
    push_booking_no_show,
    push_booking_on_hold,
    push_cancellation_to_hospital,
)
from notifications.whatsapp import (
    send_booking_cancelled,
    send_booking_no_show,
    send_booking_on_hold,
    send_hospital_cancellation,
    send_queue_advance,
)

logger = logging.getLogger('tokenwalla')

# How far the hospital queue looks either side of today. The look-back keeps
# bookings left in an active status on a previous day visible so staff can
# close them out; the look-ahead covers the dashboard's Tomorrow and All tabs
# with room to spare. Both exist to stop the queue query growing without
# bound — see HospitalQueueView.
QUEUE_LOOKBACK_DAYS  = 7
QUEUE_LOOKAHEAD_DAYS = 30


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


def _claim_transition(booking, expected, new_status):
    """Atomically move `booking` from one of `expected` into `new_status`.

    Returns True only if THIS caller made the change.

    Every status check in these views is an UNLOCKED read, so two requests can
    both pass one and both write. The conditional UPDATE is the whole guard:
    exactly one caller matches the expected status and gets a rowcount of 1.

    The interleaving that matters is a patient cancelling while staff act on the
    same booking. `process_cancellation_refund` holds a synchronous Razorpay
    call inside its lock (deliberately — see refunds.py), so a cancel is in
    flight for a second or more. Without this, a Complete landing in that window
    wrote COMPLETED unconditionally: the refund still went out, the booking read
    COMPLETED, the patient was told the cancel had failed, no pass credit came
    back, and run_daily_payouts then skipped the booking forever because of its
    `.exclude(payment__refunds__isnull=False)` guard — so the doctor was never
    ledgered for a visit the hospital had marked done.
    """
    claimed = (Booking.objects
               .filter(pk=booking.pk, status__in=expected)
               .update(status=new_status))
    if claimed:
        booking.status = new_status      # keep the in-memory copy honest
    return bool(claimed)


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
            .select_related('doctor', 'scan', 'hospital', 'user', 'appointment_pass')
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

        # Bound the queue to a date window.
        #
        # This filtered on hospital + status only, with no date bound and no
        # pagination — so every CONFIRMED/ON_HOLD/IN_PROGRESS booking the
        # hospital had EVER taken was serialised on every poll, and the
        # dashboard polls every 10 seconds. The set only grows: abandoned past
        # bookings never leave an active status on their own. CAPACITY.md §2
        # called this the first endpoint that would fall over.
        #
        # Not filtered to today, though the analysis suggested it — the
        # dashboard has Today / Tomorrow / All tabs (Hdashboard.js `dayFilter`)
        # and today-only would silently empty two of them. A window keeps every
        # tab working while dropping the unbounded tail.
        #
        # The look-back is deliberate: a booking left CONFIRMED or ON_HOLD from
        # a previous day is exactly what staff need to see in order to close it
        # out (the same rows the admin daily check flags as `stale_queue`).
        today = timezone.localdate()
        window_start = today - timedelta(days=QUEUE_LOOKBACK_DAYS)
        window_end   = today + timedelta(days=QUEUE_LOOKAHEAD_DAYS)

        base = (
            Booking.objects
            .filter(hospital_id=hospital_id,
                    date__gte=window_start, date__lte=window_end)
            # `hospital`, `scan` and `appointment_pass` were missing, and the
            # serializer reads all three (hospital_name/hospital_mobile,
            # provider_name on a scan booking, pass_role). Each was a query per
            # row on the endpoint every reception desk polls every 10 seconds.
            .select_related('doctor', 'scan', 'hospital', 'user', 'appointment_pass')
        )

        # Without this the serializer takes get_queue_position's SLOW path —
        # one query per waiting patient, on every poll. build_queue_map answers
        # the whole set in three queries flat, and MyBookingsView has always
        # passed it; this endpoint never did. Only CONFIRMED/IN_PROGRESS rows
        # carry a position, so the map is built from exactly those.
        ctx = {
            'request':   request,
            'queue_map': build_queue_map(
                base.filter(status__in=('CONFIRMED', 'IN_PROGRESS'))),
        }

        return Response({
            'waiting':    BookingSerializer(
                base.filter(status='CONFIRMED').order_by('created'),
                many=True, context=ctx
            ).data,
            'onHold':     BookingSerializer(
                base.filter(status='ON_HOLD').order_by('created'),
                many=True, context=ctx
            ).data,
            'inProgress': BookingSerializer(
                base.filter(status='IN_PROGRESS').order_by('created'),
                many=True, context=ctx
            ).data,
            'completed':  BookingSerializer(
                base.filter(status='COMPLETED').order_by('-created')[:50],
                many=True, context=ctx
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

        if not _claim_transition(booking, ('CONFIRMED',), 'IN_PROGRESS'):
            return Response(
                {'message': 'This booking was updated by someone else. Refresh and try again.'},
                status=409
            )
        logger.info('Booking %s called by hospital %s', pk, user_hospital_id)
        push_booking_in_progress(booking)  # patient "you're next" alert
        _whatsapp_async(send_queue_advance, booking, 'queue-advance')
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

        if not _claim_transition(booking, ('CONFIRMED', 'IN_PROGRESS'), 'COMPLETED'):
            return Response(
                {'message': 'This booking was updated by someone else. Refresh and try again.'},
                status=409
            )
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

        if not _claim_transition(booking, ('CONFIRMED', 'IN_PROGRESS'), Booking.NO_SHOW):
            return Response(
                {'message': 'This booking was updated by someone else. Refresh and try again.'},
                status=409
            )
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

        previous = booking.status
        if booking.status == 'CONFIRMED':
            booking.status = 'ON_HOLD'
        elif booking.status == 'ON_HOLD':
            booking.status = 'CONFIRMED'
        else:
            return Response(
                {'message': f'Cannot hold/resume a booking with status "{booking.status}".'},
                status=400
            )

        if not _claim_transition(booking, (previous,), booking.status):
            return Response(
                {'message': 'This booking was updated by someone else. Refresh and try again.'},
                status=409
            )
        logger.info('Booking %s set to %s by hospital %s', pk, booking.status, user_hospital_id)
        # Only the hold direction needs an alert — a resume is followed by the
        # existing "you're next" push when staff actually call them.
        if booking.status == 'ON_HOLD':
            push_booking_on_hold(booking)
            _whatsapp_async(send_booking_on_hold, booking, 'on-hold')
        return Response(BookingSerializer(booking, context={'request': request}).data)


# ── Admin: all bookings (admin only) ─────────────────────────────────────────
class AllBookingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        paginator = StandardPagination()
        qs = (
            Booking.objects
            .all()
            .select_related('doctor', 'scan', 'hospital', 'user', 'appointment_pass')
            .order_by('-created')
        )
        page       = paginator.paginate_queryset(qs, request)
        # Without the map this took get_queue_position's slow path — one query
        # per CONFIRMED booking on the page, so up to 50 extra per request.
        serializer = BookingSerializer(
            page, many=True,
            context={'request': request, 'queue_map': build_queue_map(page)},
        )
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

        # Claim the CONFIRMED -> CANCELLED transition atomically. The status
        # check at the top of this method is an unlocked read, so a
        # double-submitted cancel gets TWO requests past it, and everything
        # below here would then run twice.
        #
        # The refund above is already safe (it locks the Payment row and
        # re-checks under it), but the pass restore is not: a redeemed visit is
        # a ₹0 booking with no Payment to lock, so nothing serialised the two
        # callers and `used_bookings -= 1` ran twice — handing the patient back
        # two credits for one cancelled visit. The notifications would have gone
        # out twice as well.
        #
        # A conditional UPDATE is the whole guard: exactly one caller matches
        # status='CONFIRMED' and gets a rowcount of 1; the loser gets 0 and
        # stops here, having changed nothing.
        if not _claim_transition(booking, ('CONFIRMED',), Booking.CANCELLED):
            return Response(
                {'message': 'This booking has already been cancelled.'}, status=400)
        logger.info('Booking %s cancelled by user %s (refund: %s)', pk, request.user.id, refund_info)

        # Settle the Appointment Pass, if one is involved: a cancelled visit
        # that SPENT a credit gets it back, and cancelling the booking that
        # BOUGHT the pass voids the rest of it (the money is being refunded).
        # After the cancellation is committed and best-effort, like the
        # notifications below — a pass hiccup must not fail a cancellation.
        try:
            pass_result = on_booking_cancelled(booking)
        except Exception as exc:
            pass_result = None
            logger.exception('Pass settlement failed for cancelled booking %s: %s', pk, exc)
        # Settled BEFORE the notifications on purpose: both of them tell the
        # patient what happened to the pass, and a ₹0 visit has nothing else
        # worth saying.
        pass_outcome = (pass_result or {}).get('result')

        # All best-effort: the cancellation + refund are already committed, so a
        # notification failure must never turn a successful cancellation into an
        # error. Pushes are local and cheap; the WhatsApp call is threaded.
        push_booking_cancelled(booking, refund_info, pass_result)   # patient: money + pass
        push_cancellation_to_hospital(booking)         # hospital: slot is free again
        _whatsapp_async(
            lambda b: send_booking_cancelled(b, refund_info, pass_result),
            booking, 'cancellation')
        _whatsapp_async(send_hospital_cancellation, booking, 'hospital-cancellation')
        return Response({
            'message': 'Booking cancelled successfully.',
            'refund':  refund_info,
            # Kept as the bare string the web client already switches on, with
            # the detail alongside it for anything that wants the numbers.
            'pass':        pass_outcome,
            'pass_detail': pass_result,
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

        if new_slot not in booking.provider_slots:
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
                    **booking.provider_filter,
                    date=new_date,
                    slot=new_slot,
                    status__in=['CONFIRMED', 'IN_PROGRESS'],
                )
                .exclude(pk=booking.pk)
                .count()
            )
            if booked >= booking.provider_max_per_slot:
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
                    **booking.provider_filter,
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
            # The doctor_* keys are kept and kept POPULATED for a scan booking
            # (name → scan name, specialization → modality, fee → price). They
            # are API contract: build 36 reads them and would render an empty
            # card, or crash, on a null. A patient who books a scan on the web
            # and then opens the old app sees "MRI Brain / MRI / ₹4500" under a
            # "doctor" label — mislabelled, but true and legible. The provider_*
            # keys below are the correct names for new clients.
            'doctor_name':    booking.provider_name,
            'specialization': booking.provider_detail,
            'doctor_fee':     booking.provider_fee,
            'provider_name':  booking.provider_name,
            'provider_kind':  'SCAN' if booking.is_scan else 'DOCTOR',
            'scan_id':        booking.scan_id,
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
                # 'scan' included: _serialize_booking reads provider_name /
                # provider_detail / provider_fee, all of which touch .scan on a
                # scan booking.
                .select_related('user', 'doctor', 'scan', 'hospital')
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
        # Same atomic claim as the staff transitions. Losing the race here
        # means someone else already advanced this booking, which is exactly
        # what the already_done contract above describes — so reuse it rather
        # than inventing a second shape for installed apps to learn.
        if not _claim_transition(booking, ('CONFIRMED',), 'IN_PROGRESS'):
            booking.refresh_from_db()
            return Response({
                'success':      False,
                'already_done': True,
                'message':      'This token was already scanned.',
                'booking':      self._serialize_booking(booking),
            }, status=409)

        logger.info(
            'QR scan: booking %s → in_progress by user %s (hospital %s)',
            booking.id, request.user.id, self._get_hospital_id(request.user),
        )
        push_booking_in_progress(booking)  # patient "you're next" alert
        _whatsapp_async(send_queue_advance, booking, 'queue-advance')

        patient = booking.patient_display_name
        return Response({
            'success': True,
            'message': f'✅ {patient} marked as In Consultation.',
            'booking': self._serialize_booking(booking),
        })
 


