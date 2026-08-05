from django.db import migrations, models

# Legacy → new lifecycle value mapping. Renaming the stored status values to the
# spec-aligned settlement lifecycle (see bookings.models.Booking.STATUS).
FORWARD = {
    'waiting':     'CONFIRMED',
    'in_progress': 'IN_PROGRESS',
    'held':        'ON_HOLD',
    'completed':   'COMPLETED',
    'cancelled':   'CANCELLED',
}
BACKWARD = {new: old for old, new in FORWARD.items()}


def _remap(apps, mapping):
    Booking = apps.get_model('bookings', 'Booking')
    for old, new in mapping.items():
        Booking.objects.filter(status=old).update(status=new)


def forwards(apps, schema_editor):
    _remap(apps, FORWARD)


def backwards(apps, schema_editor):
    # NO_SHOW has no legacy equivalent; fold it back to 'cancelled' (its old home).
    Booking = apps.get_model('bookings', 'Booking')
    Booking.objects.filter(status='NO_SHOW').update(status='cancelled')
    _remap(apps, BACKWARD)


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0009_booking_booked_for_mobile_booking_booked_for_name'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='status',
            field=models.CharField(
                max_length=20,
                default='CONFIRMED',
                choices=[
                    ('PENDING',     'Pending'),
                    ('CONFIRMED',   'Confirmed'),
                    ('IN_PROGRESS', 'In Progress'),
                    ('ON_HOLD',     'On Hold'),
                    ('COMPLETED',   'Completed'),
                    ('CANCELLED',   'Cancelled'),
                    ('NO_SHOW',     'No Show'),
                ],
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
