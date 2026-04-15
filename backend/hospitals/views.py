import logging
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Hospital
from .serializers import HospitalSerializer
from tokenwalla.permissions import IsAdmin

logger = logging.getLogger('tokenwalla')
User   = get_user_model()


# ── OTP helper (self-contained, no cross-app import) ─────────────────────────

def _verify_otp(mobile, otp_entered):
    """Mirror of users.auth_views.verify_otp — kept local to avoid circular import."""
    from django.core.cache import cache
    api_key    = getattr(settings, 'TWOFACTOR_API_KEY', '')
    session_id = cache.get(f'otp_session:{mobile}')
    via        = cache.get(f'otp_via:{mobile}', 'sms')

    if not session_id:
        return False

    if not api_key or via == 'voice':
        result = str(session_id) == str(otp_entered)
        if result:
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
        return result

    try:
        import requests as req
        url  = f'https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp_entered}'
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
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            HospitalSerializer(
                Hospital.objects.filter(status='active').order_by('name'),
                many=True
            ).data
        )


class HospitalRegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data     = request.data
        mobile   = data.get('mobile',   '').strip()
        name     = data.get('name',     '').strip()
        password = data.get('password', '').strip()

        if not name or not mobile or not password:
            return Response({'message': 'Name, mobile and password are required.'}, status=400)

        if Hospital.objects.filter(mobile=mobile).exists():
            return Response({'message': 'Mobile already registered.'}, status=400)
        if User.objects.filter(mobile=mobile).exists():
            return Response({'message': 'Mobile already registered as a user.'}, status=400)

        hospital = Hospital.objects.create(
            name     = name,
            city     = data.get('city',    '').strip(),
            address  = data.get('address', '').strip(),
            mobile   = mobile,
            password = make_password(password),
            status   = 'active',
        )

        user = User(
            username   = mobile,
            mobile     = mobile,
            first_name = name,
            role       = 'hospital',
        )
        user.set_password(password)
        user.save()

        # Store hospital reference via last_name (no schema change needed)
        user.last_name = str(hospital.id)
        user.save(update_fields=['last_name'])

        logger.info('Hospital %s registered (id=%s)', name, hospital.id)
        return Response(HospitalSerializer(hospital).data, status=201)


class HospitalLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        mobile   = request.data.get('mobile',   '').strip()
        password = request.data.get('password', '').strip()

        if not mobile or not password:
            return Response({'message': 'Mobile and password/OTP required.'}, status=400)

        try:
            hospital = Hospital.objects.get(mobile=mobile)
        except Hospital.DoesNotExist:
            return Response({'message': 'Invalid credentials.'}, status=401)

        if hospital.status != 'active':
            return Response({'message': 'Hospital account is not active.'}, status=403)

        password_ok = check_password(password, hospital.password)
        otp_ok      = _verify_otp(mobile, password)

        if not password_ok and not otp_ok:
            logger.warning('Failed hospital login for mobile ending ...%s', mobile[-4:])
            return Response({'message': 'Invalid credentials.'}, status=401)

        user, created = User.objects.get_or_create(
            mobile=mobile,
            defaults={
                'username':   mobile,
                'first_name': hospital.name,
                'role':       'hospital',
                'last_name':  str(hospital.id),
            }
        )
        if created:
            if password_ok:
                user.set_password(password)
            else:
                user.set_unusable_password()
            user.last_name = str(hospital.id)
            user.save()

        if user.role != 'hospital':
            user.role = 'hospital'
            user.save(update_fields=['role'])

        if user.last_name != str(hospital.id):
            user.last_name = str(hospital.id)
            user.save(update_fields=['last_name'])

        refresh = RefreshToken.for_user(user)

        return Response({
            'user': {
                'id':     user.id,
                'name':   user.first_name or user.username,
                'mobile': user.mobile,
                'role':   'hospital',
                'status': getattr(user, 'status', 'active'),
                'hospital': {
                    'id':      hospital.id,
                    'name':    hospital.name,
                    'city':    hospital.city,
                    'address': hospital.address,
                    'mobile':  hospital.mobile,
                    'status':  hospital.status,
                },
            },
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
        })


class HospitalDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            return Response(HospitalSerializer(Hospital.objects.get(pk=pk)).data)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)


class HospitalResetPasswordView(APIView):
    """POST { mobile, otp, password } — uses verified flag from VerifyOTPView."""
    permission_classes = [AllowAny]

    def post(self, request):
        mobile   = request.data.get('mobile',   '').strip()
        otp      = request.data.get('otp',      '').strip()
        password = request.data.get('password', '').strip()

        if not mobile or not otp or not password:
            return Response({'message': 'Mobile, OTP and password are required.'}, status=400)
        if len(password) < 6:
            return Response({'message': 'Password must be at least 6 characters.'}, status=400)

        if not cache.get(f'otp_verified:{mobile}'):
            return Response({'message': 'OTP not verified. Please verify OTP first.'}, status=400)

        try:
            hospital          = Hospital.objects.get(mobile=mobile)
            hospital.password = make_password(password)
            hospital.save(update_fields=['password'])
        except Hospital.DoesNotExist:
            return Response({'message': 'No hospital found with this mobile.'}, status=404)

        # Also update the linked User password
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
    """Admin only — list all hospitals."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(
            HospitalSerializer(Hospital.objects.all().order_by('name'), many=True).data
        )