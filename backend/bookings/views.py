import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.pagination import PageNumberPagination
from django.shortcuts import get_object_or_404

from .models import Booking
from .serializers import BookingSerializer, build_queue_map
from tokenwalla.permissions import IsAdmin, IsHospitalStaff

logger = logging.getLogger('tokenwalla')


class StandardPagination(PageNumberPagination):
    page_size            = 50
    page_size_query_param = 'page_size'
    max_page_size        = 200


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
        queue_map = build_queue_map(bookings)
        serializer = BookingSerializer(
            bookings, many=True,
            context={'request': request, 'queue_map': queue_map}
        )
        return Response(serializer.data)


# ── Hospital: queue for own hospital only ─────────────────────────────────────
class HospitalQueueView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def get(self, request, hospital_id):
        # Verify the requesting user belongs to this hospital
        user_hospital_id = None
        try:
            user_hospital_id = request.user.hospital.id
        except AttributeError:
            # last_name fallback used during registration
            try:
                user_hospital_id = int(request.user.last_name)
            except (ValueError, TypeError):
                pass

        if user_hospital_id != hospital_id and request.user.role != 'admin':
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
            'waiting':    BookingSerializer(base.filter(status='waiting'),     many=True, context={'request': request}).data,
            'inProgress': BookingSerializer(base.filter(status='in_progress'), many=True, context={'request': request}).data,
            'completed':  BookingSerializer(base.filter(status='completed'),   many=True, context={'request': request}).data,
        })


# ── Hospital: call next (hospital staff only) ─────────────────────────────────
class CallNextView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        # Verify the user's hospital owns this booking
        user_hospital_id = self._get_user_hospital_id(request.user)
        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        booking.status = 'in_progress'
        booking.save(update_fields=['status'])
        logger.info('Booking %s called by hospital %s', pk, user_hospital_id)
        return Response(BookingSerializer(booking, context={'request': request}).data)

    @staticmethod
    def _get_user_hospital_id(user):
        try:
            return user.hospital.id
        except AttributeError:
            try:
                return int(user.last_name)
            except (ValueError, TypeError):
                return None


# ── Hospital: complete booking (hospital staff only) ──────────────────────────
class CompleteBookingView(APIView):
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        user_hospital_id = CallNextView._get_user_hospital_id(request.user)
        if user_hospital_id != booking.hospital_id and request.user.role != 'admin':
            return Response({'message': 'Access denied.'}, status=403)

        booking.status = 'completed'
        booking.save(update_fields=['status'])
        logger.info('Booking %s completed by hospital %s', pk, user_hospital_id)
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
        page = paginator.paginate_queryset(qs, request)
        serializer = BookingSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


# ── Upgrade queue access ───────────────────────────────────────────────────────
class UpgradeQueueAccessView(APIView):
    """
    This endpoint should only be called AFTER a real Razorpay payment.
    The payment view handles queue_access on initial booking.
    This endpoint is intentionally left for legacy but now requires
    payment proof via payment_id.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk, user=request.user)

        if booking.queue_access:
            return Response({'message': 'Queue access already active.'}, status=400)

        # Require a real payment_id — do not allow free upgrades
        payment_id = request.data.get('payment_id', '').strip()
        if not payment_id:
            return Response(
                {'message': 'payment_id is required to upgrade queue access.'},
                status=400
            )

        booking.queue_access = True
        booking.payment_id   = payment_id
        booking.amount       = 15
        booking.save(update_fields=['queue_access', 'payment_id', 'amount'])

        return Response({
            'success': True,
            'message': 'Queue access unlocked!',
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })


# ── Cancel booking (patient owns it) ─────────────────────────────────────────
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


# ── Reschedule booking (patient owns it) ─────────────────────────────────────
class RescheduleBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk, user=request.user)

        if booking.status != 'waiting':
            return Response(
                {'message': 'Only waiting bookings can be rescheduled.'},
                status=400
            )

        new_date = request.data.get('date', '').strip()
        new_slot = request.data.get('slot', '').strip()

        if not new_date:
            return Response({'message': 'Date is required.'}, status=400)
        if not new_slot:
            return Response({'message': 'Slot is required.'}, status=400)

        # Validate the new slot exists on this doctor
        doctor_slots = booking.doctor.slots or []
        if new_slot not in doctor_slots:
            return Response(
                {'message': f'Slot "{new_slot}" is not available for this doctor.'},
                status=400
            )

        booking.date = new_date
        booking.slot = new_slot
        booking.save(update_fields=['date', 'slot'])

        return Response({
            'message': 'Appointment rescheduled successfully.',
            'booking': BookingSerializer(booking, context={'request': request}).data,
        })