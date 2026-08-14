import re

from rest_framework import serializers

from tokenwalla.utils import is_valid_landline, is_valid_mobile

from .models import Doctor


class DoctorSerializer(serializers.ModelSerializer):
    hospital_name     = serializers.CharField(source="hospital.name",     read_only=True)
    hospital_location = serializers.CharField(source="hospital.location", read_only=True)
    hospital_address  = serializers.CharField(source="hospital.address",  read_only=True)

    # Read-only fields for returning full Cloudinary URLs
    image_url          = serializers.SerializerMethodField()
    hospital_image_url = serializers.SerializerMethodField()

    # The itemised patient bill for this doctor, computed by the SAME code that
    # prices the order (payments/fees.py). Checkout renders this rather than
    # recomputing client-side, so the preview can never disagree with what the
    # server actually charges — including for SERVICE_ONLY doctors, whose
    # consultation fee is collected at the clinic and not online.
    fee_breakdown = serializers.SerializerMethodField()

    slots = serializers.ListField(
        child=serializers.CharField(),
        default=list,
        required=False,
    )

    days = serializers.ListField(
        child=serializers.CharField(),
        default=list,
        required=False,
    )

    class Meta:
        model  = Doctor
        fields = [
            "id", "name", "specialization", "keywords", "experience",
            "mobile", "landline", "available", "fee", "slots", "days", "max_per_slot",
            "view_count",
            "payment_collection_mode", "fee_breakdown",
            "image", "hospital_image",
            "image_url", "hospital_image_url",
            "hospital", "hospital_name", "hospital_location", "hospital_address", "city",
        ]
        extra_kwargs = {
            "image":          {"required": False, "allow_null": True, "write_only": False},
            "hospital_image": {"required": False, "allow_null": True, "write_only": False},
            "keywords":       {"required": False, "allow_blank": True},
            "city":           {"required": False, "allow_blank": True},
            # One of mobile / landline is required — see validate() below.
            "mobile":         {"required": False, "allow_blank": True},
            "landline":       {"required": False, "allow_blank": True},
            "experience":     {"required": False},
            "max_per_slot":   {"required": False},
            # Ranking signal only — a client must never be able to set it.
            "view_count":     {"read_only": True},
            "available":      {"required": False},
            "fee":            {"required": False},
            # Non-sensitive: tells patients/checkout whether the consultation fee
            # is paid online or at the clinic. Bank/UPI details are NOT here —
            # they live in DoctorPaymentDetailsSerializer (owner/admin only).
            "payment_collection_mode": {"required": False},
        }

    def validate(self, attrs):
        # Merge over the instance so a PATCH that touches neither number still
        # validates against the resulting state, not just what was sent.
        inst   = self.instance
        mobile   = (attrs.get("mobile",   getattr(inst, "mobile", "")   if inst else "") or "").strip()
        landline = (attrs.get("landline", getattr(inst, "landline", "") if inst else "") or "").strip()

        errors = {}
        if mobile and not is_valid_mobile(mobile):
            errors["mobile"] = "Enter a valid 10-digit Indian mobile number."
        if landline and not is_valid_landline(landline):
            errors["landline"] = "Enter a valid landline with the STD code, e.g. 08812-234567."
        # A doctor patients cannot reach at all is not worth listing — but which
        # kind of number it is, is the clinic's business.
        if not mobile and not landline:
            errors["mobile"] = "Enter a mobile number or a landline."
        if errors:
            raise serializers.ValidationError(errors)

        if "mobile" in attrs:
            attrs["mobile"] = mobile
        if "landline" in attrs:
            attrs["landline"] = landline
        return attrs

    def get_image_url(self, obj):
        if obj.image:
            return obj.image.url
        return 'https://placehold.co/150x150?text=Doctor'

    def get_hospital_image_url(self, obj):
        if obj.hospital_image:
            return obj.hospital_image.url
        return 'https://placehold.co/1200x350?text=Hospital'

    def get_fee_breakdown(self, obj):
        # Local import: doctors must not import payments at module load time.
        from payments.fees import compute_fee_breakdown
        b = compute_fee_breakdown(obj.fee or 0, obj.payment_collection_mode)
        return {k: (str(v) if not isinstance(v, str) else v) for k, v in b.items()}

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Replace image fields with full Cloudinary URLs in response
        rep['image']          = self.get_image_url(instance)
        rep['hospital_image'] = self.get_hospital_image_url(instance)
        # Remove the extra url fields
        rep.pop('image_url', None)
        rep.pop('hospital_image_url', None)
        return rep


