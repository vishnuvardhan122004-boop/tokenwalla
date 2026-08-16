"""
Broadcast an "update the app" push to every registered device.

    python manage.py send_update_push 1.3.0                  # counts only, sends nothing
    python manage.py send_update_push 1.3.0 --send
    python manage.py send_update_push 1.3.0 --send --role patient
    python manage.py send_update_push 1.3.0 --send --message "Queue view is much faster."

This is the nudge, not the gate. What actually FORCES an update is
`APP_MIN_VERSION` on Railway: the app re-reads GET /api/app-version/ on every
launch and shows a non-dismissible "Update Required" alert below that version.
Send this to reach people who aren't opening the app; raise APP_MIN_VERSION to
make updating mandatory. Neither needs a store release.

A send reaches every real installed device at once and cannot be recalled, so
it does NOT happen without `--send` — the bare command only reports who would
be reached.
"""
from django.core.management.base import BaseCommand

from notifications.models import DeviceToken
from notifications.push import push_app_update


class Command(BaseCommand):
    help = 'Push an "update available" notification to all registered devices.'

    def add_arguments(self, parser):
        parser.add_argument('version', help='The version being pushed out, e.g. 1.3.0.')
        parser.add_argument('--send', action='store_true',
                            help='Actually send. Without this, only counts are printed.')
        parser.add_argument('--role', choices=['patient', 'hospital'], default=None,
                            help='Limit to one role (default: every device).')
        parser.add_argument('--message', default='',
                            help='Override the notification body.')

    def handle(self, *args, **opts):
        version, role = opts['version'].strip(), opts['role']

        qs = DeviceToken.objects.all()
        if role:
            qs = qs.filter(role=role)
        count = qs.count()

        scope = f'role={role}' if role else 'all roles'
        self.stdout.write(f'{count} registered device(s) — {scope}, version {version}.')

        if not count:
            self.stdout.write(self.style.WARNING('Nothing to send to.'))
            return

        if not opts['send']:
            self.stdout.write(self.style.WARNING(
                'Dry run — nothing sent. Re-run with --send to deliver.'
            ))
            return

        push_app_update(version, message=opts['message'], role=role)
        self.stdout.write(self.style.SUCCESS(
            f'Sent to {count} device(s). Delivery is best-effort; '
            f'dead tokens are pruned automatically.'
        ))
