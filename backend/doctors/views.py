import json
from datetime import datetime

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .models import Doctor
from .serializers import DoctorSerializer


class DoctorViewSet(viewsets.ModelViewSet):
    serializer_class   = DoctorSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        # Default ordering prevents UnorderedObjectListWarning with pagination
        qs = Doctor.objects.select_related("hospital").order_by("id")
        hospital_id = self.request.query_params.get("hospital")
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        return qs

    # ── Slot availability endpoint ─────────────────────────────────────────────

    @action(detail=True, methods=["get"], url_path="slot-availability")
    def slot_availability(self, request, pk=None):
        """
        GET /api/doctors/{id}/slot-availability/?date=YYYY-MM-DD

        Returns per-slot booking counts:
            { "09:00 AM": { "booked": 2, "max": 10, "full": false }, ... }

        Only counts bookings with status 'waiting' or 'in_progress' (active seats).
        """
        from bookings.models import Booking
        from django.db.models import Count

        doctor = self.get_object()
        date   = request.query_params.get("date", "").strip()

        # ── Validate date param ────────────────────────────────
        if not date:
            return Response(
                {"error": "date query param is required (YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            return Response(
                {"error": "Invalid date format. Expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Aggregate active bookings per slot ─────────────────
        counts = (
            Booking.objects
            .filter(doctor=doctor, date=date, status__in=["waiting", "in_progress"])
            .values("slot")
            .annotate(count=Count("id"))
        )
        booked_map = {row["slot"]: row["count"] for row in counts}

        result = {
            slot: {
                "booked": booked_map.get(slot, 0),
                "max":    doctor.max_per_slot,
                "full":   booked_map.get(slot, 0) >= doctor.max_per_slot,
            }
            for slot in (doctor.slots or [])
        }

        return Response(result)

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _prepare_data(self, raw):
        """
        Normalise multipart/form-data sent from the React dashboard.
        Handles both QueryDict (multipart) and plain dict (JSON body).
        """
        try:
            data = raw.copy()          # QueryDict → mutable copy
        except AttributeError:
            data = dict(raw)           # plain dict fallback

        # ── slots: JSON string → list ──────────────────────────
        slots_raw = data.get("slots")
        if slots_raw is not None and isinstance(slots_raw, str):
            try:
                decoded = json.loads(slots_raw)
                if isinstance(decoded, list):
                    if hasattr(data, "setlist"):
                        data.setlist("slots", decoded)
                    else:
                        data["slots"] = decoded
                else:
                    raise ValueError("slots JSON must be a list")
            except (json.JSONDecodeError, ValueError):
                if hasattr(data, "setlist"):
                    data.setlist("slots", [])
                else:
                    data["slots"] = []

        # ── available: string → bool ───────────────────────────
        avail = data.get("available")
        if avail is not None and isinstance(avail, str):
            data["available"] = avail.lower() not in ("false", "0", "no", "")

        # ── numeric fields ─────────────────────────────────────
        # fee uses float to support decimal values (e.g. 99.99)
        int_fields   = (("experience", 0), ("max_per_slot", 10))
        float_fields = (("fee", 0.0),)

        for field, default in int_fields:
            val = data.get(field)
            if val is not None:
                try:
                    data[field] = int(val)
                except (ValueError, TypeError):
                    data[field] = default

        for field, default in float_fields:
            val = data.get(field)
            if val is not None:
                try:
                    data[field] = float(val)
                except (ValueError, TypeError):
                    data[field] = default

        return data

    # ── ViewSet action overrides ───────────────────────────────────────────────

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
        instance    = self.get_object()
        incoming    = request.data
        incoming_keys = set(incoming.keys())

        # ── Fast-path: availability-only toggle ────────────────
        # Handles plain JSON { "available": true/false } from the
        # dashboard toggle button; skips _prepare_data so slots are
        # never accidentally overwritten.
        if incoming_keys == {"available"}:
            raw_val = incoming.get("available")
            new_val = (
                raw_val
                if isinstance(raw_val, bool)
                else str(raw_val).lower() not in ("false", "0", "no", "")
            )
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

    def destroy(self, request, *args, **kwargs):
        """
        Guard against deleting a doctor who still has active bookings.
        """
        from bookings.models import Booking

        instance = self.get_object()
        active   = Booking.objects.filter(
            doctor=instance,
            status__in=["waiting", "in_progress"],
        ).exists()

        if active:
            return Response(
                {"error": "Cannot delete a doctor with active bookings."},
                status=status.HTTP_409_CONFLICT,
            )

        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)