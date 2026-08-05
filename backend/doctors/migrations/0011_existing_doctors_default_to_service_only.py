"""One-time correction of rows that were never actually chosen.

FULL used to be the model default, so every doctor created before 0010 reads
'FULL' whether their hospital picked it or not — the column can't tell an
explicit choice from an untouched default. Collecting a doctor's consultation
fee online without their hospital opting in is the wrong way to be wrong (we'd
be holding money with no payout account on file), so this resets them all to
SERVICE_ONLY. A hospital that does want the full fee collected re-picks it on
the Doctor Payments page.

Safe to run exactly once, at the point 0010 flips the default. It deliberately
does NOT re-run: after this, a 'FULL' row is a real choice and must be left
alone. The reverse is a no-op — the information needed to restore per-doctor
values never existed.
"""
from django.db import migrations


def service_only_by_default(apps, schema_editor):
    Doctor = apps.get_model('doctors', 'Doctor')
    Doctor.objects.exclude(payment_collection_mode='SERVICE_ONLY').update(
        payment_collection_mode='SERVICE_ONLY')


class Migration(migrations.Migration):

    dependencies = [
        ('doctors', '0010_alter_doctor_payment_collection_mode'),
    ]

    operations = [
        migrations.RunPython(service_only_by_default, migrations.RunPython.noop),
    ]
