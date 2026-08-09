# TokenWalla — Roadmap

**The single source of truth for what happens next.** `/start` reads the top of
**Now**. `/wrap` updates it. If work isn't written here, the next session won't
know about it.

Sessions are ~3 hours. Each item below is sized to fit one, and ordered so that
the things that can lose money or break a live booking come first.

- **Last updated:** 2026-08-09
- **Phase:** production-ready hardening (live, low traffic)
- **Rule of thumb:** correctness → safety → capacity → features

---

## Now

Work these top-down. Don't start a second one until the first is merged.

### ~~1. Enforce slot capacity where the booking is created~~ ✅ 2026-08-09

Done on `fix/enforce-slot-capacity` (`b93be14`). Left below for the record of
what the problem was; delete once the PR is merged.

**⚠️ Not merged yet — needs a PR and CI.** And the mobile app has a follow-up:
it should send `date`/`slot` to `/api/payment/create-order/` so a collision is
rejected before payment instead of charge-then-refund. It works without it.

<details><summary>original entry</summary>

### 1. Enforce slot capacity where the booking is created 🔴

**Why first:** `payments/views.py:_handle_new_booking` creates the booking
*after* payment is captured and never checks `max_per_slot`. Two patients on the
last seat both pay and both get a token. Money is already taken by then, so the
only fix at that point is a refund. Low traffic is the only reason this hasn't
bitten yet — it breaks the first time two people want the same popular slot.
Full analysis in `CAPACITY.md` §1.

- Count CONFIRMED + IN_PROGRESS for `(doctor, date, slot)` under
  `select_for_update()` inside the existing `transaction.atomic()`
- Mirror the logic already correct in `bookings/views.py:371-388`
- The rejection path must **auto-refund** — payment is captured, so a bare 400
  strands the patient's money
- Also check in `CreateOrderView._create_booking_order` so most collisions are
  caught before an order exists at all; the `_handle_new_booking` check stays as
  the race backstop
- Call `is_slot_bookable(date, slot)` server-side on both paths — the 2h cutoff
  is currently frontend-only too

**Done when:** a test books two patients concurrently into a 1-seat slot, one
succeeds, one is rejected and refunded.

</details>

### 2. Bound `HospitalQueueView` 🔴

**Why:** `bookings/views.py:82` filters by hospital and status with **no date
filter and no pagination**. Every booking a hospital has ever taken is
serialized every 10 seconds by the dashboard poll. At 100 bookings/day this is
moving thousands of rows per request within a month — it's the first endpoint
that will fall over, and it degrades silently until it doesn't.

- Filter to `date=today` (the queue is a today-only view by definition)
- Bound the `completed` list to today as well
- `idx_booking_hosp_date_status` already exists for exactly this query

**Done when:** the response is O(today), and the dashboard still shows what it
showed before.

### 3. Give the server room to breathe 🟠

**Why:** `Procfile` and `railway.json` both start gunicorn with no `--workers`
or `--threads` — that's **one sync worker, one request at a time**. That worker
also blocks on Razorpay during `/verify/` (~0.5–1.5s), so a single checkout
stalls every other request on the box. `CAPACITY.md` §2 puts the ceiling at
~120 concurrent patients before booking traffic.

- `gunicorn tokenwalla.wsgi --workers 3 --threads 4 --timeout 60` in **both**
  files (they must not drift)
- Point `CACHES` at Redis — `REDIS_URL` is already read in `settings.py:93` and
  then ignored, so every throttled request is doing DB writes on a read path
- Railway has one-click Redis; add the addon first

**Done when:** both start commands match, Redis is live, and throttling no
longer touches `tw_cache_table`.

### 4. Fix the Railway cron for `run_daily_payouts` 🟠

**Surfaced by the new daily check.** `daily_ops` now raises
`ledger_not_running` when completed bookings sit more than 2 days without a
ledger row. That alert is only useful if the cron it's watching actually exists
— and per `backend/notifications/CRON_SETUP.md` the two cron services were never
set up.

- Create the Railway cron services (`railway.cron.json`, `railway.payouts.cron.json`)
- Confirm the logs show a run
- Then confirm the dashboard alert clears on its own

**Done when:** the daily check says "Nothing needs you" because it's true, not
because nothing is being measured.

---

## Next

- **Pause the hospital dashboard poll on tab hide** — reuse the existing
  `useVisiblePolling`; patient pages already do this, the dashboard polls all
  day whether or not anyone is looking
- **Verify the WhatsApp token is a permanent System-User token**, not the 24h
  temp one — if it's temporary, every notification is silently dead already
- **Set up the 2 Railway cron services** (`backend/notifications/CRON_SETUP.md`)
- **Mobile app: `/api/bookings/upgrade/` contract** — still sends bare
  `payment_id`, which now returns 400. Installed apps are broken on this path
- **Raise the 6-char password floor**
- **Confirm the deploy target** — `.github/workflows/deploy.yml` posts to
  **Render** deploy hooks, but every doc says **Railway**. One of them is wrong
  and it's worth 10 minutes to find out which
- **Branch cleanup** — 12 local branches, several long dead

---

## Later

- **Automated doctor payouts — NOT BEFORE ~OCTOBER 2026, and only if Vishnu says
  so.** Manual is the deliberate design (see `CLAUDE.md`). Don't start this
  because it looks like an obvious improvement; the human checkpoint is the point.
- Server-Sent Events (or push) for queue updates instead of polling — polling is
  what makes concurrent users expensive
- Per-day booking archive/purge so queue tables stay small
- Load-test the checkout path specifically — the only path holding an external
  HTTP call
- Notify-the-beneficiary option for "book for someone else"
- Reword the approved `doctor_unavailable` Meta template to drop "Dr."

---

## Done

- **2026-08-09** — **Daily ops check** on `/Adashboard`. `payments/daily_ops.py`
  + `GET /api/payment/daily-summary/` (admin-only, read-only) + `src/ADMIN/DailyOps.js`.
  Today's bookings, gross collected, our actual revenue (service fee — doctor
  fees and GST shown separately so gross is never misread as earnings), total
  owed to doctors, and five alerts: cron stopped, doctors waiting >3 days,
  owed-but-no-payout-details, queue left open, negative ledger balance.
  18 new backend tests + 6 frontend. Payouts stay manual — this supports the
  human in the loop, it doesn't replace him.
- **2026-08-09** — Claude Code setup: `.claude/settings.json`, production guard
  hook, `/start` `/ship` `/wrap` `/daily`, this ROADMAP. RazorpayX cancelled.
- **2026-08-08** — `CAPACITY.md`: full audit of booking capacity and infra
  ceiling, traced to code rather than estimated. Source for items 1–3 above.
- **2026-08-07** — cancellation / hold / no-show / payout notifications
- **2026-08-07** — bulk-transfer CSV export on the admin payouts page
- **2026-08-06** — WhatsApp the doctor when a payout is marked paid
- **2026-08-05** — reverted Cashfree → Razorpay; manual doctor payout flow
- **2026-08-05** — service-fee-only default; checkout repriced server-side
- **2026-07-27** — all 4 Meta WhatsApp templates approved and delivering
- **2026-07-26** — security review: 15 findings + 2 hardening items closed
