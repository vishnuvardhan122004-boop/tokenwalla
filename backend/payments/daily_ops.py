"""
backend/payments/daily_ops.py

The daily operations summary — the one screen Vishnu checks before deciding how
to spend the day.

Doctor payouts are MANUAL by design (see CLAUDE.md): Razorpay settles to
TokenWalla, Vishnu wires each doctor from the Slice current account, then marks
it paid in the admin. A human sits in the money path on purpose, so the job of
this module is to make that human's daily check fast and complete — not to
replace it.

Everything here is READ-ONLY. No money moves, no rows are written. It is safe to
call as often as you like.

Kept out of views.py so the numbers can be tested directly, without HTTP.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from bookings.models import Booking
from payments.models import DoctorLedger, Payment
from payments.payout_utils import choose_mode, payout_target

ZERO = Decimal('0.00')

# A completed booking should be ledgered by the next daily cron run. If rows are
# still PENDING well past that, the cron isn't running — which is silent, and is
# exactly the kind of thing a daily check exists to catch.
LEDGER_LAG_DAYS = 2

# How long an unpaid ledger row can sit before it's worth nagging about. This is
# a prompt for Vishnu to wire money, never a prompt to automate the wire.
PAYOUT_AGEING_DAYS = 3


def _money(value):
    """Decimal → the 2dp string the API returns. None/0 both become '0.00'."""
    return str((value or ZERO).quantize(Decimal('0.01')))


def _booking_counts(day):
    """Today's bookings, counted by status in a single query."""
    counts = Booking.objects.filter(date=day).aggregate(
        total=Count('id'),
        confirmed=Count('id', filter=Q(status=Booking.CONFIRMED)),
        in_progress=Count('id', filter=Q(status=Booking.IN_PROGRESS)),
        on_hold=Count('id', filter=Q(status=Booking.ON_HOLD)),
        completed=Count('id', filter=Q(status=Booking.COMPLETED)),
        cancelled=Count('id', filter=Q(status=Booking.CANCELLED)),
        no_show=Count('id', filter=Q(status=Booking.NO_SHOW)),
    )
    return {k: v or 0 for k, v in counts.items()}


def _collected(day):
    """What actually landed in the Razorpay account today.

    Split the way the money is actually owed onward, because "revenue" and
    "money in the account" are not the same number and confusing them is how a
    payout goes wrong:

      doctor_fees  — collected online, owed to doctors. NOT ours.
      gst          — owed to the government. NOT ours.
      platform+gateway — TokenWalla's actual revenue.

    `offline_doctor_fees` never touches us at all: in SERVICE_ONLY mode the
    patient settles the consultation fee at the clinic. It's reported so the
    day's totals reconcile against what hospitals see.
    """
    agg = Payment.objects.filter(
        status=Payment.PAID, created__date=day,
    ).aggregate(
        count=Count('id'),
        gross=Sum('final_amount'),
        doctor_fees=Sum('doctor_fee'),
        offline_doctor_fees=Sum('offline_doctor_fee'),
        platform_fee=Sum('platform_fee'),
        gateway_fee=Sum('gateway_fee'),
        gst=Sum('gst_amount'),
    )
    platform = agg['platform_fee'] or ZERO
    gateway = agg['gateway_fee'] or ZERO
    return {
        'payments': agg['count'] or 0,
        'gross': _money(agg['gross']),
        'doctor_fees': _money(agg['doctor_fees']),
        'offline_doctor_fees': _money(agg['offline_doctor_fees']),
        'platform_fee': _money(platform),
        'gateway_fee': _money(gateway),
        'gst': _money(agg['gst']),
        # What TokenWalla actually keeps: the service fee, GST excluded.
        'tokenwalla_revenue': _money(platform + gateway),
    }


def _outstanding_by_doctor():
    """Net unbatched ledger balance per payee:
    [((doctor_id, center_id), net_amount), ...].

    Grouped on BOTH columns, not just doctor_id: exactly one of them is set on
    any row, so grouping on doctor_id alone would fold every scanning centre in
    the country into a single `None` bucket — one balance where there should be
    one per centre, and an owed-count that is wrong the moment a second centre
    is owed anything.

    Includes non-positive balances, which the payouts page deliberately hides —
    a provider whose absence clawbacks exceed their earnings is owed nothing,
    but it's worth seeing on the daily check rather than never.
    """
    rows = (
        DoctorLedger.objects
        .filter(payout_batch__isnull=True)
        .order_by()                       # clear Meta.ordering — it breaks GROUP BY
        .values('doctor_id', 'center_id')
        .annotate(net=Sum('amount'))
    )
    return [((r['doctor_id'], r['center_id']), r['net'] or ZERO) for r in rows]


