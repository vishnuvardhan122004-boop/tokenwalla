import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.core.cache import cache
from django.db import transaction
from django.utils.dateparse import parse_date

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from tokenwalla.utils import check_password_strength, is_valid_landline
# One counter for both logins — a partner account and a patient account are the
# same brute-force target, and two copies of the cap would drift.
from users.auth_views import login_password_allowed, clear_login_failures

from .models import (
    Hospital, HospitalPhoto, in_segment, exclude_test_hospitals,
    show_test_hospitals_to,
)
from .serializers import HospitalSerializer


def _is_owner_or_admin(user, hospital):
    """True if `user` is the hospital's own account or an admin."""
    if not user or not user.is_authenticated:
        return False
    is_owner = getattr(user, 'role', None) == 'hospital' and str(getattr(user, 'last_name', '')) == str(hospital.id)
    is_admin = getattr(user, 'role', None) == 'admin' or user.is_staff
    return is_owner or is_admin
from tokenwalla.permissions import IsAdmin

logger = logging.getLogger('tokenwalla')
User = get_user_model()


# ── OTP helper ────────────────────────────────────────────────────────────────

def _verify_otp(mobile, otp_entered):
    """
    Verifies an OTP for the given mobile number.

    Delegates to users.auth_views.verify_otp so the brute-force protection
    (per-code attempt cap, constant-time compare) is enforced identically for
    hospital logins and password resets. Imported lazily to avoid any import
    cycle at module load.
    """
    from users.auth_views import verify_otp as _shared_verify_otp
    # register_failure=False: HospitalLoginView tries the submitted value as both
    # password and OTP, so a wrong password must not consume the OTP attempt cap
    # (else anyone knowing the mobile could burn a victim's in-flight OTP).
    return _shared_verify_otp(mobile, otp_entered, register_failure=False)


# ── Views ─────────────────────────────────────────────────────────────────────

