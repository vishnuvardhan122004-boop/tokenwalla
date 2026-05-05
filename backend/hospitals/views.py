import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.conf import settings
from django.core.cache import cache
from django.db import transaction

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Hospital
from .serializers import HospitalSerializer
from tokenwalla.permissions import IsAdmin

logger = logging.getLogger('tokenwalla')
User = get_user_model()


# ── OTP helper ────────────────────────────────────────────────────────────────

def _verify_otp(mobile, otp_entered):
    """
    Verifies an OTP for the given mobile number.
    Mirrors users.auth_views.verify_otp — kept local to avoid circular import.
    """
    api_key = getattr(settings, 'TWOFACTOR_API_KEY', '')
    session_id = cache.get(f'otp_session:{mobile}')
    via = cache.get(f'otp_via:{mobile}', 'sms')

    if not session_id:
        return False

    # Fallback: compare session_id directly (dev / voice mode)
    if not api_key or via == 'voice':
        result = str(session_id) == str(otp_entered)
        if result:
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
        return result

    # Live: call 2factor.in
    try:
        import requests as req
        url = f'https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp_entered}'
        data = req.get(url, timeout=5).json()
        if data.get('Status') == 'Success' and 'Matched' in str(data.get('Details', '')):
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
            return True
        return False
    except Exception:
        logger.exception('Hospital OTP verify error for mobile ending ...%s', mobile[-4:])
        return False


# ── Views ─────────────────────────────────────────────────────────────────────

class HospitalListView(APIView):
    """Public — list only APPROVED (active) hospitals."""
    permission_classes = [AllowAny]

    def get(self, request):
        hospitals = Hospital.objects.filter(status='active').order_by('name')
        return Response(HospitalSerializer(hospitals, many=True).data)


class HospitalRegisterView(APIView):
    """
    Public — register a new hospital.
    New hospitals start with status='pending' and must be approved by an admin
    before they can log in or appear publicly.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        mobile = data.get('mobile', '').strip()
        name = data.get('name', '').strip()
        password = data.get('password', '').strip()

        if not name or not mobile or not password:
            return Response(
                {'message': 'Name, mobile and password are required.'},
                status=400,
            )

        if Hospital.objects.filter(mobile=mobile).exists():
            return Response(
                {'message': 'Mobile already registered as a hospital.'},
                status=400,
            )
        if User.objects.filter(mobile=mobile).exists():
            return Response(
                {'message': 'Mobile already registered.'},
                status=400,
            )

        hospital = Hospital.objects.create(
            name=name,
            city=data.get('city', '').strip(),
            address=data.get('address', '').strip(),
            mobile=mobile,
            password=make_password(password),
            status='pending',
        )

        # Create a linked Django User (inactive until admin approves)
        user = User(
            username=mobile,
            mobile=mobile,
            first_name=name,
            last_name=str(hospital.id),
            role='hospital',
            is_active=False,
        )
        user.set_password(password)
        user.save()

        logger.info(
            'Hospital "%s" registered (id=%s, user=%s) — awaiting admin approval',
            name, hospital.id, user.id,
        )
        return Response(
            {
                'message': (
                    'Registration submitted successfully! '
                    'Your account is under review and will be activated by an admin shortly.'
                ),
                'status': 'pending',
                'hospital': HospitalSerializer(hospital).data,
            },
            status=201,
        )


class HospitalLoginView(APIView):
    """Public — authenticate a hospital account, return JWT tokens."""
    permission_classes = [AllowAny]

    def post(self, request):
        mobile = request.data.get('mobile', '').strip()
        password = request.data.get('password', '').strip()

        if not mobile or not password:
            return Response(
                {'message': 'Mobile and password/OTP required.'},
                status=400,
            )

        try:
            hospital = Hospital.objects.get(mobile=mobile)
        except Hospital.DoesNotExist:
            return Response({'message': 'Invalid credentials.'}, status=401)

        # Block non-active hospitals
        if hospital.status == 'pending':
            return Response(
                {
                    'message': (
                        'Your hospital registration is under review. '
                        'You will be notified once an admin approves your account.'
                    )
                },
                status=403,
            )
        if hospital.status == 'rejected':
            return Response(
                {
                    'message': (
                        'Your hospital registration was not approved. '
                        'Please contact support at tokentraq@gmail.com.'
                    )
                },
                status=403,
            )
        if hospital.status != 'active':
            return Response(
                {'message': 'Hospital account is not active. Contact admin.'},
                status=403,
            )

        password_ok = check_password(password, hospital.password)
        otp_ok = _verify_otp(mobile, password)

        if not password_ok and not otp_ok:
            logger.warning('Failed hospital login for mobile ending ...%s', mobile[-4:])
            return Response({'message': 'Invalid credentials.'}, status=401)

        user, created = User.objects.get_or_create(
            mobile=mobile,
            defaults={
                'username': mobile,
                'first_name': hospital.name,
                'last_name': str(hospital.id),
                'role': 'hospital',
                'is_active': True,
            },
        )

        needs_save = False
        if not user.is_active:
            user.is_active = True
            needs_save = True
        if user.role != 'hospital':
            user.role = 'hospital'
            needs_save = True
        if user.last_name != str(hospital.id):
            user.last_name = str(hospital.id)
            needs_save = True
        if user.first_name != hospital.name:
            user.first_name = hospital.name
            needs_save = True
        if created and password_ok:
            user.set_password(password)
            needs_save = True
        if needs_save:
            user.save()

        refresh = RefreshToken.for_user(user)
        return Response({
            'user': {
                'id': user.id,
                'name': user.first_name or user.username,
                'mobile': user.mobile,
                'role': 'hospital',
                'status': getattr(user, 'status', 'active'),
                'hospital': {
                    'id': hospital.id,
                    'name': hospital.name,
                    'city': hospital.city,
                    'address': hospital.address,
                    'mobile': hospital.mobile,
                    'status': hospital.status,
                },
            },
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })


class HospitalDetailView(APIView):
    """Public — fetch a single hospital by PK."""
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)
        return Response(HospitalSerializer(hospital).data)


class HospitalResetPasswordView(APIView):
    """Public — reset hospital password after OTP verification."""
    permission_classes = [AllowAny]

    def post(self, request):
        mobile = request.data.get('mobile', '').strip()
        otp = request.data.get('otp', '').strip()
        password = request.data.get('password', '').strip()

        if not mobile or not otp or not password:
            return Response(
                {'message': 'Mobile, OTP and password are required.'},
                status=400,
            )
        if len(password) < 6:
            return Response(
                {'message': 'Password must be at least 6 characters.'},
                status=400,
            )
        if not cache.get(f'otp_verified:{mobile}'):
            return Response(
                {'message': 'OTP not verified. Please verify OTP first.'},
                status=400,
            )

        try:
            hospital = Hospital.objects.get(mobile=mobile)
        except Hospital.DoesNotExist:
            return Response(
                {'message': 'No hospital found with this mobile.'},
                status=404,
            )

        hospital.password = make_password(password)
        hospital.save(update_fields=['password'])

        try:
            user = User.objects.get(mobile=mobile)
            user.set_password(password)
            user.save(update_fields=['password'])
        except User.DoesNotExist:
            pass

        cache.delete(f'otp_verified:{mobile}')
        logger.info('Hospital password reset for mobile ending ...%s', mobile[-4:])
        return Response({'message': 'Password reset successfully.'})


class HospitalAdminListView(APIView):
    """Admin only — list ALL hospitals including pending and rejected."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        hospitals = Hospital.objects.all().order_by('name')
        return Response(HospitalSerializer(hospitals, many=True).data)


