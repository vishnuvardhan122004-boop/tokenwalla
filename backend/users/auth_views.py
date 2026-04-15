import random
import re
import logging

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .serializers import RegisterSerializer, UserSerializer
from tokenwalla.permissions import IsAdmin

logger = logging.getLogger('tokenwalla')
User   = get_user_model()


class OTPRateThrottle(AnonRateThrottle):
    scope = 'otp'


# ── OTP Helpers ───────────────────────────────────────────────────────────────

def send_otp(mobile, otp, via='sms'):
    """
    Send OTP via 2factor.in.
    Returns session_id/otp string on success, None on failure.
    Secrets are NEVER logged.
    """
    api_key = getattr(settings, 'TWOFACTOR_API_KEY', '')
    if not api_key:
        # Dev mode: store OTP directly
        logger.info('[DEV] OTP for %s generated (not logged for security)', mobile)
        cache.set(f'otp_session:{mobile}', str(otp), timeout=300)
        cache.set(f'otp_via:{mobile}',     via,       timeout=300)
        return str(otp)

    try:
        import requests
        channel          = 'VOICE' if via == 'voice' else 'SMS'
        mobile_formatted = mobile[-10:] if via == 'voice' else (
            f'91{mobile}' if not mobile.startswith('91') else mobile
        )
        url  = f'https://2factor.in/API/V1/{api_key}/{channel}/{mobile_formatted}/{otp}'
        res  = requests.get(url, timeout=5)
        data = res.json()

        if data.get('Status') == 'Success':
            stored = str(otp) if via == 'voice' else data.get('Details')
            cache.set(f'otp_session:{mobile}', stored,  timeout=300)
            cache.set(f'otp_via:{mobile}',     via,     timeout=300)
            return stored

        logger.warning('2Factor OTP send failed for %s: %s', mobile, data.get('Details'))
        return None
    except Exception:
        logger.exception('OTP send error for mobile ending ...%s', mobile[-4:])
        return None


def verify_otp(mobile, otp_entered):
    """
    Verify OTP from cache. Returns True/False.
    """
    api_key    = getattr(settings, 'TWOFACTOR_API_KEY', '')
    session_id = cache.get(f'otp_session:{mobile}')
    via        = cache.get(f'otp_via:{mobile}', 'sms')

    if not session_id:
        logger.debug('OTP verify: no session for mobile ending ...%s', mobile[-4:])
        return False

    # Dev mode or voice — direct comparison
    if not api_key or via == 'voice':
        result = str(session_id) == str(otp_entered)
        if result:
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
        return result

    # SMS production — 2Factor verify endpoint
    try:
        import requests
        url  = f'https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp_entered}'
        data = requests.get(url, timeout=5).json()
        if data.get('Status') == 'Success' and 'Matched' in str(data.get('Details', '')):
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
            return True
        return False
    except Exception:
        logger.exception('OTP verify error for mobile ending ...%s', mobile[-4:])
        return False


# ── Views ─────────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        if s.is_valid():
            user = s.save()
            r    = RefreshToken.for_user(user)
            return Response({
                'user':    UserSerializer(user).data,
                'access':  str(r.access_token),
                'refresh': str(r),
            }, status=201)
        return Response(s.errors, status=400)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        mobile   = request.data.get('mobile',   '').strip()
        password = request.data.get('password', '').strip()

        if not mobile or not password:
            return Response({'message': 'Mobile and password/OTP required.'}, status=400)

        try:
            user = User.objects.get(mobile=mobile)
        except User.DoesNotExist:
            return Response({'message': 'No account found with this mobile.'}, status=401)

        if user.status == 'blocked':
            return Response({'message': 'Account blocked. Contact support.'}, status=403)

        password_ok = user.check_password(password)
        otp_ok      = verify_otp(mobile, password)

        if not password_ok and not otp_ok:
            logger.warning('Failed login attempt for mobile ending ...%s', mobile[-4:])
            return Response({'message': 'Invalid credentials.'}, status=401)

        r = RefreshToken.for_user(user)
        return Response({
            'user':    UserSerializer(user).data,
            'access':  str(r.access_token),
            'refresh': str(r),
        })


class LogoutView(APIView):
    """Blacklist the refresh token so it can't be reused."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh', '').strip()
        if not refresh_token:
            return Response({'message': 'Refresh token required.'}, status=400)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully.'})
        except TokenError:
            return Response({'message': 'Invalid or expired token.'}, status=400)


class RequestOTPView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [OTPRateThrottle]

    def post(self, request):
        mobile = request.data.get('mobile', '').strip()
        via    = request.data.get('via', 'sms').lower()

        if not re.match(r'^[6-9]\d{9}$', mobile):
            return Response({'message': 'Invalid mobile number.'}, status=400)

        if cache.get(f'otp_limit:{mobile}'):
            return Response({'message': 'Wait 60 seconds before requesting again.'}, status=429)

        otp        = str(random.randint(1000, 9999))
        cache.set(f'otp_limit:{mobile}', True, timeout=60)
        session_id = send_otp(mobile, otp, via=via)

        if session_id is None:
            return Response({'message': 'Failed to send OTP. Try again.'}, status=500)
        return Response({'message': 'OTP sent.'})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        mobile = request.data.get('mobile', '').strip()
        otp    = request.data.get('otp',    '').strip()

        if verify_otp(mobile, otp):
            cache.set(f'otp_verified:{mobile}', True, timeout=600)
            return Response({'message': 'OTP verified.', 'verified': True})
        return Response({'message': 'Invalid or expired OTP.', 'verified': False}, status=400)


class ResetPasswordView(APIView):
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
            user = User.objects.get(mobile=mobile)
        except User.DoesNotExist:
            return Response({'message': 'No account found with this mobile.'}, status=404)

        user.set_password(password)
        user.save(update_fields=['password'])
        cache.delete(f'otp_verified:{mobile}')
        logger.info('Password reset for user %s', user.id)
        return Response({'message': 'Password reset successfully.'})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AllUsersView(APIView):
    """Admin only — list all users with pagination."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from rest_framework.pagination import PageNumberPagination
        paginator          = PageNumberPagination()
        paginator.page_size = 100

        qs   = User.objects.all().order_by('-date_joined')
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            UserSerializer(page, many=True).data
        )


class BlockUserView(APIView):
    """Admin only — block/unblock a user."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)

        new_status = request.data.get('status', 'blocked')
        if new_status not in ('active', 'blocked'):
            return Response({'message': 'Invalid status.'}, status=400)

        user.status = new_status
        user.save(update_fields=['status'])
        logger.info('User %s status changed to %s by admin %s', pk, new_status, request.user.id)
        return Response(UserSerializer(user).data)