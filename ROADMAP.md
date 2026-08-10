# TokenWalla — Roadmap

**The single source of truth for what happens next.** `/start` reads the top of
**Now**. `/wrap` updates it. If work isn't written here, the next session won't
know about it.

Sessions are ~3 hours. Each item below is sized to fit one, and ordered so that
the things that can lose money or break a live booking come first.

- **Last updated:** 2026-08-10
- **Phase:** production-ready hardening (live, low traffic)
- **Rule of thumb:** correctness → safety → capacity → features

---

## Now

**PR #10 is merged and live** (`b719378`). The backlog is no longer code — every
open item below is a verification that can only be done against production, and
the one that matters most is not in this repo at all.

### 1. Prove the two Railway crons actually ran 🟠

Both services exist as of 2026-08-10. **A cron service that exists is not a cron
service that works.** Without its own config file a service inherits
`railway.json` and boots gunicorn instead of the command — indistinguishable
from a healthy one in the services list, and exactly how the zombie reminder
cron went 14 days unnoticed logging only `Starting Container`.

- **Reminders** (`*/10 * * * *`) — checkable right now, fires every 10 minutes.
  Read the service log for real application output.
- **Payouts** (`0 15 * * *` UTC = **20:30 IST**) — look for
  `Ledgered 0 booking(s). Payouts are manual — see the admin payouts page.`
  That line appearing **at all** is the proof.

The schedule is correct. If it ever looks wrong, do **not** rewrite it as
`30 20` — Railway cron is UTC and that bug was already fixed once (`cfc751e`).

> **The admin dashboard cannot verify the payouts cron.** Checked live after the
> merge: the Today's check card reads "Nothing needs you", so `ledger_not_running`
> is not firing and cannot clear. With no doctor on `FULL` collection there are no
> ledger rows to write either. The run leaves **no trace in the UI** — the Railway
> service log is the only signal. An earlier version of this file said otherwise.

### 2. Confirm the permanent WhatsApp token reached Railway 🟠

A permanent System-User token was generated in Meta on 2026-08-10. That changes
nothing on its own: `WHATSAPP_ACCESS_TOKEN` has to be updated on the Railway
service **and** the service redeployed. `send_template` fails silently by design
— it logs a warning and returns, never raises — so a stale token is
indistinguishable from a working one without testing.

```bash
manage.py send_test_whatsapp <mobile> --template booking_confirmation
```

Proves it end to end with no test booking and no real money.

### 3. Ship the mobile app 🟠

`5b11bd7` is committed in the app repo and changes nothing for patients until an
EAS build goes out. **First check the EAS build list for what is actually in the
store** — `app.json` uses `appVersionSource: "remote"` and the repo has no tags,
so the repo cannot tell you. If the last production build predates 2026-08-05,
patients are running a checkout that no longer matches the backend, and that
outranks everything else on this page.

### 4. Watch the first day live 🟡

- `grep oversold_refund` in the Railway logs — any hit means a patient was
  charged and auto-refunded, and it is worth knowing why
- the hospital dashboard still shows Today / Tomorrow / All correctly

### 5. The item this roadmap has been avoiding 🔴

**27 users · 11 hospitals live · 8 doctors · 4 bookings ever · ₹60 lifetime ·
last booking 2026-07-26.** No doctor has opted into `FULL` collection, so the
payout machinery has never carried a rupee.

A week of hardening went into a load that has not arrived. That was the right
order — capacity, refunds and locking had to exist before patients did — but it
cannot be the next week too. The unresolved question is whether the funnel is
**broken** (a store build older than the backend, a checkout that fails) or
**empty** (nobody arriving). Those need opposite responses and are currently
indistinguishable. Item 3 settles it in an afternoon.

Before starting any new engineering work, answer that question first.

---

## Next

- **Pause the hospital dashboard poll on tab hide** — reuse the existing
  `useVisiblePolling`; patient pages already do this, the dashboard polls all
  day whether or not anyone is looking
