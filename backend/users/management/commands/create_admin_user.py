import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Create or update the default admin user'

    def handle(self, *args, **options):
        ADMIN_MOBILE = os.environ.get('ADMIN_MOBILE', '9959330601')
        ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'changeme123')

        try:
            user = User.objects.get(mobile=ADMIN_MOBILE)
            user.is_staff = True
            user.is_superuser = True
            user.set_password(ADMIN_PASSWORD)
            user.save(update_fields=['is_staff', 'is_superuser', 'password'])
            self.stdout.write(self.style.WARNING('Admin user already exists — updated.'))
        except User.DoesNotExist:
            User.objects.create_superuser(
                mobile=ADMIN_MOBILE,
                password=ADMIN_PASSWORD,
            )
            self.stdout.write(self.style.SUCCESS('Admin user created successfully.'))