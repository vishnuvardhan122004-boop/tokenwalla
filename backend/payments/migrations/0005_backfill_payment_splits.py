from decimal import Decimal

from django.db import migrations


def forwards(apps, schema_editor):
    """Backfill legacy Payment rows created before the fee split existed.

    Those rows only have the flat integer `amount` (the old ₹15 booking fee).
    We can't reconstruct the true component split retroactively, so we record
    the whole thing as `final_amount` and leave the components at 0 — enough
    for reporting; new payments carry the real split. Status strings from the
    old flow ('success'/'pending') are normalised to the new lifecycle.
    """
    Payment = apps.get_model('payments', 'Payment')
    status_map = {'success': 'PAID', 'pending': 'CREATED', 'failed': 'FAILED'}
    for p in Payment.objects.all().iterator():
        p.final_amount = Decimal(p.amount or 0)
        p.status = status_map.get(p.status, p.status if p.status in
                                   ('CREATED', 'PAID', 'FAILED') else 'PAID')
        p.save(update_fields=['final_amount', 'status'])


def backwards(apps, schema_editor):
    # Non-destructive reverse: normalise status back to the old 'success' label.
    Payment = apps.get_model('payments', 'Payment')
    Payment.objects.filter(status='PAID').update(status='success')


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0004_payment_doctor_fee_payment_final_amount_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
