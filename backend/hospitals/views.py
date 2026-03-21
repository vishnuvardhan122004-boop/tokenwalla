from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Hospital
from .serializers import HospitalSerializer

User = get_user_model()


# ── OTP helper (self-contained, no cross-app import) ─────────────────────────

def _verify_otp(mobile, otp_entered):
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
    # SMS — 2Factor VERIFY endpoint
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

class HospitalListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            HospitalSerializer(Hospital.objects.filter(status='active'), many=True).data
        )


class HospitalRegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data     = request.data
        mobile   = data.get('mobile',   '').strip()
        name     = data.get('name',     '').strip()
        password = data.get('password', '')

        if Hospital.objects.filter(mobile=mobile).exists():
            return Response({'message': 'Mobile already registered.'}, status=400)
        if User.objects.filter(mobile=mobile).exists():
            return Response({'message': 'Mobile already registered as a user.'}, status=400)

        hospital = Hospital.objects.create(
            name     = name,
            city     = data.get('city',    ''),
            address  = data.get('address', ''),
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

        try:
            user.hospital = hospital
            user.save(update_fields=['hospital'])
        except Exception:
            user.last_name = str(hospital.id)
            user.save(update_fields=['last_name'])

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
        print(f"[HospitalLogin] mobile={mobile} password_ok={password_ok} otp_ok={otp_ok}")

        if not password_ok and not otp_ok:
            return Response({'message': 'Invalid credentials.'}, status=401)

        user, created = User.objects.get_or_create(
            mobile=mobile,
            defaults={
                'username':   mobile,
                'first_name': hospital.name,
                'role':       'hospital',
            }
        )
        if created:
            if password_ok:
                user.set_password(password)
            else:
                user.set_unusable_password()
            user.save()

        if user.role != 'hospital':
            user.role = 'hospital'
            user.save(update_fields=['role'])

        refresh = RefreshToken.for_user(user)

        user_data = {
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
        }

        return Response({
            'user':    user_data,
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
    """
    POST { mobile, otp, password }
    Resets password for both the Hospital row and the linked User account.
    Uses verified flag set by VerifyOTPView — no re-verification needed.
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

        # Check verified flag (set by /auth/otp/verify/ in step 2)
        if not cache.get(f"otp_verified:{mobile}"):
            return Response({"message": "OTP not verified. Please verify OTP first."}, status=400)

        try:
            hospital = Hospital.objects.get(mobile=mobile)
            hospital.password = make_password(password)
            hospital.save()
        except Hospital.DoesNotExist:
            return Response({"message": "No hospital found with this mobile."}, status=404)

        # Also update linked User account
        try:
            user = User.objects.get(mobile=mobile)
            user.set_password(password)
            user.save()
        except User.DoesNotExist:
            pass

        cache.delete(f"otp_verified:{mobile}")  # clean up
        return Response({"message": "Password reset successfully."})