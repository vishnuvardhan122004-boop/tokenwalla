from rest_framework import serializers
from django.contrib.auth import get_user_model
import re

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    name = serializers.CharField(write_only=True)

    class Meta:
        model  = User
        fields = ["name", "mobile", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate_mobile(self, value):
        if not re.match(r"^[6-9]\d{9}$", value):
            raise serializers.ValidationError("Enter a valid Indian mobile number.")
        if User.objects.filter(mobile=value).exists():
            raise serializers.ValidationError("Mobile already registered.")
        return value

    def create(self, validated_data):
        name = validated_data.pop("name")
        user = User(
            username   = validated_data["mobile"],
            mobile     = validated_data["mobile"],
            first_name = name,
        )
        user.set_password(validated_data["password"])
        user.save()
        return user

class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ["id", "name", "mobile", "status", "role"]

    def get_name(self, obj):
        return obj.first_name or obj.username
