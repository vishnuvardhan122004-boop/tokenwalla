import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Create or update the default admin user'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            mobile=ADMIN_MOBILE,
            defaults={
                'username': ADMIN_USERNAME,
                'email': ADMIN_EMAIL,
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
            },
        )

        # Always ensure staff/superuser flags and password are correct,
        # even if the record already existed.
        user.username = ADMIN_USERNAME
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
