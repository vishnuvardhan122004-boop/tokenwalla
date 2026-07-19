# hospitals/serializers.py
from rest_framework import serializers
from .models import Hospital


class HospitalSerializer(serializers.ModelSerializer):
    image   = serializers.SerializerMethodField()   # banner URL
    logo    = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()

    class Meta:
        model  = Hospital
        fields = [
            'id', 'name', 'city', 'address', 'location', 'mobile', 'status',
            'instagram', 'youtube', 'facebook', 'services',
            'description', 'announcement', 'open_time', 'close_time',
            'image', 'logo', 'gallery',
        ]

    def _url(self, f):
        try:
            return f.url if f else ''
        except Exception:
            return ''

    def get_image(self, obj):
        return self._url(obj.image)

    def get_logo(self, obj):
        return self._url(obj.logo)

    def get_gallery(self, obj):
        return [
            {'id': p.id, 'url': self._url(p.image)}
            for p in obj.photos.all()
            if self._url(p.image)
        ]
