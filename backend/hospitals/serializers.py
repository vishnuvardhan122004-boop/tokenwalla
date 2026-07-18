# hospitals/serializers.py
from rest_framework import serializers
from .models import Hospital  # ✅ only this


class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Hospital
        fields = [
            'id', 'name', 'city', 'address', 'location', 'mobile', 'status',
            'instagram', 'youtube', 'facebook', 'services',
            'announcement', 'open_time', 'close_time',
        ]