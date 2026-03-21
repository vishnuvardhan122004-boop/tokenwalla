import json
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import Doctor
from .serializers import DoctorSerializer


class DoctorViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for Doctor.

    GET    /api/doctors/          → list  (filter: ?hospital=<id>)
    POST   /api/doctors/          → create
    GET    /api/doctors/<id>/     → retrieve
    PUT    /api/doctors/<id>/     → full update
    PATCH  /api/doctors/<id>/     → partial update (toggle availability, edit form)
    DELETE /api/doctors/<id>/     → destroy
    """
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
        Normalise multipart/form-data coming from the React dashboard:

        1. slots      — sent as JSON string '["09:00 AM","10:00 AM"]'
                        → decoded to a Python list
        2. available  — sent as string "true"/"false"
                        → converted to bool
        3. experience / max_per_slot — coerce to int
        """
        data = raw.copy()

        # ── slots ──────────────────────────────────────────────
        slots_raw = data.get("slots", "[]")
        if isinstance(slots_raw, str):
            try:
                decoded = json.loads(slots_raw)
                if isinstance(decoded, list):
                    data.setlist("slots", decoded)
            except (json.JSONDecodeError, ValueError):
                data.setlist("slots", [])

        # ── available (string → bool) ──────────────────────────
        avail = data.get("available", "true")
        if isinstance(avail, str):
            data["available"] = avail.lower() not in ("false", "0", "no", "")

        # ── numeric fields ─────────────────────────────────────
        for field, default in (("experience", 0), ("max_per_slot", 10), ("fee", 0)):
            val = data.get(field, "")
            try:
                data[field] = int(val)
            except (ValueError, TypeError):
                data[field] = default

        return data

    def create(self, request, *args, **kwargs):
        data = self._prepare_data(request.data)

        # Debug: printed to Django console so you can see exactly what fails
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
        data     = self._prepare_data(request.data)

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