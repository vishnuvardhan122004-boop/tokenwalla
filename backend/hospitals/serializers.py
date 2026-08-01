# hospitals/serializers.py
import re

from rest_framework import serializers
from .models import Hospital


class HospitalSerializer(serializers.ModelSerializer):
    image   = serializers.SerializerMethodField()   # banner URL
    logo    = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()

    class Meta:
        model  = Hospital
        fields = [
            'id', 'name', 'city', 'address', 'location', 'latitude', 'longitude',
            'mobile', 'status',
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


class HospitalPaymentDetailsSerializer(serializers.ModelSerializer):
    """The hospital's own payout / settlement account.

    SEPARATE from HospitalSerializer on purpose — bank/UPI details are sensitive
    and must never leak on the public hospital list/detail endpoints. Only served
    by the owner-hospital / admin `payment-details` view.

    Field names match what the hospital enters (upi_id / account_number /
    ifsc_code) and map onto the model columns.
    """
    upi_id         = serializers.CharField(source='upi_vpa',             required=False, allow_blank=True)
    account_number = serializers.CharField(source='bank_account_number', required=False, allow_blank=True)
    ifsc_code      = serializers.CharField(source='ifsc',                required=False, allow_blank=True)

    class Meta:
        model  = Hospital
        fields = [
            'id', 'name',
            'payment_method',
            'upi_id',
            'account_holder_name',
            'bank_name',
            'account_number',
            'ifsc_code',
            'payout_notes',
        ]
        read_only_fields = ['id', 'name']
        extra_kwargs = {
            'payment_method':      {'required': False, 'allow_blank': True},
            'account_holder_name': {'required': False, 'allow_blank': True},
            'bank_name':           {'required': False, 'allow_blank': True},
            'payout_notes':        {'required': False, 'allow_blank': True},
        }

    def validate_ifsc_code(self, value):
        v = (value or '').strip().upper()
        if v and not re.fullmatch(r'[A-Z]{4}0[A-Z0-9]{6}', v):
            raise serializers.ValidationError(
                'Enter a valid 11-character IFSC (e.g. HDFC0001234).'
            )
        return v

    def validate_upi_id(self, value):
        v = (value or '').strip()
        if v and not re.fullmatch(r'[\w.\-]{2,256}@[a-zA-Z]{2,64}', v):
            raise serializers.ValidationError('Enter a valid UPI ID (e.g. name@bank).')
        return v

    def validate(self, attrs):
        inst = self.instance
        def cur(field):
            return getattr(inst, field, '') if inst else ''
        method = attrs.get('payment_method',      cur('payment_method'))
        upi    = attrs.get('upi_vpa',             cur('upi_vpa'))
        acct   = attrs.get('bank_account_number', cur('bank_account_number'))
        ifsc   = attrs.get('ifsc',                cur('ifsc'))
        holder = attrs.get('account_holder_name', cur('account_holder_name'))

        if method == Hospital.UPI and not (upi or '').strip():
            raise serializers.ValidationError(
                {'upi_id': 'UPI ID is required when the payout method is UPI.'}
            )
        if method == Hospital.BANK:
            missing = {}
            if not (acct or '').strip():
                missing['account_number'] = 'Account number is required for a bank payout.'
            if not (ifsc or '').strip():
                missing['ifsc_code'] = 'IFSC is required for a bank payout.'
            if not (holder or '').strip():
                missing['account_holder_name'] = 'Account holder name is required for a bank payout.'
            if missing:
                raise serializers.ValidationError(missing)
        return attrs