class HospitalListView(APIView):
    """Public — list only APPROVED (active) hospitals.

    `?kind=` selects WHAT THE PROVIDER SELLS, not what it calls itself:
    SCAN_CENTER means "sells scans", BLOOD_CENTER means "sells blood tests".
    A hybrid — one account offering consultations AND scans — therefore appears
    in both the default list and the scans list, which is the whole point.

    Without ?kind= the response is consultation providers only, byte-for-byte
    what it was before centres existed: the installed app builds calling this
    endpoint have never heard of a Scan and would render a pure centre as a
    bookable hospital. See in_segment().

    The parameter keeps its old NAME so no shipped client has to change how it
    asks; only what it resolves to has changed.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        hospitals = Hospital.objects.filter(status='active').order_by('name')

        # Unknown/absent value ⇒ hospitals. An old client sends nothing; a typo
        # must not silently widen the list, so only the exact opt-in counts.
        # Unknown/absent value ⇒ consultation providers, the old default. A
        # typo must not silently widen the list, so only an exact known value
        # counts; anything else falls through to the safe branch.
        kind    = request.query_params.get('kind')
        segment = Hospital.KIND_TO_SEGMENT.get(kind, Hospital.SEG_CONSULT)
        hospitals = in_segment(hospitals, segment)

        if not show_test_hospitals_to(request.user):
            hospitals = exclude_test_hospitals(hospitals)
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

        # Same OTP-ownership gate as HospitalResetPasswordView and the mobile
        # change above: this endpoint is public, and the mobile it takes becomes
        # the login identity for a partner account that will hold other people's
        # patient records. Both clients already verify before they get here.
        if not cache.get(f'otp_verified:{mobile}'):
            return Response(
                {'message': 'Please verify your mobile with OTP first.'},
                status=400,
            )

        # Before any row is created, so a weak password cannot leave a
        # half-registered hospital behind. The stand-in user gives the
        # similarity check the mobile and name to compare against.
        complaint = check_password_strength(
            password, user=User(username=mobile, mobile=mobile, first_name=name),
        )
        if complaint:
            return Response({'message': complaint}, status=400)

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

        def _coord(v):
            try:
                return float(v) if v not in (None, '') else None
            except (TypeError, ValueError):
                return None

        # Provider kind. Whitelisted against the model's own choices rather than
        # trusted: this endpoint is public and unauthenticated, and `kind`
        # decides which patient-facing list a row appears in. Anything not
        # recognised — absent, blank, misspelt, or hostile — registers a
        # HOSPITAL, which is the safe default because it is the behaviour that
        # existed before centres did.
        kind = data.get('kind', Hospital.HOSPITAL)
        if kind not in dict(Hospital.KIND_CHOICES):
            kind = Hospital.HOSPITAL

        # Optional, and deliberately not required. Verification of a centre's
        # registration happens on a PHONE CALL before approval, so demanding the
        # number in the form only costs us partners who don't have it to hand.
        # Staff record what the call turns up in Django admin.
        license_number = str(data.get('license_number', '') or '').strip()[:60]

        # What they sell. The card they picked is always on; `also_offers` is
        # the "we also do…" tick-boxes beside it. Both go straight to ACTIVE
        # rather than PENDING, because the whole account is already gated by the
        # admin approval that flips status to 'active' — the reviewer sees the
        # full registration, capabilities included. Only capabilities added
        # LATER, from Profile, need their own approval.
        caps = {f: Hospital.CAP_OFF for f in Hospital.SEGMENT_FIELD.values()}
        chosen = {Hospital.KIND_TO_SEGMENT[kind]}
        for seg in (data.get('also_offers') or []):
            if seg in Hospital.SEGMENT_FIELD:
                chosen.add(seg)
        for seg in chosen:
            caps[Hospital.SEGMENT_FIELD[seg]] = Hospital.CAP_ACTIVE

        hospital = Hospital.objects.create(
            name=name,
            kind=kind,
            **caps,
            city=data.get('city', '').strip(),
            address=data.get('address', '').strip(),
            location=data.get('location', '').strip(),
            latitude=_coord(data.get('latitude')),
            longitude=_coord(data.get('longitude')),
            mobile=mobile,
            license_number=license_number,
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

        cache.delete(f'otp_verified:{mobile}')

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

        # Same password brute-force cap as the patient login, and the same
        # shared counter — see users.auth_views.login_password_allowed. A
        # hospital account is the higher-value target of the two: it holds other
        # people's patient records. The OTP branch still runs when locked, so
        # reception is never shut out of its own dashboard.
        unlocked = login_password_allowed(mobile)
        password_ok = unlocked and check_password(password, hospital.password)
        otp_ok = _verify_otp(mobile, password)

        if not password_ok and not otp_ok:
            logger.warning('Failed hospital login for mobile ending ...%s', mobile[-4:])
            if not unlocked:
                return Response(
                    {'message': 'Too many failed password attempts. Log in with an '
                                'OTP instead, or try again later.'},
                    status=429,
                )
            return Response({'message': 'Invalid credentials.'}, status=401)

        clear_login_failures(mobile)

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
                    # `kind` is the identity (the badge, the labels). The
                    # dashboard reads `segments` to decide which provider tabs
                    # to show — a hybrid has more than one. Both are additive:
                    # a client that ignores them behaves exactly as before.
                    'kind': hospital.kind,
                    'segments': hospital.active_segments,
                    # Includes PENDING, so Profile can show "awaiting approval"
                    # against a capability instead of silently showing it off.
                    'capabilities': {
                        seg: getattr(hospital, f)
                        for seg, f in Hospital.SEGMENT_FIELD.items()
                    },
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
    """
    GET  — public: fetch a single hospital by PK.
    PATCH — the owning hospital (or an admin) updates its own details:
            name, city, address, location (maps), and mobile (OTP-verified).
    """
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)
        return Response(HospitalSerializer(hospital).data)

    def patch(self, request, pk):
        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)

        user = request.user
        if not user or not user.is_authenticated:
            return Response({'message': 'Authentication required.'}, status=401)

        # The linked hospital user stores the hospital id in last_name.
        is_owner = getattr(user, 'role', None) == 'hospital' and str(getattr(user, 'last_name', '')) == str(hospital.id)
        is_admin = getattr(user, 'role', None) == 'admin' or user.is_staff
        if not (is_owner or is_admin):
            return Response({'message': 'You can only edit your own hospital.'}, status=403)

        for field in ('name', 'city', 'address', 'location', 'instagram', 'youtube',
                      'facebook', 'description', 'announcement', 'open_time', 'close_time'):
            if field in request.data:
                setattr(hospital, field, str(request.data[field]).strip())

        # Landline: display-only, so blank is always allowed — it just has to be
        # a real landline when present. NOT a substitute for `mobile`, which is
        # the login identity and OTP-gated above.
        if 'landline' in request.data:
            landline = str(request.data['landline'] or '').strip()
            if landline and not is_valid_landline(landline):
                return Response(
                    {'message': 'Enter a valid landline with the STD code, e.g. 08812-234567.'},
                    status=400,
                )
            hospital.landline = landline

        # Announcement expiry: blank/null clears it (show until manually removed).
        if 'announcement_until' in request.data:
            raw_until = str(request.data['announcement_until'] or '').strip()
            if not raw_until:
                hospital.announcement_until = None
            else:
                parsed = parse_date(raw_until)
                if parsed is None:
                    return Response({'message': 'Invalid announcement date.'}, status=400)
                hospital.announcement_until = parsed

        # Geocoded coordinates from the location autocomplete (numeric / nullable).
        for coord in ('latitude', 'longitude'):
            if coord in request.data:
                raw = request.data.get(coord)
                if raw in (None, ''):
                    setattr(hospital, coord, None)
                else:
                    try:
                        setattr(hospital, coord, float(raw))
                    except (TypeError, ValueError):
                        return Response({'message': f'Invalid {coord}.'}, status=400)

        if 'services' in request.data:
            svc = request.data.get('services')
            if isinstance(svc, list):
                hospital.services = [str(s).strip() for s in svc if str(s).strip()]

        # Banner / logo image uploads (multipart)
        if 'image' in request.FILES:
            hospital.image = request.FILES['image']
        if 'logo' in request.FILES:
            hospital.logo = request.FILES['logo']

        raw_mobile = request.data.get('mobile')
        new_mobile = str(raw_mobile).strip() if raw_mobile else None
        if new_mobile and new_mobile != hospital.mobile:
            def _valid(m):
                return len(m) == 10 and m.isdigit() and m[0] in '6789'
            if not _valid(new_mobile):
                return Response({'message': 'Invalid mobile number.'}, status=400)
            if not cache.get(f'otp_verified:{new_mobile}'):
                return Response({'message': 'Please verify the new mobile with OTP first.'}, status=400)
            if Hospital.objects.filter(mobile=new_mobile).exclude(pk=hospital.pk).exists():
                return Response({'message': 'This mobile is already in use.'}, status=400)
            old_mobile = hospital.mobile
            hospital.mobile = new_mobile
            cache.delete(f'otp_verified:{new_mobile}')
            # keep the linked hospital user's mobile in sync
            try:
                u = User.objects.get(mobile=old_mobile)
                u.mobile = new_mobile
                u.username = new_mobile
                u.save(update_fields=['mobile', 'username'])
            except User.DoesNotExist:
                pass

        hospital.save()
        logger.info('Hospital %s updated details', hospital.id)
        return Response(HospitalSerializer(hospital).data)


class HospitalPhotoView(APIView):
    """
    Gallery photos for a hospital.
      GET  /api/hospitals/<pk>/photos/  — public: list photos
      POST /api/hospitals/<pk>/photos/  — owner/admin: add a photo (multipart 'image')
    """
    permission_classes = [AllowAny]

    def get(self, request, pk):
        photos = HospitalPhoto.objects.filter(hospital_id=pk)
        return Response([
            {'id': p.id, 'url': (p.image.url if p.image else '')}
            for p in photos
        ])

    def post(self, request, pk):
        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)
        if not _is_owner_or_admin(request.user, hospital):
            return Response({'message': 'Not allowed.'}, status=403)
        img = request.FILES.get('image')
        if not img:
            return Response({'message': 'No image provided.'}, status=400)
        if hospital.photos.count() >= 12:
            return Response({'message': 'Gallery limit reached (12 photos).'}, status=400)
        photo = HospitalPhoto.objects.create(hospital=hospital, image=img)
        return Response({'id': photo.id, 'url': (photo.image.url if photo.image else '')}, status=201)


class HospitalPhotoDeleteView(APIView):
    """DELETE /api/hospitals/<pk>/photos/<photo_id>/ — owner/admin: remove a photo."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, photo_id):
        try:
            hospital = Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return Response({'message': 'Not found.'}, status=404)
        if not _is_owner_or_admin(request.user, hospital):
            return Response({'message': 'Not allowed.'}, status=403)
        HospitalPhoto.objects.filter(pk=photo_id, hospital=hospital).delete()
        return Response({'message': 'Deleted.'})


