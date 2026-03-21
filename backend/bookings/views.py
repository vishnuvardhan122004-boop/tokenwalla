from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Booking
from .serializers import BookingSerializer


class MyBookingsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        bookings = Booking.objects.filter(
            user=request.user
        ).select_related('doctor', 'hospital')
        return Response(BookingSerializer(bookings, many=True).data)


class HospitalQueueView(APIView):
    permission_classes = [AllowAny]
    def get(self, request, hospital_id):
        base = Booking.objects.filter(
            hospital_id=hospital_id
        ).select_related('doctor', 'user')
        return Response({
            'waiting':    BookingSerializer(base.filter(status='waiting'),     many=True).data,
            'inProgress': BookingSerializer(base.filter(status='in_progress'), many=True).data,
            'completed':  BookingSerializer(base.filter(status='completed'),   many=True).data,
        })


class CallNextView(APIView):
    permission_classes = [AllowAny]
    def patch(self, request, pk):
        try:
            b = Booking.objects.get(pk=pk)
            b.status = 'in_progress'
            b.save()
            return Response(BookingSerializer(b).data)
        except Booking.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)


class CompleteBookingView(APIView):
    permission_classes = [AllowAny]
    def patch(self, request, pk):
        try:
            b = Booking.objects.get(pk=pk)
            b.status = 'completed'
            b.save()
            return Response(BookingSerializer(b).data)
        except Booking.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)


class AllBookingsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(BookingSerializer(
            Booking.objects.all().select_related('doctor', 'hospital', 'user'),
            many=True
        ).data)


class UpgradeQueueAccessView(APIView):
    permission_classes = [IsAuthenticated]
    def patch(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk, user=request.user)
            booking.queue_access = True
            booking.amount       = 15
            booking.save()
            return Response({
                'success': True,
                'message': 'Queue access unlocked!',
                'booking': BookingSerializer(booking).data,
            })
        except Booking.DoesNotExist:
            return Response({'message': 'Booking not found.'}, status=404)


class CancelBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk, user=request.user)
        except Booking.DoesNotExist:
            return Response({'message': 'Booking not found.'}, status=404)

        if booking.status != 'waiting':
            return Response(
                {'message': f'Cannot cancel a booking that is already "{booking.status}".'},
                status=400
            )

        booking.status = 'cancelled'
        booking.save()
        return Response({
            'message': 'Booking cancelled successfully.',
            'booking': BookingSerializer(booking).data,
        })


class RescheduleBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk, user=request.user)
        except Booking.DoesNotExist:
            return Response({'message': 'Booking not found.'}, status=404)

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

        booking.date = new_date
        booking.slot = new_slot
        booking.save()

        return Response({
            'message': 'Appointment rescheduled successfully.',
            'booking': BookingSerializer(booking).data,
        })