import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('doctors', '0001_initial'),
        ('hospitals', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Booking',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('slot', models.CharField(max_length=20)),
                ('token', models.CharField(max_length=30, unique=True)),
                ('status', models.CharField(
                    choices=[
                        ('waiting', 'Waiting'),
                        ('in_progress', 'In Progress'),
                        ('completed', 'Completed'),
                        ('cancelled', 'Cancelled'),
                    ],
                    default='waiting',
                    max_length=20
                )),
                ('payment_id', models.CharField(blank=True, max_length=100)),
                ('order_id', models.CharField(blank=True, max_length=100)),
                ('amount', models.IntegerField(default=0)),
                ('queue_access', models.BooleanField(default=False)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('doctor', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='bookings',
                    to='doctors.doctor'
                )),
                ('hospital', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='bookings',
                    to='hospitals.hospital'
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bookings',
                    to=settings.AUTH_USER_MODEL
                )),
            ],
            options={
                'ordering': ['-created'],
            },
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['hospital', 'date', 'status'],
                name='idx_booking_hosp_date_status'
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['user', 'status'],
                name='idx_booking_user_status'
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['doctor', 'date', 'status'],
                name='idx_booking_doc_date_status'
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['status'],
                name='idx_booking_status'
            ),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(
                fields=['created'],
                name='idx_booking_created'
            ),
        ),
    ]