class HospitalPaymentDetailsView(APIView):
    """
    GET  /api/hospitals/<pk>/payment-details/ — read the hospital's payout account.
    PUT  /api/hospitals/<pk>/payment-details/ — the owning hospital (or admin)
         updates its UPI / bank / IFSC settlement details.

    Sensitive bank/UPI details are served ONLY here (never on the public
    hospital list/detail), gated to the owning hospital or an admin.
    """
    permission_classes = [IsAuthenticated]

    def _get(self, pk):
        try:
            return Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return None

    def get(self, request, pk):
        from .serializers import HospitalPaymentDetailsSerializer
        hospital = self._get(pk)
        if hospital is None:
            return Response({'message': 'Not found.'}, status=404)
        if not _is_owner_or_admin(request.user, hospital):
            return Response({'message': 'You can only view your own hospital.'}, status=403)
        return Response(HospitalPaymentDetailsSerializer(hospital).data)

    def put(self, request, pk):
        from .serializers import HospitalPaymentDetailsSerializer
        hospital = self._get(pk)
        if hospital is None:
            return Response({'message': 'Not found.'}, status=404)
        if not _is_owner_or_admin(request.user, hospital):
            return Response({'message': 'You can only edit your own hospital.'}, status=403)

        serializer = HospitalPaymentDetailsSerializer(hospital, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'message': 'Validation failed', 'errors': serializer.errors},
                status=400,
            )
        serializer.save()
        logger.info('Payout details updated for hospital %s', hospital.id)
        return Response(serializer.data)

    # Allow PATCH as an alias for PUT (both partial here).
    patch = put


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

        complaint = check_password_strength(
            password,
            user=User(username=mobile, mobile=mobile, first_name=hospital.name),
        )
        if complaint:
            return Response({'message': complaint}, status=400)

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
            'active': qs.filter(status__in=['CONFIRMED', 'IN_PROGRESS']).count(),
            'waiting': qs.filter(status='CONFIRMED').count(),
            'in_progress': qs.filter(status='IN_PROGRESS').count(),
            'completed': qs.filter(status='COMPLETED').count(),
            'cancelled': qs.filter(status='CANCELLED').count(),
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
                    status__in=['CONFIRMED', 'IN_PROGRESS'],
                ).update(status='CANCELLED')

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

