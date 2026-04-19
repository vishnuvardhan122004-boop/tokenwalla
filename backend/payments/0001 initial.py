import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('bookings', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order_id', models.CharField(max_length=100)),
                ('payment_id', models.CharField(blank=True, max_length=100)),
                ('signature', models.CharField(blank=True, max_length=300)),
                ('amount', models.IntegerField()),
                ('status', models.CharField(default='pending', max_length=20)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('booking', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='payment',
                    to='bookings.booking'
                )),
            ],
        ),
    ]