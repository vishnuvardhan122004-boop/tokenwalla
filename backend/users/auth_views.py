import hmac
import secrets
import re
import logging
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import RateCounter
from .serializers import RegisterSerializer, UserSerializer
from tokenwalla.permissions import IsAdmin
from tokenwalla.utils import check_password_strength

logger = logging.getLogger('tokenwalla')
User   = get_user_model()


class OTPRateThrottle(AnonRateThrottle):
    # Requesting an OTP sends an SMS/voice call (real cost) → tight bucket.
    scope = 'otp'


class OTPVerifyRateThrottle(AnonRateThrottle):
    # Verifying an OTP / checking a mobile is cheap and happens several times in
    # a single login or reset flow, so it gets its own, looser bucket instead of
    # sharing the tight SMS-send 'otp' scope (which 429'd legitimate users
    # mid-login and let one NAT/CGNAT IP lock others out).
    scope = 'otp_verify'


class AdminSetupRateThrottle(AnonRateThrottle):
    # /auth/create-admin/ bootstraps a superuser behind a shared setup key.
    # Throttle hard so that key cannot be brute-forced over the network.
    scope = 'admin_setup'


# Max wrong OTP guesses before the code is burned and a new one must be sent.
# This is the primary defence against brute-forcing the numeric OTP — even a
# distributed attacker (bypassing per-IP throttling) only gets this many tries
# per issued code.
OTP_MAX_ATTEMPTS = 5

# Hard ceiling on how many OTP *sends* a single number can trigger in 24h.
# The 60s per-number cooldown alone still allows ~1440 paid SMS/day to one
# number (an attacker pacing just under it, or a real number being harassed);
# this caps the spend at OTP_MAX_SENDS_PER_DAY texts per number per day.
# A real user needs only a handful (login + the odd password reset), so 10 is
# generous for humans while turning SMS-flood abuse from "expensive" into "cheap".
OTP_MAX_SENDS_PER_DAY = 10
OTP_SEND_CAP_WINDOW   = 60 * 60 * 24  # seconds (24h)


OTP_ATTEMPT_WINDOW = 300   # seconds a wrong-guess count stays alive

# How long "this number proved it owns the OTP" stays true, for the endpoints
# that consume it (register, reset-password, the mobile change, and the hospital
# equivalents of all three).
#
# This flag is a BEARER token keyed on the phone number alone — it is not bound
# to a session, a device or a request, because an anonymous caller has none of
# those to bind to. So whoever calls /auth/reset-password/ first inside the
# window wins, not necessarily the person who passed the OTP. An attacker cannot
# create the flag (that still needs the code), so this is a race against a
# legitimate flow rather than an independent attack — but it is the
# account-takeover path, and 600 seconds was ten minutes of it.
#
# 180s is the mitigation, not the fix: it is comfortable for a human choosing
# and typing a new password on a phone, and cuts the window by 3.3x.
#
# ponytail: shortened window, not a bound token — the real fix is a one-time
# nonce returned by /otp/verify/ and required back by every consumer, which is
# a BREAKING API change and must ship with a mobile app release.
OTP_VERIFIED_WINDOW = 180


# Both caps below are counted in the DATABASE (users.RateCounter), not the
# cache. They used to use cache.add + cache.incr, which is only atomic on Redis:
# DatabaseCache inherits BaseCache.incr, a read-modify-write. That was harmless
# while gunicorn ran one sync worker and requests were strictly serialised, but
# with 3 workers x 4 threads twelve requests run at once and parallel attempts
# could each read the same count before any wrote back. These caps are the
# defence against OTP brute force and paid-SMS flooding, so they must not depend
# on which cache backend an env var happens to select.

