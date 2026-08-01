"""
backend/payments/webhooks.py

Cashfree Payouts webhook receiver. Handles the transfer lifecycle events:

    TRANSFER_SUCCESS   → settle the batch: mark PROCESSED, mark the batch's
                         bookings' doctor_payout_status = PAID.
    TRANSFER_FAILED    → mark FAILED, alert internally, release the ledger rows
    TRANSFER_REVERSED    back to unbatched so the next cycle retries them.

Idempotent: a duplicate delivery for an already-settled batch is a no-op, and a
late failure for an already-PROCESSED batch is ignored (never releases the ledger
— that would double-pay). Built now but effectively inert until Cashfree Payouts
go live (the daily task only SIMULATES payouts while CASHFREE_PAYOUTS_ENABLED is
false, so no real events arrive).
"""
import json
import logging

from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from payments.models import PayoutBatch, DoctorLedger
from payments.cashfree_payouts_utils import (
    verify_payout_webhook_signature, verify_legacy_payout_notification,
)
from bookings.models import Booking

logger = logging.getLogger('tokenwalla')


class CashfreeWebhookView(APIView):
    # Public endpoint — authenticated by HMAC signature, not a session.
    # (Class name kept so the URLconf import is unchanged; it now receives
    # Cashfree Payouts webhooks.)
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw       = request.body
        signature = request.META.get('HTTP_X_WEBHOOK_SIGNATURE', '')
        timestamp = request.META.get('HTTP_X_WEBHOOK_TIMESTAMP', '')

        try:
            payload = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return Response({'message': 'Bad payload.'}, status=400)

        # Cashfree puts the event name in `type` (V2); the older format uses
        # `event`. Both name the events identically (TRANSFER_SUCCESS, …).
        event = payload.get('type') or payload.get('event') or ''

        if signature and timestamp:
            # TRANSFER_* — header-signed (V2 scheme).
            if not verify_payout_webhook_signature(raw, signature, timestamp):
                logger.warning('Cashfree webhook: invalid or unverifiable signature.')
                return Response({'message': 'Invalid signature.'}, status=400)
        else:
            # No x-webhook-* headers → Cashfree's older format, signature
            # embedded in the body. Used for account-level alerts (e.g.
            # LOW_BALANCE_ALERT), and for transfer events when the dashboard
            # webhook is configured as V1 rather than V2.
            if not verify_legacy_payout_notification(payload):
                logger.warning('Cashfree webhook: invalid legacy-format signature for event %s',
                               event)
                return Response({'message': 'Invalid signature.'}, status=400)
            if not event.startswith('TRANSFER_'):
                # Nothing for us to act on — ack so Cashfree's dashboard test
                # succeeds and it stops retrying.
                logger.info('Cashfree webhook: acknowledged legacy notification %s.', event)
                return Response({'status': 'ok'}, status=200)
            # A V1-format transfer event still settles a batch — falling through
            # to the same handlers (rather than acking it away) is what stops a
            # V1-configured webhook silently leaving every batch QUEUED and every
            # doctor unpaid. _find_batch reads both payload shapes.

        if event == 'TRANSFER_SUCCESS':
            return self._settle_processed(payload)
        # REJECTED (risk/limits) is as final as FAILED and must release the
        # ledger too — otherwise the batch sits QUEUED forever and the doctor is
        # never paid and never retried.
        if event in ('TRANSFER_FAILED', 'TRANSFER_REVERSED', 'TRANSFER_REJECTED'):
            return self._settle_failed(payload, event)

        # Any other event: acknowledge so Cashfree doesn't retry.
        logger.info('Cashfree webhook: ignoring event %s', event)
        return Response({'status': 'ignored'}, status=200)

    # ── helpers ───────────────────────────────────────────────────────────────
    @staticmethod
    def _find_batch(payload):
        """Locate the PayoutBatch from the transfer event by Cashfree transfer id
        (cf_transfer_id) or our transfer_id (== the batch idempotency_key).

        V2 nests these under `data` as transfer_id/cf_transfer_id; the V1 format
        puts them at the top level as transferId/referenceId. Read both."""
        entity      = (payload.get('data') or {})
        transfer    = entity.get('transfer_id') or payload.get('transferId') or ''
        cf_transfer = entity.get('cf_transfer_id') or payload.get('referenceId') or ''
        batch = None
        if cf_transfer:
            batch = PayoutBatch.objects.filter(razorpay_payout_id=str(cf_transfer)).first()
        if batch is None and transfer:
            batch = PayoutBatch.objects.filter(idempotency_key=transfer).first()
        return batch

    def _settle_processed(self, payload):
        batch = self._find_batch(payload)
        if batch is None:
            logger.warning('TRANSFER_SUCCESS for unknown batch: %s', payload.get('data') or payload)
            return Response({'status': 'unknown_batch'}, status=200)

        # Lock the batch row and re-read status inside the lock so two concurrent
        # deliveries of the SAME event can't both transition it / both re-run the
        # booking update. On Postgres this is a real row lock; on SQLite (tests)
        # select_for_update is a silent no-op, which is fine single-threaded.
        with transaction.atomic():
            batch = PayoutBatch.objects.select_for_update().get(pk=batch.pk)
            if batch.status == PayoutBatch.PROCESSED:
                return Response({'status': 'already_processed'}, status=200)  # idempotent

            batch.status = PayoutBatch.PROCESSED
            batch.save(update_fields=['status'])
            # Mark every booking settled by this batch as PAID.
            booking_ids = list(DoctorLedger.objects
                               .filter(payout_batch=batch, booking__isnull=False)
                               .values_list('booking_id', flat=True).distinct())
            Booking.objects.filter(id__in=booking_ids).update(
                doctor_payout_status=Booking.PAYOUT_PAID)
        logger.info('Payout batch %s PROCESSED — %s booking(s) marked PAID.',
                    batch.id, len(booking_ids))
        return Response({'status': 'processed'}, status=200)

    def _settle_failed(self, payload, event):
        batch = self._find_batch(payload)
        if batch is None:
            logger.warning('%s for unknown batch: %s', event, payload.get('data') or payload)
            return Response({'status': 'unknown_batch'}, status=200)

        new_status = (PayoutBatch.REVERSED if event == 'TRANSFER_REVERSED'
                      else PayoutBatch.FAILED)
        with transaction.atomic():
            batch = PayoutBatch.objects.select_for_update().get(pk=batch.pk)
            if batch.status in (PayoutBatch.FAILED, PayoutBatch.REVERSED):
                return Response({'status': 'already_settled'}, status=200)  # idempotent
            # A failure/reversal that lands AFTER the batch already settled as
            # PROCESSED (a replayed or out-of-order delivery) must NOT release the
            # ledger rows — that would re-batch them next cycle and pay the doctor
            # a SECOND time. Treat the late event as a no-op.
            if batch.status == PayoutBatch.PROCESSED:
                logger.warning('%s for already-PROCESSED batch %s — ignoring to '
                               'avoid a double payout.', event, batch.id)
                return Response({'status': 'already_processed'}, status=200)

            batch.status = new_status
            batch.save(update_fields=['status'])
            # Release the ledger rows so the next cycle retries; bookings stay
            # PROCESSING (they already have ledger entries — don't re-ledger).
            DoctorLedger.objects.filter(payout_batch=batch).update(payout_batch=None)
        # Internal alert — bad VPA/IFSC, insufficient balance, etc. Needs eyes.
        logger.error('ALERT: payout batch %s → %s for doctor %s (₹%s). '
                     'Ledger released for retry. Check payout details.',
                     batch.id, new_status, batch.doctor_id, batch.total_amount)
        return Response({'status': new_status.lower()}, status=200)
