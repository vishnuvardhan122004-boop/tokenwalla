from rest_framework import serializers
from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    doctor_name    = serializers.CharField(source="doctor.name",      read_only=True)
    hospital_name  = serializers.CharField(source="hospital.name",    read_only=True)
    user_name      = serializers.CharField(source="user.first_name",  read_only=True)
    patient_name   = serializers.CharField(source="user.username",    read_only=True)
    user_mobile    = serializers.CharField(source="user.mobile",      read_only=True)
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model  = Booking
        fields = [
            "id", "token", "status", "date", "slot", "amount",
            "payment_id", "order_id", "created",
            "queue_access", "queue_position",
            "doctor", "doctor_name", "hospital", "hospital_name",
            "user", "user_name", "patient_name", "user_mobile",
        ]

    def get_queue_position(self, obj):
        """
        Live queue position for waiting bookings.
        Returns the 1-based position among all 'waiting' bookings
        for the same doctor on the same date, ordered by creation time.
        Returns None for non-waiting bookings.
        """
        if obj.status not in ("waiting", "in_progress"):
            return None
        waiting = (
            Booking.objects
            .filter(doctor=obj.doctor, date=obj.date, status="waiting")
            .order_by("created")
            .values_list("id", flat=True)
        )
        ids = list(waiting)
        if obj.id in ids:
            return ids.index(obj.id) + 1
        # in_progress means it's currently being seen — position 0
        return 0