# TokenWalla

Doctor-appointment booking with a live hospital queue. Django REST backend
(`backend/`) + Create React App frontend (`src/`). The mobile app is a
**separate repo** — any change to the `/api/payment/*` contract must be mirrored
there.

## ⚠️ This product is LIVE

Real patients hold tokens. Real money moves through Razorpay. Traffic is low
today, which buys room to make mistakes — it does not make them free. From
2026-08-09 onward this repo is in **production-ready mode**, and the rules below
are not suggestions.

**Never, from a session:**

- Touch the production database. No `railway run`, no `railway connect`, no
  `psql`. If something can only be diagnosed against prod, say so and hand it to
  Vishnu — don't improvise.
- Push to `main` or `develop`. Both deploy. Work on a feature branch, open a
  PR, let CI run the tests.
- Deploy. No `vercel --prod`, no deploy hooks. Merging is the deploy.

**Deployment is Railway + Vercel only. Render is gone** — don't reintroduce it,
and treat any older note mentioning a Render deploy hook as stale.
`.github/workflows/deploy.yml` is named for history but runs **tests only**;
Railway and Vercel each deploy off their own GitHub integration on a push to
`main`. Keep CI green — Railway's "Wait for CI" will hold a deploy back on a
red run.
- Put an `rzp_live_` key anywhere near local dev — it charges a real card on
  every test payment. Razorpay has no sandbox for live credentials.

`.claude/hooks/guard-production.py` blocks all of the above. If it fires, that's
the system working: surface it, don't route around it.

**Migrations against live data.** Additive only — new nullable columns, new
tables. Never drop or rename a column that deployed code still reads. Railway
migrates and deploys as separate steps, so every migration must be safe to run
*before* the code that needs it. Real bookings, payments and ledger rows already
exist; a migration that assumes an empty table will corrupt them.

**The default is to do less.** When a change could be narrow or broad, take the
narrow one. When you're unsure whether something is safe, stop and ask — a
question costs a minute, a bad refund path costs a patient.

## The three repos

| Repo | Contains | Deploys to |
|---|---|---|
| **this one** (`tokenwalla`) | Django backend (`backend/`) + React website (`src/`) | Railway (API) + Vercel (web) |
| **mobile app** (`tokenwalla.app`) | Expo/React Native patient app | EAS build → stores |

The app is a **separate repo with its own release cycle**, and that asymmetry is
the single most common source of breakage: the website ships the moment a PR
merges, the app ships when someone builds and the stores approve it.

So: **the API is a contract, not an implementation detail.** Any change to
request shape, response shape, status values or error codes on `/api/payment/*`
or `/api/bookings/*` breaks installed apps that cannot be updated on your
schedule. Additive changes only; if a breaking change is unavoidable, version
the endpoint and keep the old one alive until the app release has rolled out.
Call it out explicitly in the PR — `/ship` checks for this.

## How we work

Sessions are ~3 hours. One slice per session, merged before it ends.

- `/start` — orient, pick the top ROADMAP item, agree the scope, cut a branch
- work the slice
- `/ship` — the pre-merge gate (tests, money paths, migrations, secrets, API contract)
- `/wrap` — update ROADMAP + WORKLOG, write tomorrow's first move

`ROADMAP.md` is the single source of truth for what's next. If a plan lives in a
chat message and not in ROADMAP.md, it doesn't exist — tomorrow's session won't
see it.

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

### Doctor payouts are MANUAL — and this is deliberate

**This is the chosen design, not a missing feature.** Do not propose automating
it, do not add a payout API, do not reintroduce RazorpayX. Any older note
calling automated payouts a priority is stale — it lost.

The money path is: patient pays → **Razorpay settles to TokenWalla** → Vishnu
pays each doctor from the **Slice current account** → the payment is recorded in
the admin. A human sits in the middle on purpose: at this stage Vishnu wants
eyes on every rupee daily — sales, who's owed, whether anything looks wrong —
and an automated payout removes the one checkpoint that catches a bad number
before it leaves the bank.

Revisit around **October 2026**, only once the daily numbers are boring and
Vishnu says so explicitly. Until then, treat automation as out of scope.

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

