"""
backend/notifications/whatsapp.py

Thin wrapper around Meta's WhatsApp Cloud API.
Never raises - callers should treat send_template() as fire-and-forget
and check the returned dict for success/failure, logging via WhatsAppLog.
"""
import logging
import requests
from django.conf import settings

logger = logging.getLogger('tokenwalla')


def _graph_url():
    version  = getattr(settings, 'WHATSAPP_API_VERSION', 'v21.0')
    phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
    return f'https://graph.facebook.com/{version}/{phone_id}/messages'


def send_template(to_mobile: str, template_name: str, params: list) -> dict:
    """
    Sends an approved WhatsApp template message.

    to_mobile:     10-digit Indian mobile (no country code) - we prefix 91.
    template_name: exact approved template name in Meta Business Manager.
    params:        ordered list of strings filling {{1}}, {{2}}, ... in the template body.

    Returns: {'success': bool, 'message_id': str|None, 'error': str|None}
    """
    token = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
    if not token:
        logger.warning('[notifications] WHATSAPP_ACCESS_TOKEN not set - skipping send (dev mode).')
        return {'success': False, 'message_id': None, 'error': 'WhatsApp not configured (dev mode).'}

    to = to_mobile.strip()
    if not to.startswith('91'):
        to = f'91{to}'

    lang = getattr(settings, 'WHATSAPP_TEMPLATE_LANG', 'en')

    payload = {
        'messaging_product': 'whatsapp',
        'to': to,
        'type': 'template',
        'template': {
            'name': template_name,
            'language': {'code': lang},
            'components': [
                {
                    'type': 'body',
                    'parameters': [{'type': 'text', 'text': str(p)} for p in params],
                }
            ],
        },
    }

    try:
        resp = requests.post(
            _graph_url(),
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
            },
            json=payload,
            timeout=10,
        )
        data = resp.json()

        if resp.status_code == 200 and data.get('messages'):
            msg_id = data['messages'][0].get('id', '')
            logger.info('[notifications] WhatsApp sent to ...%s via %s (id=%s)', to[-4:], template_name, msg_id)
            return {'success': True, 'message_id': msg_id, 'error': None}

        error_msg = data.get('error', {}).get('message', f'HTTP {resp.status_code}')
        logger.warning('[notifications] WhatsApp send failed to ...%s: %s', to[-4:], error_msg)
        return {'success': False, 'message_id': None, 'error': error_msg}

    except Exception as exc:
        logger.exception('[notifications] WhatsApp send exception: %s', exc)
        return {'success': False, 'message_id': None, 'error': str(exc)}


def send_booking_confirmation(booking):
    """booking: Booking instance with related doctor, hospital, user accessible."""
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    patient_name = user.first_name or user.username
    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_BOOKING_CONFIRM,
        params=[
            patient_name,
            booking.doctor.name,
            booking.hospital.name,
            str(booking.date),
            booking.slot,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='booking_confirmation',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_doctor_unavailable(booking):
    """Tell the patient their doctor is unavailable and they can reschedule free.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} patient name  {{2}} doctor  {{3}} hospital
      {{4}} date          {{5}} slot    {{6}} token
    """
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    patient_name = user.first_name or user.username
    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_DOCTOR_UNAVAILABLE,
        params=[
            patient_name,
            booking.doctor.name,
            booking.hospital.name,
            str(booking.date),
            booking.slot,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='doctor_unavailable',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_hospital_new_booking(booking):
    """Alert the hospital team on WhatsApp that a new appointment was booked.

    Goes to the hospital's own number (booking.hospital.mobile), NOT the patient,
    so it is never gated on the patient's whatsapp_opt_in. This complements the
    Expo push the hospital app already receives — WhatsApp lands even when the
    hospital app is closed or the push token is stale.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} hospital name  {{2}} patient name  {{3}} doctor
      {{4}} date           {{5}} slot          {{6}} token
    """
    from .models import WhatsAppLog

    hospital = booking.hospital
    if not hospital.mobile:
        return

    patient_name = booking.user.first_name or booking.user.username
    result = send_template(
        to_mobile=hospital.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_HOSPITAL_NEW_BOOKING,
        params=[
            hospital.name,
            patient_name,
            booking.doctor.name,
            str(booking.date),
            booking.slot,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='hospital_new_booking',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_appointment_reminder(booking):
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    patient_name = user.first_name or user.username
    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_REMINDER,
        params=[
            patient_name,
            booking.doctor.name,
            booking.hospital.name,
            str(booking.date),
            booking.slot,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='appointment_reminder',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )
    if result['success']:
        booking.reminder_sent = True
        booking.save(update_fields=['reminder_sent'])