def _reserve_otp_send(mobile):
    """Count an OTP send against the per-number daily cap.

    Returns True if the send is allowed, False once the number has hit
    OTP_MAX_SENDS_PER_DAY within the rolling 24h window (measured from the first
    send, not refreshed by later ones).
    """
    allowed, sends = RateCounter.bump(
        f'otp_sends:{mobile}',
        limit=OTP_MAX_SENDS_PER_DAY,
        window_seconds=OTP_SEND_CAP_WINDOW,
    )
    if not allowed:
        logger.warning('OTP daily send cap reached for mobile ...%s (%s sends)',
                       mobile[-4:], sends)
    return allowed


def _reserve_otp_send_for_ip(request):
    """Count an OTP send against the per-IP daily ceiling.

    The per-number cap can't see this attack: one host walking a list of a
    thousand different numbers spends one send on each and never trips it. The
    per-minute throttle only bounds the rate, not the day's total.

    Residual risk, stated plainly: a distributed attacker with many IPs still
    gets OTP_MAX_SENDS_PER_DAY per number. That's inherent — the per-number cap
    is the backstop there.

    Uses DRF's own ident so this counts the same client the throttle does
    (X-Forwarded-For behind Railway's proxy, not the proxy's own address).
    """
    ident = OTPRateThrottle().get_ident(request)
    if not ident:
        return True  # can't identify the caller — the per-number cap still applies

    allowed, sends = RateCounter.bump(
        f'otp_sends_ip:{ident}',
        limit=settings.OTP_MAX_SENDS_PER_IP_PER_DAY,
        window_seconds=OTP_SEND_CAP_WINDOW,
    )
    if not allowed:
        logger.warning('OTP daily send cap reached for ident %s (%s sends)', ident, sends)
    return allowed


# ── Password brute-force cap ─────────────────────────────────────────────────
# The OTP path is hardened to the teeth — 5 guesses per code, a per-number daily
# send cap, a per-IP daily ceiling, a CSPRNG code — and the PASSWORD door beside
# it had nothing at all. Both logins sat on the global AnonRateThrottle only,
# which is 300/minute (deliberately loose, because CGNAT puts a neighbourhood
# behind one address). With a 6-character minimum password and /auth/check-mobile/
# confirming which numbers exist, that is a workable online brute force.
#
# Counted per MOBILE, not per IP — for the same CGNAT reason the throttles are
# loose: an IP-keyed lockout would take out a whole carrier, and the thing under
# attack is the account, not the address. Counted in the DATABASE for the same
# reason the OTP caps are (users.RateCounter): cache.incr is only atomic on
# Redis, and a security control must not weaken because an env var changed.
#
# This locks the PASSWORD path only. Both login views accept an OTP in the same
# field, and that path keeps working — so a locked-out patient always has a way
# in, and an attacker cannot use this to deny someone their own account.
LOGIN_MAX_ATTEMPTS   = 5
LOGIN_ATTEMPT_WINDOW = 60 * 30   # seconds (30 minutes, rolling from the first)


def login_password_allowed(mobile):
    """Count one login attempt. False once the password path is locked out.

    Bumps on EVERY attempt and is cleared on success (`clear_login_failures`),
    so a normal login leaves the counter at zero. The window rolls from the
    first attempt, so hammering the endpoint cannot hold it open — same
    behaviour as every other RateCounter cap here.
    """
    allowed, count = RateCounter.bump(
        f'login_fails:{mobile}',
        limit=LOGIN_MAX_ATTEMPTS,
        window_seconds=LOGIN_ATTEMPT_WINDOW,
    )
    if not allowed:
        logger.warning('Password login locked for mobile ...%s (%s attempts)',
                       mobile[-4:], count)
    return allowed


def clear_login_failures(mobile):
    """Successful login — the account is not under attack. Reset the counter."""
    RateCounter.reset(f'login_fails:{mobile}')


