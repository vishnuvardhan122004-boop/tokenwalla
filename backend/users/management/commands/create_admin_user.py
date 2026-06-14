from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

ADMIN_MOBILE = '9959330601'
ADMIN_USERNAME = 'admin'
ADMIN_EMAIL = 'admin@tokenwalla.com'
ADMIN_PASSWORD = 'vishnu2004'


class Command(BaseCommand):
    help = 'Idempotently create the default TokenWalla superuser for admin panel access'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=ADMIN_USERNAME,
            defaults={
                'mobile': ADMIN_MOBILE,
                'email': ADMIN_EMAIL,
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
            },
        )

        # Always ensure staff/superuser flags and password are correct,
        # even if the record already existed.
        user.mobile = ADMIN_MOBILE
        user.email = ADMIN_EMAIL
        user.role = 'admin'
        user.is_staff = True
        user.is_superuser = True
        user.set_password(ADMIN_PASSWORD)
        user.save()

        action = 'Created' if created else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(
                f'{action} admin user — mobile: {ADMIN_MOBILE}, '
                f'login at /secure-admin-tw/'
            )
        )
