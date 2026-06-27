from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='whatsapp_opt_in',
            field=models.BooleanField(default=True),
        ),
    ]
