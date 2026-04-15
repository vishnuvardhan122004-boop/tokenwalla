# Generated migration for Booking model indexes + PROTECT on delete
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0003_booking_queue_access'),
        ('doctors',  '0003_alter_doctor_fee'),
        ('hospitals', '0001_initial'),
    ]

    operations = [
        # Change CASCADE → PROTECT so deleting a doctor/hospital
        # doesn't silently wipe patient booking history
        migrations.AlterField(
            model_name='booking',
            name='doctor',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='bookings',
                to='doctors.doctor',
            ),
        ),
        migrations.AlterField(
            model_name='booking',
            name='hospital',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='bookings',
                to='hospitals.hospital',
            ),
        ),
        # Performance indexes
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['hospital', 'date', 'status'],
                name='idx_booking_hosp_date_status',
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['user', 'status'],
                name='idx_booking_user_status',
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['doctor', 'date', 'status'],
                name='idx_booking_doc_date_status',
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['status'],
                name='idx_booking_status',
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['created'],
                name='idx_booking_created',
            ),
        ),
    ]