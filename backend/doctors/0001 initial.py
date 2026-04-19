import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('hospitals', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Doctor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('specialization', models.CharField(max_length=200)),
                ('experience', models.IntegerField(default=0)),
                ('mobile', models.CharField(max_length=15)),
                ('available', models.BooleanField(default=True)),
                ('fee', models.IntegerField(default=0)),
                ('slots', models.JSONField(blank=True, default=list)),
                ('max_per_slot', models.IntegerField(default=10)),
                ('city', models.CharField(blank=True, max_length=100)),
                ('image', models.ImageField(blank=True, null=True, upload_to='doctors/')),
                ('hospital_image', models.ImageField(blank=True, null=True, upload_to='hospital_banners/')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('hospital', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='doctors',
                    to='hospitals.hospital'
                )),
            ],
            options={
                'ordering': ['name'],
            },
        ),
    ]