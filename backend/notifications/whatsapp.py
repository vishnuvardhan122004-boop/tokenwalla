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


def one_line(text: str, limit: int = 220) -> str:
    """Squeeze free text into something Meta will accept as a template param.

    Meta rejects a body parameter containing a newline, a tab or four
    consecutive spaces, so any operator-typed field has to be flattened before
    it can be sent. `Scan.prep_instructions` is a TextField a centre fills in
    by hand — multi-line is the normal case there, not the edge case.

    Also ends the text with a sentence stop, because it sits mid-body in
    §14 and runs straight into the next sentence otherwise.
    """
    flat = ' '.join(str(text).split())
    if len(flat) > limit:
        flat = flat[:limit - 1].rstrip() + '…'
    if flat and flat[-1] not in '.!?…':
        flat += '.'
    return flat


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
            booking.provider_name,
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
            booking.provider_name,
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
      {{1}} hospital name  {{2}} patient name   {{3}} patient mobile
      {{4}} doctor         {{5}} date           {{6}} slot          {{7}} token
    """
    from .models import WhatsAppLog

    hospital = booking.hospital
    if not hospital.mobile:
        return

    # Show the hospital who the appointment is *for* (the beneficiary when the
    # booking was made for someone else), and the best contact number for them.
    patient_name = booking.patient_display_name
    # Same seven params either way; only the sentence around them differs.
    # Branch on the BOOKING, not on hospital.kind — a hospital with an in-house
    # scanning wing (kind=HOSPITAL, svc_scans=True) takes scan bookings too, and
    # it is the booking that decides whether {{4}} is a doctor or a test.
    template = (settings.WHATSAPP_TEMPLATE_CENTRE_NEW_BOOKING if booking.is_scan
                else settings.WHATSAPP_TEMPLATE_HOSPITAL_NEW_BOOKING)
    result = send_template(
        to_mobile=hospital.mobile,
        template_name=template,
        params=[
            hospital.name,
            patient_name,
            booking.patient_display_mobile,
            booking.provider_name,
            str(booking.date),
            booking.slot,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='centre_new_booking' if booking.is_scan else 'hospital_new_booking',
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
            booking.provider_name,
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


def send_booking_cancelled(booking, refund_info=None, pass_result=None):
    """Confirm a cancellation to the patient, in writing, with the refund amount.

    Money moved on this one and the tiered percentage is rarely 100%, so the
    patient needs a durable record — a push can be missed or cleared, and this is
    the notification most likely to turn into a support conversation.

    The refund line is a SINGLE template param ({{6}}): Meta templates are fixed
    text, so a conditional sentence has to be pre-rendered here rather than
    branched inside the template.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} patient name  {{2}} doctor  {{3}} hospital  {{4}} date
      {{5}} token         {{6}} refund line
    """
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    # {{6}} is pre-rendered free text, so the pass sentence rides along without
    # needing a second Meta template — see payments.pass_utils.cancellation_line.
    from payments.pass_utils import cancellation_line

    info = refund_info or {}
    pass_line = cancellation_line(pass_result).rstrip('.')
    if info.get('refunded'):
        refund_line = f'A refund of ₹{info.get("amount", "0")} will reach you in 5-7 working days'
        if pass_line:
            refund_line += f'. {pass_line}'
    elif pass_line:
        # A pass visit costs ₹0 — "no refund was due" would be the only thing
        # this message said, and the patient would think the visit was lost.
        refund_line = pass_line
    else:
        refund_line = 'No refund was due on this booking'

    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_BOOKING_CANCELLED,
        params=[
            user.first_name or user.username,
            booking.provider_name,
            booking.hospital.name,
            str(booking.date),
            booking.token,
            refund_line,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='booking_cancelled',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_booking_no_show(booking):
    """Tell the patient their booking was marked a no-show.

    Terminal and non-refundable, and the patient was by definition not present to
    be told in person — so this is the state most often disputed later. WhatsApp
    leaves the timestamped record that settles it.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} patient name  {{2}} doctor  {{3}} hospital  {{4}} date  {{5}} token
    """
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_NO_SHOW,
        params=[
            user.first_name or user.username,
            booking.provider_name,
            booking.hospital.name,
            str(booking.date),
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='booking_no_show',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_doctor_payout_paid(batch):
    """Tell the doctor on WhatsApp that their pending balance has been paid out.

    batch: a PayoutBatch that has just been marked PROCESSED by
    payments.views.MarkPayoutPaidView. Doctors have no TokenWalla login (the
    Doctor model carries a `mobile`, not a User), so WhatsApp is the ONLY channel
    that reaches them — there is no push token to send to.

    Goes to doctor.mobile, so no patient `whatsapp_opt_in` gate applies.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} doctor name  {{2}} amount  {{3}} hospital name  {{4}} reference
    """
    from .models import WhatsAppLog

    doctor = batch.doctor
    if doctor is None:
        # A scan-centre payout. The centre is told by push instead: this
        # template's params are doctor-shaped ({{3}} is the hospital name) and
        # Meta approves templates by exact body, so reusing it here would send
        # an approved template with meaningless params.
        logger.info('[notifications] batch %s is a centre payout — no doctor WhatsApp', batch.id)
        return
    if not doctor.mobile:
        logger.info('[notifications] doctor %s has no mobile — skipping payout WhatsApp', doctor.id)
        return

    # Meta rejects blank template params, so an absent UTR needs a placeholder.
    reference = (batch.razorpay_payout_id or '').strip() or 'NA'

    result = send_template(
        to_mobile=doctor.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_DOCTOR_PAYOUT,
        params=[
            doctor.name,
            f'{batch.total_amount:.2f}',
            doctor.hospital.name,
            reference,
        ],
    )
    WhatsAppLog.objects.create(
        booking=None,
        event_type='doctor_payout',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_centre_payout_paid(batch):
    """Tell a scanning or blood centre on WhatsApp that its balance was paid.

    batch: a PayoutBatch with `center` set, just marked PROCESSED by
    payments.views.MarkPayoutPaidView. Until this template existed the centre
    half of that view was push-only — `send_doctor_payout_paid` bails out on a
    centre batch because its body names a doctor AND their hospital, and Meta
    approves a template by its exact wording, so reusing it would have sent an
    approved template with meaningless params.

    A centre is its own business, so there is no third party to name: three
    params against the doctor template's four.

    Goes to the centre's own number, so no patient opt-in gate applies.

    Template body (see notifications/WHATSAPP_TEMPLATES.md §12) params:
      {{1}} centre name  {{2}} amount  {{3}} reference
    """
    from .models import WhatsAppLog

    centre = batch.center
    if centre is None:
        logger.info('[notifications] batch %s is a doctor payout — not a centre WhatsApp', batch.id)
        return
    if not centre.mobile:
        logger.info('[notifications] centre %s has no mobile — skipping payout WhatsApp', centre.id)
        return

    # Meta rejects blank template params, so an absent UTR needs a placeholder.
    reference = (batch.razorpay_payout_id or '').strip() or 'NA'

    result = send_template(
        to_mobile=centre.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_CENTRE_PAYOUT,
        params=[
            centre.name,
            f'{batch.total_amount:.2f}',
            reference,
        ],
    )
    WhatsAppLog.objects.create(
        booking=None,
        event_type='centre_payout',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_appointment_prep(booking):
    """Send the centre's own preparation instructions to the patient.

    `Scan.prep_instructions` has been captured, stored and serialised since
    scanning centres shipped, and has never reached a patient on any channel.
    For a blood centre that is the message that matters most: somebody who eats
    breakfast before a fasting panel loses the slot, the sample and the trip.

    Sent at BOOKING time rather than with the ~2h reminder on purpose — "fast
    for 8 hours" is useless two hours out. The cost is that a booking made three
    weeks ahead gets its prep three weeks ahead; a day-before pass would be the
    fix, and it needs a second cron window rather than a second template.

    No-ops when the provider left prep blank, which is most consultations and
    plenty of scans — an empty param would be rejected by Meta anyway.

    Template body (see notifications/WHATSAPP_TEMPLATES.md §14) params:
      {{1}} patient  {{2}} service  {{3}} centre  {{4}} date
      {{5}} prep instructions  {{6}} booking reference
    """
    from .models import WhatsAppLog

    if not booking.is_scan:
        return

    prep = one_line(getattr(booking.scan, 'prep_instructions', '') or '')
    if not prep:
        return

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    patient_name = user.first_name or user.username
    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_APPOINTMENT_PREP,
        params=[
            patient_name,
            booking.provider_name,
            booking.hospital.name,
            str(booking.date),
            prep,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='appointment_prep',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_queue_advance(booking):
    """Tell the patient on WhatsApp that they are next in the queue.

    The one notification where lateness makes it worthless: the patient has to
    physically walk in now. Push already covers this, but a push is only seen if
    the app is installed and its token is live — WhatsApp reaches the patient who
    booked from the website or never installed the app at all.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} patient name  {{2}} doctor  {{3}} hospital  {{4}} token
    """
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_QUEUE_ADVANCE,
        params=[
            user.first_name or user.username,
            booking.provider_name,
            booking.hospital.name,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='queue_advance',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_booking_on_hold(booking):
    """Tell the patient the queue moved past them and they were put on hold.

    Without this the queue visibly advances past the patient with no explanation
    — the most common reason someone walks out believing they were forgotten.
    The message therefore has to say they are still in the queue, not dropped.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} patient name  {{2}} doctor  {{3}} hospital  {{4}} token
    """
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    result = send_template(
        to_mobile=user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_ON_HOLD,
        params=[
            user.first_name or user.username,
            booking.provider_name,
            booking.hospital.name,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='booking_on_hold',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_hospital_cancellation(booking):
    """Tell the hospital a patient cancelled, so the slot can be reused.

    Goes to the hospital's own number, NOT the patient, so it is never gated on
    the patient's whatsapp_opt_in — mirroring send_hospital_new_booking. This is
    the other half of that message: the hospital is told when a booking arrives,
    so it should be told when one goes away.

    Template body (see notifications/WHATSAPP_TEMPLATES.md) params:
      {{1}} hospital name  {{2}} patient name  {{3}} doctor
      {{4}} date           {{5}} slot          {{6}} token
    """
    from .models import WhatsAppLog

    hospital = booking.hospital
    if not hospital.mobile:
        return

    result = send_template(
        to_mobile=hospital.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_HOSPITAL_CANCELLED,
        params=[
            hospital.name,
            booking.patient_display_name,
            booking.provider_name,
            str(booking.date),
            booking.slot,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        event_type='hospital_cancellation',
        status='sent' if result['success'] else 'failed',
        wa_message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )


def send_scan_report_ready(booking):
    """Tell a patient their scan report is available.

    Deliberately carries NO link. The report is medical PII served only behind
    an ownership check, and a WhatsApp message is forwardable — putting a URL in
    it would hand the report to whoever the message reaches. The patient opens
    the app or the site, where their session proves who they are.

    Params: {{1}} patient {{2}} scan {{3}} centre {{4}} booking reference.
    "Booking reference", never "token" — the word token beside a code-like value
    trips Meta's Authentication/OTP classifier and gets the template rejected
    (see WHATSAPP_TEMPLATES.md §2).
    """
    from .models import WhatsAppLog

    user = booking.user
    if not getattr(user, 'whatsapp_opt_in', True):
        return

    result = send_template(
        to_mobile=booking.patient_display_mobile or user.mobile,
        template_name=settings.WHATSAPP_TEMPLATE_SCAN_REPORT,
        params=[
            booking.patient_display_name,
            booking.provider_name,
            booking.hospital.name,
            booking.token,
        ],
    )
    WhatsAppLog.objects.create(
        booking=booking,
        template=settings.WHATSAPP_TEMPLATE_SCAN_REPORT,
        to_mobile=booking.patient_display_mobile or user.mobile,
        success=result['success'],
        message_id=result.get('message_id') or '',
        error=result.get('error') or '',
    )
