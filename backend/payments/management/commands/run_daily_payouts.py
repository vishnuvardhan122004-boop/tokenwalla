"""
Daily doctor-ledger run. Wire to Railway cron, scheduled once a day, next-day —
after Razorpay's settlement to our account has landed:

    python manage.py run_daily_payouts

Steps (see the feature spec §6):
  1. Find COMPLETED, not-yet-paid, not-refunded bookings with a fee split.
  2. Write one DoctorLedger row each: BOOKING_COMPLETED (+doctor_fee), keyed to
     the doctor or — for a scan booking — to the scanning centre. Nothing is
     deducted; the provider receives the whole online fee. Move the booking to
     PROCESSING.

Payouts themselves are MANUAL from here — the admin payouts page
(payments.views.PendingPayoutsView / MarkPayoutPaidView) aggregates every
doctor's unbatched ledger rows live and lets staff mark a doctor paid once
they've actually wired the money. There is no automated gateway payout step.

Idempotent: the PENDING filter stops this re-processing a booking twice.
"""
import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from bookings.models import Booking
from payments.models import DoctorLedger
from payments.payout_utils import ledger_owner

logger = logging.getLogger('tokenwalla')


class Command(BaseCommand):
    help = "Write doctor-ledger entries for newly completed bookings."

    def handle(self, *args, **options):
        eligible = (
            Booking.objects
            .filter(status=Booking.COMPLETED,
                    doctor_payout_status=Booking.PAYOUT_PENDING)
            .exclude(payment__refunds__isnull=False)   # never pay out a refunded booking
            .select_related('doctor', 'payment', 'scan__center')
        )

        written = 0
        for booking in eligible:
            payment = getattr(booking, 'payment', None)
            doctor_fee = payment.doctor_fee if payment else 0
            # Legacy bookings with no fee split collected no doctor fee → nothing
            # to pay out. Mark settled so we don't re-scan them.
            if not payment or doctor_fee <= 0:
                booking.doctor_payout_status = Booking.PAYOUT_PAID
                booking.save(update_fields=['doctor_payout_status'])
                continue

            # Doctor or scanning centre. Left PENDING (not settled) if neither
            # resolves, so the booking is re-scanned every run and surfaces as a
            # visible backlog rather than money owed quietly vanishing.
            owner = ledger_owner(booking)
            if owner is None:
                logger.error(
                    'Booking %s has no payout owner (no doctor, no scan centre). '
                    'Left PENDING on purpose.', booking.id)
                continue

            try:
                with transaction.atomic():
                    # Re-fetch under a row lock and re-check the payout status:
                    # this is the idempotency guard against a second concurrent
                    # run double-ledgering (and therefore double-paying) the
                    # same completed booking. The loser sees PROCESSING/PAID
                    # and skips.
                    locked = Booking.objects.select_for_update().get(pk=booking.pk)
                    if locked.doctor_payout_status != Booking.PAYOUT_PENDING:
                        continue
                    DoctorLedger.objects.create(
                        booking=locked, amount=doctor_fee,
                        reason=DoctorLedger.BOOKING_COMPLETED, **owner,
                    )
                    locked.doctor_payout_status = Booking.PAYOUT_PROCESSING
                    locked.save(update_fields=['doctor_payout_status'])
                written += 1
            except Exception as exc:
                logger.exception('Ledgering failed for booking %s: %s', booking.id, exc)

        msg = f'Ledgered {written} booking(s). Payouts are manual — see the admin payouts page.'
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))