- **Backend observability** — new 2026-08-10. There is no error tracking on the
  API and no way to see whether a WhatsApp send succeeded without reading a
  Railway log by hand. Every silent-failure hunt this week cost time that a
  `WhatsAppLog` view in Django admin would have saved outright. Cheap, and it
  pays for itself the first time a notification goes quiet.
- **Raise the 6-char password floor**
- **Branch cleanup** — 12 local branches, several long dead

Resolved and deliberately removed, so they don't get re-added:

- ~~Verify the WhatsApp token is permanent~~ — generated 2026-08-10; the
  remaining half (is it live on Railway?) is item 2 in **Now**.
- ~~Mobile app `/api/bookings/upgrade/` contract~~ — **not a thing.** Audited the
  app repo 2026-08-10: zero references to `upgrade`, and the endpoint isn't in
  `bookings/urls.py` at all. Both this and WORKLOG #9 were chasing a problem
  that doesn't exist.
- ~~Confirm the deploy target~~ — settled. `deploy.yml` runs **tests only**; the
  Render POST steps are gone and the file's own header says so. Railway and
  Vercel each deploy off their GitHub integration.

---

## Later

- **Automated doctor payouts — NOT BEFORE ~OCTOBER 2026, and only if Vishnu says
  so.** Manual is the deliberate design (see `CLAUDE.md`). Don't start this
  because it looks like an obvious improvement; the human checkpoint is the point.
- **Redis cache — deferred 2026-08-09, on purpose.** The code is ready and
  gated behind `USE_REDIS_CACHE`; the flag is off and no addon is attached.
  At current traffic the database cache table is genuinely fine, and the
  gunicorn worker/thread change is where the throughput actually came from.
  Attach the addon and flip the flag when polling load makes the cache writes
  show up in the DB metrics — not before, and never point it at the stale
  `redis://localhost` already sitting in local `.env` files.
- Server-Sent Events (or push) for queue updates instead of polling — polling is
  what makes concurrent users expensive
- Per-day booking archive/purge so queue tables stay small
- Load-test the checkout path specifically — the only path holding an external
  HTTP call
- Notify-the-beneficiary option for "book for someone else"
- Reword the approved `doctor_unavailable` Meta template to drop "Dr."

---

## Done

- **2026-08-10** — **PR #10 shipped.** `b719378` on `main`, 23 commits,
  +3,985/−99. Vercel production READY; Railway confirmed live via
  `/api/payment/daily-summary/` returning 200 and the Today's check card
  rendering on `/Adashboard`. All three migrations applied.
- **2026-08-10** — **The CI flake, diagnosed and fixed** (`dcd4c16`).
  `database table is locked` was a leaking notification thread — but
  `_dispatch_booking_notifications` was only the **first of three** sources.
  `_notify_doctor_payout_async` (mark-paid) and `_notify_doctor_unavailable`
  (availability toggle) were never patched, and were making real outbound
  WhatsApp calls during the suite. Reproduced ~1 run in 4; 57 consecutive green
  runs after. The generalisation is now in `CLAUDE.md`: every `threading.Thread`
  in a view is a test-isolation hazard, and a verbose run with zero
  `graph.facebook.com` lines is the check that proves it.
- **2026-08-10** — **Mobile app checkout fixed** (`5b11bd7`, app repo). Three
  fixes: `create-order/` now sends `date`/`slot` top-level so a full slot is
  refused *before* charging; the error handler reads the server's message rather
  than axios's `"Request failed with status code 409"`; `/verify/` no longer
  retries a 4xx. `tsc` clean, jest 100/100. **Not shipped — needs an EAS build.**
- **2026-08-10** — **Two roadmap items deleted as non-issues.** The app is fully
  on Razorpay (WORKLOG line 7 was stale) and never calls `/api/bookings/upgrade/`.
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