class HospitalCapabilityView(APIView):
    """A provider asks to sell one more thing; an admin says yes.

    POST  /api/hospitals/<pk>/capabilities/   { "segment": "SCAN" }
      Provider (or admin) requests a capability. Goes to PENDING, which is NOT
      offering — the provider appears in no new list until it is approved. An
      admin doing this gets ACTIVE immediately, since their approval is the
      thing being waited on.

    PATCH /api/hospitals/<pk>/capabilities/   { "segment": "SCAN",
                                                "action": "approve"|"reject" }
      Admin only. approve -> ACTIVE, reject -> OFF.

    Turning a capability OFF is a POST with action="disable" and is allowed to
    the provider: nobody needs permission to stop offering something. What it
    does NOT do is delete the Scan rows behind it — they stop being listed and
    come back intact if the capability is turned on again, because a provider
    pausing for a month should not lose their price list.
    """
    permission_classes = [IsAuthenticated]

    def _hospital_or_404(self, pk):
        try:
            return Hospital.objects.get(pk=pk)
        except Hospital.DoesNotExist:
            return None

    def _may_manage(self, request, hospital) -> bool:
        """Admins, or the staff account belonging to THIS hospital."""
        role = getattr(request.user, 'role', None)
        if role == 'admin' or request.user.is_staff:
            return True
        # Hospital staff carry their hospital id in last_name — the same link
        # HospitalLoginView writes. Compared as strings; last_name is CharField.
        return role == 'hospital' and str(request.user.last_name) == str(hospital.id)

    @staticmethod
    def _segment(request):
        seg = str(request.data.get('segment', '') or '').strip().upper()
        return seg if seg in Hospital.SEGMENT_FIELD else None

    def post(self, request, pk):
        hospital = self._hospital_or_404(pk)
        if hospital is None:
            return Response({'message': 'Hospital not found.'}, status=404)
        if not self._may_manage(request, hospital):
            return Response({'message': 'Not allowed.'}, status=403)

        segment = self._segment(request)
        if not segment:
            return Response(
                {'message': f'segment must be one of {list(Hospital.SEGMENT_FIELD)}.'},
                status=400)

        field  = Hospital.SEGMENT_FIELD[segment]
        action = str(request.data.get('action', '') or '').strip().lower()
        is_admin = getattr(request.user, 'role', None) == 'admin' or request.user.is_staff

        if action == 'disable':
            new_state = Hospital.CAP_OFF
        elif is_admin:
            new_state = Hospital.CAP_ACTIVE
        else:
            new_state = Hospital.CAP_PENDING

        setattr(hospital, field, new_state)
        hospital.save(update_fields=[field])
        return Response({
            'segment': segment,
            'state': new_state,
            'segments': hospital.active_segments,
        })

    def patch(self, request, pk):
        if not (getattr(request.user, 'role', None) == 'admin' or request.user.is_staff):
            return Response({'message': 'Not allowed.'}, status=403)

        hospital = self._hospital_or_404(pk)
        if hospital is None:
            return Response({'message': 'Hospital not found.'}, status=404)

        segment = self._segment(request)
        if not segment:
            return Response(
                {'message': f'segment must be one of {list(Hospital.SEGMENT_FIELD)}.'},
                status=400)

        action = str(request.data.get('action', '') or '').strip().lower()
        if action not in ('approve', 'reject'):
            return Response({'message': 'action must be "approve" or "reject".'},
                            status=400)

        field = Hospital.SEGMENT_FIELD[segment]
        setattr(hospital, field,
                Hospital.CAP_ACTIVE if action == 'approve' else Hospital.CAP_OFF)
        hospital.save(update_fields=[field])
        return Response({
            'segment': segment,
            'state': getattr(hospital, field),
            'segments': hospital.active_segments,
        })