class HospitalApproveView(APIView):
    """
    Admin only — approve or reject a hospital registration.
    PATCH /api/hospitals/<pk>/approve/
    Body: { "action": "approve" | "reject" }
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Hospital not found.'}, status=404)

        action = request.data.get('action', '').strip().lower()
        if action not in ('approve', 'reject'):
            return Response(
                {'message': 'action must be "approve" or "reject".'},
                status=400,
            )

        if action == 'approve':
            hospital.status = 'active'
            hospital.save(update_fields=['status'])

            try:
                user = User.objects.get(mobile=hospital.mobile)
                if not user.is_active:
                    user.is_active = True
                    user.save(update_fields=['is_active'])
            except User.DoesNotExist:
                pass

            logger.info(
                'Admin %s approved hospital %s ("%s")',
                request.user.id, hospital.id, hospital.name,
            )
            return Response({
                'message': f'Hospital "{hospital.name}" has been approved and is now active.',
                'hospital': HospitalSerializer(hospital).data,
            })

        # action == 'reject'
        hospital.status = 'rejected'
        hospital.save(update_fields=['status'])

        try:
            user = User.objects.get(mobile=hospital.mobile)
            if user.is_active:
                user.is_active = False
                user.save(update_fields=['is_active'])
        except User.DoesNotExist:
            pass

        logger.info(
            'Admin %s rejected hospital %s ("%s")',
            request.user.id, hospital.id, hospital.name,
        )
        return Response({
            'message': f'Hospital "{hospital.name}" has been rejected.',
            'hospital': HospitalSerializer(hospital).data,
        })


class HospitalBookingSummaryView(APIView):
    """
    Admin only — returns booking counts for a hospital.
    GET /api/hospitals/<pk>/booking-summary/
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        from bookings.models import Booking

        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)

        qs = Booking.objects.filter(hospital=hospital)
        return Response({
            'total': qs.count(),
            'active': qs.filter(status__in=['waiting', 'in_progress']).count(),
            'waiting': qs.filter(status='waiting').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'completed': qs.filter(status='completed').count(),
            'cancelled': qs.filter(status='cancelled').count(),
            'doctors': hospital.doctors.count(),
        })


class HospitalForceDeleteView(APIView):
    """
    Admin only — safely deletes a hospital by:
      1. Cancelling all active bookings
      2. Deleting all booking records
      3. Deleting all doctors
      4. Deleting the linked Django User
      5. Deleting the hospital
    DELETE /api/hospitals/<pk>/force-delete/
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def delete(self, request, pk):
        from bookings.models import Booking

        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Hospital not found.'}, status=404)

        name = hospital.name

        try:
            with transaction.atomic():
                cancelled = Booking.objects.filter(
                    hospital=hospital,
                    status__in=['waiting', 'in_progress'],
                ).update(status='cancelled')

                bookings_deleted = Booking.objects.filter(hospital=hospital).delete()[0]

                doctors_deleted = hospital.doctors.count()
                hospital.doctors.all().delete()

                User.objects.filter(mobile=hospital.mobile).delete()

                hospital.delete()

        except Exception as exc:
            logger.exception('Force-delete failed for hospital %s: %s', pk, exc)
            return Response({'message': f'Delete failed: {exc}'}, status=500)

        logger.info(
            'Admin %s force-deleted hospital "%s" (id=%s): '
            '%s bookings cancelled, %s records deleted, %s doctors removed.',
            request.user.id, name, pk, cancelled, bookings_deleted, doctors_deleted,
        )
        return Response({
            'message': (
                f'Hospital "{name}" deleted successfully. '
                f'{cancelled} active booking(s) cancelled. '
                f'{bookings_deleted} booking records removed. '
                f'{doctors_deleted} doctor(s) removed.'
            ),
            'cancelled_bookings': cancelled,
            'deleted_bookings': bookings_deleted,
            'deleted_doctors': doctors_deleted,
        })