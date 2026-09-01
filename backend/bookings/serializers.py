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
    # True when an Appointment Pass paid for this booking's service fee — the
    # cancel dialog promises a credit back rather than a refund off this.
    uses_pass     = serializers.SerializerMethodField()
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
            'uses_pass',
        ]

    def get_provider_kind(self, obj):
        return 'SCAN' if obj.is_scan else 'DOCTOR'

    def get_is_for_other(self, obj):
        return bool(obj.booked_for_name)

    def get_uses_pass(self, obj):
        return obj.appointment_pass_id is not None

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


def build_queue_map(bookings_qs):
    """
    Build {booking_id: position} for all bookings in a queryset
    using a single extra DB query instead of N queries.

    Call this in views before passing to the serializer context:
        queue_map = build_queue_map(bookings)
        BookingSerializer(bookings, many=True, context={'queue_map': queue_map})
    """
    # Group by PROVIDER — (doctor_id, scan_id) — not doctor alone. Keying on
    # doctor_id only would give every scan booking the key (None, date) and
    # queue patients at unrelated centres into one another's positions.
    provider_ids = bookings_qs.values_list('doctor_id', 'scan_id').distinct()
    doctor_ids = {d for d, _ in provider_ids if d is not None}
    scan_ids   = {s for _, s in provider_ids if s is not None}

    # Fetch all waiting bookings for those providers, ordered for queue position
    active = list(
        Booking.objects
        .filter(
            Q(doctor_id__in=doctor_ids) | Q(scan_id__in=scan_ids),
            status='CONFIRMED',
        )
        .order_by('doctor_id', 'scan_id', 'date', 'created')
        .values('id', 'doctor_id', 'scan_id', 'date')
    )

    queue_map = {}

    # Build position counters per (provider, date) group
    counters = {}
    for row in active:
        key = (row['doctor_id'], row['scan_id'], str(row['date']))
        counters[key] = counters.get(key, 0) + 1
        queue_map[row['id']] = counters[key]

    # in_progress bookings → position 0
    in_prog_ids = bookings_qs.filter(status='IN_PROGRESS').values_list('id', flat=True)
    for bid in in_prog_ids:
        queue_map[bid] = 0

    return queue_map