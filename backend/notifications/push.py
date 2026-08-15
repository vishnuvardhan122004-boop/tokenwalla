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


def push_to_hospital(hospital_id, title, body, data=None):
    """Push to every device registered by any staff account of one hospital."""
    try:
        staff_ids = _hospital_user_ids(hospital_id)
        if not staff_ids:
            logger.info('[push] hospital %s has no staff accounts — skipping', hospital_id)
            return
        tokens = (
            DeviceToken.objects
            .filter(user_id__in=staff_ids, role='hospital')
            .values_list('expo_token', flat=True)
        )
        _send(list(tokens), title, body, data)
    except Exception as exc:
        logger.warning('[push] push_to_hospital(%s) failed: %s', hospital_id, exc)


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


def push_booking_confirmed(booking):
    """Patient alert the moment payment is verified and the token is issued.

    The patient already gets `send_booking_confirmation` on WhatsApp; this is the
    in-app half of the same event, so a patient who has the app and has opted out
    of WhatsApp (or simply reads notifications first) still gets the token.
    Paired deliberately — the confirmation is the one message that must land.
    """
    try:
        push_to_user(
            booking.user,
            title='✅ Booking confirmed',
            body=(
                f'Token {booking.token} with {booking.doctor.name} at '
                f'{booking.hospital.name} on {booking.date}, {booking.slot}.'
            ),
            data={
                'screen': 'my-bookings',
                'type': 'booking_confirmed',
                'appId': f'confirm-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] confirmed push failed for booking %s: %s', booking.id, exc)


def push_appointment_reminder(booking):
    """Patient reminder before the slot — the in-app half of the WhatsApp one.

    Fired from the `send_appointment_reminders` cron beside
    `send_appointment_reminder`, so both channels are driven by the same
    `reminder_sent` flag and a patient cannot be reminded twice on one channel
    and never on the other.
    """
    try:
        push_to_user(
            booking.user,
            title='⏰ Appointment reminder',
            body=(
                f'Token {booking.token} with {booking.doctor.name} at '
                f'{booking.hospital.name} — {booking.slot} today.'
            ),
            data={
                'screen': 'my-bookings',
                'type': 'appointment_reminder',
                'appId': f'remind-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] reminder push failed for booking %s: %s', booking.id, exc)


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
        patient = booking.user.first_name or booking.user.username
        push_to_hospital(
            booking.hospital_id,
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


def push_booking_cancelled(booking, refund_info=None):
    """Patient alert after they cancel — names the refund so the tiered
    percentage isn't a surprise they only discover on their bank statement.

    refund_info is the dict from payments.refunds.process_cancellation_refund:
    {'refunded': bool, 'percentage': str, 'amount': str}.
    """
    try:
        info = refund_info or {}
        if info.get('refunded'):
            money = f'A refund of ₹{info.get("amount", "0")} is on its way — allow 5-7 working days.'
        else:
            # No pool to refund (e.g. service-only booking, or cancelled too late
            # for the tier to pay out). Say so rather than implying money is coming.
            money = 'No refund was due on this booking.'
        push_to_user(
            booking.user,
            title='Booking cancelled',
            body=f'Token {booking.token} with {booking.doctor.name} is cancelled. {money}',
            data={
                'screen': 'my-bookings',
                'type': 'booking_cancelled',
                'appId': f'cancel-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] cancelled push failed for booking %s: %s', booking.id, exc)


def push_booking_on_hold(booking):
    """Patient alert when staff skip them (CONFIRMED → ON_HOLD).

    Without this the queue visibly moves past the patient with no explanation —
    the most common reason someone walks out thinking they were forgotten.
    """
    try:
        push_to_user(
            booking.user,
            title='Your turn is on hold',
            body=(
                f'{booking.hospital.name} has paused token {booking.token} for now. '
                f'You have not lost your place — please stay nearby.'
            ),
            data={
                'screen': 'my-bookings',
                'type': 'booking_on_hold',
                'appId': f'hold-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] on-hold push failed for booking %s: %s', booking.id, exc)


def push_booking_no_show(booking):
    """Patient alert when the hospital marks them a no-show — terminal and
    non-refundable, so they should hear it from us rather than find out later.
    """
    try:
        push_to_user(
            booking.user,
            title='Marked as no-show',
            body=(
                f'Token {booking.token} at {booking.hospital.name} was marked as a no-show. '
                f'No refund applies. Book again any time.'
            ),
            data={
                'screen': 'my-bookings',
                'type': 'booking_no_show',
                'appId': f'noshow-{booking.id}',
                'audience': 'patient',
                'token': booking.token,
            },
            role='patient',
        )
    except Exception as exc:
        logger.warning('[push] no-show push failed for booking %s: %s', booking.id, exc)


def push_cancellation_to_hospital(booking):
    """Tell the hospital a patient cancelled, so the slot can be refilled."""
    try:
        patient = booking.user.first_name or booking.user.username
        push_to_hospital(
            booking.hospital_id,
            title='Booking cancelled',
            body=(
                f'{patient} cancelled token {booking.token} with {booking.doctor.name} '
                f'at {booking.slot}. The slot is free again.'
            ),
            data={
                'screen': 'hospital-dashboard',
                'type': 'booking_cancelled',
                'appId': f'hcancel-{booking.id}',
                'audience': 'hospital',
                'token': booking.token,
            },
        )
    except Exception as exc:
        logger.warning('[push] hospital cancellation push failed for booking %s: %s', booking.id, exc)


def push_app_update(version, message='', role=None):
    """Broadcast "update the app" to every registered device.

    This is the NUDGE. The FORCE is `APP_MIN_VERSION` on the backend, which the
    app re-reads on every launch (`services/appUpdate.ts`) and which shows a
    non-dismissible "Update Required" alert. The two are deliberately separate:
    the gate still stops an unsupported build for a patient who never taps a
    notification, and a patient who taps this one lands on a cold launch, where
    the gate runs and blocks. Sending this without raising APP_MIN_VERSION is a
    plain "please update"; raising it is what makes updating mandatory.

    `data` carries NO `screen` key on purpose. Installed builds route a tap on
    `data.screen` alone, and their handler is fixed — an unknown value would
    have to be shipped to them first, which is exactly what an old build can't
    do. With the key absent, both branches fall through and the tap just opens
    the app, which is all this needs: the launch gate does the rest.

    `version` is the build being pushed out; it only keys the notification
    centre's dedup (`appId`), so re-running the command doesn't stack duplicates
    in the panel.
    """
    try:
        body = message or (
            'A new version of TokenWalla is available. '
            'Please update to keep booking appointments.'
        )
        # Sent one role at a time so `audience` matches the recipient: the app's
        # notification centre files an entry by that key, and a hospital staffer
        # would otherwise find the notice in their patient tab.
        for target in ([role] if role else ['patient', 'hospital']):
            tokens = (
                DeviceToken.objects
                .filter(role=target)
                .values_list('expo_token', flat=True)
            )
            _send(
                list(tokens),
                title='Update TokenWalla',
                body=body,
                data={
                    'type': 'app_update',
                    'appId': f'appupdate-{version}',
                    'audience': target,
                },
            )
    except Exception as exc:
        logger.warning('[push] app-update broadcast failed: %s', exc)


def push_payout_to_hospital(batch):
    """Tell the hospital a payout batch was settled.

    Salaried doctors settle to the hospital's own payout account, so the hospital
    — not the doctor — is the party that needs to reconcile this one.
    """
    try:
        doctor = batch.doctor
        ref = (batch.razorpay_payout_id or '').strip()
        push_to_hospital(
            doctor.hospital_id,
            title='Payout sent',
            body=(
                f'₹{batch.total_amount} for {doctor.name} has been transferred'
                f'{f" (ref {ref})" if ref else ""}.'
            ),
            data={
                'screen': 'hospital-dashboard',
                'type': 'payout_paid',
                'appId': f'payout-{batch.id}',
                'audience': 'hospital',
            },
        )
    except Exception as exc:
        logger.warning('[push] hospital payout push failed for batch %s: %s', batch.id, exc)
