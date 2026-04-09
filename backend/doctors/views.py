import json
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import Doctor
from .serializers import DoctorSerializer


class DoctorViewSet(viewsets.ModelViewSet):
    serializer_class   = DoctorSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = Doctor.objects.select_related("hospital").all()
        hospital_id = self.request.query_params.get("hospital")
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        return qs

    def _prepare_data(self, raw):
        """
        Normalise multipart/form-data from the React dashboard.
        Works with both QueryDict (multipart) and plain dict (JSON).
        """
        # QueryDict needs .copy(); plain dict is already mutable
        try:
            data = raw.copy()
        except AttributeError:
            data = dict(raw)

        # ── slots ──────────────────────────────────────────────
        slots_raw = data.get("slots", None)
        if slots_raw is not None:
            if isinstance(slots_raw, str):
                try:
                    decoded = json.loads(slots_raw)
                    if isinstance(decoded, list):
                        # QueryDict path
                        if hasattr(data, "setlist"):
                            data.setlist("slots", decoded)
                        else:
                            data["slots"] = decoded
                except (json.JSONDecodeError, ValueError):
                    if hasattr(data, "setlist"):
                        data.setlist("slots", [])
                    else:
                        data["slots"] = []

        # ── available (string → bool) ──────────────────────────
        avail = data.get("available", None)
        if avail is not None and isinstance(avail, str):
            data["available"] = avail.lower() not in ("false", "0", "no", "")

        # ── numeric fields ─────────────────────────────────────
        for field, default in (("experience", 0), ("max_per_slot", 10), ("fee", 0)):
            val = data.get(field, None)
            if val is not None:
                try:
                    data[field] = int(val)
                except (ValueError, TypeError):
                    data[field] = default

        return data

    def create(self, request, *args, **kwargs):
        data = self._prepare_data(request.data)

        print("=== POST /api/doctors/ ===")
        print("DATA  :", dict(data))
        print("FILES :", request.FILES)

        serializer = self.get_serializer(data=data)
        if not serializer.is_valid():
            print("ERRORS:", serializer.errors)
            return Response(
                {"message": "Validation failed", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()

        incoming = request.data

        # ── Fast-path: availability-only toggle ────────────────
        # Handles plain JSON { "available": true/false } sent by the
        # dashboard toggle button. Skips _prepare_data entirely so
        # slots are never touched.
        incoming_keys = set(incoming.keys())
        if incoming_keys == {"available"}:
            raw_val = incoming.get("available")
            if isinstance(raw_val, bool):
                new_val = raw_val
            else:
                new_val = str(raw_val).lower() not in ("false", "0", "no", "")

            instance.available = new_val
            instance.save(update_fields=["available"])

            print(f"=== TOGGLE /api/doctors/{instance.id}/ available={new_val} ===")
            return Response(DoctorSerializer(instance).data)

        # ── Full / partial form update (multipart FormData) ────
        data = self._prepare_data(incoming)

        print(f"=== PATCH /api/doctors/{instance.id}/ ===")
        print("DATA  :", dict(data))

        serializer = self.get_serializer(instance, data=data, partial=True)
        if not serializer.is_valid():
            print("ERRORS:", serializer.errors)
            return Response(
                {"message": "Validation failed", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.perform_update(serializer)
        return Response(serializer.data)