def _register_otp_failure(mobile):
    """Count a wrong OTP guess; burn the code once the cap is hit."""
    _, attempts = RateCounter.bump(
        f'otp_attempts:{mobile}',
        limit=OTP_MAX_ATTEMPTS,
        window_seconds=OTP_ATTEMPT_WINDOW,
    )
    if attempts >= OTP_MAX_ATTEMPTS:
        cache.delete(f'otp_session:{mobile}')
        cache.delete(f'otp_via:{mobile}')
        RateCounter.reset(f'otp_attempts:{mobile}')
        logger.warning('OTP attempt cap reached for mobile ...%s — code invalidated', mobile[-4:])


def _clear_otp_state(mobile):
    """Clear all OTP state for a mobile after a successful verify.

    The issued code lives in the cache (losing it just means requesting another
    one); the attempt counter lives in the database. The daily SEND cap is
    deliberately NOT cleared — a successful login must not reset the spend
    ceiling, or flooding becomes free again by logging in once.
    """
    cache.delete(f'otp_session:{mobile}')
    cache.delete(f'otp_via:{mobile}')
    RateCounter.reset(f'otp_attempts:{mobile}')


# ── OTP Helpers ───────────────────────────────────────────────────────────────

def send_otp(mobile, otp, via='sms'):
    """
    Send OTP via 2factor.in.
    When TWOFACTOR_API_KEY is empty, runs in dev mode:
    the OTP is stored in cache and printed clearly to the console.
    """
    api_key = getattr(settings, 'TWOFACTOR_API_KEY', '')

    if not api_key:
        # ── DEV MODE ──────────────────────────────────────────────────────────
        cache.set(f'otp_session:{mobile}', str(otp), timeout=300)
        cache.set(f'otp_via:{mobile}',     via,       timeout=300)

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


def verify_otp(mobile, otp_entered, register_failure=True):
    """
    Verify OTP from cache.
    Returns True on success (and clears the cache entry).
    Returns False if OTP is wrong or expired.

    `register_failure` controls whether a mismatch counts against the per-code
    attempt cap. It MUST stay True for the dedicated OTP-verify endpoint, but
    login views pass False: they speculatively try the submitted value as both a
    password and an OTP, so counting those password mismatches would let anyone
    who knows a mobile number burn a victim's in-flight OTP session.
    """
    # Reject anything that is not a bare numeric code BEFORE it is used.
    # verify_otp is also fed the login form's `password` field, and the SMS
    # branch below interpolates this value into the 2Factor URL path — where
    # `../` would be normalised away client-side by urllib3 and let a caller
    # choose which 2Factor endpoint decides the auth outcome. Codes we issue are
    # always 6 digits (secrets.randbelow(900000) + 100000), so this rejects
    # nothing legitimate.
    if not re.fullmatch(r'\d{4,8}', str(otp_entered or '').strip()):
        return False

    api_key    = getattr(settings, 'TWOFACTOR_API_KEY', '')
    session_id = cache.get(f'otp_session:{mobile}')
    via        = cache.get(f'otp_via:{mobile}', 'sms')

    if not session_id:
        logger.debug('OTP verify: no session found for mobile ...%s', mobile[-4:])
        return False

    # Dev mode or voice call → direct string comparison
    if not api_key or via == 'voice':
        # Compare as UTF-8 bytes: hmac.compare_digest raises TypeError on a str
        # containing non-ASCII characters, and this input is user-controlled.
        result = hmac.compare_digest(
            str(session_id).strip().encode('utf-8'),
            str(otp_entered).strip().encode('utf-8'),
        )
        if result:
            _clear_otp_state(mobile)
            logger.info('OTP verified for mobile ...%s (dev/voice mode)', mobile[-4:])
        else:
            if register_failure:
                _register_otp_failure(mobile)
            logger.warning('OTP mismatch for mobile ...%s', mobile[-4:])
        return result

    # SMS production → verify via 2Factor API
    try:
        import requests
        url  = (
            'https://2factor.in/API/V1/'
            f'{api_key}/SMS/VERIFY/'
            f'{quote(str(session_id), safe="")}/{quote(str(otp_entered), safe="")}'
        )
        data = requests.get(url, timeout=8).json()
        if data.get('Status') == 'Success' and 'Matched' in str(data.get('Details', '')):
            _clear_otp_state(mobile)
            logger.info('OTP verified for mobile ...%s (2Factor SMS)', mobile[-4:])
            return True
        if register_failure:
            _register_otp_failure(mobile)
        logger.warning('OTP verify failed for ...%s: %s', mobile[-4:], data.get('Details'))
        return False
    except Exception:
        logger.exception('OTP verify error for mobile ending ...%s', mobile[-4:])
        return False


