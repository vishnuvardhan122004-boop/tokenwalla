import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hospitals', '0004_hospital_hours_announcement'),
    ]

    operations = [
        migrations.AddField(
            model_name='hospital',
            name='logo',
            field=models.ImageField(blank=True, null=True, upload_to='hospital_logos/'),
        ),
        migrations.CreateModel(
            name='HospitalPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(upload_to='hospital_gallery/')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('hospital', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photos', to='hospitals.hospital')),
            ],
            options={'ordering': ['-created']},
        ),
    ]
