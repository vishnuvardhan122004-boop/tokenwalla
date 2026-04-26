# ── Add this to backend/bookings/views.py ────────────────────────────────────
# Replace the existing ScanQRView class with this fixed version.
#
# Fixes:
#   1. _get_user_hospital_id: removed broken `user.hospital.id` attempt
#      (Hospital has no direct OneToOne to User). Uses user.last_name only.
#   2. GET returns 200 with booking info (or 404/403).
#   3. POST marks booking in_progress and returns updated info (or 409/400/403/404).
#   4. Consistent response shape that matches QRScanner.js expectations.

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Booking
from tokenwalla.permissions import IsHospitalStaff

logger = logging.getLogger('tokenwalla')


class ScanQRView(APIView):
    """
    Hospital staff scans a patient QR code.

    GET  /api/bookings/scan/<token>/
         Returns booking details. No status change.
         Response: { valid, already_done, booking: {...} }

    POST /api/bookings/scan/<token>/
         Marks booking as in_progress.
         Returns: { success, message, booking: {...} }
         409 if already in_progress / completed.
    """
    permission_classes = [IsAuthenticated, IsHospitalStaff]

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _hospital_id(user):
        """
        Resolve the hospital ID for the requesting user.

        Hospital users have their hospital.id stored as a string in
        user.last_name (set by HospitalRegisterView and HospitalLoginView).
        Admin users (role='admin') pass hospital checks via the role guard.
        """
        try:
            return int(user.last_name)
        except (ValueError, TypeError, AttributeError):
            return None

    @staticmethod
    def _booking_payload(booking):
        """Return a consistent dict for both GET and POST responses."""
        return {
            'id':               booking.id,
            'token':            booking.token,
            'status':           booking.status,
            'patient_name':     booking.user.first_name or booking.user.username,
            'patient_mobile':   booking.user.mobile,
            'doctor_name':      booking.doctor.name,
            'specialization':   booking.doctor.specialization,
            'hospital_name':    booking.hospital.name,
            'date':             str(booking.date),
            'slot':             booking.slot,
            'amount':           booking.amount,
            'queue_access':     booking.queue_access,
            'created':          booking.created.strftime('%d %b %Y, %I:%M %p'),
        }

    def _check_hospital_access(self, request, booking):
        """Return None if access is allowed, else a Response(403)."""
        hospital_id = self._hospital_id(request.user)
        if request.user.role == 'admin':
            return None  # Admins can scan any hospital
        if hospital_id != booking.hospital_id:
            return Response(
                {'valid': False, 'message': 'This token belongs to a different hospital.'},
                status=403,
            )
        return None

    # ── GET — lookup only ─────────────────────────────────────────────────────

    def get(self, request, token):
        try:
            booking = (
                Booking.objects
                .select_related('user', 'doctor', 'hospital')
                .get(token=token)
            )
        except Booking.DoesNotExist:
            return Response(
                {'valid': False, 'message': f'No booking found for token "{token}".'},
                status=404,
            )

        denied = self._check_hospital_access(request, booking)
        if denied:
            return denied

        return Response({
            'valid':        True,
            'already_done': booking.status in ('in_progress', 'completed', 'cancelled'),
            'booking':      self._booking_payload(booking),
        })

    # ── POST — mark attended ──────────────────────────────────────────────────

    def post(self, request, token):
        try:
            booking = (
                Booking.objects
                .select_related('user', 'doctor', 'hospital')
                .get(token=token)
            )
        except Booking.DoesNotExist:
            return Response(
                {'success': False, 'message': f'No booking found for token "{token}".'},
                status=404,
            )

        denied = self._check_hospital_access(request, booking)
        if denied:
            return denied

        if booking.status == 'cancelled':
            return Response(
                {'success': False, 'message': 'This booking was cancelled and cannot be attended.'},
                status=400,
            )

        if booking.status in ('in_progress', 'completed'):
            return Response(
                {
                    'success':      False,
                    'already_done': True,
                    'message': (
                        'Patient is already marked as In Consultation.'
                        if booking.status == 'in_progress'
                        else 'This patient has already completed their visit.'
                    ),
                    'booking': self._booking_payload(booking),
                },
                status=409,
            )

        # All good — mark as in_progress
        booking.status = 'in_progress'
        booking.save(update_fields=['status'])

        logger.info(
            'QR scan: booking %s → in_progress (hospital %s)',
            booking.id, self._hospital_id(request.user),
        )

        patient_name = booking.user.first_name or booking.user.username
        return Response({
            'success': True,
            'message': f'✅ {patient_name} marked as In Consultation.',
            'booking': self._booking_payload(booking),
        })