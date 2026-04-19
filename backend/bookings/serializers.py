from rest_framework import serializers
from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    doctor_name   = serializers.CharField(source='doctor.name',     read_only=True)
    hospital_name = serializers.CharField(source='hospital.name',   read_only=True)
    # user.first_name is set to the patient's real name at registration
    user_name     = serializers.CharField(source='user.first_name', read_only=True)
    # patient_name also uses first_name (was incorrectly using username = mobile)
    patient_name  = serializers.CharField(source='user.first_name', read_only=True)
    user_mobile   = serializers.CharField(source='user.mobile',     read_only=True)
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model  = Booking
        fields = [
            'id', 'token', 'status', 'date', 'slot', 'amount',
            'payment_id', 'order_id', 'created',
            'queue_access', 'queue_position',
            'doctor', 'doctor_name', 'hospital', 'hospital_name',
            'user', 'user_name', 'patient_name', 'user_mobile',
        ]

    def get_queue_position(self, obj):
        """
        Returns the patient's position in the queue.
          0  = currently in consultation (in_progress)
          1+ = number of patients ahead + 1
          None = not in an active status
        """
        if obj.status not in ('waiting', 'in_progress'):
            return None

        if obj.status == 'in_progress':
            return 0

        # Fast path: view pre-computed the position map
        queue_map = self.context.get('queue_map')
        if queue_map is not None:
            return queue_map.get(obj.id)

        # Slow path (single-object detail view): one extra query, acceptable
        waiting_ids = list(
            Booking.objects
            .filter(doctor=obj.doctor, date=obj.date, status='waiting')
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
            status='waiting',
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
    in_prog_ids = bookings_qs.filter(status='in_progress').values_list('id', flat=True)
    for bid in in_prog_ids:
        queue_map[bid] = 0

    return queue_map