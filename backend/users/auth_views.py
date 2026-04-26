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
    When TWOFACTOR_API_KEY is empty, runs in dev mode:
    the OTP is stored in Redis cache and printed clearly to the console.
    """
    api_key = getattr(settings, 'TWOFACTOR_API_KEY', '')

    if not api_key:
        # ── DEV MODE ──────────────────────────────────────────────────────────
        # Store OTP in cache so verify_otp() can read it
        cache.set(f'otp_session:{mobile}', str(otp), timeout=300)
        cache.set(f'otp_via:{mobile}',     via,       timeout=300)

        # Print clearly so you can see it during development
        border = "─" * 50
        print(f"\n┌{border}┐")
        print(f"│  📱 DEV OTP  │  Mobile: {mobile}  │  OTP: {otp}  │")
        print(f"└{border}┘\n")

        logger.warning(
            '[DEV MODE] OTP for mobile ...%s → %s (expires in 5 min)',
            mobile[-4:], otp
        )
        return str(otp)

    # ── PRODUCTION MODE ────────────────────────────────────────────────────────
    try:
        import requests
        channel          = 'VOICE' if via == 'voice' else 'SMS'
        mobile_formatted = mobile[-10:] if via == 'voice' else (
            f'91{mobile}' if not mobile.startswith('91') else mobile
        )
        url  = f'https://2factor.in/API/V1/{api_key}/{channel}/{mobile_formatted}/{otp}'
        res  = requests.get(url, timeout=8)
        data = res.json()

        if data.get('Status') == 'Success':
            # For voice OTP, store the raw OTP (verified by comparison)
            # For SMS OTP, store the session ID (verified via 2Factor API)
            stored = str(otp) if via == 'voice' else data.get('Details')
            cache.set(f'otp_session:{mobile}', stored, timeout=300)
            cache.set(f'otp_via:{mobile}',     via,    timeout=300)
            logger.info('OTP sent via %s to mobile ...%s', channel, mobile[-4:])
            return stored

        logger.warning(
            'OTP send failed for ...%s via %s: %s',
            mobile[-4:], channel, data.get('Details', 'unknown error')
        )
        return None

    except Exception:
        logger.exception('OTP send error for mobile ending ...%s', mobile[-4:])
        return None


def verify_otp(mobile, otp_entered):
    """
    Verify OTP from Redis cache.
    Returns True on success (and clears the cache entry).
    Returns False if OTP is wrong or expired.
    """
    api_key    = getattr(settings, 'TWOFACTOR_API_KEY', '')
    session_id = cache.get(f'otp_session:{mobile}')
    via        = cache.get(f'otp_via:{mobile}', 'sms')

    if not session_id:
        logger.debug('OTP verify: no session found for mobile ...%s', mobile[-4:])
        return False

    # Dev mode or voice call → direct string comparison
    if not api_key or via == 'voice':
        result = str(session_id).strip() == str(otp_entered).strip()
        if result:
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
            logger.info('OTP verified for mobile ...%s (dev/voice mode)', mobile[-4:])
        else:
            logger.warning(
                'OTP mismatch for mobile ...%s (entered: %s)',
                mobile[-4:], otp_entered
            )
        return result

    # SMS production → verify via 2Factor API
    try:
        import requests
        url  = f'https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp_entered}'
        data = requests.get(url, timeout=8).json()
        if data.get('Status') == 'Success' and 'Matched' in str(data.get('Details', '')):
            cache.delete(f'otp_session:{mobile}')
            cache.delete(f'otp_via:{mobile}')
            logger.info('OTP verified for mobile ...%s (2Factor SMS)', mobile[-4:])
            return True
        logger.warning('OTP verify failed for ...%s: %s', mobile[-4:], data.get('Details'))
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
    """
    Authenticate a patient or admin user.
    Hospital users should use /api/hospitals/login/ instead.
    This endpoint also works for hospital users who already have a User record.
    """
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

        if getattr(user, 'status', 'active') == 'blocked':
            return Response({'message': 'Account blocked. Contact support.'}, status=403)

        password_ok = user.check_password(password)
        otp_ok      = verify_otp(mobile, password)

        if not password_ok and not otp_ok:
            logger.warning('Failed login attempt for mobile ending ...%s', mobile[-4:])
            return Response({'message': 'Invalid credentials.'}, status=401)

        r = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data

        # Attach hospital object for hospital-role users (needed by Hdashboard)
        if user.role == 'hospital':
            try:
                hospital_id = int(user.last_name)
                from hospitals.models import Hospital
                from hospitals.serializers import HospitalSerializer
                hospital              = Hospital.objects.get(pk=hospital_id)
                user_data['hospital'] = HospitalSerializer(hospital).data
            except Exception as e:
                logger.warning('Could not attach hospital to login response: %s', e)

        return Response({
            'user':    user_data,
            'access':  str(r.access_token),
            'refresh': str(r),
        })


class LogoutView(APIView):
    """Blacklist the refresh token so it cannot be reused."""
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

        if not mobile or not otp:
            return Response({'message': 'Mobile and OTP are required.'}, status=400)

        if verify_otp(mobile, otp):
            # Store verification flag so reset-password can use it
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
        user_data = UserSerializer(request.user).data
        if request.user.role == 'hospital':
            try:
                hospital_id = int(request.user.last_name)
                from hospitals.models import Hospital
                from hospitals.serializers import HospitalSerializer
                hospital              = Hospital.objects.get(pk=hospital_id)
                user_data['hospital'] = HospitalSerializer(hospital).data
            except Exception:
                pass
        return Response(user_data)


class AllUsersView(APIView):
    """Admin only — list all users (paginated)."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from rest_framework.pagination import PageNumberPagination
        paginator           = PageNumberPagination()
        paginator.page_size = int(request.query_params.get('page_size', 100))

        qs   = User.objects.all().order_by('-date_joined')
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            UserSerializer(page, many=True).data
        )


class BlockUserView(APIView):
    """Admin only — block or unblock a user."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'message': 'User not found.'}, status=404)

        new_status = request.data.get('status', 'blocked')
        if new_status not in ('active', 'blocked'):
            return Response({'message': 'Status must be "active" or "blocked".'}, status=400)

        user.status = new_status
        user.save(update_fields=['status'])
        logger.info('User %s → %s (by admin %s)', pk, new_status, request.user.id)
        return Response(UserSerializer(user).data)

        
# TEMPORARY — remove after use
from django.http import JsonResponse
from django.views import View

class TempResetAdminView(View):
    def get(self, request):
        secret = request.GET.get('secret', '')
        if secret != 'tw-reset-2026':
            return JsonResponse({'error': 'forbidden'}, status=403)
        
        mobile   = request.GET.get('mobile', '')
        password = request.GET.get('password', '')
        
        if not mobile or not password:
            return JsonResponse({'error': 'mobile and password required'})
        
        try:
            # Get OR CREATE the admin user
            user, created = User.objects.get_or_create(
                mobile=mobile,
                defaults={
                    'username':    mobile,
                    'first_name':  'Admin',
                    'is_staff':    True,
                    'is_superuser': True,
                    'role':        'admin',
                }
            )
            # Always update these fields
            user.username     = mobile
            user.role         = 'admin'
            user.is_staff     = True
            user.is_superuser = True
            user.first_name   = 'Admin'
            user.set_password(password)
            user.save()

            return JsonResponse({
                'success': True,
                'created': created,
                'message': f'Admin {"created" if created else "updated"} for {mobile}',
                'role':    user.role,
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)