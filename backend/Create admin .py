import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create or update the TokenWalla admin account'

    def add_arguments(self, parser):
        parser.add_argument('--no-input', action='store_true', help='Read from env vars')
        parser.add_argument('--mobile', type=str, help='Admin mobile number')
        parser.add_argument('--password', type=str, help='Admin password')
        parser.add_argument('--name', type=str, help='Admin name', default='Admin')

    def handle(self, *args, **options):
        no_input = options.get('no_input', False)

        if no_input or options.get('mobile'):
            mobile = options.get('mobile') or os.environ.get('ADMIN_MOBILE', '')
            password = options.get('password') or os.environ.get('ADMIN_PASSWORD', '')
            name = options.get('name') or os.environ.get('ADMIN_NAME', 'Admin')
        else:
            self.stdout.write(self.style.WARNING('\n=== TokenWalla Admin Setup ===\n'))
            mobile = input('Admin mobile number (10 digits): ').strip()
            password = input('Admin password (min 8 chars):    ').strip()
            name = input('Admin name [Admin]:              ').strip() or 'Admin'

        if not mobile or len(mobile) != 10 or not mobile.isdigit():
            self.stderr.write(self.style.ERROR('Invalid mobile number. Must be 10 digits.'))
            return
        if not password or len(password) < 8:
            self.stderr.write(self.style.ERROR('Password must be at least 8 characters.'))
            return

        user, created = User.objects.get_or_create(
            mobile=mobile,
            defaults={
                'username': mobile,
                'first_name': name,
                'is_staff': True,
                'is_superuser': True,
            }
        )

        user.first_name = name
        user.role = 'admin'
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(
            f'\n✅ {action} admin account:\n'
            f'   Mobile:   {mobile}\n'
            f'   Name:     {name}\n'
            f'   Role:     admin\n'
            f'   Login at: /2004\n'
        ))