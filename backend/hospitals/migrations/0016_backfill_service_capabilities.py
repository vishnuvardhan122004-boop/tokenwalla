"""Give every existing provider the capability its `kind` already implied.

Nothing about any live row's behaviour changes here. Before this migration the
patient-facing lists asked `kind`; after it they ask the svc_* capabilities, so
the back-fill exists purely to keep those two answers identical for rows that
predate the column.

  kind=HOSPITAL     -> svc_consultations=ACTIVE   (appears in the default list)
  kind=SCAN_CENTER  -> svc_scans=ACTIVE           (appears under ?kind=SCAN_CENTER)
  kind=BLOOD_CENTER -> svc_blood=ACTIVE           (appears under ?kind=BLOOD_CENTER)

DELIBERATELY NOT GUESSING. Production has four providers whose names advertise
more than their kind does — "Sri venakteshwara clinic and bharathi lab",
"Aditya scans", "Kopprams dental /…/CBCT centre", "ARAVINDA DIABETIC CENTER AND
DENTAL CARE". It is tempting to read those names and switch extra capabilities
on. We do not: a name is not a statement of what a business currently offers,
and switching consultations OFF for "Aditya scans" on the strength of one word
would hide doctors it may well have. They tick their own boxes, or an admin does
it having asked them.

Reversible: the reverse pass clears the fields back to OFF, which is where a
row without this migration would sit anyway.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    Hospital = apps.get_model('hospitals', 'Hospital')
    # Literals, not Hospital.CAP_ACTIVE — historical models carry no methods or
    # class attributes, and a migration must keep working when the model moves on.
    for kind, field in (
        ('HOSPITAL',     'svc_consultations'),
        ('SCAN_CENTER',  'svc_scans'),
        ('BLOOD_CENTER', 'svc_blood'),
    ):
        Hospital.objects.filter(kind=kind).update(**{field: 'ACTIVE'})


def unbackfill(apps, schema_editor):
    Hospital = apps.get_model('hospitals', 'Hospital')
    Hospital.objects.update(svc_consultations='OFF', svc_scans='OFF', svc_blood='OFF')


class Migration(migrations.Migration):

    dependencies = [
        ('hospitals', '0015_hospital_svc_blood_hospital_svc_consultations_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
