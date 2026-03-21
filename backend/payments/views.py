import razorpay, hmac as hmac_lib, hashlib, uuid
from datetime import datetime
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

class CreateOrderView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        try:
            amount = int(request.data.get('amount'))
            if amount not in [1000, 1500, 500]:
                return Response({'message': 'Invalid amount.'}, status=400)
            order = client.order.create({
                'amount':          amount,
                'currency':        'INR',
                'payment_capture': 1,
                'notes':           request.data.get('notes', {}),
            })
            return Response({
                'order_id': order['id'],
                'amount':   order['amount'],
                'currency': order['currency'],
            })
        except Exception as e:
            return Response({'message': str(e)}, status=500)


class VerifyPaymentView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        try:
            order_id   = request.data.get('razorpay_order_id', '')
            payment_id = request.data.get('razorpay_payment_id', '')
            sig        = request.data.get('razorpay_signature', '')
            booking    = request.data.get('booking', {})

            msg      = f"{order_id}|{payment_id}".encode('utf-8')
            secret   = settings.RAZORPAY_KEY_SECRET.encode('utf-8')
            expected = hmac_lib.new(secret, msg, digestmod=hashlib.sha256).hexdigest()

            if not hmac_lib.compare_digest(expected, sig):
                return Response({'success': False, 'message': 'Invalid signature.'}, status=400)

            token        = f"TW-{datetime.now().strftime('%H%M%S')}-{str(uuid.uuid4())[:4].upper()}"
            amount       = booking.get('amount', 10)
            queue_access = amount >= 15

            from bookings.models import Booking
            from payments.models import Payment
            from doctors.models  import Doctor

            doctor      = Doctor.objects.get(pk=booking['doctorId'])
            hospital    = doctor.hospital
            new_booking = Booking.objects.create(
                user         = request.user,
                doctor       = doctor,
                hospital     = hospital,
                date         = booking['date'],
                slot         = booking['slot'],
                token        = token,
                payment_id   = payment_id,
                order_id     = order_id,
                amount       = amount,
                status       = 'waiting',
                queue_access = queue_access,
            )
            Payment.objects.create(
                booking    = new_booking,
                order_id   = order_id,
                payment_id = payment_id,
                signature  = sig,
                amount     = amount,
                status     = 'success',
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
                    'amount':       amount,
                    'queue_access': queue_access,
                }
            })
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=404)
        except Exception as e:
            return Response({'success': False, 'message': str(e)}, status=500)


class AdminReportsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        from bookings.models import Booking
        from bookings.serializers import BookingSerializer
        all_b = Booking.objects.all().select_related('doctor', 'hospital', 'user')
        return Response({
            'total':     all_b.count(),
            'completed': all_b.filter(status='completed').count(),
            'waiting':   all_b.filter(status='waiting').count(),
            'bookings':  BookingSerializer(all_b, many=True).data,
        })