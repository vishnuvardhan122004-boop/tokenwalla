from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0004_indexes_and_protect'),
    ]

    operations = [
        migrations.AddField(
            model_name='booking',
            name='reminder_sent',
            field=models.BooleanField(default=False),
        ),
    ]
