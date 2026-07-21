import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


def _truthy(val):
    return str(val).strip().lower() in ('1', 'true', 'yes', 'on')


class Command(BaseCommand):
    help = (
        'Ensure the default admin user exists and is staff/superuser. '
        'Sets the password ONLY when first creating the user, so a password '
        'changed in the admin UI survives later deploys. To deliberately reset '
        'an existing admin password, deploy once with ADMIN_PASSWORD_RESET=1 '
        '(or pass --reset-password), then remove it.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset-password',
            action='store_true',
            help='Force-set the existing admin password from ADMIN_PASSWORD.',
        )

    def handle(self, *args, **options):
        ADMIN_MOBILE   = os.environ.get('ADMIN_MOBILE', '9959330601')
        ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')  # no insecure default
        force_reset    = options.get('reset_password') or _truthy(os.environ.get('ADMIN_PASSWORD_RESET', ''))

        try:
            user = User.objects.get(mobile=ADMIN_MOBILE)
        except User.DoesNotExist:
            if not ADMIN_PASSWORD:
                self.stderr.write(self.style.ERROR(
                    'Admin user does not exist and ADMIN_PASSWORD is not set — '
                    'cannot create one. Set ADMIN_PASSWORD in the environment and redeploy.'
                ))
                return
            User.objects.create_superuser(mobile=ADMIN_MOBILE, password=ADMIN_PASSWORD)
            self.stdout.write(self.style.SUCCESS(f'Admin user {ADMIN_MOBILE} created.'))
            return

        # User exists: keep it staff/superuser, but DO NOT overwrite the password
        # on every deploy — that was silently reverting manual password changes.
        changed = []
        if not user.is_staff:
            user.is_staff = True
            changed.append('is_staff')
        if not user.is_superuser:
            user.is_superuser = True
            changed.append('is_superuser')

        if force_reset:
            if not ADMIN_PASSWORD:
                self.stderr.write(self.style.ERROR(
                    'ADMIN_PASSWORD_RESET requested but ADMIN_PASSWORD is not set — skipping reset.'
                ))
            else:
                user.set_password(ADMIN_PASSWORD)
                changed.append('password')
                self.stdout.write(self.style.WARNING(
                    'Admin password force-reset from ADMIN_PASSWORD. '
                    'Remove ADMIN_PASSWORD_RESET so it is not reset again.'
                ))

        if changed:
            user.save(update_fields=changed)
            self.stdout.write(self.style.WARNING(f'Admin user {ADMIN_MOBILE} updated: {", ".join(changed)}.'))
        else:
            self.stdout.write(f'Admin user {ADMIN_MOBILE} already correct — password left unchanged.')
