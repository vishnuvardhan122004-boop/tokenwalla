"""
Scan CRUD — the diagnostic-service analogue of doctors/views.py.

Public read, centre-staff write, with the same ownership rules: a centre may
only touch its own scans. Deliberately mirrors DoctorViewSet rather than
inventing a second shape, so anyone who knows one knows the other.
"""
import logging
import threading
from datetime import datetime

from django.db.models import Count, F, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hospitals.models import (
    Hospital, exclude_test_hospitals, show_test_hospitals_to,
)
from tokenwalla.permissions import IsHospitalStaff, IsScanOwnerCenterOrAdmin
from tokenwalla.utils import is_slot_bookable

from .models import Scan, ScanReport
from .serializers import ScanReportSerializer, ScanSerializer

logger = logging.getLogger('tokenwalla')


class ScanViewSet(viewsets.ModelViewSet):
    serializer_class = ScanSerializer
    permission_classes = [AllowAny]

    _PUBLIC_ACTIONS = {'list', 'retrieve', 'slot_availability', 'record_view'}

    def get_permissions(self):
        if self.action in self._PUBLIC_ACTIONS:
            return [AllowAny()]
        if self.action == 'create':
            # No object yet — ownership of the target centre is enforced inside
            # create() against the submitted `center` field.
            return [IsAuthenticated(), IsHospitalStaff()]
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsHospitalStaff(), IsScanOwnerCenterOrAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        # Popular first, then id — the id tiebreak keeps the order total, which
        # pagination needs. Same reasoning as DoctorViewSet.
        qs = Scan.objects.select_related('center').order_by('-view_count', 'id')

        center_id = self.request.query_params.get('center')
        if center_id:
            qs = qs.filter(center_id=center_id)

        modality = (self.request.query_params.get('modality') or '').strip()
        if modality:
            qs = qs.filter(modality__iexact=modality)

        # A scan is only bookable where the owner still SELLS scans. If the
        # capability was switched off (or is merely PENDING) after the row was
        # created, the scan is unbookable — the whole patient flow keys off it —
        # so it must not be listed either. Note this asks the capability, not
        # `kind`: a hospital with a scanning wing is kind=HOSPITAL and its scans
        # are perfectly bookable.
        qs = qs.filter(
            Q(center__svc_scans=Hospital.CAP_ACTIVE)
            | Q(center__svc_blood=Hospital.CAP_ACTIVE)
        )

        # Same demo-fixture rule as doctors: internal [TEST] centres are not
        # patient-facing, but stay visible to their own staff and to admins.
        if not show_test_hospitals_to(getattr(self.request, 'user', None)):
            qs = exclude_test_hospitals(qs, field='center__name')
        return qs

    # ── Popularity ────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='view', permission_classes=[AllowAny])
    def record_view(self, request, pk=None):
        """Count one patient opening this scan. Mirrors DoctorViewSet.record_view:
        public (most browsing happens before login) and a single atomic UPDATE
        via F() so two concurrent opens can't lose a count."""
        updated = Scan.objects.filter(pk=pk).update(view_count=F('view_count') + 1)
        if not updated:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── Slot availability ─────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='slot-availability')
    def slot_availability(self, request, pk=None):
        """
        GET /api/scans/<id>/slot-availability/?date=YYYY-MM-DD

            { "09:00 AM": { "booked": 1, "max": 1, "full": true, "too_soon": false } }

        Identical contract to the doctor endpoint so the front end can drive the
        same slot grid from either. `full` also covers a slot starting within
        BOOKING_CUTOFF_HOURS, so a slot that is about to happen cannot be booked.

        Counts bookings by SCAN, not by centre: an MRI and a blood draw run on
        different machines at the same time, which is exactly why slots live on
        Scan rather than on the centre.
        """
        from bookings.models import Booking

        scan = self.get_object()
        date = request.query_params.get('date', '').strip()

        if not date:
            return Response(
                {'error': 'date query param is required (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Expected YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        counts = (
            Booking.objects
            .filter(scan=scan, date=date, status__in=['CONFIRMED', 'IN_PROGRESS'])
            .values('slot')
            .annotate(count=Count('id'))
        )
        booked_map = {row['slot']: row['count'] for row in counts}

        result = {}
        for slot in (scan.slots or []):
            booked = booked_map.get(slot, 0)
            capacity_full = booked >= scan.max_per_slot
            too_soon = not is_slot_bookable(date, slot)
            result[slot] = {
                'booked': booked,
                'max': scan.max_per_slot,
                'too_soon': too_soon,
                'full': capacity_full or too_soon,
            }
        return Response(result)

    # ── Write ─────────────────────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        # A centre account may only add scans under its OWN centre; admins (or
        # staff) may create for any. Mirrors DoctorViewSet.create.
        user = request.user
        if not (getattr(user, 'role', None) == 'admin' or user.is_staff):
            own_center_id = str(getattr(user, 'last_name', '') or '')
            if str(request.data.get('center', '')) != own_center_id:
                return Response(
                    {'message': 'You can only add scans to your own centre.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.warning('Scan create validation failed: %s', serializer.errors)
            return Response(
                {'message': 'Validation failed', 'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ── Reports ───────────────────────────────────────────────────────────────────

def _notify_report_ready_async(report):
    """Tell the patient their report is up — push + WhatsApp, off-thread.

    THIS IS THE FIFTH BACKGROUND THREAD IN THE CODEBASE, and it does a DB write
    (WhatsAppLog, plus stamping notified_at). Any test that reaches the report
    upload endpoint MUST patch `scans.views._notify_report_ready_async`, or the
    thread outlives the test, opens its own connection, and collides with a
    LATER, UNRELATED test's first write against the shared-cache in-memory
    SQLite — failing a different test about one run in four. See CLAUDE.md.
    """
    def _run():
        from django.db import connection
        from django.utils import timezone as tz
        from notifications.push import push_scan_report_ready
        from notifications.whatsapp import send_scan_report_ready
        try:
            booking = report.booking
            try:
                push_scan_report_ready(booking)
            except Exception as exc:
                logger.warning('scan report push failed for %s: %s', report.id, exc)
            try:
                send_scan_report_ready(booking)
            except Exception as exc:
                logger.warning('scan report WhatsApp failed for %s: %s', report.id, exc)
            ScanReport.objects.filter(pk=report.pk).update(notified_at=tz.now())
        except Exception as exc:
            logger.exception('scan report notify failed for %s: %s', report.id, exc)
        finally:
            connection.close()

    threading.Thread(target=_run, name=f'scan-report-{report.id}', daemon=True).start()



# What a provider is allowed to hand a patient. An allow-list rather than a
# block-list because this is a trust boundary: the file is stored under our
# domain and handed back to a phone that will open it. .html and .svg execute in
# a WebView, and an Office macro executes on a laptop — none of them are things
# a hospital needs to send.
ALLOWED_UPLOAD_EXTS = {
    '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024      # 15 MB — a chest CT PDF is ~5 MB


def _reject_file(upload):
    """Return an error string if this upload is not something we will store."""
    name = (getattr(upload, 'name', '') or '').lower()
    ext  = name[name.rfind('.'):] if '.' in name else ''
    if ext not in ALLOWED_UPLOAD_EXTS:
        return ('Only PDF and image files can be shared '
                '(PDF, JPG, PNG, WEBP, HEIC).')
    if (getattr(upload, 'size', 0) or 0) > MAX_UPLOAD_BYTES:
        return 'The file is too large. Maximum size is 15 MB.'
    return None


def _may_see_report(user, booking):
    """Who is allowed anywhere near a scan report.

    A scan report is medical PII, so this is an allow-list of three, checked on
    every single request rather than once at upload:

      * the patient the booking belongs to,
      * the centre that produced it (its own staff account, and no other
        centre's — the hospital id a staff user manages lives in
        User.last_name, the same convention every other owner check here uses),
      * an admin.

    Deliberately NOT "anyone with the link": the storage URL is never exposed,
    precisely so that forwarding a WhatsApp message cannot leak a report.
    """
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'role', None) == 'admin' or user.is_staff:
        return True
    if booking.user_id == user.id:
        return True
    return (
        getattr(user, 'role', None) == 'hospital'
        and str(getattr(user, 'last_name', '')) == str(booking.hospital_id)
    )


def _is_centre_staff(user, booking):
    """Only the centre that ran the scan may UPLOAD. A patient may read their
    own report but must never be able to publish one."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'role', None) == 'admin' or user.is_staff:
        return True
    return (
        getattr(user, 'role', None) == 'hospital'
        and str(getattr(user, 'last_name', '')) == str(booking.hospital_id)
    )


class ScanReportListCreateView(APIView):
    """GET  /api/bookings/<pk>/reports/   — list (patient, centre or admin)
    POST /api/bookings/<pk>/reports/   — upload (centre or admin only)
    """
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def _booking(self, pk):
        from bookings.models import Booking
        return get_object_or_404(
            Booking.objects.select_related('user', 'hospital', 'scan'), pk=pk)

    def get(self, request, pk):
        booking = self._booking(pk)
        if not _may_see_report(request.user, booking):
            # 404, not 403: a 403 confirms the booking exists, which is itself a
            # small leak when the id is guessable.
            return Response({'message': 'Not found.'}, status=404)
        return Response(ScanReportSerializer(booking.reports.all(), many=True).data)

    def post(self, request, pk):
        booking = self._booking(pk)
        if not _is_centre_staff(request.user, booking):
            return Response({'message': 'Not found.'}, status=404)

        # Any provider may share a document against a booking they own — a
        # hospital's discharge summary is the same object as a centre's scan
        # PDF, and gating on scan_id only ever meant "we shipped centres first".

        upload = request.FILES.get('file')
        if not upload:
            return Response({'message': 'A file is required.'}, status=400)

        err = _reject_file(upload)
        if err:
            return Response({'message': err}, status=400)

        report = ScanReport.objects.create(
            booking       = booking,
            file          = upload,
            original_name = (getattr(upload, 'name', '') or '')[:255],
            title       = (request.data.get('title') or '').strip()[:200],
            notes       = (request.data.get('notes') or '').strip(),
            uploaded_by = request.user,
        )

        # Tell the patient, off-thread. The report is already durably saved, so
        # a slow or failing Meta call must never fail this upload — the centre
        # would re-upload and we would store the file twice.
        _notify_report_ready_async(report)

        logger.info('Scan report %s uploaded for booking %s by user %s',
                    report.id, booking.id, request.user.id)
        return Response(ScanReportSerializer(report).data, status=201)


    def delete(self, request, pk, report_id):
        """Only the provider that published it may unpublish it — the
        wrong-file-uploaded case. A patient may read their own report but never
        remove it; it is the provider's record of what they issued."""
        booking = self._booking(pk)
        if not _is_centre_staff(request.user, booking):
            return Response({'message': 'Not found.'}, status=404)
        report = get_object_or_404(ScanReport, pk=report_id, booking=booking)
        report.file.delete(save=False)   # drop the blob too, not just the row
        report.delete()
        logger.info('Report %s deleted from booking %s by user %s',
                    report_id, booking.id, request.user.id)
        return Response(status=204)


class ScanReportDetailView(ScanReportListCreateView):
    """DELETE /api/bookings/<pk>/reports/<report_id>/ — and nothing else.

    A subclass purely so GET/POST on the detail URL 405 instead of hitting the
    list handlers, which take no report_id.
    """
    http_method_names = ['delete', 'options']


class ScanReportDownloadView(APIView):
    """GET /api/bookings/<pk>/reports/<report_id>/download/

    The ONLY route to the file. Ownership is re-checked here on every request,
    which is the whole point: the storage URL is never handed out, so a
    forwarded link is worthless without a session that passes _may_see_report.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, report_id):
        from bookings.models import Booking
        booking = get_object_or_404(
            Booking.objects.select_related('user', 'hospital'), pk=pk)
        if not _may_see_report(request.user, booking):
            return Response({'message': 'Not found.'}, status=404)

        report = get_object_or_404(ScanReport, pk=report_id, booking=booking)
        try:
            fh = report.file.open('rb')
        except Exception:
            logger.exception('Scan report %s file could not be opened', report.id)
            return Response({'message': 'The report file is unavailable.'}, status=502)

        filename = report.original_name or (report.file.name or 'report').rsplit('/', 1)[-1]
        return FileResponse(fh, as_attachment=True, filename=filename)


class MyReportsView(APIView):
    """GET /api/bookings/reports/mine/ — every document shared with me.

    The profile-level view of the same rows the booking cards show. Filtering by
    `booking__user` is the whole ownership check: a report is only reachable
    here through a booking that is already the caller's, so there is no id to
    guess and nothing extra to authorise.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (ScanReport.objects
              .filter(booking__user=request.user)
              .select_related('booking', 'booking__hospital', 'booking__doctor',
                              'booking__scan', 'uploaded_by')
              .order_by('-created'))
        return Response(ScanReportSerializer(qs, many=True).data)
