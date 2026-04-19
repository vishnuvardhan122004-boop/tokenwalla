import razorpay
import hmac as hmac_lib
import hashlib
import uuid
import logging

from datetime import datetime
from django.conf import settings
from django.db import transaction, IntegrityError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from bookings.models import Booking
from bookings.serializers import BookingSerializer
from tokenwalla.permissions import IsAdmin

logger = logging.getLogger('tokenwalla')

client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)

# Valid amounts in PAISE — server is the source of truth, never trust the client
VALID_AMOUNTS_PAISE = {
    1500: {'fee': 15, 'queue_access': True, 'plan': 'queue_view'},
}


def _generate_token():
    """Generate a unique booking token with retry on collision."""
    for _ in range(5):
        ts    = datetime.now().strftime('%H%M%S')
        uid   = str(uuid.uuid4())[:6].upper()
        token = f'TW-{ts}-{uid}'
        if not Booking.objects.filter(token=token).exists():
            return token
    raise RuntimeError('Could not generate a unique token after 5 attempts.')


class CreateOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            amount_paise = int(request.data.get('amount', 0))
        except (ValueError, TypeError):
            return Response({'message': 'Invalid amount.'}, status=400)

        if amount_paise not in VALID_AMOUNTS_PAISE:
            return Response(
                {'message': f'Invalid amount. Allowed: {list(VALID_AMOUNTS_PAISE.keys())}'},
                status=400
            )

        try:
            order = client.order.create({
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
            })
        except Exception as exc:
            logger.error('Razorpay order creation failed: %s', exc)
            return Response({'message': 'Payment gateway error. Try again.'}, status=502)


class VerifyPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        order_id   = request.data.get('razorpay_order_id',   '').strip()
        payment_id = request.data.get('razorpay_payment_id', '').strip()
        sig        = request.data.get('razorpay_signature',  '').strip()
        booking    = request.data.get('booking', {})

        if not all([order_id, payment_id, sig]):
            return Response({'success': False, 'message': 'Missing payment fields.'}, status=400)

        # ── 1. Idempotency — prevent duplicate bookings ───────────────────────
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
                }
            })

        # ── 2. Signature verification ─────────────────────────────────────────
        msg      = f'{order_id}|{payment_id}'.encode('utf-8')
        secret   = settings.RAZORPAY_KEY_SECRET.encode('utf-8')
        expected = hmac_lib.new(secret, msg, digestmod=hashlib.sha256).hexdigest()

        if not hmac_lib.compare_digest(expected, sig):
            logger.warning('Invalid Razorpay signature for order %s', order_id)
            return Response({'success': False, 'message': 'Invalid signature.'}, status=400)

        # ── 3. Validate amount SERVER-SIDE ────────────────────────────────────
        try:
            order_details = client.order.fetch(order_id)
        except Exception as exc:
            logger.error('Failed to fetch Razorpay order %s: %s', order_id, exc)
            return Response({'success': False, 'message': 'Could not verify order.'}, status=502)

        amount_paise = int(order_details.get('amount', 0))
        plan_info    = VALID_AMOUNTS_PAISE.get(amount_paise)
        if not plan_info:
            logger.error('Invalid amount in verified order %s: %s paise', order_id, amount_paise)
            return Response({'success': False, 'message': 'Invalid payment amount.'}, status=400)

        amount_inr   = plan_info['fee']
        queue_access = plan_info['queue_access']

        # ── 4. Create booking + payment atomically ────────────────────────────
        try:
            from doctors.models import Doctor
            from payments.models import Payment

            doctor_id = booking.get('doctorId')
            if not doctor_id:
                return Response({'success': False, 'message': 'doctorId missing.'}, status=400)

            doctor   = Doctor.objects.select_related('hospital').get(pk=doctor_id)
            hospital = doctor.hospital

            date_val = booking.get('date', '').strip()
            slot_val = booking.get('slot', '').strip()

            if not date_val or not slot_val:
                return Response({'success': False, 'message': 'Date and slot are required.'}, status=400)

            if slot_val not in (doctor.slots or []):
                return Response({'success': False, 'message': 'Invalid slot.'}, status=400)

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
                    status       = 'waiting',
                    queue_access = queue_access,
                )

                Payment.objects.create(
                    booking    = new_booking,
                    order_id   = order_id,
                    payment_id = payment_id,
                    signature  = sig,
                    amount     = amount_inr,
                    status     = 'success',
                )

            logger.info(
                'Booking %s created for user %s doctor %s',
                new_booking.id, request.user.id, doctor.id
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
                }
            })

        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=404)
        except IntegrityError as exc:
            logger.error('Booking IntegrityError: %s', exc)
            return Response({'success': False, 'message': 'Booking conflict. Please try again.'}, status=409)
        except RuntimeError as exc:
            logger.error('Token generation failed: %s', exc)
            return Response({'success': False, 'message': 'Could not generate token.'}, status=500)
        except Exception as exc:
            logger.exception('Unexpected error in VerifyPaymentView: %s', exc)
            return Response({'success': False, 'message': 'Internal error.'}, status=500)


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
        completed = all_b.filter(status='completed').count()
        waiting   = all_b.filter(status='waiting').count()

        # Limit to 500 most recent for the reports table
        recent    = all_b[:500]
        bookings  = BookingSerializer(recent, many=True, context={'request': request}).data

        return Response({
            'total':     total,
            'completed': completed,
            'waiting':   waiting,
            'bookings':  bookings,
        })