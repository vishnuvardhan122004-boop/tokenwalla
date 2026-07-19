from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hospitals', '0005_hospital_logo_gallery'),
    ]

    operations = [
        migrations.AddField(
            model_name='hospital',
            name='description',
            field=models.TextField(blank=True),
        ),
    ]
