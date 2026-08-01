"""
Daily doctor payout run. Wire to Railway cron (see railway.payouts.cron.json),
scheduled once a day, next-day — after Cashfree's settlement to our account has
landed:

    python manage.py run_daily_payouts

Steps (see the feature spec §6):
  1. Find COMPLETED, not-yet-paid, not-refunded bookings with a fee split.
  2. Write one DoctorLedger row each: BOOKING_COMPLETED (+doctor_fee). Nothing
     is deducted — the doctor receives the whole online consultation fee. Move
     the booking to PROCESSING.
  3. Group every doctor's UNBATCHED ledger rows into ONE PayoutBatch (per
     doctor, not per booking) and call Cashfree Payouts (simulated until enabled).
  4. payout.processed / failed webhooks (payments.webhooks) settle the batch.

Idempotent: the PENDING filter stops step 2 re-processing a booking, and the
unique idempotency_key stops step 3 creating a doctor's batch twice per day.
"""
import logging
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction, IntegrityError
from django.utils import timezone

from bookings.models import Booking
from payments.models import DoctorLedger, PayoutBatch
from payments.cashfree_payouts_utils import create_payout, choose_mode, payout_target

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
            .select_related('doctor', 'payment')
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

            try:
                with transaction.atomic():
                    # Re-fetch under a row lock and re-check the payout status:
                    # this is the idempotency guard against a second concurrent /
                    # overlapping run double-ledgering (and therefore double-paying)
                    # the same completed booking. The loser sees PROCESSING/PAID
                    # and skips.
                    locked = (Booking.objects
                              .select_for_update()
                              .get(pk=booking.pk))
                    if locked.doctor_payout_status != Booking.PAYOUT_PENDING:
                        continue
                    DoctorLedger.objects.create(
                        doctor=booking.doctor, booking=locked,
                        amount=doctor_fee, reason=DoctorLedger.BOOKING_COMPLETED,
                    )
                    locked.doctor_payout_status = Booking.PAYOUT_PROCESSING
                    locked.save(update_fields=['doctor_payout_status'])
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
            doctor = None
            idem   = f'payout_{doctor_id}_{run_date}'
            try:
                with transaction.atomic():
                    # Lock this doctor's unbatched rows and snapshot their EXACT
                    # ids under the lock. The old code summed a lazy queryset and
                    # then re-ran it at .update(): a row inserted in between (a
                    # concurrent completion/absence adjustment) would be attached
                    # to the batch WITHOUT being in the summed total, so
                    # total_amount understated what was paid. Summing and
                    # attaching the same locked id set makes them always agree.
                    entries = (DoctorLedger.objects
                               .select_for_update()
                               .select_related('doctor', 'doctor__hospital')
                               .filter(doctor_id=doctor_id, payout_batch__isnull=True))
                    rows = list(entries)
                    if not rows:
                        continue
                    entry_ids = [e.id for e in rows]
                    total = sum((e.amount for e in rows), Decimal('0'))
                    # Only pay a positive net. A ≤0 net (e.g. absence clawbacks
                    # exceed earnings) stays unbatched to settle against future
                    # earnings.
                    if total <= 0:
                        logger.info('Doctor %s net payout ₹%s ≤ 0 — leaving unbatched.', doctor_id, total)
                        continue

                    # No VPA and no bank account → nowhere to send the money.
                    # Leave the rows unbatched so the earnings accrue and pay out
                    # in a later cycle once the hospital fills the details in;
                    # batching now would only create a guaranteed-failed transfer.
                    # For a salaried doctor the target is their HOSPITAL, so the
                    # missing details may be the hospital's — say which.
                    target = payout_target(rows[0].doctor)
                    mode   = choose_mode(target)
                    if mode is None:
                        logger.error('ALERT: doctor %s has ₹%s owed but payout target '
                                     '%s %s has no UPI VPA and no bank account — holding '
                                     'the ledger. Add payout details to release it.',
                                     doctor_id, total, target._meta.model_name, target.id)
                        continue

                    doctor = rows[0].doctor
                    batch  = PayoutBatch.objects.create(
                        doctor=doctor, total_amount=total, payout_mode=mode,
                        status=PayoutBatch.QUEUED, idempotency_key=idem,
                    )
                    # Attach exactly the rows we summed.
                    DoctorLedger.objects.filter(id__in=entry_ids).update(payout_batch=batch)
            except IntegrityError:
                # A batch with this idempotency_key already exists (task re-run).
                logger.warning('Payout batch %s already exists — skipping.', idem)
                continue

            # No positive batch was created for this doctor (empty / net ≤ 0).
            if doctor is None:
                continue

            try:
                resp = create_payout(doctor, total, mode, idem)
                batch.razorpay_payout_id = (resp or {}).get('id', '') or ''
                batch.save(update_fields=['razorpay_payout_id'])
            except Exception as exc:
                # Couldn't hand off to Cashfree Payouts: mark FAILED and release the rows
                # so the next cycle retries them.
                logger.exception('Payout dispatch failed for %s: %s', idem, exc)
                batch.status = PayoutBatch.FAILED
                batch.save(update_fields=['status'])
                # Release exactly the rows we attached (they're no longer
                # payout_batch__isnull=True, so re-run over entry_ids, not the
                # original queryset) so the next cycle retries them.
                DoctorLedger.objects.filter(id__in=entry_ids).update(payout_batch=None)
                continue

            created += 1
        return created
