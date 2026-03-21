from rest_framework import serializers
from .models import Booking

class BookingSerializer(serializers.ModelSerializer):
    doctor_name   = serializers.CharField(source="doctor.name",     read_only=True)
    hospital_name = serializers.CharField(source="hospital.name",   read_only=True)
    user_name     = serializers.CharField(source="user.first_name", read_only=True)
    patient_name  = serializers.CharField(source="user.username",   read_only=True)
    user_mobile   = serializers.CharField(source="user.mobile",     read_only=True)

    class Meta:
        model  = Booking
        fields = [
            "id", "token", "status", "date", "slot", "amount",
            "payment_id", "order_id", "created",
            "doctor", "doctor_name", "hospital", "hospital_name",
            "user", "user_name", "patient_name", "user_mobile",
        ]