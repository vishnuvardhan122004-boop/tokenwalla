from rest_framework import serializers

from hospitals.models import Hospital

from .models import Scan


class ScanSerializer(serializers.ModelSerializer):
    center_name     = serializers.CharField(source='center.name',     read_only=True)
    center_city     = serializers.CharField(source='center.city',     read_only=True)
    center_location = serializers.CharField(source='center.location', read_only=True)
    center_address  = serializers.CharField(source='center.address',  read_only=True)

    image_url = serializers.SerializerMethodField()

    # The itemised patient bill for this scan, from the SAME code that prices
    # the order (payments/fees.py). Checkout renders this rather than
    # recomputing client-side, so the preview can never disagree with what the
    # server actually charges — including for SERVICE_ONLY scans, whose price is
    # settled at the centre and not online.
    fee_breakdown = serializers.SerializerMethodField()

    slots = serializers.ListField(child=serializers.CharField(), default=list, required=False)
    days  = serializers.ListField(child=serializers.CharField(), default=list, required=False)

    class Meta:
        model  = Scan
        fields = [
            'id', 'name', 'modality', 'keywords', 'description',
            'prep_instructions',
            'price', 'duration_minutes',
            'available', 'slots', 'days', 'max_per_slot',
            'view_count',
            'payment_collection_mode', 'fee_breakdown',
            'image', 'image_url',
            'center', 'center_name', 'center_city', 'center_location', 'center_address',
        ]
        extra_kwargs = {
            'image':             {'required': False, 'allow_null': True},
            'modality':          {'required': False, 'allow_blank': True},
            'keywords':          {'required': False, 'allow_blank': True},
            'description':       {'required': False, 'allow_blank': True},
            'prep_instructions': {'required': False, 'allow_blank': True},
            'duration_minutes':  {'required': False},
            'max_per_slot':      {'required': False},
            'available':         {'required': False},
            'price':             {'required': False},
            # Ranking signal only — a client must never be able to set it.
            'view_count':        {'read_only': True},
            # Non-sensitive: tells checkout whether the scan price is collected
            # online or at the centre. Payout details are NOT here — a centre's
            # bank/UPI lives on Hospital and is served only by the owner/admin
            # payment-details endpoint.
            'payment_collection_mode': {'required': False},
        }

    def validate_center(self, value):
        """A scan belongs to a scanning centre, not a hospital.

        Checked here rather than by a DB constraint because `kind` is mutable —
        a centre mis-registered as a hospital is fixed by flipping one column,
        and a constraint would make that flip fail against rows that already
        exist. A serializer error is also the only version of this the person
        filling in the form can actually act on.
        """
        if value.kind != Hospital.SCAN_CENTER:
            raise serializers.ValidationError(
                f'"{value.name}" is registered as a hospital, not a scanning '
                f'centre. Scans can only be added to a scanning centre.'
            )
        return value

    def validate_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Price cannot be negative.')
        return value

    def validate_name(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Scan name is required.')
        return v

    def get_image_url(self, obj):
        if obj.image:
            return obj.image.url
        return 'https://placehold.co/150x150?text=Scan'

    def get_fee_breakdown(self, obj):
        # Local import: scans must not import payments at module load time.
        from payments.fees import compute_fee_breakdown
        b = compute_fee_breakdown(obj.price or 0, obj.payment_collection_mode)
        return {k: (str(v) if not isinstance(v, str) else v) for k, v in b.items()}

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['image'] = self.get_image_url(instance)
        rep.pop('image_url', None)
        return rep
