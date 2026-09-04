from django.db.models import Q
from rest_framework import serializers

from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    # Reads through provider_name so a scan booking serialises its scan's name
    # here instead of a null. The key name stays `doctor_name` because installed
    # app builds read it — see the note in BookingViewSet._serialize_booking.
    doctor_name    = serializers.CharField(source='provider_name',    read_only=True)
    provider_name  = serializers.CharField(read_only=True)
    provider_kind  = serializers.SerializerMethodField()
    hospital_name  = serializers.CharField(source='hospital.name',   read_only=True)
    hospital_mobile = serializers.CharField(source='hospital.mobile', read_only=True)
    # user.first_name is the account holder's real name (set at registration).
    user_name     = serializers.CharField(source='user.first_name', read_only=True)
    # patient_name is who the appointment is *for* — the beneficiary when the
    # booking was made "for someone else", otherwise the account holder.
    patient_name  = serializers.CharField(source='patient_display_name',   read_only=True)
    patient_mobile = serializers.CharField(source='patient_display_mobile', read_only=True)
    user_mobile   = serializers.CharField(source='user.mobile',     read_only=True)
    # True when this booking was made on behalf of another person.
    is_for_other  = serializers.SerializerMethodField()
    # True when an Appointment Pass paid for this booking's service fee.
    uses_pass     = serializers.SerializerMethodField()
    # Which SIDE of the pass this booking is: 'purchase' (the checkout that
    # bought it — cancelling ends the pass) or 'redeemed' (a free visit —
    # cancelling hands the credit back). The two need opposite cancel copy, so
    # `uses_pass` alone is not enough to write it.
    pass_role     = serializers.SerializerMethodField()
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model  = Booking
        fields = [
            'id', 'token', 'status', 'date', 'slot', 'amount',
            'payment_id', 'order_id', 'created',
            'queue_access', 'queue_position', 'free_reschedule',
            'doctor', 'doctor_name', 'scan', 'provider_name', 'provider_kind',
            'hospital', 'hospital_name', 'hospital_mobile',
            'user', 'user_name', 'patient_name', 'patient_mobile', 'user_mobile',
            'booked_for_name', 'booked_for_mobile', 'is_for_other',
            'uses_pass', 'pass_role',
        ]

    def get_provider_kind(self, obj):
        return 'SCAN' if obj.is_scan else 'DOCTOR'

    def get_is_for_other(self, obj):
        return bool(obj.booked_for_name)

    def get_uses_pass(self, obj):
        return obj.appointment_pass_id is not None

    def get_pass_role(self, obj):
        if obj.appointment_pass_id is None:
            return None
        ap = obj.appointment_pass
        return 'purchase' if ap and ap.source_booking_id == obj.id else 'redeemed'

    def get_queue_position(self, obj):
        """
        Returns the patient's position in the queue.
          0  = currently in consultation (in_progress)
          1+ = number of patients ahead + 1
          None = not in an active status
        """
        if obj.status not in ('CONFIRMED', 'IN_PROGRESS'):
            return None

        if obj.status == 'IN_PROGRESS':
            return 0

        # Fast path: view pre-computed the position map
        queue_map = self.context.get('queue_map')
        if queue_map is not None:
            return queue_map.get(obj.id)

        # Slow path (single-object detail view): one extra query, acceptable
        # provider_filter, not `doctor=obj.doctor`: on a scan booking doctor is
        # None, which would filter `doctor__isnull=True` and queue the patient
        # against every scan booking in the system.
        waiting_ids = list(
            Booking.objects
            .filter(**obj.provider_filter, date=obj.date, status='CONFIRMED')
            .order_by('created')
            .values_list('id', flat=True)
        )
        try:
            return waiting_ids.index(obj.id) + 1
        except ValueError:
            return None


def build_queue_map(bookings):
    """
    Build {booking_id: position} for a set of bookings in ONE query, instead of
    the one-query-per-row slow path in BookingSerializer.get_queue_position.

    Accepts anything iterable of Booking objects — a QuerySet, a paginator page,
    or an already-sliced queryset.

    That tolerance is the whole point. This used to require a QuerySet it could
    re-filter (`.values_list(...)`, `.filter(status=...)`), which quietly
    excluded the two callers that most needed it: AllBookingsView hands the
    serializer a paginator PAGE (a list — `.values_list` raises AttributeError)
    and AdminReportsView hands it `qs[:500]` (a slice — filtering after slicing
    raises "Cannot filter a query once a slice has been taken"). Neither could
    call this, so both silently fell back to a query per row — 50 and 500 of
    them respectively. Deriving the provider ids and the in-progress ids from
    the rows in memory removes the constraint and drops 3 queries to 1.

    Call it in the view and pass the result through the serializer context:
        queue_map = build_queue_map(bookings)
        BookingSerializer(bookings, many=True, context={'queue_map': queue_map})
    """
    rows = list(bookings)          # evaluate once, whatever shape it arrived in
    if not rows:
        return {}

    # Group by PROVIDER — (doctor_id, scan_id) — not doctor alone. Keying on
    # doctor_id only would give every scan booking the key (None, date) and
    # queue patients at unrelated centres into one another's positions.
    doctor_ids = {b.doctor_id for b in rows if b.doctor_id is not None}
    scan_ids   = {b.scan_id   for b in rows if b.scan_id   is not None}

    queue_map = {}

    # Every CONFIRMED booking for those providers — not just the ones in `rows`.
    # A patient's position depends on everyone ahead of them, including
    # bookings that fall outside the current page.
    if doctor_ids or scan_ids:
        active = (
            Booking.objects
            .filter(
                Q(doctor_id__in=doctor_ids) | Q(scan_id__in=scan_ids),
                status='CONFIRMED',
            )
            .order_by('doctor_id', 'scan_id', 'date', 'created')
            .values('id', 'doctor_id', 'scan_id', 'date')
        )

        # Position counters per (provider, date) group
        counters = {}
        for row in active:
            key = (row['doctor_id'], row['scan_id'], str(row['date']))
            counters[key] = counters.get(key, 0) + 1
            queue_map[row['id']] = counters[key]

    # in_progress bookings → position 0. Read off the rows we already hold
    # rather than asking the database a second time.
    for b in rows:
        if b.status == 'IN_PROGRESS':
            queue_map[b.id] = 0

    return queue_map