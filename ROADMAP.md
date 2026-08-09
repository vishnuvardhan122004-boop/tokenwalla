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

All four hardening items are **written and green, but nothing is merged.**
Branch `fix/enforce-slot-capacity`. That is the only thing standing between
this work and production.

### 1. Open the PR and merge 🔴

The single next action. Everything below is done code; none of it protects a
patient until it is on `main`.

```bash
git push -u origin fix/enforce-slot-capacity
```

Then `/ship` for the gate, open the PR, let CI run, merge. Railway migrates and
deploys separately — there is no migration in this branch, so the deploy is
just code.

**Call out in the PR body** (the app is a separate repo and cannot be updated
on your schedule):

- `/api/payment/create-order/` accepts optional `date` + `slot`. Additive; older
  clients unaffected.
- `/api/payment/verify/` can now return **409** with `{success:false, refunded:bool}`
  when a slot is full or past its cutoff. New status for a new condition.
- Invalid slot still returns **400**, unchanged — but now includes `refunded`
  and actually gives the money back.

### 2. Turn on the two Railway crons 🟠

Dashboard work, not code — I cannot do this from a session. Both config files
exist and are correct; the services were never created.
`backend/notifications/CRON_SETUP.md` now documents both, including the two
traps (config path is from the repo root; without its own config file the
service inherits `railway.json` and boots gunicorn instead of the command).

- `backend/railway.cron.json` — appointment reminders, every 10 min
- `backend/railway.payouts.cron.json` — `run_daily_payouts`, 20:30 IST

Until the second one runs, no doctor ever appears on the payouts page. The new
`ledger_not_running` alert on the admin dashboard is the alarm for it.

### 3. Attach Redis and flip the flag 🟠

Also dashboard work. Railway has one-click Redis. Once attached, set
`USE_REDIS_CACHE=True` **and** `REDIS_URL` on the web service.

Deliberately gated behind its own flag rather than `REDIS_URL` alone: that
variable already contains a stale `redis://localhost` in local `.env` files, and
switching on it would point every throttled request at a dead connection. See
the local-dev section of `CLAUDE.md`.

### 4. Watch it for a day 🟡

The first day after merge, check the admin **Today's check** card and confirm:

- `ledger_not_running` clears once the payouts cron runs
- no `oversold_refund` lines in the Railway logs (`grep oversold_refund`) — if
  there are, a patient was charged and refunded, and it is worth knowing why
- the hospital dashboard still shows Today / Tomorrow / All correctly

---

## Next

- **Pause the hospital dashboard poll on tab hide** — reuse the existing
  `useVisiblePolling`; patient pages already do this, the dashboard polls all
  day whether or not anyone is looking
- **Verify the WhatsApp token is a permanent System-User token**, not the 24h
  temp one — if it's temporary, every notification is silently dead already
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

- **2026-08-09** — **Slot capacity enforced on the money paths.**
  `bookings/capacity.py` is now the single definition; `CreateOrderView` rejects
  before payment, `_handle_new_booking` re-checks under a doctor-row lock and
  auto-refunds in full if the money was already captured. `BOOKING_CUTOFF_HOURS`
  is server-side too. Also fixed a money leak: an unknown slot used to reject
  after capture and keep the payment. 19 tests.
- **2026-08-09** — **Hospital queue bounded** to a −7/+30 day window. It had no
  date filter and no pagination while being polled every 10s. Not today-only as
  the audit suggested — that would have emptied the dashboard's Tomorrow and All
  tabs. 9 tests.
- **2026-08-09** — **Throughput:** gunicorn `--workers 3 --threads 4
  --timeout 60` in both `Procfile` and `railway.json` (was one sync worker
  blocking on Razorpay), and a real Redis cache backend behind `USE_REDIS_CACHE`.
- **2026-08-09** — **Cron setup documented** for `run_daily_payouts`; the
  service was never created, which is why no doctor ever reaches the payouts page.
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
