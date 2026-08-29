"""
Send a single WhatsApp template message to verify credentials + template setup.

    python manage.py send_test_whatsapp 9876543210
    python manage.py send_test_whatsapp 9876543210 --template hospital_new_booking
    python manage.py send_test_whatsapp 9876543210 --template doctor_unavailable \
        --params Rahul "Anita Rao" "City Care Clinic" 2026-07-26 "10:30 AM" TW-TEST-1

Prints the exact Meta API result so you can see success (a message_id) or the
precise error (invalid token, template not found/approved, recipient not in the
allowed test list, parameter-count mismatch, etc.). Never creates a real booking.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from notifications.whatsapp import send_template

# Default sample params per template — ORDER matches the senders in whatsapp.py.
SAMPLE_PARAMS = {
    # {{1}} patient {{2}} doctor {{3}} hospital {{4}} date {{5}} slot {{6}} ref
    'doctor_unavailable':   ['Rahul', 'Anita Rao', 'City Care Clinic',
                             '2026-07-26', '10:30 AM', 'TW-TEST-0001'],
    'booking_confirmation': ['Rahul', 'Anita Rao', 'City Care Clinic',
                             '2026-07-26', '10:30 AM', 'TW-TEST-0001'],
    'appointment_reminder': ['Rahul', 'Anita Rao', 'City Care Clinic',
                             '2026-07-26', '10:30 AM', 'TW-TEST-0001'],
    # {{1}} hospital {{2}} patient {{3}} mobile {{4}} doctor {{5}} date {{6}} slot {{7}} ref
    'hospital_new_booking': ['City Care Clinic', 'Rahul', '9876543210', 'Anita Rao',
                             '2026-07-26', '10:30 AM', 'TW-TEST-0001'],
    # {{1}} patient {{2}} doctor {{3}} hospital {{4}} token
    'queue_advance':        ['Rahul', 'Anita Rao', 'City Care Clinic', 'TW-TEST-0001'],
    'booking_on_hold':      ['Rahul', 'Anita Rao', 'City Care Clinic', 'TW-TEST-0001'],
    # {{1}} hospital {{2}} patient {{3}} doctor {{4}} date {{5}} slot {{6}} token
    'hospital_cancellation': ['City Care Clinic', 'Rahul', 'Anita Rao',
                              '2026-07-26', '10:30 AM', 'TW-TEST-0001'],
    # {{1}} patient {{2}} doctor {{3}} hospital {{4}} date {{5}} token {{6}} refund line
    'booking_cancelled':    ['Rahul', 'Anita Rao', 'City Care Clinic', '2026-07-26',
                             'TW-TEST-0001',
                             'A refund of ₹25.37 will reach you in 5-7 working days'],
    # {{1}} patient {{2}} doctor {{3}} hospital {{4}} date {{5}} token
    'booking_no_show':      ['Rahul', 'Anita Rao', 'City Care Clinic',
                             '2026-07-26', 'TW-TEST-0001'],
    # {{1}} doctor {{2}} amount {{3}} hospital {{4}} reference
    'doctor_payout':        ['Anita Rao', '500.00', 'City Care Clinic', 'NA'],
    # {{1}} patient {{2}} scan {{3}} centre {{4}} booking reference
    'scan_report_ready':    ['Rahul', 'MRI Brain', 'Vijaya Diagnostics', 'TW-TEST-0001'],
    # {{1}} centre {{2}} amount {{3}} reference   — THREE, not four; see §12
    'centre_payout':        ['Vijaya Diagnostics', '4250.00', 'NA'],
    # {{1}} centre {{2}} patient {{3}} mobile {{4}} test {{5}} date {{6}} slot {{7}} ref
    'centre_new_booking':   ['Vijaya Diagnostics', 'Rahul', '9876543210',
                             'Complete Blood Count', '2026-09-02', '08:00 AM', 'TW-TEST-0001'],
    # {{1}} patient {{2}} test {{3}} centre {{4}} date {{5}} prep {{6}} ref
    'appointment_prep':     ['Rahul', 'Complete Blood Count', 'Vijaya Diagnostics',
                             '2026-09-02', 'Fast for 8 hours. Water is fine.', 'TW-TEST-0001'],
}


class Command(BaseCommand):
    help = 'Send one WhatsApp template to a number to verify credentials/templates.'

    def add_arguments(self, parser):
        parser.add_argument('mobile', help='Recipient 10-digit mobile (91 is prefixed automatically).')
        parser.add_argument('--template', default='doctor_unavailable',
                            help='Approved template name (default: doctor_unavailable).')
        parser.add_argument('--params', nargs='*', default=None,
                            help='Override the body params (space-separated, in order).')

    def handle(self, *args, **opts):
        mobile   = opts['mobile'].strip()
        template = opts['template'].strip()
        params   = opts['params'] if opts['params'] is not None else SAMPLE_PARAMS.get(template)

        if params is None:
            raise CommandError(
                f'No built-in sample params for "{template}". '
                f'Pass them explicitly with --params ...'
            )

        if not getattr(settings, 'WHATSAPP_ACCESS_TOKEN', ''):
            self.stderr.write(self.style.WARNING(
                'WHATSAPP_ACCESS_TOKEN is not set — send will no-op. '
                'Set it (and WHATSAPP_PHONE_NUMBER_ID) in this environment and retry.'
            ))

        self.stdout.write(
            f'Sending "{template}" (lang={getattr(settings, "WHATSAPP_TEMPLATE_LANG", "en")}) '
            f'to ...{mobile[-4:]} with {len(params)} param(s)…'
        )
        result = send_template(to_mobile=mobile, template_name=template, params=params)

        if result['success']:
            self.stdout.write(self.style.SUCCESS(f'✅ Sent. message_id={result["message_id"]}'))
        else:
            self.stdout.write(self.style.ERROR(f'❌ Failed: {result["error"]}'))
            raise CommandError('Send failed — see the error above.')
