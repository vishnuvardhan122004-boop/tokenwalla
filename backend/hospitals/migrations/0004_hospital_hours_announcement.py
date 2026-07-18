from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hospitals', '0003_hospital_social_services'),
    ]

    operations = [
        migrations.AddField(
            model_name='hospital',
            name='announcement',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='hospital',
            name='open_time',
            field=models.CharField(blank=True, max_length=5),
        ),
        migrations.AddField(
            model_name='hospital',
            name='close_time',
            field=models.CharField(blank=True, max_length=5),
        ),
    ]
