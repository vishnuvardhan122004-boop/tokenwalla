# TokenWalla

Doctor-appointment booking with a live hospital queue. Django REST backend
(`backend/`) + Create React App frontend (`src/`). The mobile app is a
**separate repo** — any change to the `/api/payment/*` contract must be mirrored
there.

## Payments

**Gateway: Razorpay.** (The project ran on Cashfree from 2026-07-29 to
2026-08-05 and was reverted; Cashfree is fully removed. Don't reintroduce it.)

- `backend/payments/razorpay_utils.py` is the ONLY place that talks to the
  gateway. It imports no models, so it's safe to import anywhere.
- **Verification is server-side.** We deliberately ignore the signature Razorpay
  Checkout hands the browser: `confirm_order_paid(order_id)` re-fetches the order
  and its payments and looks for a `captured` one. `/api/payment/verify/` and the
  queue-upgrade endpoint take only `{ order_id }`. Never add client-signature
  trust back.
- **The client is never trusted for an amount.** Prices come from
  `payments/fees.py`; `/verify/` recomputes the split and rejects a mismatch.
  The doctor and payer are bound to the server-written order tags, not to what
  the client re-sends.
- Money is **rupee `Decimal`** everywhere internally. Paise conversion happens
  only inside `razorpay_utils.py` at the API boundary.
- Razorpay refunds are keyed by **payment id**, not order id.

### Doctor payouts are MANUAL

There is no payout API call anywhere, and no payout keys or webhooks to
configure. Staff wire the money from TokenWalla's own bank account, then record
it:

1. `manage.py run_daily_payouts` (cron) writes `DoctorLedger` rows for newly
   completed bookings. It does not move money.
2. Admin opens `/Adashboard/payouts` (`src/ADMIN/Payouts.js`) to see who is owed.
3. Mark Paid → `POST /api/payment/payouts/mark-paid/` batches that doctor's
   ledger rows into a `PayoutBatch(PROCESSED)` and flips the bookings to
   payout-PAID. `razorpay_payout_id` stores a hand-entered UTR, not a gateway id.

`payments/payout_utils.py` answers only *who* gets paid (`payout_target` — a
salaried doctor's money goes to their hospital) and *on which rail*
(`choose_mode`).

### Money rules that must not be broken

- **TokenWalla charges the PATIENT only.** Never bill or deduct from a hospital
  or doctor. Our revenue is the service fee (platform + gateway + GST); the
  doctor's payout is the full online consultation fee.
- The doctor's consultation fee is a healthcare service and is **GST-exempt** —
  GST applies only to (platform_fee + gateway_fee).
- Gateway fee and GST are **never refunded** (the gateway doesn't return them).
- Idempotency and locking on the money paths are load-bearing. `Payment` has a
  partial unique index on non-blank `payment_id`; refunds, absence adjustments,
  ledger writes and mark-paid all re-check under `select_for_update()`. Preserve
  these when editing.

## Testing

`cd backend && python manage.py test` (103 tests) and `CI=true npx react-scripts
test --watchAll=false`. Payment changes must keep `payments/tests_payments.py`
and `payments/tests_integration.py` green — they cover the fee math, refund
tiers, the manual-payout flow, and the order-binding/idempotency regressions.
