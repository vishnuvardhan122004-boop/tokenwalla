"""Seed one approved, fully-stocked scanning centre for a demo.

    python manage.py seed_scan_center

IDEMPOTENT — re-run it before every demo. It updates the same rows rather than
piling up duplicates, so a demo that got half-clicked-through resets cleanly.

Deliberately NOT prefixed "[TEST]": that marker hides a hospital from the
patient app (constants/config.ts isTestHospital), and the whole point here is
to show the patient-facing browse-and-book flow.

Refuses to run when DEBUG is off. This creates an approved provider with a
known password; on a production database that is an open door.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError

from hospitals.models import Hospital
from scans.models import Scan

MOBILE   = '9000000008'
PASSWORD = 'Test@1234'

ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
MORNING  = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM']
EVENING  = ['04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM']

SCANS = [
    {
        'name': 'MRI Brain',
        'modality': 'MRI',
        'keywords': 'brain scan, head mri, neuro, headache',
        'description': 'Detailed imaging of the brain and surrounding tissue.',
        'prep_instructions': 'Remove ALL metal — jewellery, watches, hairpins. Tell us if you have a pacemaker or any implant.',
        'price': 4500,
        'duration_minutes': 45,
        'max_per_slot': 1,
        # The one scan on FULL, so a demo shows BOTH money paths side by side:
        # this price is collected online and lands on the payouts page.
        'payment_collection_mode': Scan.COLLECT_FULL,
        'slots': MORNING + EVENING,
    },
    {
        'name': 'CT Scan - Chest',
        'modality': 'CT',
        'keywords': 'chest ct, lungs, hrct',
        'description': 'Cross-sectional imaging of the chest and lungs.',
        'prep_instructions': 'Do not eat for 4 hours before the scan. Wear loose clothing with no metal buttons.',
        'price': 3000,
        'duration_minutes': 20,
        'max_per_slot': 1,
        'payment_collection_mode': Scan.COLLECT_SERVICE_ONLY,
        'slots': MORNING + EVENING,
    },
    {
        'name': 'Complete Blood Count (CBC)',
        'modality': 'Blood Test',
        'keywords': 'cbc, blood test, haemogram, fever',
        'description': 'Routine blood panel — haemoglobin, white cells, platelets.',
        'prep_instructions': 'Fast for 8 hours. Water is fine.',
        'price': 300,
        'duration_minutes': 5,
        # Four draws run concurrently — capacity is per SCAN, so a full MRI
        # never closes this one.
        'max_per_slot': 4,
        'payment_collection_mode': Scan.COLLECT_SERVICE_ONLY,
        'slots': MORNING,
    },
]


class Command(BaseCommand):
    help = 'Create/refresh a demo scanning centre with scans (local dev only).'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                'Refusing to run with DEBUG=False. This creates an approved '
                'provider with a known password.'
            )

        centre, created = Hospital.objects.update_or_create(
            mobile=MOBILE,
            defaults={
                'kind': Hospital.SCAN_CENTER,
                'name': 'Vijaya Diagnostics',
                'city': 'Hindupur',
                'address': 'Opp. Municipal Office, Bengaluru Road, Hindupur',
                'location': 'Bengaluru Road, Hindupur, Andhra Pradesh',
                'latitude': 13.8283,
                'longitude': 77.4911,
                'landline': '08556-234567',
                'license_number': 'AP/CEA/2026/1188',
                'description': 'MRI, CT, X-ray and a full pathology lab. Reports the same day.',
                'open_time': '08:00',
                'close_time': '20:00',
                'password': make_password(PASSWORD),
                # Pre-approved: the approval gate is worth DEMONSTRATING on a
                # second, pending centre, not worth making you click through
                # before anything is visible.
                'status': 'active',
                # A FULL scan means we hold this centre's money, so it needs a
                # payout account or the payouts page shows "no details on file".
                'payment_method': Hospital.UPI,
                'upi_vpa': 'vijaya@okaxis',
                'account_holder_name': 'Vijaya Diagnostics',
            },
        )

        User = get_user_model()
        user, _ = User.objects.update_or_create(
            mobile=MOBILE,
            defaults={
                'username': MOBILE,
                'first_name': centre.name,
                # The login view resolves the centre from here.
                'last_name': str(centre.id),
                'role': 'hospital',
                'is_active': True,
            },
        )
        user.set_password(PASSWORD)
        user.save()

        for spec in SCANS:
            Scan.objects.update_or_create(
                center=centre, name=spec['name'],
                defaults={**{k: v for k, v in spec.items() if k != 'name'},
                          'days': ALL_DAYS, 'available': True},
            )

        # A second centre left PENDING, so the "under review" login message and
        # the admin approve action both have something to act on.
        pending, _ = Hospital.objects.update_or_create(
            mobile='9000000009',
            defaults={
                'kind': Hospital.SCAN_CENTER,
                'name': 'Sri Sai Scans (awaiting approval)',
                'city': 'Hindupur',
                'address': 'Main Road, Hindupur',
                'license_number': '',
                'password': make_password(PASSWORD),
                'status': 'pending',
            },
        )

        self.stdout.write(self.style.SUCCESS(
            f'\n  Scanning centre {"created" if created else "refreshed"}: '
            f'{centre.name} (id={centre.id})\n'
            f'    login    {MOBILE} / {PASSWORD}\n'
            f'    licence  {centre.license_number}\n'
            f'    scans    {centre.scans.count()}\n\n'
            f'  Centre awaiting approval: {pending.name} (id={pending.id})\n'
            f'    log in as it to see the "under review" message, or approve it in admin.\n'
        ))
