# hospitals/serializers.py
import re

from django.utils import timezone
from rest_framework import serializers
from .models import Hospital


class HospitalSerializer(serializers.ModelSerializer):
    image   = serializers.SerializerMethodField()   # banner URL
    logo    = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()
    # Whether the announcement is still worth showing a patient. Computed here
    # so the website and the app can't disagree about when a notice expires —
    # and so an old app build that ignores the flag simply behaves as before.
    announcement_active = serializers.SerializerMethodField()
    # What this provider is LIVE in, e.g. ['CONSULT', 'SCAN']. Additive: a
    # client that ignores it behaves exactly as before, which is why `kind` is
    # still sent alongside. Clients should match on this rather than on `kind`
    # — a hospital with a scanning wing is kind=HOSPITAL and belongs in the
    # Scans tab, and only `segments` can say so.
    segments = serializers.SerializerMethodField()
    # Every capability WITH its state, PENDING included. `segments` is the
    # patient-facing answer (live only); this is the provider's and the admin's,
    # so a request awaiting approval is visible instead of looking like an
    # option nobody ever ticked.
    capabilities = serializers.SerializerMethodField()

    class Meta:
        model  = Hospital
        fields = [
            'id', 'name', 'kind', 'segments', 'capabilities',
            'city', 'address', 'location',
            'latitude', 'longitude',
            'mobile', 'landline', 'status',
            'instagram', 'youtube', 'facebook', 'services',
            'description', 'announcement', 'announcement_until',
            'announcement_active', 'open_time', 'close_time',
            'image', 'logo', 'gallery',
        ]

    def get_segments(self, obj):
        return obj.active_segments

    def get_capabilities(self, obj):
        return {seg: getattr(obj, f) for seg, f in Hospital.SEGMENT_FIELD.items()}

    def get_announcement_active(self, obj):
        if not (obj.announcement or '').strip():
            return False
        if obj.announcement_until is None:
            return True
        return obj.announcement_until >= timezone.localdate()

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