class DoctorPaymentDetailsSerializer(serializers.ModelSerializer):
    """Payout / KYC details a hospital manages for one of its doctors.

    SEPARATE from DoctorSerializer on purpose: bank/UPI details are sensitive and
    must never leak on the public doctor list/detail endpoints. Only served by
    the owner-hospital / admin `payment-details` action.

    The spec's field names (upi_id / account_number / ifsc_code) map onto the
    existing model columns the payout utils already read (upi_vpa /
    bank_account_number / ifsc) so payouts keep working with no data migration.
    """
    upi_id         = serializers.CharField(source="upi_vpa",             required=False, allow_blank=True)
    account_number = serializers.CharField(source="bank_account_number", required=False, allow_blank=True)
    ifsc_code      = serializers.CharField(source="ifsc",                required=False, allow_blank=True)

    class Meta:
        model  = Doctor
        fields = [
            "id", "name", "fee",
            "payment_collection_mode",
            "payment_method",
            "payout_to_hospital",
            "upi_id",
            "account_holder_name",
            "bank_name",
            "account_number",
            "ifsc_code",
            "payout_notes",
        ]
        read_only_fields = ["id", "name", "fee"]
        extra_kwargs = {
            "payment_collection_mode": {"required": False},
            "payment_method":          {"required": False, "allow_blank": True},
            "payout_to_hospital":      {"required": False},
            "account_holder_name":     {"required": False, "allow_blank": True},
            "bank_name":               {"required": False, "allow_blank": True},
            "payout_notes":            {"required": False, "allow_blank": True},
        }

    def validate_ifsc_code(self, value):
        v = (value or "").strip().upper()
        if v and not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", v):
            raise serializers.ValidationError(
                "Enter a valid 11-character IFSC (e.g. HDFC0001234)."
            )
        return v

    def validate_upi_id(self, value):
        v = (value or "").strip()
        if v and not re.fullmatch(r"[\w.\-]{2,256}@[a-zA-Z]{2,64}", v):
            raise serializers.ValidationError("Enter a valid UPI ID (e.g. name@bank).")
        return v

    def validate(self, attrs):
        # Merge incoming values over the instance so partial updates validate
        # against the resulting state, not just the fields present in the request.
        inst = self.instance
        method = attrs.get("payment_method", getattr(inst, "payment_method", "") if inst else "")
        upi    = attrs.get("upi_vpa",             getattr(inst, "upi_vpa", "") if inst else "")
        acct   = attrs.get("bank_account_number", getattr(inst, "bank_account_number", "") if inst else "")
        ifsc   = attrs.get("ifsc",                getattr(inst, "ifsc", "") if inst else "")
        holder = attrs.get("account_holder_name", getattr(inst, "account_holder_name", "") if inst else "")
        to_hospital = attrs.get(
            "payout_to_hospital",
            getattr(inst, "payout_to_hospital", False) if inst else False)

        # Salaried doctor: paid into the HOSPITAL's account, so this doctor's own
        # instrument is never read. Demanding it would block the save on a field
        # the UI has (correctly) hidden — and a stale payment_method left over
        # from before the switch is exactly how that happens.
        if to_hospital:
            return attrs

        if method == Doctor.UPI and not (upi or "").strip():
            raise serializers.ValidationError(
                {"upi_id": "UPI ID is required when the payout method is UPI."}
            )
        if method == Doctor.BANK:
            missing = {}
            if not (acct or "").strip():
                missing["account_number"] = "Account number is required for a bank payout."
            if not (ifsc or "").strip():
                missing["ifsc_code"] = "IFSC is required for a bank payout."
            if not (holder or "").strip():
                missing["account_holder_name"] = "Account holder name is required for a bank payout."
            if missing:
                raise serializers.ValidationError(missing)
        return attrs