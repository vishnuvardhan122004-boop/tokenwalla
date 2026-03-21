import random, re
from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


# ── OTP Helpers ───────────────────────────────────────────────────────────────

def send_otp(mobile, otp, via="sms"):
    """
    via="sms"   → SMS text (2factor needs 91XXXXXXXXXX)
    via="voice" → Voice call (2factor needs 10-digit number)
    VOICE has no verify endpoint — store OTP directly for self-verification.
    """
    api_key = getattr(settings, "TWOFACTOR_API_KEY", "")
    if not api_key:
        print(f"[DEV OTP] {mobile} → {otp} (via {via})")
        cache.set(f"otp_session:{mobile}", otp, timeout=300)
        cache.set(f"otp_via:{mobile}", via, timeout=300)
        return otp
    try:
        import requests
        channel = "VOICE" if via == "voice" else "SMS"
        mobile_formatted = mobile[-10:] if via == "voice" else (
            f"91{mobile}" if not mobile.startswith("91") else mobile
        )
        url = f"https://2factor.in/API/V1/{api_key}/{channel}/{mobile_formatted}/{otp}"
        print(f"[2Factor] Sending via {channel} to {mobile_formatted}")
        res  = requests.get(url, timeout=5)
        data = res.json()
        print(f"[2Factor] Response: {data}")
        if data.get("Status") == "Success":
            # VOICE: no verify endpoint — store actual OTP for direct comparison
            # SMS:   store session_id for API-based verification
            stored = otp if via == "voice" else data.get("Details")
            cache.set(f"otp_session:{mobile}", stored, timeout=300)
            cache.set(f"otp_via:{mobile}", via, timeout=300)
            return stored
        print(f"[2Factor] Failed: {data}")
        return None
    except Exception as e:
        print(f"[OTP send error] {e}")
        return None


def verify_otp(mobile, otp_entered):
    """
    VOICE: compare OTP directly from cache (no 2Factor verify endpoint).
    SMS:   use 2Factor SMS/VERIFY endpoint with session_id.
    """
    import requests as req
    api_key    = getattr(settings, "TWOFACTOR_API_KEY", "")
    session_id = cache.get(f"otp_session:{mobile}")
    via        = cache.get(f"otp_via:{mobile}", "sms")
    print(f"[OTP Check] mobile={mobile} otp={otp_entered} via={via} session={session_id} api_key_set={bool(api_key)}")
    if not session_id:
        print(f"[OTP] No session found for {mobile}")
        return False
    # Dev mode OR VOICE — direct comparison
    if not api_key or via == "voice":
        result = str(session_id) == str(otp_entered)
        if result:
            cache.delete(f"otp_session:{mobile}")
            cache.delete(f"otp_via:{mobile}")
        print(f"[OTP Direct] match={result}")
        return result
    # SMS production — 2Factor VERIFY endpoint
    try:
        url  = f"https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp_entered}"
        print(f"[2Factor Verify URL] {url}")
        data = req.get(url, timeout=5).json()
        print(f"[2Factor Verify Response] {data}")
        if data.get("Status") == "Success" and "Matched" in str(data.get("Details", "")):
            cache.delete(f"otp_session:{mobile}")
            cache.delete(f"otp_via:{mobile}")
            return True
        return False
    except Exception as e:
        print(f"[OTP verify error] {e}")
        return False

# ── Views ─────────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        if s.is_valid():
            user = s.save()
            r = RefreshToken.for_user(user)
            return Response({
                "user":    UserSerializer(user).data,
                "access":  str(r.access_token),
                "refresh": str(r),
            }, status=201)
        return Response(s.errors, status=400)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        mobile   = request.data.get("mobile",   "").strip()
        password = request.data.get("password", "").strip()

        if not mobile or not password:
            return Response({"message": "Mobile and password/OTP required."}, status=400)

        try:
            user = User.objects.get(mobile=mobile)
        except User.DoesNotExist:
            return Response({"message": "No account found with this mobile."}, status=401)

        if user.status == "blocked":
            return Response({"message": "Account blocked. Contact support."}, status=403)

        password_ok = user.check_password(password)
        otp_ok      = verify_otp(mobile, password)
        print(f"[Login] mobile={mobile} password_ok={password_ok} otp_ok={otp_ok}")

        if not password_ok and not otp_ok:
            return Response({"message": "Invalid credentials."}, status=401)

        r = RefreshToken.for_user(user)
        return Response({
            "user":    UserSerializer(user).data,
            "access":  str(r.access_token),
            "refresh": str(r),
        })


class RequestOTPView(APIView):
    """
    POST { mobile, via? }
    via = 'sms' (default) | 'voice' (for password reset)
    """
    permission_classes = [AllowAny]

    def post(self, request):
        mobile = request.data.get("mobile", "").strip()
        via    = request.data.get("via",    "sms").lower()

        if not re.match(r"^[6-9]\d{9}$", mobile):
            return Response({"message": "Invalid mobile number."}, status=400)
        if cache.get(f"otp_limit:{mobile}"):
            return Response({"message": "Wait 60 seconds before requesting again."}, status=429)

        otp        = str(random.randint(1000, 9999))
        cache.set(f"otp_limit:{mobile}", True, timeout=60)
        session_id = send_otp(mobile, otp, via=via)

        if session_id is None:
            return Response({"message": "Failed to send OTP. Try again."}, status=500)
        return Response({"message": "OTP sent."})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        mobile = request.data.get("mobile", "").strip()
        otp    = request.data.get("otp",    "").strip()
        if verify_otp(mobile, otp):
            # Store a verified flag so ResetPasswordView doesn't need to re-verify
            cache.set(f"otp_verified:{mobile}", True, timeout=600)
            return Response({"message": "OTP verified.", "verified": True})
        return Response({"message": "Invalid or expired OTP.", "verified": False}, status=400)


class ResetPasswordView(APIView):
    """
    POST { mobile, otp, password }
    Uses the verified flag set by VerifyOTPView — no re-verification needed.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        mobile   = request.data.get("mobile",   "").strip()
        otp      = request.data.get("otp",      "").strip()
        password = request.data.get("password", "").strip()

        if not mobile or not otp or not password:
            return Response({"message": "Mobile, OTP and password are required."}, status=400)
        if len(password) < 6:
            return Response({"message": "Password must be at least 6 characters."}, status=400)

        # Check verified flag (set by VerifyOTPView in step 2)
        if not cache.get(f"otp_verified:{mobile}"):
            return Response({"message": "OTP not verified. Please verify OTP first."}, status=400)

        try:
            user = User.objects.get(mobile=mobile)
        except User.DoesNotExist:
            return Response({"message": "No account found with this mobile."}, status=404)

        user.set_password(password)
        user.save()
        cache.delete(f"otp_verified:{mobile}")  # clean up
        return Response({"message": "Password reset successfully."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AllUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            UserSerializer(User.objects.all().order_by("-date_joined"), many=True).data
        )


class BlockUserView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            user.status = request.data.get("status", "blocked")
            user.save()
            return Response(UserSerializer(user).data)
        except User.DoesNotExist:
            return Response({"message": "Not found."}, status=404)