"""
backend/payments/webhooks.py

Razorpay/RazorpayX webhook receiver. Currently handles payout lifecycle events:

    payout.processed  → settle the batch: mark PROCESSED, mark the batch's
                        bookings' doctor_payout_status = PAID.
    payout.failed     → mark FAILED, alert internally, release the ledger rows
    payout.reversed     back to unbatched so the next cycle retries them.

Idempotent: a duplicate delivery for an already-settled batch is a no-op. Built
now but effectively inert until RazorpayX payouts go live (the daily task only
SIMULATES payouts while RAZORPAYX_ENABLED is false, so no real events arrive).
"""
import json
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from payments.models import PayoutBatch, DoctorLedger
from payments.razorpay_utils import verify_webhook_signature
from bookings.models import Booking

logger = logging.getLogger('tokenwalla')


class RazorpayWebhookView(APIView):
    # Public endpoint — authenticated by HMAC signature, not a session.
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.body
        signature = request.META.get('HTTP_X_RAZORPAY_SIGNATURE', '')
        if not verify_webhook_signature(raw, signature):
            logger.warning('Razorpay webhook: invalid or unverifiable signature.')
            return Response({'message': 'Invalid signature.'}, status=400)

        try:
            payload = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return Response({'message': 'Bad payload.'}, status=400)

        event = payload.get('event', '')
        if event == 'payout.processed':
            return self._settle_processed(payload)
        if event in ('payout.failed', 'payout.reversed'):
            return self._settle_failed(payload, event)

        # Any other event: acknowledge so Razorpay doesn't retry.
        logger.info('Razorpay webhook: ignoring event %s', event)
        return Response({'status': 'ignored'}, status=200)

    # ── helpers ───────────────────────────────────────────────────────────────
    @staticmethod
    def _find_batch(payload):
        """Locate the PayoutBatch from the event by payout id or reference_id."""
        entity = (((payload.get('payload') or {}).get('payout') or {}).get('entity') or {})
        payout_id = entity.get('id', '')
        reference = entity.get('reference_id', '')
        batch = None
        if payout_id:
            batch = PayoutBatch.objects.filter(razorpay_payout_id=payout_id).first()
        if batch is None and reference:
            batch = PayoutBatch.objects.filter(idempotency_key=reference).first()
        return batch

    def _settle_processed(self, payload):
        batch = self._find_batch(payload)
        if batch is None:
            logger.warning('payout.processed for unknown batch: %s', payload.get('payload'))
            return Response({'status': 'unknown_batch'}, status=200)

        if batch.status == PayoutBatch.PROCESSED:
            return Response({'status': 'already_processed'}, status=200)  # idempotent

        batch.status = PayoutBatch.PROCESSED
        batch.save(update_fields=['status'])
        # Mark every booking settled by this batch as PAID.
        booking_ids = (DoctorLedger.objects
                       .filter(payout_batch=batch, booking__isnull=False)
                       .values_list('booking_id', flat=True).distinct())
        Booking.objects.filter(id__in=list(booking_ids)).update(
            doctor_payout_status=Booking.PAYOUT_PAID)
        logger.info('Payout batch %s PROCESSED — %s booking(s) marked PAID.',
                    batch.id, len(booking_ids))
        return Response({'status': 'processed'}, status=200)

    def _settle_failed(self, payload, event):
        batch = self._find_batch(payload)
        if batch is None:
            logger.warning('%s for unknown batch: %s', event, payload.get('payload'))
            return Response({'status': 'unknown_batch'}, status=200)

        new_status = (PayoutBatch.REVERSED if event == 'payout.reversed'
                      else PayoutBatch.FAILED)
        if batch.status in (PayoutBatch.FAILED, PayoutBatch.REVERSED):
            return Response({'status': 'already_settled'}, status=200)  # idempotent

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
