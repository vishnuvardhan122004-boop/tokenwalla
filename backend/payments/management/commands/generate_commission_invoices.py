"""
Monthly hospital-commission invoice run. Wire to Railway cron
(railway.invoices.cron.json), scheduled on the 1st of each month:

    python manage.py generate_commission_invoices

Aggregates the prior month's HOSPITAL_COMMISSION ledger deductions per hospital
into one HospitalCommissionInvoice, with taxable value and GST shown separately
(a proper B2B GST invoice the hospital can claim ITC on).

Options (for backfills / testing):
    --year 2026 --month 7    Invoice a specific month instead of last month.

Idempotent: one invoice per (hospital, period) via a unique constraint.
"""
import calendar
import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db.models import Sum

from payments.models import DoctorLedger, HospitalCommissionInvoice
from payments.fees import GST_RATE

logger = logging.getLogger('tokenwalla')

TWO_PLACES = Decimal('0.01')


def _q(amount):
    return Decimal(amount).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _prior_month(today):
    first_this = today.replace(day=1)
    end = date.fromordinal(first_this.toordinal() - 1)   # last day of prior month
    return end.replace(day=1), end


class Command(BaseCommand):
    help = "Generate monthly B2B GST commission invoices per hospital."

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int)
        parser.add_argument('--month', type=int)

    def handle(self, *args, **options):
        from django.utils import timezone
        if options.get('year') and options.get('month'):
            y, m = options['year'], options['month']
            period_start = date(y, m, 1)
            period_end   = date(y, m, calendar.monthrange(y, m)[1])
        else:
            period_start, period_end = _prior_month(timezone.localdate())

        # Gross commission per hospital = Σ |HOSPITAL_COMMISSION| in the period,
        # grouped by the booking's hospital. The ledger stores the gross
        # (base + GST) as one negative row; we split it back for the invoice.
        rows = (
            DoctorLedger.objects
            .filter(reason=DoctorLedger.HOSPITAL_COMMISSION,
                    created_at__date__gte=period_start,
                    created_at__date__lte=period_end,
                    booking__hospital__isnull=False)
            # Clear default ('-created_at') ordering — otherwise Django adds
            # created_at to GROUP BY and splits each hospital into many rows.
            .order_by()
            .values('booking__hospital')
            .annotate(gross=Sum('amount'))   # negative
        )

        created = 0
        for row in rows:
            hospital_id = row['booking__hospital']
            gross = abs(_q(row['gross'] or 0))
            if gross <= 0:
                continue
            # Reverse the GST-inclusive gross into taxable base + GST.
            base = _q(gross / (Decimal('1') + GST_RATE))
            gst  = _q(gross - base)

            _, was_created = HospitalCommissionInvoice.objects.get_or_create(
                hospital_id=hospital_id,
                period_start=period_start,
                period_end=period_end,
                defaults={'total_commission': base, 'gst_amount': gst},
            )
            if was_created:
                created += 1
            else:
                logger.info('Invoice for hospital %s %s→%s already exists — skipping.',
                            hospital_id, period_start, period_end)

        msg = (f'Commission invoice run complete for {period_start}→{period_end}. '
               f'Created {created} invoice(s).')
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
