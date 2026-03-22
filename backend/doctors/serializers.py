from rest_framework import serializers
from .models import Doctor


class DoctorSerializer(serializers.ModelSerializer):
    hospital_name  = serializers.CharField(source="hospital.name", read_only=True)
    image          = serializers.SerializerMethodField()
    hospital_image = serializers.SerializerMethodField()

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
            "city":         {"required": False, "allow_blank": True},
            "experience":   {"required": False},
            "max_per_slot": {"required": False},
            "available":    {"required": False},
            "fee":          {"required": False},
        }

    def get_image(self, obj):
        if obj.image:
            return obj.image.url
        return 'https://placehold.co/150x150?text=Doctor'

    def get_hospital_image(self, obj):
        if obj.hospital_image:
            return obj.hospital_image.url
        return 'https://placehold.co/1200x350?text=Hospital'