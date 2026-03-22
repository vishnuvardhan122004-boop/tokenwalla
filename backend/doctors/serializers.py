from rest_framework import serializers
from .models import Doctor


class DoctorSerializer(serializers.ModelSerializer):
    hospital_name  = serializers.CharField(source="hospital.name", read_only=True)

    # Read-only fields for returning full Cloudinary URLs
    image_url          = serializers.SerializerMethodField()
    hospital_image_url = serializers.SerializerMethodField()

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
            "image_url", "hospital_image_url",
            "hospital", "hospital_name", "city",
        ]
        extra_kwargs = {
            "image":          {"required": False, "allow_null": True, "write_only": False},
            "hospital_image": {"required": False, "allow_null": True, "write_only": False},
            "city":           {"required": False, "allow_blank": True},
            "experience":     {"required": False},
            "max_per_slot":   {"required": False},
            "available":      {"required": False},
            "fee":            {"required": False},
        }

    def get_image_url(self, obj):
        if obj.image:
            return obj.image.url
        return 'https://placehold.co/150x150?text=Doctor'

    def get_hospital_image_url(self, obj):
        if obj.hospital_image:
            return obj.hospital_image.url
        return 'https://placehold.co/1200x350?text=Hospital'

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Replace image fields with full Cloudinary URLs in response
        rep['image']          = self.get_image_url(instance)
        rep['hospital_image'] = self.get_hospital_image_url(instance)
        # Remove the extra url fields
        rep.pop('image_url', None)
        rep.pop('hospital_image_url', None)
        return rep