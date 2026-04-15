from rest_framework import serializers
from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    doctor_name    = serializers.CharField(source='doctor.name',      read_only=True)
    hospital_name  = serializers.CharField(source='hospital.name',    read_only=True)
    user_name      = serializers.CharField(source='user.first_name',  read_only=True)
    patient_name   = serializers.CharField(source='user.username',    read_only=True)
    user_mobile    = serializers.CharField(source='user.mobile',      read_only=True)
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
        Efficient queue position — uses pre-computed context dict when
        the view injects it, so a list of 100 bookings costs 1 extra
        query total, not 100.

        Views that want efficient position must call:
            BookingSerializer(qs, many=True,
                              context={'queue_map': build_queue_map(qs)})
        """
        if obj.status not in ('waiting', 'in_progress'):
            return None

        # Fast path: view pre-computed the position map
        queue_map = self.context.get('queue_map')
        if queue_map is not None:
            return queue_map.get(obj.id)

        # Slow path (single-object detail view): one extra query, acceptable
        if obj.status == 'in_progress':
            return 0
        waiting_ids = list(
            Booking.objects
            .filter(doctor=obj.doctor, date=obj.date, status='waiting')
            .order_by('created')
            .values_list('id', flat=True)
        )
        if obj.id in waiting_ids:
            return waiting_ids.index(obj.id) + 1
        return 0


def build_queue_map(bookings_qs):
    """
    Build {booking_id: position} for all bookings in a queryset
    using a single extra DB query.  Call this in views before
    passing to the serializer context.
    """
    from django.db.models import F
    # Group waiting bookings per (doctor, date), ordered by created
    active = list(
        Booking.objects
        .filter(
            doctor_id__in=bookings_qs.values('doctor_id'),
            status='waiting',
        )
        .order_by('doctor_id', 'date', 'created')
        .values('id', 'doctor_id', 'date')
    )

    queue_map = {}
    # Build position counters per (doctor, date) group
    counters = {}
    for row in active:
        key = (row['doctor_id'], str(row['date']))
        counters[key] = counters.get(key, 0) + 1
        queue_map[row['id']] = counters[key]

    # in_progress → position 0
    in_prog = bookings_qs.filter(status='in_progress').values_list('id', flat=True)
    for bid in in_prog:
        queue_map[bid] = 0

    return queue_map