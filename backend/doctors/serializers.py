from rest_framework import serializers
from .models import Doctor


class DoctorSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)

    # Explicit field so multipart list values are accepted correctly
    slots = serializers.ListField(
        child=serializers.CharField(),
        default=list,
        required=False,
    )

    class Meta:
        model  = Doctor
        fields = [
            "id", "name", "specialization", "experience",
            "mobile", "available", "fee", "slots", "max_per_slot",
            "image", "hospital_image",
            "hospital", "hospital_name", "city",
        ]
        extra_kwargs = {
            "image":          {"required": False, "allow_null": True},
            "hospital_image": {"required": False, "allow_null": True},
            "city":           {"required": False, "allow_blank": True},
            "experience":     {"required": False},
            "max_per_slot":   {"required": False},
            "available":      {"required": False},
            "fee":            {"required": False},
        }