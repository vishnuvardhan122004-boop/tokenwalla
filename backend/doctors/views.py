import json
from datetime import datetime

from django.db.models import F

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import Doctor
from .serializers import DoctorSerializer
from hospitals.models import (
    exclude_centers, exclude_test_hospitals, show_test_hospitals_to,
)
from payments.payout_utils import payout_target
from tokenwalla.permissions import IsHospitalStaff, IsDoctorOwnerHospitalOrAdmin
from tokenwalla.utils import is_slot_bookable

import logging
import threading

logger = logging.getLogger('tokenwalla')


def _empty_totals():
    """Zeroed hospital-wide totals for a hospital with no doctors yet."""
    return {
        'total_collected': '0', 'doctor_fees_collected': '0', 'service_revenue': '0',
        'gateway_fees': '0', 'gst_collected': '0', 'service_total': '0',
        'offline_doctor_fee': '0', 'refunded_to_patient': '0',
        'pending_payout': '0', 'paid_amount': '0', 'doctor_count': 0,
    }


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
                .filter(doctor_id=doctor_id, date=today, status__in=['CONFIRMED', 'ON_HOLD'])
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
    _PUBLIC_ACTIONS = {'list', 'retrieve', 'slot_availability', 'record_view'}

    def get_permissions(self):
        """Public read, authenticated hospital/admin write.

        Custom @action methods (booking_summary, force_delete) declare their own
        permission_classes and enforce an explicit admin check inside the handler,
        so they are left to DRF's per-action resolution.
        """
        if self.action in self._PUBLIC_ACTIONS:
            return [AllowAny()]
        if self.action == 'create':
            # No object yet — ownership of the target hospital is enforced
            # inside create() against the submitted `hospital` field.
            return [IsAuthenticated(), IsHospitalStaff()]
        if self.action in ('update', 'partial_update', 'destroy'):
            # IsDoctorOwnerHospitalOrAdmin runs per-object in get_object(), so a
            # hospital can't edit/delete another hospital's doctor.
            return [IsAuthenticated(), IsHospitalStaff(), IsDoctorOwnerHospitalOrAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        # Popular first, then id. The id tiebreak keeps the order total, which
        # pagination needs — ordering by view_count alone would let rows shuffle
        # between pages as counts change mid-browse.
        #
        # Clients re-rank what they receive (availability and city matter more
        # than popularity), but ordering here too means page 1 holds the most
        # popular doctors once there are more than PAGE_SIZE of them.
        qs = Doctor.objects.select_related('hospital').order_by('-view_count', 'id')
        hospital_id = self.request.query_params.get('hospital')
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        # Internal demo/test hospitals are not patient-facing. Left visible,
        # their doctors show up in the public browse list next to real ones —
        # and the demo doctor is the only row in the system set to collect the
        # FULL consultation fee, so a patient could be charged hundreds of
        # rupees for an appointment that does not exist, and we would then owe
        # a payout against it. Staff and admins still see them.
        if not show_test_hospitals_to(getattr(self.request, 'user', None)):
            qs = exclude_test_hospitals(qs, field='hospital__name')

        # A scanning centre has Scans, not Doctors, so this should normally
        # match nothing. It is here because "should" is not a guarantee: a
        # centre mis-registered as a hospital, or one that added a doctor before
        # its kind was corrected, would otherwise leak a bookable row into the
        # installed app builds — which is exactly the failure the [TEST] filter
        # above was added for, after it happened in production on 2026-08-11.
        qs = exclude_centers(qs, field='hospital__kind')
        return qs

    # ── Popularity ────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='view', permission_classes=[AllowAny])
    def record_view(self, request, pk=None):
        """Count one patient opening this doctor's page.

        Public and unauthenticated on purpose — most browsing happens before
        login, and a signal that only counted logged-in patients would rank the
        wrong doctors.

        A single atomic UPDATE via F(), not read-modify-write: two patients
        opening the same page at once would otherwise both read N and write
        N+1, losing a count. No row lock is needed because the database does
        the arithmetic.

        Deliberately NOT folded into retrieve(): that endpoint is also polled by
        the hospital dashboard and the admin screens, which would inflate the
        count with staff traffic and rank whichever doctor staff edit most.

        Returns 204 with no body. The clients fire this and ignore the result,
        so there is nothing worth serialising back.
        """
        updated = Doctor.objects.filter(pk=pk).update(view_count=F('view_count') + 1)
        if not updated:
            return Response({'message': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

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

        Only counts bookings with status 'CONFIRMED' or 'IN_PROGRESS'.
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
            .filter(doctor=doctor, date=date, status__in=['CONFIRMED', 'IN_PROGRESS'])
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
            'active': qs.filter(status__in=['CONFIRMED', 'IN_PROGRESS']).count(),
            'waiting': qs.filter(status='CONFIRMED').count(),
            'in_progress': qs.filter(status='IN_PROGRESS').count(),
            'completed': qs.filter(status='COMPLETED').count(),
            'cancelled': qs.filter(status='CANCELLED').count(),
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
                status__in=['CONFIRMED', 'IN_PROGRESS'],
            ).update(status='CANCELLED')

            total_deleted = Booking.objects.filter(doctor=doctor).delete()[0]

            name = doctor.name
            doctor.delete()

        return Response({
            'message': (
                f'{name} deleted. '
                f'{cancelled} active booking(s) were cancelled. '
                f'{total_deleted} total booking records removed.'
            ),
            'cancelled_bookings': cancelled,
            'deleted_records': total_deleted,
        })

    # ── Payout / payment details (owning hospital or admin) ───────────────────

    @action(
        detail=True,
        methods=['get', 'put', 'patch'],
        url_path='payment-details',
        permission_classes=[IsAuthenticated, IsHospitalStaff, IsDoctorOwnerHospitalOrAdmin],
    )
    def payment_details(self, request, pk=None):
        """
        GET  /api/doctors/<id>/payment-details/  — read this doctor's payout/KYC details.
        PUT  /api/doctors/<id>/payment-details/  — update them (owning hospital or admin).

        Sensitive bank/UPI details are served ONLY here (never on the public
        doctor list/detail), gated to the owning hospital or an admin via
        IsDoctorOwnerHospitalOrAdmin, which get_object() enforces per-object.
        """
        from .serializers import DoctorPaymentDetailsSerializer

        doctor = self.get_object()  # runs object-level owner/admin permission

        if request.method == 'GET':
            return Response(DoctorPaymentDetailsSerializer(doctor).data)

        serializer = DoctorPaymentDetailsSerializer(doctor, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'message': 'Validation failed', 'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()
        logger.info('Payment details updated for doctor %s', doctor.id)
        return Response(serializer.data)

    # ── Payment summary for a hospital's doctors (owning hospital or admin) ────

    @action(
        detail=False,
        methods=['get'],
        url_path='payment-summary',
        permission_classes=[IsAuthenticated, IsHospitalStaff],
    )
    def payment_summary(self, request):
        """
        GET /api/doctors/payment-summary/?hospital=<id>

        Per-doctor money tracker for the hospital dashboard's Doctor Payments
        page: appointments, amount collected, doctor earnings, TokenWalla service
        revenue, pending payout, paid-out amount and last payout date — plus
        hospital-wide totals for the summary cards. Owning hospital or admin only.
        """
        from django.db.models import Sum, Count, Max
        from bookings.models import Booking
        from payments.models import Payment, DoctorLedger, PayoutBatch, Refund

        hospital_id = request.query_params.get('hospital')
        if not hospital_id:
            return Response({'message': 'hospital query param is required.'}, status=400)

        user = request.user
        is_admin = getattr(user, 'role', None) == 'admin' or user.is_staff
        if not is_admin and str(getattr(user, 'last_name', '')) != str(hospital_id):
            return Response({'message': 'You can only view your own hospital.'}, status=403)

        # select_related('hospital'): payout_target() reads it for salaried doctors.
        doctors = list(Doctor.objects.filter(hospital_id=hospital_id)
                       .select_related('hospital').order_by('name'))
        if not doctors:
            return Response({'doctors': [], 'totals': _empty_totals()})

        # ── Aggregate in a handful of grouped queries (not per-doctor loops) ──
        def _index(rows, key):
            return {r[key]: r for r in rows}

        pay_rows = _index(
            Payment.objects
            .filter(booking__doctor__hospital_id=hospital_id, status=Payment.PAID)
            .values('booking__doctor_id')
            .annotate(
                collected=Sum('final_amount'),
                earnings=Sum('doctor_fee'),
                offline=Sum('offline_doctor_fee'),
                service=Sum('platform_fee'),
                gateway=Sum('gateway_fee'),
                gst=Sum('gst_amount'),
                paid_appointments=Count('id'),
            ),
            'booking__doctor_id',
        )
        appt_rows = _index(
            Booking.objects
            .filter(doctor__hospital_id=hospital_id)
            .values('doctor_id')
            .annotate(appointments=Count('id')),
            'doctor_id',
        )
        # Clawbacks for doctor no-shows (negative rows). Counted whether or not
        # they've been batched: a batch's total_amount is already net of any
        # clawback inside it, so `earnings + adjustments - paid` nets out either
        # way — see the pending derivation below.
        adjust_rows = _index(
            DoctorLedger.objects
            .filter(doctor__hospital_id=hospital_id,
                    reason=DoctorLedger.ABSENCE_REFUND)
            .values('doctor_id')
            .annotate(adjustments=Sum('amount')),
            'doctor_id',
        )
        # Cancellation refunds — collected online, then given back to the
        # patient. Both slices leave us: the doctor's share is never owed to the
        # doctor, and the platform's share is not our revenue. (Gateway fee and
        # GST are never refunded, so they need no netting.)
        refund_rows = _index(
            Refund.objects
            .filter(payment__booking__doctor__hospital_id=hospital_id)
            .values('payment__booking__doctor_id')
            .annotate(refunded=Sum('doctor_loss'),
                      service_refunded=Sum('platform_loss')),
            'payment__booking__doctor_id',
        )
        paid_rows = _index(
            PayoutBatch.objects
            .filter(doctor__hospital_id=hospital_id, status=PayoutBatch.PROCESSED)
            .values('doctor_id')
            .annotate(paid=Sum('total_amount'), last=Max('created_at')),
            'doctor_id',
        )

        def _num(v):
            return str(v if v is not None else 0)

        rows = []
        t_collected = t_doctor_fees = t_service = t_pending = t_paid = 0
        t_gateway = t_gst = t_offline = t_refunded = 0
        for d in doctors:
            p  = pay_rows.get(d.id, {})
            a  = appt_rows.get(d.id, {})
            ad = adjust_rows.get(d.id, {})
            rf = refund_rows.get(d.id, {})
            pd = paid_rows.get(d.id, {})

            online    = p.get('collected') or 0   # Σ final_amount (paid via TokenWalla)
            earnings  = p.get('earnings') or 0     # Σ doctor_fee captured ONLINE (FULL mode)
            offline   = p.get('offline') or 0      # Σ consultation fee collected at hospital
            gateway   = p.get('gateway') or 0
            gst       = p.get('gst') or 0
            adjust    = ad.get('adjustments') or 0   # ≤ 0
            refunded  = rf.get('refunded') or 0
            svc_back  = rf.get('service_refunded') or 0
            paid      = pd.get('paid') or 0
            last      = pd.get('last')

            # Our platform fee, net of the share handed back on cancellations.
            # Never negative: a refund's platform_loss is a percentage of that
            # same payment's platform_fee (see payments.refunds).
            service   = (p.get('service') or 0) - svc_back

            # What is still owed to this doctor. Derived from the fees actually
            # COLLECTED online, not from ledger rows: a ledger row only appears
            # once the nightly payout run has seen the visit COMPLETED, so a
            # ledger-driven "pending" read ₹0 while real money sat with us, and
            # fees already inside a QUEUED (not yet PROCESSED) batch showed up in
            # neither column. As a remainder this always holds:
            #   doctor_fee_online == pending_payout + paid_amount
            #                        + refunded_from_doctor_fee
            owed    = earnings + adjust - refunded
            pending = max(owed - paid, 0)

            # Doctor's consultation fee collected across BOTH rails (online for
            # FULL bookings, offline at the hospital for Service-Fee-Only ones),
            # less whatever went back to the patient on a cancellation.
            doctor_fees = earnings + offline - refunded
            # Grand total that changed hands: everything paid online PLUS the
            # consultation fee collected offline at the hospital, MINUS the whole
            # refunded pool. Netting each slice where it landed is what keeps the
            # remainder below equal to platform + gateway + GST.
            total = online + offline - refunded - svc_back

            # Everything the patient paid TokenWalla on top of the consultation
            # fee. Charged to the PATIENT — never deducted from the doctor or
            # billed to the hospital.
            #
            # Derived as the REMAINDER, not as platform+gateway+gst: legacy
            # pre-split payments carry a final_amount with every component field
            # at 0 (the old flat ₹15 booking fee, all of it ours), so summing
            # components silently dropped them and left the page showing a gap
            # nobody could account for. As a remainder this always holds:
            #   total_collected == doctor_fees_collected + service_total
            service_total = max(total - doctor_fees, 0)

            t_collected  += total
            t_doctor_fees += doctor_fees
            t_service    += service
            t_gateway    += gateway
            t_gst        += gst
            t_offline    += offline
            t_refunded   += refunded + svc_back
            t_pending    += pending
            t_paid       += paid

            # A salaried doctor is paid into the HOSPITAL's account, so "are the
            # payout details set?" must ask the target, not the doctor — else the
            # dashboard nags for bank details that would never be used.
            target = payout_target(d)

            rows.append({
                'id':               d.id,
                'name':             d.name,
                'specialization':   d.specialization,
                'fee':              d.fee,
                'collection_mode':  d.payment_collection_mode,
                'payment_method':   d.payment_method,
                'payout_to_hospital': d.payout_to_hospital,
                'has_payout_details': bool(target.upi_vpa or target.bank_account_number),
                'appointments':     a.get('appointments', 0),
                'paid_appointments': p.get('paid_appointments', 0),
                'total_collected':  _num(total),          # gross (online + offline)
                'online_collected': _num(online),         # captured via TokenWalla
                'doctor_fees_collected': _num(doctor_fees),
                'doctor_fee_online':     _num(earnings),  # captured by us → payable
                'offline_doctor_fee':    _num(offline),   # collected at the hospital
                'refunded_to_patient':   _num(refunded + svc_back),  # whole pool
                'refunded_from_doctor_fee': _num(refunded),           # …its doctor slice
                'refunded_from_service':    _num(svc_back),           # …and ours
                'service_revenue':  _num(service),          # platform fee alone
                'gateway_fee':      _num(gateway),
                'gst_collected':    _num(gst),
                'service_total':    _num(service_total),    # platform + gateway + GST
                'pending_payout':   _num(pending),
                'paid_amount':      _num(paid),
                'last_payout_date': last.isoformat() if last else None,
            })

        return Response({
            'doctors': rows,
            'totals': {
                'total_collected':       _num(t_collected),
                'doctor_fees_collected': _num(t_doctor_fees),
                'offline_doctor_fee':    _num(t_offline),
                'refunded_to_patient':   _num(t_refunded),
                'service_revenue':       _num(t_service),
                'gateway_fees':          _num(t_gateway),
                'gst_collected':         _num(t_gst),
                'service_total':         _num(max(t_collected - t_doctor_fees, 0)),
                'pending_payout':        _num(t_pending),
                'paid_amount':           _num(t_paid),
                'doctor_count':          len(doctors),
            },
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

        # A hospital account may only add doctors under its OWN hospital; admins
        # (or staff) may create for any hospital.
        user = request.user
        if not (getattr(user, 'role', None) == 'admin' or user.is_staff):
            own_hospital_id = str(getattr(user, 'last_name', '') or '')
            if str(data.get('hospital', '')) != own_hospital_id:
                return Response(
                    {'message': 'You can only add doctors to your own hospital.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

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
            status__in=['CONFIRMED', 'IN_PROGRESS'],
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