`cd backend && python manage.py test` (158 tests) and `CI=true npx react-scripts
test --watchAll=false` (13). Payment changes must keep `payments/tests_payments.py`
and `payments/tests_integration.py` green — they cover the fee math, refund
tiers, the manual-payout flow, and the order-binding/idempotency regressions.

CI (`.github/workflows/deploy.yml`) runs **tests only** and runs on
`pull_request`, so a PR is gated before it lands. It also gates on
`makemigrations --check`.

### Four traps that have already cost a session

**1. Every `threading.Thread` in a view is a test-isolation hazard.** Views fire
WhatsApp + push on a **background thread** that opens its own DB connection and
outlives the test. Against Django's shared-cache in-memory SQLite it then
collides with a LATER, UNRELATED test's first write and fails it with
`database table is locked`. It reproduces about one run in four, on a different
test each time, so a single green run proves nothing.

There are four such threads. Any test that reaches one must patch it:

| Fires on | Patch |
|---|---|
| booking through `/verify/` | `payments.views._dispatch_booking_notifications` |
| `/api/payment/payouts/mark-paid/` | `payments.views._notify_doctor_payout_async` |
| doctor toggled to unavailable | `doctors.views._notify_doctor_unavailable` |
| booking cancel / hold / no-show | `bookings.views._whatsapp_async` |

```python
@mock.patch('payments.views._dispatch_booking_notifications', lambda b: None)
```

The tell in a verbose log is a `graph.facebook.com` proxy error, or a
`push_to_hospital(N) failed` line, attributed to a test that has nothing to do
with the feature — the thread's output lands on whichever test is running when
it finishes, so the *reported* test is never the offender. **The check that
actually proves it: `manage.py test -v 2` with zero `graph.facebook.com` lines.**
A live outbound call during the suite means a thread escaped.

**2. Never hard-code a date in a test.** `payments/tests_integration.py` had
`'2026-08-01'` literals that silently rotted into the past and then started
failing the 2h booking cutoff. Compute dates from `timezone.localdate()`.

**3. Never let a test depend on the time of day.** A cutoff test using today's
date with an `09:00 AM` slot passed at 23:00 and failed at 01:00. Pin the clock
instead: `@mock.patch('tokenwalla.utils.timezone.now')`.

**4. Don't add `TransactionTestCase` to this suite.** Its teardown truncates
every table, which is a lot of destructive machinery against the shared-cache
SQLite test DB. Simulate "outside a transaction" by patching the connection.
True-concurrency tests genuinely need Postgres and are `skipUnless`'d — they do
not run in CI, so a row-lock guarantee is code review plus a manual
`DATABASE_URL=postgres://...` run, not something CI proves.

## Rate limiting and the OTP caps

The OTP attempt cap and the daily SMS-send cap are counted in the **database**
(`users.RateCounter.bump()`, under `select_for_update()`), not the cache.

`cache.incr()` is only atomic on Redis — `DatabaseCache` inherits
`BaseCache.incr`, a read-modify-write. That was harmless when gunicorn ran one
sync worker and requests were strictly serialised, but the worker/thread change
(3 × 4) makes twelve requests concurrent, and parallel guesses could each read
the same count before any wrote back. These caps are a security control; they
must not weaken because an env var changed the cache backend. Don't move them
back into the cache, and don't assume `cache.incr` is atomic anywhere else.

Two behaviours that look like bugs and aren't: the window rolls from the FIRST
event (so hammering the endpoint can't hold your own counter open), and a
successful login clears the attempt counter but deliberately NOT the daily send
cap (resetting the spend ceiling on login would make flooding free again).

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

**Redis is opt-in, and deliberately not switched on by `REDIS_URL`.** That
variable defaulted to `redis://localhost:6379/0` and was read but never used, so
the stale value is already sitting in local `.env` files pointing at a Redis
nobody runs. Keying the cache backend off it would send every throttled request
— which is all of them — at a dead connection, and the site would look broken
for a reason that isn't in the code. So the cache uses Redis only when
`USE_REDIS_CACHE=True` *and* `REDIS_URL` is set; otherwise it falls back to the
database cache table, which needs nothing running. Set the flag on Railway once
a Redis addon is attached, never locally. (The test suite forces LocMemCache
regardless, so a developer with Redis configured doesn't get cross-test bleed.)
