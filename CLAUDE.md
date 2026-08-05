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
  and its payments and looks for a `captured` one. `/api/payment/verify/` takes
  only `{ order_id }`. Never add client-signature trust back.
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
- **Collecting the consultation fee online is opt-in.** Only an explicit
  `Doctor.payment_collection_mode == 'FULL'` does it; blank, missing, unknown or
  never-chosen all price as `SERVICE_ONLY` (patient pays the service fee online,
  settles the consultation fee at the clinic, and no payout is owed). One place
  decides this — `payments/fees.py`: `service_only = (collection_mode != FULL)`.
  Never make `FULL` a default or a fallback: it would have us holding a doctor's
  money with no payout account on file. Migration `0011` reset every legacy row
  once, so a `FULL` row now means someone actually chose it. Test fixtures that
  mean "collect the full fee" must pass `payment_collection_mode='FULL'`.
  (Exception: `/verify/` still falls back to `FULL` for an order whose tags
  predate the field, so a legacy in-flight order reconciles instead of being
  rejected after capture.)
- Gateway fee and GST are **never refunded** (the gateway doesn't return them).
- Idempotency and locking on the money paths are load-bearing. `Payment` has a
  partial unique index on non-blank `payment_id`; refunds, absence adjustments,
  ledger writes and mark-paid all re-check under `select_for_update()`. Preserve
  these when editing.

## Testing

`cd backend && python manage.py test` (99 tests) and `CI=true npx react-scripts
test --watchAll=false`. Payment changes must keep `payments/tests_payments.py`
and `payments/tests_integration.py` green — they cover the fee math, refund
tiers, the manual-payout flow, and the order-binding/idempotency regressions.

## Local dev gotchas

`backend/.env` is gitignored and read by python-decouple, which keeps the **last**
value of a duplicated key. A stray second `DEBUG=False` therefore switches on
`SECURE_SSL_REDIRECT` and makes every `http://127.0.0.1:8000` call 301 to an
https:// the dev server can't answer — the site and the API both look broken for
reasons that aren't in the code. `DEBUG=False` belongs on Railway only. (The test
suite is insulated from this: `settings.py` forces the redirect off under
`manage.py test`.) runserver reloads on `.py` edits but **not** on `.env` ones —
`touch backend/tokenwalla/settings.py` to make it re-read.

Local checkout needs the `rzp_test_` key pair. An `rzp_live_` key in `.env`
charges a real card on every test payment — Razorpay has no sandbox for live
credentials.
