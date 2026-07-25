"""
backend/notifications/push.py

Expo push notifications. Fire-and-forget helpers that never raise — callers
wrap them in try/except and treat delivery as best-effort (mirrors the WhatsApp
wrapper's contract). Invalid tokens reported by Expo are pruned automatically.

Docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""
import logging

import requests
from django.contrib.auth import get_user_model

from .models import DeviceToken

logger = logging.getLogger('tokenwalla')
User = get_user_model()

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
ANDROID_CHANNEL_ID = 'appointments'  # must match the client's channel id
_CHUNK = 100


def _send(tokens, title, body, data=None):
    """POST messages to Expo in chunks; prune tokens Expo says are dead."""
    tokens = sorted({t for t in tokens if t})
    if not tokens:
        # Reaching nobody is indistinguishable from success without this —
        # e.g. the recipient never registered, or their token was reassigned
        # to another role (DeviceToken is unique on expo_token).
        logger.info('[push] no registered devices for: %s', title)
        return
    logger.info('[push] sending "%s" to %d device(s)', title, len(tokens))

    payload_data = data or {}
    for i in range(0, len(tokens), _CHUNK):
        chunk = tokens[i:i + _CHUNK]
        messages = [
            {
                'to': t,
                'title': title,
                'body': body,
                'sound': 'default',
                'channelId': ANDROID_CHANNEL_ID,
                'priority': 'high',
                'data': payload_data,
            }
            for t in chunk
        ]
        try:
            resp = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                timeout=10,
            )
            receipts = (resp.json() or {}).get('data', [])
        except Exception as exc:  # network / JSON errors — never bubble up
            logger.warning('[push] send failed for %d tokens: %s', len(chunk), exc)
            continue

        # Expo returns one receipt per message, in order.
        dead = []
        for token, receipt in zip(chunk, receipts):
            if isinstance(receipt, dict) and receipt.get('status') == 'error':
                err = (receipt.get('details') or {}).get('error')
                logger.warning('[push] token error: %s (%s)', err, receipt.get('message'))
                if err == 'DeviceNotRegistered':
                    dead.append(token)
        if dead:
            DeviceToken.objects.filter(expo_token__in=dead).delete()
            logger.info('[push] pruned %d dead tokens', len(dead))


def _hospital_user_ids(hospital_id):
    """
    Users who staff a hospital. The hospital id is stored (as a string) in
    User.last_name for role='hospital' accounts — same convention the booking
    views use via `_get_user_hospital_id`.
    """
    return list(
        User.objects
        .filter(role='hospital', last_name=str(hospital_id))
        .values_list('id', flat=True)
    )


def push_to_user(user, title, body, data=None, role='patient'):
    """Push to every device the given user has registered for `role`."""
    try:
        tokens = DeviceToken.objects.filter(user=user, role=role).values_list('expo_token', flat=True)
        _send(list(tokens), title, body, data)
    except Exception as exc:
        logger.warning('[push] push_to_user(%s) failed: %s', getattr(user, 'id', '?'), exc)


# ── Event helpers used by the views ──────────────────────────────────────────

def push_doctor_unavailable(booking):
    """Patient alert when the doctor is marked unavailable — offers a free reschedule.

    The `data.screen` deep-links to my-bookings; `reschedule: 'free'` tells the
    app to open the reschedule flow with the ₹5 fee waived.
    """
    try:
        push_to_user(
            booking.user,
            title='⚠️ Doctor unavailable',
            body=(
                f'{booking.doctor.name} is unavailable on {booking.date}. '
                f'Tap to reschedule token {booking.token} for FREE.'
            ),
            data={
                'screen': 'my-bookings',
                'type': 'doctor_unavailable',
                'reschedule': 'free',
                'bookingId': str(booking.id),
                'appId': f'unavail-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] doctor_unavailable push failed for booking %s: %s', booking.id, exc)


def push_booking_in_progress(booking):
    """Patient 'your turn' alert when a booking moves waiting → in_progress."""
    try:
        push_to_user(
            booking.user,
            title='⏰ You\'re next!',
            body=f'Token {booking.token} — please head to {booking.hospital.name} now.',
            data={
                'screen': 'my-bookings',
                'type': 'queue_advance',
                'appId': f'queue-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] in_progress push failed for booking %s: %s', booking.id, exc)


def push_new_booking_to_hospital(booking):
    """Hospital alert on a new booking, independent of the dashboard being open."""
    try:
        staff_ids = _hospital_user_ids(booking.hospital_id)
        if not staff_ids:
            return
        tokens = (
            DeviceToken.objects
            .filter(user_id__in=staff_ids, role='hospital')
            .values_list('expo_token', flat=True)
        )
        patient = booking.user.first_name or booking.user.username
        _send(
            list(tokens),
            title='🔔 New Appointment Booked',
            body=f'{patient} booked {booking.doctor.name} at {booking.slot}. Token {booking.token}.',
            data={
                'screen': 'hospital-dashboard',
                'type': 'new_booking',
                'appId': f'newbooking-{booking.token}',
                'audience': 'hospital',
                'token': booking.token,
            },
        )
    except Exception as exc:
        logger.warning('[push] new-booking push failed for booking %s: %s', booking.id, exc)
