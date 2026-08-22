from rest_framework import serializers
from django.contrib.auth import get_user_model
import re

from tokenwalla.utils import check_password_strength

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    name = serializers.CharField(write_only=True)

    class Meta:
        model  = User
        fields = ['name', 'mobile', 'password']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_mobile(self, value):
        if not re.match(r'^[6-9]\d{9}$', value):
            raise serializers.ValidationError('Enter a valid Indian mobile number.')
        if User.objects.filter(mobile=value).exists():
            raise serializers.ValidationError('Mobile already registered.')
        return value

    def validate(self, attrs):
        # Checked here, not in validate_password(), because the similarity rule
        # needs the mobile and name alongside the password — and the mobile IS
        # the username, so without this a patient's own phone number passes.
        complaint = check_password_strength(
            attrs.get('password', ''),
            user=User(
                username   = attrs.get('mobile', ''),
                mobile     = attrs.get('mobile', ''),
                first_name = attrs.get('name', ''),
            ),
        )
        if complaint:
            raise serializers.ValidationError({'password': complaint})
        return attrs

    def create(self, validated_data):
        name = validated_data.pop('name')
        user = User(
            username   = validated_data['mobile'],
            mobile     = validated_data['mobile'],
            first_name = name,          # real name stored in first_name
        )
        user.set_password(validated_data['password'])
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    # 'name' is a virtual field → returns first_name or username as fallback
    name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ['id', 'name', 'mobile', 'status', 'role', 'whatsapp_opt_in']

    def get_name(self, obj):
        return obj.first_name or obj.username