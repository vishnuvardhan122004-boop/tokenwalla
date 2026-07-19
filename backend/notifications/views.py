"""
backend/notifications/views.py

Device-token registration for Expo push notifications.
"""
import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeviceToken

logger = logging.getLogger('tokenwalla')

_VALID_ROLES = {'patient', 'hospital'}


class RegisterDeviceView(APIView):
    """
    POST /api/notifications/register-device/
      body: { "token": "ExponentPushToken[...]", "role": "patient" | "hospital" }

    Idempotent: keyed on the Expo token, so re-registering (every app launch)
    just refreshes the owning user + role. The app calls this after login.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = (request.data.get('token') or '').strip()
        role = (request.data.get('role') or 'patient').strip()

        if not token:
            return Response({'message': 'token is required.'}, status=400)
        if role not in _VALID_ROLES:
            role = 'patient'

        DeviceToken.objects.update_or_create(
            expo_token=token,
            defaults={'user': request.user, 'role': role},
        )
        logger.info('[push] device registered for user %s (role %s)', request.user.id, role)
        return Response({'success': True})

    def delete(self, request):
        """Unregister a token (e.g. on logout). Best-effort."""
        token = (request.data.get('token') or '').strip()
        if token:
            DeviceToken.objects.filter(expo_token=token, user=request.user).delete()
        return Response({'success': True})
