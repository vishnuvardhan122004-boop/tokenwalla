"""
Scan CRUD — the diagnostic-service analogue of doctors/views.py.

Public read, centre-staff write, with the same ownership rules: a centre may
only touch its own scans. Deliberately mirrors DoctorViewSet rather than
inventing a second shape, so anyone who knows one knows the other.
"""
import logging
from datetime import datetime

from django.db.models import Count, F
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from hospitals.models import (
    Hospital, exclude_test_hospitals, show_test_hospitals_to,
)
from tokenwalla.permissions import IsHospitalStaff, IsScanOwnerCenterOrAdmin
from tokenwalla.utils import is_slot_bookable

from .models import Scan
from .serializers import ScanSerializer

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

        # A scan can only be booked at a scanning centre. If a row's centre was
        # flipped back to kind=HOSPITAL after the scan was created, the scan is
        # unbookable — the whole patient flow keys off the centre being a
        # centre — so it must not be listed either.
        qs = qs.filter(center__kind=Hospital.SCAN_CENTER)

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
