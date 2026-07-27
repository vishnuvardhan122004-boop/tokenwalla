"""
Daily doctor payout run. Wire to Railway cron (see railway.payouts.cron.json),
scheduled once a day, next-day — after Razorpay's settlement to our account has
landed:

    python manage.py run_daily_payouts

Steps (see the feature spec §6):
  1. Find COMPLETED, not-yet-paid, not-refunded bookings with a fee split.
  2. Write two DoctorLedger rows each: BOOKING_COMPLETED (+doctor_fee) and
     HOSPITAL_COMMISSION (−commission). Move the booking to PROCESSING.
  3. Group every doctor's UNBATCHED ledger rows into ONE PayoutBatch (per
     doctor, not per booking) and call RazorpayX (simulated until enabled).
  4. payout.processed / failed webhooks (payments.webhooks) settle the batch.

Idempotent: the PENDING filter stops step 2 re-processing a booking, and the
unique idempotency_key stops step 3 creating a doctor's batch twice per day.
"""
import logging

from django.core.management.base import BaseCommand
from django.db import transaction, IntegrityError
from django.db.models import Sum
from django.utils import timezone

from bookings.models import Booking
from payments.models import DoctorLedger, PayoutBatch
from payments.fees import compute_hospital_commission
from payments.razorpayx_utils import create_payout, choose_mode

logger = logging.getLogger('tokenwalla')


class Command(BaseCommand):
    help = "Build ledger entries for completed bookings and pay doctors out."

    def handle(self, *args, **options):
        ledgers_written = self._write_completion_ledgers()
        batches_created = self._create_and_send_batches()
        msg = (f'Payout run complete. Ledgered {ledgers_written} booking(s), '
               f'created {batches_created} payout batch(es).')
        logger.info(msg)
        self.stdout.write(self.style.SUCCESS(msg))

    # ── Step 1–2: completion → ledger ─────────────────────────────────────────
    def _write_completion_ledgers(self):
        eligible = (
            Booking.objects
            .filter(status=Booking.COMPLETED,
                    doctor_payout_status=Booking.PAYOUT_PENDING)
            .exclude(payment__refunds__isnull=False)   # never pay out a refunded booking
            .select_related('doctor', 'hospital', 'payment')
        )

        written = 0
        for booking in eligible:
            payment = getattr(booking, 'payment', None)
            doctor_fee = payment.doctor_fee if payment else 0
            # Legacy bookings with no fee split collected no doctor fee → nothing
            # to pay and no commission owed. Mark settled so we don't re-scan them.
            if not payment or doctor_fee <= 0:
                booking.doctor_payout_status = Booking.PAYOUT_PAID
                booking.save(update_fields=['doctor_payout_status'])
                continue

            commission = compute_hospital_commission(booking.hospital.commission_rate)['total_commission']
            try:
                with transaction.atomic():
                    DoctorLedger.objects.create(
                        doctor=booking.doctor, booking=booking,
                        amount=doctor_fee, reason=DoctorLedger.BOOKING_COMPLETED,
                    )
                    DoctorLedger.objects.create(
                        doctor=booking.doctor, booking=booking,
                        amount=-commission, reason=DoctorLedger.HOSPITAL_COMMISSION,
                    )
                    booking.doctor_payout_status = Booking.PAYOUT_PROCESSING
                    booking.save(update_fields=['doctor_payout_status'])
                written += 1
            except Exception as exc:
                logger.exception('Ledgering failed for booking %s: %s', booking.id, exc)
        return written

    # ── Step 3: group unbatched ledger → one PayoutBatch per doctor ───────────
    def _create_and_send_batches(self):
        run_date = timezone.localdate().isoformat()

        # .order_by() clears the model's default ('-created_at') ordering — else
        # Django folds created_at into SELECT DISTINCT and returns a doctor once
        # per ledger row instead of once overall.
        doctor_ids = list(
            DoctorLedger.objects
            .filter(payout_batch__isnull=True)
            .order_by()
            .values_list('doctor_id', flat=True)
            .distinct()
        )

        created = 0
        for doctor_id in doctor_ids:
            entries = (DoctorLedger.objects
                       .select_related('doctor')
                       .filter(doctor_id=doctor_id, payout_batch__isnull=True))
            total = entries.aggregate(s=Sum('amount'))['s'] or 0
            # Only pay a positive net. A ≤0 net (e.g. absence clawbacks exceed
            # earnings) stays unbatched to settle against future earnings.
            if total <= 0:
                logger.info('Doctor %s net payout ₹%s ≤ 0 — leaving unbatched.', doctor_id, total)
                continue

            doctor = entries[0].doctor
            mode   = choose_mode(doctor)
            idem   = f'payout_{doctor_id}_{run_date}'
            try:
                with transaction.atomic():
                    batch = PayoutBatch.objects.create(
                        doctor=doctor, total_amount=total, payout_mode=mode,
                        status=PayoutBatch.QUEUED, idempotency_key=idem,
                    )
                    # Attach exactly the rows we summed (guard against a race).
                    entries.update(payout_batch=batch)
            except IntegrityError:
                # A batch with this idempotency_key already exists (task re-run).
                logger.warning('Payout batch %s already exists — skipping.', idem)
                continue

            try:
                resp = create_payout(doctor, total, mode, idem)
                batch.razorpay_payout_id = (resp or {}).get('id', '') or ''
                batch.save(update_fields=['razorpay_payout_id'])
            except Exception as exc:
                # Couldn't hand off to RazorpayX: mark FAILED and release the rows
                # so the next cycle retries them.
                logger.exception('Payout dispatch failed for %s: %s', idem, exc)
                batch.status = PayoutBatch.FAILED
                batch.save(update_fields=['status'])
                entries.update(payout_batch=None)
                continue

            created += 1
        return created