def _payouts_owed(balances):
    """Total currently owed to providers, and how many are waiting."""
    payable = [amount for _, amount in balances if amount > 0]
    return {
        'doctors_owed': len(payable),
        'total_owed': _money(sum(payable, ZERO)),
    }


def _attention(day, balances):
    """Things that need a human. Ordered worst-first; empty list means clear.

    Each item is {code, severity, message, count} — severity is 'high' for
    anything touching money or a patient, 'medium' for everything else.
    """
    items = []
    now = timezone.now()

    # 1. The ledger cron has stopped. Silent failure: bookings complete, doctors
    #    simply never appear on the payouts page.
    lag_cutoff = day - timedelta(days=LEDGER_LAG_DAYS)
    # Same status set the cron settles (COMPLETED + NO_SHOW). If this probe
    # watched only COMPLETED, a NO_SHOW payout that never got ledgered would be
    # invisible on the one screen checked every day.
    stuck_ledger = Booking.objects.filter(
        status__in=(Booking.COMPLETED, Booking.NO_SHOW),
        doctor_payout_status=Booking.PAYOUT_PENDING,
        date__lt=lag_cutoff,
    ).count()
    if stuck_ledger:
        items.append({
            'code': 'ledger_not_running',
            'severity': 'high',
            'count': stuck_ledger,
            'message': (
                f'{stuck_ledger} completed booking(s) older than {LEDGER_LAG_DAYS} '
                f'days still have no ledger row. run_daily_payouts may not be '
                f'running — check the Railway cron service.'
            ),
        })

    # 2. Doctors who have been waiting on a manual wire too long.
    ageing_cutoff = now - timedelta(days=PAYOUT_AGEING_DAYS)
    ageing = (
        DoctorLedger.objects
        .filter(payout_batch__isnull=True, amount__gt=0, created_at__lt=ageing_cutoff)
        .order_by()
        .values('doctor_id', 'center_id')
        .distinct()
        .count()
    )
    if ageing:
        items.append({
            'code': 'payouts_ageing',
            'severity': 'high',
            'count': ageing,
            'message': (
                f'{ageing} provider(s) have money owed for more than '
                f'{PAYOUT_AGEING_DAYS} days. Wire from the Slice account, then '
                f'mark paid on the payouts page.'
            ),
        })

    # 3. Owed money with nowhere to send it — invisible until you try to pay.
    owed_doctor_ids = [d for (d, _c), amount in balances if amount > 0 and d]
    owed_center_ids = [c for (_d, c), amount in balances if amount > 0 and c]
    missing = 0
    if owed_doctor_ids:
        from doctors.models import Doctor
        for doctor in Doctor.objects.select_related('hospital').filter(pk__in=owed_doctor_ids):
            if choose_mode(payout_target(doctor)) is None:
                missing += 1
    if owed_center_ids:
        # A centre is its own payout target — the same Hospital payout fields.
        from hospitals.models import Hospital
        for center in Hospital.objects.filter(pk__in=owed_center_ids):
            if choose_mode(center) is None:
                missing += 1
    if missing:
        items.append({
            'code': 'no_payout_details',
            'severity': 'high',
            'count': missing,
            'message': (
                f'{missing} provider(s) are owed money but have no UPI or bank '
                f'details on file. You cannot pay them until this is fixed.'
            ),
        })

    # 4. A queue someone forgot to close. The patient's booking is stranded in a
    #    live state and will never complete on its own.
    stale_queue = Booking.objects.filter(
        status__in=[Booking.IN_PROGRESS, Booking.ON_HOLD], date__lt=day,
    ).count()
    if stale_queue:
        items.append({
            'code': 'stale_queue',
            'severity': 'medium',
            'count': stale_queue,
            'message': (
                f'{stale_queue} booking(s) from before today are still '
                f'In Progress or On Hold. A hospital left the queue open.'
            ),
        })

    # 5. Net-negative balances: clawbacks currently exceed earnings, so the
    #    payouts page shows nothing for this doctor. Worth knowing about.
    negative = sum(1 for _, amount in balances if amount < 0)
    if negative:
        items.append({
            'code': 'negative_balance',
            'severity': 'medium',
            'count': negative,
            'message': (
                f'{negative} doctor(s) have a negative ledger balance — absence '
                f'clawbacks exceed earnings, so nothing is owed to them yet.'
            ),
        })

    return items


def build_daily_summary(day=None):
    """The whole daily check as one dict. Read-only; safe to call repeatedly."""
    day = day or timezone.localdate()
    balances = _outstanding_by_doctor()
    attention = _attention(day, balances)

    return {
        'date': str(day),
        'bookings': _booking_counts(day),
        'collected': _collected(day),
        'payouts': _payouts_owed(balances),
        'attention': attention,
        # One glance: is anything wrong at all?
        'all_clear': not attention,
    }
