import re

from rest_framework import serializers
from .models import Doctor


class DoctorSerializer(serializers.ModelSerializer):
    hospital_name     = serializers.CharField(source="hospital.name",     read_only=True)
    hospital_location = serializers.CharField(source="hospital.location", read_only=True)
    hospital_address  = serializers.CharField(source="hospital.address",  read_only=True)

    # Read-only fields for returning full Cloudinary URLs
    image_url          = serializers.SerializerMethodField()
    hospital_image_url = serializers.SerializerMethodField()

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
            "mobile", "available", "fee", "slots", "days", "max_per_slot",
            "payment_collection_mode",
            "image", "hospital_image",
            "image_url", "hospital_image_url",
            "hospital", "hospital_name", "hospital_location", "hospital_address", "city",
        ]
        extra_kwargs = {
            "image":          {"required": False, "allow_null": True, "write_only": False},
            "hospital_image": {"required": False, "allow_null": True, "write_only": False},
            "keywords":       {"required": False, "allow_blank": True},
            "city":           {"required": False, "allow_blank": True},
            "experience":     {"required": False},
            "max_per_slot":   {"required": False},
            "available":      {"required": False},
            "fee":            {"required": False},
            # Non-sensitive: tells patients/checkout whether the consultation fee
            # is paid online or at the clinic. Bank/UPI details are NOT here —
            # they live in DoctorPaymentDetailsSerializer (owner/admin only).
            "payment_collection_mode": {"required": False},
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


class DoctorPaymentDetailsSerializer(serializers.ModelSerializer):
    """Payout / KYC details a hospital manages for one of its doctors.

    SEPARATE from DoctorSerializer on purpose: bank/UPI details are sensitive and
    must never leak on the public doctor list/detail endpoints. Only served by
    the owner-hospital / admin `payment-details` action.

    The spec's field names (upi_id / account_number / ifsc_code) map onto the
    existing model columns the Cashfree payout utils already read (upi_vpa /
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