# ── Views ─────────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        # Registration is the one place identity is CREATED, so it needs the
        # same OTP-ownership gate every other mobile-bound operation uses
        # (ResetPasswordView, the MeView mobile change, hospital register/reset).
        # Both clients already call /auth/otp/verify/ first and set this flag;
        # checking it here stops anyone scripting the API from squatting a
        # stranger's number, which would then swallow that person's own OTP
        # login (mobile is USERNAME_FIELD and unique).
        mobile = str(request.data.get('mobile', '')).strip()
        if not cache.get(f'otp_verified:{mobile}'):
            return Response(
                {'message': 'Please verify your mobile with OTP first.'},
                status=400,
            )

        s = RegisterSerializer(data=request.data)
        if s.is_valid():
            user = s.save()
            cache.delete(f'otp_verified:{mobile}')
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

        # Locked accounts skip the password comparison entirely — but the OTP
        # branch below still runs, so the real owner always has a way in.
        unlocked    = login_password_allowed(mobile)
        password_ok = unlocked and user.check_password(password)
        # register_failure=False: a wrong password must not consume the OTP
        # attempt cap (that would let anyone burn a victim's OTP via login).
        otp_ok      = verify_otp(mobile, password, register_failure=False)

        if not password_ok and not otp_ok:
            logger.warning('Failed login attempt for mobile ending ...%s', mobile[-4:])
            if not unlocked:
                return Response(
                    {'message': 'Too many failed password attempts. Log in with an '
                                'OTP instead, or try again later.'},
                    status=429,
                )
            return Response({'message': 'Invalid credentials.'}, status=401)

        clear_login_failures(mobile)
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


class CheckMobileView(APIView):
    """
    POST /api/auth/check-mobile/
    Body: { "mobile": "9876543210", "type": "patient" | "hospital" }

    Checks whether a mobile number is registered before sending an OTP.
    Called by the login pages so the user gets a clear error immediately
    instead of receiving an OTP and then seeing "not registered" on submit.

    Returns:
        200  { "exists": true,  "status": "active" | "blocked" | "pending" | "rejected" }
        200  { "exists": false }

    Never reveals passwords, tokens, or any sensitive data.
    Throttled to prevent enumeration attacks.
    """
    permission_classes = [AllowAny]
    throttle_classes   = [OTPVerifyRateThrottle]

    def post(self, request):
        mobile       = request.data.get('mobile', '').strip()
        account_type = request.data.get('type',   'patient').strip().lower()

        if not re.match(r'^[6-9]\d{9}$', mobile):
            return Response({'message': 'Invalid mobile number.'}, status=400)

        if account_type == 'hospital':
            # ── Check hospital account ────────────────────────────────────────
            from hospitals.models import Hospital
            try:
                hospital = Hospital.objects.get(mobile=mobile)
                return Response({
                    'exists': True,
                    'status': hospital.status,   # active | pending | rejected
                })
            except Hospital.DoesNotExist:
                return Response({'exists': False})

        else:
            # ── Check patient / admin account ─────────────────────────────────
            try:
                user = User.objects.get(mobile=mobile)
                return Response({
                    'exists': True,
                    'status': getattr(user, 'status', 'active'),
                })
            except User.DoesNotExist:
                return Response({'exists': False})


class RequestOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [OTPRateThrottle]

    def post(self, request):
        mobile = request.data.get('mobile', '').strip()
        via    = request.data.get('via', 'sms').lower()

        if not re.match(r'^[6-9]\d{9}$', mobile):
            return Response({'message': 'Invalid mobile number.'}, status=400)

        if cache.get(f'otp_limit:{mobile}'):
            return Response({'message': 'Wait 60 seconds before requesting again.'}, status=429)

        # Per-IP daily ceiling — checked before the per-number budget so a host
        # that's already over its limit can't burn a real number's allowance.
        if not _reserve_otp_send_for_ip(request):
            return Response(
                # Not "tomorrow" — the window rolls 24h from the first send in
                # it (RateCounter.bump), so it can clear at any hour.
                {'message': 'Too many OTP requests from this network. Please try again later.'},
                status=429,
            )

        # Per-number daily ceiling — protects against SMS-flood abuse (real cost)
        # that paces itself just under the 60s cooldown.
        if not _reserve_otp_send(mobile):
            return Response(
                {'message': 'Too many OTP requests for this number today. Try again tomorrow.'},
                status=429,
            )

        # 6-digit code from a CSPRNG (100000–999999). Wider space + the
        # per-code attempt cap in verify_otp defeats brute-forcing.
        otp        = str(secrets.randbelow(900000) + 100000)
        cache.set(f'otp_limit:{mobile}', True, timeout=60)
        cache.delete(f'otp_attempts:{mobile}')  # fresh code → reset the counter
        session_id = send_otp(mobile, otp, via=via)

        if session_id is None:
            return Response({'message': 'Failed to send OTP. Try again.'}, status=500)

        return Response({'message': 'OTP sent.'})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [OTPVerifyRateThrottle]

    def post(self, request):
        mobile = request.data.get('mobile', '').strip()
        otp    = request.data.get('otp',    '').strip()

        if not mobile or not otp:
            return Response({'message': 'Mobile and OTP are required.'}, status=400)

        if verify_otp(mobile, otp):
            cache.set(f'otp_verified:{mobile}', True, timeout=OTP_VERIFIED_WINDOW)
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

        complaint = check_password_strength(password, user=user)
        if complaint:
            return Response({'message': complaint}, status=400)

        user.set_password(password)
        user.save(update_fields=['password'])
        cache.delete(f'otp_verified:{mobile}')
        # Whoever got here proved they own the number via OTP, which is a
        # stronger signal than the successful password login that already
        # clears this. Without it a locked-out user resets their password and
        # is still locked, with nothing on screen explaining why.
        clear_login_failures(mobile)
        logger.info('Password reset for user %s', user.id)
        return Response({'message': 'Password reset successfully.'})
    
class WhatsAppOptInView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        opted_in = request.data.get('whatsapp_opt_in')
        if not isinstance(opted_in, bool):
            return Response({'message': 'whatsapp_opt_in must be true or false.'}, status=400)
        request.user.whatsapp_opt_in = opted_in
        request.user.save(update_fields=['whatsapp_opt_in'])
        return Response({'whatsapp_opt_in': opted_in})

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

    def patch(self, request):
        """
        Update the logged-in user's own profile.
          - name   → updated directly (User.first_name)
          - mobile → only changes if the NEW number has been OTP-verified
                     (client calls /auth/otp/request/ then /auth/otp/verify/,
                     which sets the `otp_verified:<mobile>` cache flag).
        """
        user = request.user

        name = request.data.get('name')
        if name is not None and str(name).strip():
            user.first_name = str(name).strip()

        raw_mobile = request.data.get('mobile')
        new_mobile = str(raw_mobile).strip() if raw_mobile else None
        if new_mobile and new_mobile != user.mobile:
            if not re.match(r'^[6-9]\d{9}$', new_mobile):
                return Response({'message': 'Invalid mobile number.'}, status=400)
            if not cache.get(f'otp_verified:{new_mobile}'):
                return Response({'message': 'Please verify the new mobile with OTP first.'}, status=400)
            if User.objects.filter(mobile=new_mobile).exclude(pk=user.pk).exists():
                return Response({'message': 'This mobile is already in use.'}, status=400)
            user.mobile = new_mobile
            user.username = new_mobile
            cache.delete(f'otp_verified:{new_mobile}')

        user.save()
        logger.info('Profile updated for user %s', user.id)
        return Response(UserSerializer(user).data)


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

        if new_status == 'blocked':
            # Setting the flag is not enough on its own: StatusAwareJWTAuthentication
            # refuses the access token they already hold, but an un-blacklisted
            # refresh token would keep minting new ones — and with
            # ROTATE_REFRESH_TOKENS it renews its own 14-day life each time, so
            # the block would never actually land.
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken, OutstandingToken,
            )
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)

        logger.info('User %s → %s (by admin %s)', pk, new_status, request.user.id)
        return Response(UserSerializer(user).data)


