import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('bookings', '0004_indexes_and_protect'),
    ]

    operations = [
        migrations.CreateModel(
            name='WhatsAppLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('booking_confirmation', 'Booking Confirmation'), ('appointment_reminder', 'Appointment Reminder')], max_length=30)),
                ('status', models.CharField(choices=[('sent', 'Sent'), ('failed', 'Failed')], max_length=10)),
                ('wa_message_id', models.CharField(blank=True, max_length=120)),
                ('error', models.TextField(blank=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('booking', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='whatsapp_logs', to='bookings.booking')),
            ],
            options={'ordering': ['-created']},
        ),
        migrations.AddIndex(
            model_name='whatsapplog',
            index=models.Index(fields=['booking', 'event_type'], name='notif_booking_event_idx'),
        ),
    ]
