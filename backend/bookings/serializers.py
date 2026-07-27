from rest_framework import serializers
from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    doctor_name    = serializers.CharField(source='doctor.name',     read_only=True)
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
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model  = Booking
        fields = [
            'id', 'token', 'status', 'date', 'slot', 'amount',
            'payment_id', 'order_id', 'created',
            'queue_access', 'queue_position', 'free_reschedule',
            'doctor', 'doctor_name', 'hospital', 'hospital_name', 'hospital_mobile',
            'user', 'user_name', 'patient_name', 'patient_mobile', 'user_mobile',
            'booked_for_name', 'booked_for_mobile', 'is_for_other',
        ]

    def get_is_for_other(self, obj):
        return bool(obj.booked_for_name)

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
        waiting_ids = list(
            Booking.objects
            .filter(doctor=obj.doctor, date=obj.date, status='CONFIRMED')
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
    # Collect doctor IDs present in the queryset
    doctor_ids = bookings_qs.values_list('doctor_id', flat=True).distinct()

    # Fetch all waiting bookings for those doctors, ordered for queue position
    active = list(
        Booking.objects
        .filter(
            doctor_id__in=doctor_ids,
            status='CONFIRMED',
        )
        .order_by('doctor_id', 'date', 'created')
        .values('id', 'doctor_id', 'date')
    )

    queue_map = {}

    # Build position counters per (doctor_id, date) group
    counters = {}
    for row in active:
        key = (row['doctor_id'], str(row['date']))
        counters[key] = counters.get(key, 0) + 1
        queue_map[row['id']] = counters[key]

    # in_progress bookings → position 0
    in_prog_ids = bookings_qs.filter(status='IN_PROGRESS').values_list('id', flat=True)
    for bid in in_prog_ids:
        queue_map[bid] = 0

    return queue_map