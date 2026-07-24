import json
from datetime import datetime

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import Doctor
from .serializers import DoctorSerializer
from tokenwalla.permissions import IsHospitalStaff
from tokenwalla.utils import is_slot_bookable

import logging
import threading

logger = logging.getLogger('tokenwalla')


def _notify_doctor_unavailable(doctor_id):
    """Flag today's active bookings for a just-unavailable doctor as eligible for
    a free reschedule, and notify each patient (push + WhatsApp) off-thread.

    Runs in a background thread so the availability toggle responds instantly and
    slow external APIs (push/WhatsApp) can never block or fail it. Best-effort.
    """
    def _run():
        from django.db import connection
        from django.utils import timezone
        from bookings.models import Booking
        from notifications.push import push_doctor_unavailable
        from notifications.whatsapp import send_doctor_unavailable
        try:
            today = timezone.localdate()
            affected = list(
                Booking.objects
                .filter(doctor_id=doctor_id, date=today, status__in=['waiting', 'held'])
                .select_related('user', 'doctor', 'hospital')
            )
            if not affected:
                return
            # Flag them all first so the free-reschedule CTA is live even if a
            # notification send is slow or fails.
            Booking.objects.filter(id__in=[b.id for b in affected]).update(free_reschedule=True)
            for b in affected:
                b.free_reschedule = True
                try:
                    push_doctor_unavailable(b)
                except Exception as exc:
                    logger.warning('doctor_unavailable push failed for booking %s: %s', b.id, exc)
                try:
                    send_doctor_unavailable(b)
                except Exception as exc:
                    logger.warning('doctor_unavailable WhatsApp failed for booking %s: %s', b.id, exc)
            logger.info('Doctor %s unavailable — notified %d patient(s) for %s', doctor_id, len(affected), today)
        except Exception as exc:
            logger.exception('doctor_unavailable dispatch failed for doctor %s: %s', doctor_id, exc)
        finally:
            connection.close()

    threading.Thread(target=_run, name=f'doc-unavail-{doctor_id}', daemon=True).start()


class DoctorViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorSerializer
    # Reads are public; any write (create/update/partial_update/destroy) requires
    # an authenticated hospital-staff or admin account. Without this, the
    # class-level default let anonymous callers create, edit, and delete doctors
    # (and wipe their booking history). See get_permissions() below.
    permission_classes = [AllowAny]

    # Verbs that are safe to expose to the public (patients browsing doctors).
    _PUBLIC_ACTIONS = {'list', 'retrieve', 'slot_availability'}

    def get_permissions(self):
        """Public read, authenticated hospital/admin write.

        Custom @action methods (booking_summary, force_delete) declare their own
        permission_classes and enforce an explicit admin check inside the handler,
        so they are left to DRF's per-action resolution.
        """
        if self.action in self._PUBLIC_ACTIONS:
            return [AllowAny()]
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsHospitalStaff()]
        return super().get_permissions()

    def get_queryset(self):
        # Default ordering prevents UnorderedObjectListWarning with pagination
        qs = Doctor.objects.select_related('hospital').order_by('id')
        hospital_id = self.request.query_params.get('hospital')
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        return qs

    # ── Slot availability ─────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='slot-availability')
    def slot_availability(self, request, pk=None):
        """
        GET /api/doctors/<id>/slot-availability/?date=YYYY-MM-DD

        Returns per-slot booking counts:
            { "09:00 AM": { "booked": 2, "max": 10, "full": false, "too_soon": false } }

        A slot is also marked 'full' — the same flag the web + mobile UI
        already use to grey out / strike-through a slot and block selection —
        if it starts within BOOKING_CUTOFF_HOURS (2h) of right now. This means
        patients can no longer book a slot that's about to happen, without
        needing any frontend changes.

        Only counts bookings with status 'waiting' or 'in_progress'.
        """
        from bookings.models import Booking
        from django.db.models import Count

        doctor = self.get_object()
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
            .filter(doctor=doctor, date=date, status__in=['waiting', 'in_progress'])
            .values('slot')
            .annotate(count=Count('id'))
        )
        booked_map = {row['slot']: row['count'] for row in counts}

        result = {}
        for slot in (doctor.slots or []):
            booked = booked_map.get(slot, 0)
            capacity_full = booked >= doctor.max_per_slot
            too_soon = not is_slot_bookable(date, slot)
            result[slot] = {
                'booked': booked,
                'max': doctor.max_per_slot,
                'too_soon': too_soon,
                'full': capacity_full or too_soon,
            }
        return Response(result)

    # ── Booking summary (admin only) ──────────────────────────────────────────

    @action(
        detail=True,
        methods=['get'],
        url_path='booking-summary',
        permission_classes=[IsAuthenticated],
    )
    def booking_summary(self, request, pk=None):
        """
        GET /api/doctors/<id>/booking-summary/
        Admin only — returns booking counts for a doctor.
        Used by the admin frontend before showing the delete confirmation modal.
        """
        from bookings.models import Booking

        if not (request.user.is_authenticated and
                getattr(request.user, 'role', None) == 'admin'):
            return Response({'message': 'Admin access required.'}, status=403)

        doctor = self.get_object()
        qs = Booking.objects.filter(doctor=doctor)
        return Response({
            'total': qs.count(),
            'active': qs.filter(status__in=['waiting', 'in_progress']).count(),
            'waiting': qs.filter(status='waiting').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'completed': qs.filter(status='completed').count(),
            'cancelled': qs.filter(status='cancelled').count(),
        })

    # ── Force delete (admin only) ─────────────────────────────────────────────

    @action(
        detail=True,
        methods=['delete'],
        url_path='force-delete',
        permission_classes=[IsAuthenticated],
    )
    def force_delete(self, request, pk=None):
        """
        DELETE /api/doctors/<id>/force-delete/
        Admin only — cancels all active bookings, deletes all booking records,
        then deletes the doctor. Bypasses the on_delete=PROTECT guard.
        """
        from bookings.models import Booking
        from django.db import transaction

        if not (request.user.is_authenticated and
                getattr(request.user, 'role', None) == 'admin'):
            return Response({'message': 'Admin access required.'}, status=403)

        doctor = self.get_object()

        with transaction.atomic():
            cancelled = Booking.objects.filter(
                doctor=doctor,
                status__in=['waiting', 'in_progress'],
            ).update(status='cancelled')

            total_deleted = Booking.objects.filter(doctor=doctor).delete()[0]

            name = doctor.name
            doctor.delete()

        return Response({
            'message': (
                f'Dr. {name} deleted. '
                f'{cancelled} active booking(s) were cancelled. '
                f'{total_deleted} total booking records removed.'
            ),
            'cancelled_bookings': cancelled,
            'deleted_records': total_deleted,
        })

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _prepare_data(self, raw):
        """
        Normalise multipart/form-data sent from the React dashboard / mobile app.
        Handles both QueryDict (multipart) and plain dict (JSON body).

        IMPORTANT: When a file is uploaded, DRF merges the uploaded file object
        directly into `request.data` (via QueryDict.update(files)). Calling
        `raw.copy()` on a QueryDict triggers Django's __deepcopy__, which tries
        to copy.deepcopy() every value — including open file handles
        (BufferedRandom), which cannot be pickled/deepcopied and crashes with:
            TypeError: cannot pickle 'BufferedRandom' instances

        Fix: rebuild the QueryDict manually using setlist() (no deepcopy),
        re-referencing the same original values — including file objects —
        without ever calling .copy() on a dict that may contain files.
        """
        from django.http import QueryDict

        if hasattr(raw, 'lists'):
            # QueryDict (multipart or urlencoded) — safe manual rebuild, no deepcopy
            data = QueryDict('', mutable=True)
            for key, values in raw.lists():
                data.setlist(key, list(values))
        else:
            # Plain dict (JSON body) — shallow copy is fine, no file objects possible
            data = dict(raw)

        # slots & days: JSON string → list
        for list_field in ('slots', 'days'):
            raw_val = data.get(list_field)
            if raw_val is not None and isinstance(raw_val, str):
                try:
                    decoded = json.loads(raw_val)
                    if isinstance(decoded, list):
                        if hasattr(data, 'setlist'):
                            data.setlist(list_field, decoded)
                        else:
                            data[list_field] = decoded
                    else:
                        raise ValueError(f'{list_field} JSON must be a list')
                except (json.JSONDecodeError, ValueError):
                    if hasattr(data, 'setlist'):
                        data.setlist(list_field, [])
                    else:
                        data[list_field] = []

        # available: string → bool
        avail = data.get('available')
        if avail is not None and isinstance(avail, str):
            data['available'] = avail.lower() not in ('false', '0', 'no', '')

        # numeric fields
        int_fields = (('experience', 0), ('max_per_slot', 10))
        float_fields = (('fee', 0.0),)

        for field, default in int_fields:
            val = data.get(field)
            if val is not None:
                try:
                    data[field] = int(val)
                except (ValueError, TypeError):
                    data[field] = default

        for field, default in float_fields:
            val = data.get(field)
            if val is not None:
                try:
                    data[field] = float(val)
                except (ValueError, TypeError):
                    data[field] = default

        return data

    # ── ViewSet action overrides ──────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        data = self._prepare_data(request.data)

        serializer = self.get_serializer(data=data)
        if not serializer.is_valid():
            logger.warning('Doctor create validation failed: %s', serializer.errors)
            return Response(
                {'message': 'Validation failed', 'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        incoming = request.data
        incoming_keys = set(incoming.keys())

        # Fast-path: availability-only toggle
        # Handles plain JSON { "available": true/false } from the dashboard toggle;
        # skips _prepare_data so slots are never accidentally overwritten.
        if incoming_keys == {'available'}:
            raw_val = incoming.get('available')
            new_val = (
                raw_val
                if isinstance(raw_val, bool)
                else str(raw_val).lower() not in ('false', '0', 'no', '')
            )
            was_available = instance.available
            instance.available = new_val
            instance.save(update_fields=['available'])

            logger.info('Doctor %s availability set to %s', instance.id, new_val)

            # Became unavailable → notify today's booked patients + offer a free
            # reschedule. Only on a true→false transition, so re-saving 'off'
            # doesn't re-notify.
            if was_available and not new_val:
                _notify_doctor_unavailable(instance.id)

            return Response(DoctorSerializer(instance).data)

        # Full / partial form update (multipart FormData)
        data = self._prepare_data(incoming)

        serializer = self.get_serializer(instance, data=data, partial=True)
        if not serializer.is_valid():
            logger.warning('Doctor %s update validation failed: %s', instance.id, serializer.errors)
            return Response(
                {'message': 'Validation failed', 'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.perform_update(serializer)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """
        Delete a doctor.

        - Blocks (409) if the doctor still has ACTIVE bookings
          (waiting / in_progress) — those must be completed or cancelled first.
        - Otherwise removes the doctor's historical (completed / cancelled)
          bookings in the same transaction. This is required because the
          Booking -> Doctor FK uses on_delete=PROTECT, so any leftover booking
          row would otherwise raise ProtectedError and make deletion fail.
        """
        from bookings.models import Booking
        from django.db import transaction
        from django.db.models import ProtectedError

        instance = self.get_object()
        active = Booking.objects.filter(
            doctor=instance,
            status__in=['waiting', 'in_progress'],
        ).exists()

        if active:
            return Response(
                {
                    'error': 'Cannot delete a doctor with active bookings. '
                             'Please complete or cancel them first.',
                    'message': 'Cannot delete a doctor with active bookings. '
                               'Please complete or cancel them first.',
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            with transaction.atomic():
                # Remove historical bookings first so PROTECT doesn't block.
                Booking.objects.filter(doctor=instance).delete()
                self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {
                    'error': 'This doctor has linked records and cannot be deleted.',
                    'message': 'This doctor has linked records and cannot be deleted.',
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)