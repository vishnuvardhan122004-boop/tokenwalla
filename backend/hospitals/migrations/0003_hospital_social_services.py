from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hospitals', '0002_hospital_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='hospital',
            name='instagram',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='hospital',
            name='youtube',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='hospital',
            name='facebook',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='hospital',
            name='services',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