class CreateAdminView(APIView):
    """
    Web-based admin account creation — protected by ADMIN_SETUP_KEY.

    POST /api/auth/create-admin/
    Body: { setup_key, mobile, password, name }

    Returns 201 (created) or 200 (updated existing account).
    Returns 503 if ADMIN_SETUP_KEY is not configured.
    Returns 403 on wrong key.
    """
    permission_classes = [AllowAny]
    throttle_classes   = [AdminSetupRateThrottle]

    def post(self, request):
        import re as _re

        setup_key = request.data.get('setup_key', '').strip()
        mobile    = request.data.get('mobile',    '').strip()
        password  = request.data.get('password',  '').strip()
        name      = request.data.get('name',      'Admin').strip()

        # ── 1. Check that setup key is configured ─────────────────────────────
        expected_key = getattr(settings, 'ADMIN_SETUP_KEY', '').strip()
        if not expected_key:
            return Response(
                {'message': 'Admin setup is not enabled. Set ADMIN_SETUP_KEY in your environment.'},
                status=503,
            )

        # ── 2. Validate setup key (constant-time, byte-safe) ──────────────────
        if not hmac.compare_digest(setup_key.encode('utf-8'), expected_key.encode('utf-8')):
            logger.warning(
                'Invalid admin setup key attempt from IP %s',
                request.META.get('REMOTE_ADDR', 'unknown'),
            )
            return Response(
                {'message': 'Invalid setup key. Check your ADMIN_SETUP_KEY environment variable.'},
                status=403,
            )

        # ── 3. Validate inputs ────────────────────────────────────────────────
        if not _re.match(r'^\d{10}$', mobile):
            return Response({'message': 'Mobile must be exactly 10 digits.'}, status=400)
        if len(password) < 8:
            return Response({'message': 'Password must be at least 8 characters.'}, status=400)
        if not name or len(name) < 2:
            return Response({'message': 'Name must be at least 2 characters.'}, status=400)

        # Before get_or_create, so a weak password cannot leave a created-but-
        # unconfigured admin row behind. Stand-in user gives the similarity
        # check the mobile and name to compare against.
        complaint = check_password_strength(
            password, user=User(username=mobile, mobile=mobile, first_name=name),
        )
        if complaint:
            return Response({'message': complaint}, status=400)

        # ── 4. Create or update admin ─────────────────────────────────────────
        user, created = User.objects.get_or_create(
            mobile=mobile,
            defaults={
                'username':     mobile,
                'first_name':   name,
                'is_staff':     True,
                'is_superuser': True,
            },
        )

        user.first_name   = name
        user.role         = 'admin'
        user.is_staff     = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        action = 'Created' if created else 'Updated'
        logger.info('%s admin account for mobile ending ...%s', action, mobile[-4:])

        return Response(
            {
                'message': f'Admin account {action.lower()} successfully. You can now log in at /2004.',
                'action':  action.lower(),
            },
            status=201 if created else 200,
        )