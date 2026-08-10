# Tasks

Working task list for TokenWalla. `ROADMAP.md` stays the source of truth for
*what ships next*; this file tracks the day-to-day items, including the ones
that aren't code.

**Last updated:** 2026-08-10

---

## Open right now

### 1. Verify the two Railway crons actually ran 🟠

Both services exist as of today, but **a cron service that exists is not a cron
service that works.** Without its own config file a service inherits
`railway.json` and boots gunicorn instead of the command — which looks identical
from the services list, and is exactly how the zombie reminder cron went 14 days
unnoticed logging only `Starting Container`.

- [ ] **Reminders** (`*/10 * * * *`) — checkable immediately, it fires every 10
      minutes. Open the service log and look for real application output.
- [ ] **Payouts** (`0 15 * * *` UTC = **20:30 IST**) — after 20:30 tonight, look for
      `Ledgered 0 booking(s). Payouts are manual — see the admin payouts page.`
      That line appearing **at all** is the proof.
- [ ] Schedule is already correct. If it ever looks wrong, do **not** change it to
      `30 20` — Railway cron is UTC and that bug was fixed once already.

> **The dashboard cannot verify the payouts cron, and I was wrong to say it could.**
> Checked the live card after the merge: it reads "✓ Nothing needs you", so
> `ledger_not_running` is not firing and cannot clear. With no doctor on
> `FULL` collection there are no ledger rows to write either. Tonight's run
> leaves **no trace anywhere in the UI** — the service log is the only signal.

### 2. Confirm the permanent WhatsApp token reached Railway 🟠

Permanent in Meta ≠ in use in production. `WHATSAPP_ACCESS_TOKEN` has to be
updated on the Railway service *and* the service redeployed. `send_template`
fails silently by design — it logs a warning and returns, never raises — so a
stale token looks exactly like a working one.

- [ ] `manage.py send_test_whatsapp <your mobile> --template booking_confirmation`
      — proves it end to end with no test booking and no real money

### 3. Ship the mobile app 🟠

`5b11bd7` is committed but changes nothing for patients until a build goes out.

- [ ] EAS build + submit
- [ ] **First, check the EAS build list for what's actually in the store.**
      `appVersionSource: "remote"` and no git tags, so the repo can't tell you.
      If the last production build predates 2026-08-05, patients aren't even on
      the Razorpay checkout yet — that would outrank everything else here.

### 4. Housekeeping

- [ ] `grep oversold_refund` in the Railway logs — any hit means a patient was
      charged and auto-refunded, worth knowing why
- [ ] Confirm the hospital dashboard still shows Today / Tomorrow / All correctly
- [ ] Authorize the connectors this session couldn't reach: Linear, Slack, Notion,
      Atlassian, Datadog, ClickUp, Monday

---

## The thing the roadmap isn't tracking

Live numbers, 2026-08-10: 27 users · 11 hospitals live · 8 doctors · **4 bookings
ever** · ₹60 lifetime revenue · **last booking 2026-07-26**.

The hardening shipped this week — slot capacity, queue bounds, 3×4 gunicorn, the
Redis-ready cache — is correct work and had to happen before traffic arrives. But
nothing is currently stressing any of it, no doctor has opted into `FULL`
collection, and the payout machinery has never carried a rupee.

- [ ] Decide whether the next session goes to demand — getting the 11 live
      hospitals actually booking — rather than more infrastructure

---

## Next up (from ROADMAP)

- [ ] Pause the hospital dashboard poll on tab hide (reuse `useVisiblePolling`)
- [ ] Raise the 6-char password floor
- [ ] Branch cleanup — 12 local branches, several long dead

---

## Done

### 2026-08-10

- **PR #10 shipped.** `b719378` on `main` — 23 commits, +3,985/−99. Vercel
  production READY; Railway confirmed live via `/api/payment/daily-summary/`
  returning 200 and the Today's check card rendering on `/Adashboard`.
- **The CI flake, diagnosed and fixed** (`dcd4c16`). `database table is locked`
  was a leaking notification thread — but `_dispatch_booking_notifications` was
  only the **first of three** sources. `_notify_doctor_payout_async` (mark-paid)
  and `_notify_doctor_unavailable` (availability toggle) were never patched, and
  were making real outbound WhatsApp calls during the suite. Reproduced ~1 run in
  4; 57 consecutive green runs after. The generalisation is now in `CLAUDE.md`:
  every `threading.Thread` in a view is a test-isolation hazard, and a verbose run
  with zero `graph.facebook.com` lines is the check that proves it.
- **`/ship` gate run clean** — 158 backend + 13 frontend tests, 68 money-path
  tests, no secrets, no debris. Caught that ROADMAP undercounted the migrations:
  **three**, not one (`users/0003_ratecounter` plus two `notifications` ones). All
  additive and safe to run ahead of the code.
- **Mobile app audited and fixed** (`5b11bd7`). Three fixes: `create-order/` now
  sends `date`/`slot` top-level so a full slot is refused *before* charging;
  the error handler reads the server's message instead of axios's useless
  `"Request failed with status code 409"`; `/verify/` no longer retries a 4xx.
  `tsc` clean, jest 100/100.
- **Two roadmap items deleted as non-issues.** The app is fully on Razorpay
  (WORKLOG line 7 was stale), and `/api/bookings/upgrade/` is neither called by
  the app nor present in `bookings/urls.py`.
- Railway crons created; permanent Meta System-User token generated.

### Earlier

- **2026-08-09** — Slot capacity enforced on the money paths; hospital queue
  bounded; gunicorn 3×4; daily ops check on `/Adashboard`; OTP caps moved to the DB
