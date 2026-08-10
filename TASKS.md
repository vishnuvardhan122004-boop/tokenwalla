# Tasks

Working task list for TokenWalla. `ROADMAP.md` stays the source of truth for
*what ships next*; this file tracks the day-to-day items, including the ones
that aren't code.

**Last updated:** 2026-08-10

---

## Today — 2026-08-10

- [x] Reproduce PR #10's backend CI failure locally (`database table is locked`, ~1 run in 4)
- [x] Find the second and third thread leakers — payout mark-paid and the doctor-unavailable toggle
- [x] Patch them; 57 consecutive green runs (`dcd4c16`)
- [x] Replace the last hard-coded date literal (`payments/tests_integration.py`)
- [ ] **Remove the stale `.git/index.lock`** — a zero-byte lock is blocking all commits
- [ ] Commit the ROADMAP / CLAUDE.md / TASKS.md edits (staged and ready on disk)
- [ ] **Push `fix/enforce-slot-capacity`** — `origin` is still 2 commits behind, so PR #10
      has never seen either fix. This is the whole reason CI is red.
- [ ] `/ship` gate, then merge PR #10 — nothing in the branch protects a patient until it's on `main`

## Blocked on Vishnu (dashboard work, not code)

- [x] Create the Railway cron service for `backend/railway.cron.json` — appointment reminders, every 10 min
- [x] Create the Railway cron service for `backend/railway.payouts.cron.json` — `run_daily_payouts`, 20:30 IST
- [x] Generate a permanent Meta System-User token
- [ ] **Confirm the permanent token is actually in Railway**, not just created in Meta —
      `WHATSAPP_ACCESS_TOKEN` must be updated on the service and the service redeployed.
      Creating it in Meta alone changes nothing.
- [ ] Authorize the connectors this session couldn't reach: Linear, Slack, Notion, Atlassian, Datadog, ClickUp, Monday

## Tonight — first ever `run_daily_payouts` run (20:30 IST)

`run_daily_payouts` has **no date filter**: it sweeps every COMPLETED +
PAYOUT_PENDING booking that has ever existed. Tonight's first run therefore
ledgers the whole backlog at once, not just today's.

- [ ] After 20:30 IST, read the cron service log — the `Ledgered N booking(s)` line
- [ ] Open `/Adashboard/payouts` and **eyeball the totals before wiring anyone money**.
      A number that looks too big is expected on the first run; a number that looks
      wrong is worth stopping for.
- [ ] Confirm the `ledger_not_running` alert on the admin dashboard clears

## The day after merge — watch it

- [ ] Confirm the `ledger_not_running` alert clears once the payouts cron runs
- [ ] `grep oversold_refund` in the Railway logs — any hit means a patient was charged and refunded
- [ ] Check the hospital dashboard still shows Today / Tomorrow / All correctly

## Next up (from ROADMAP)

- [ ] Verify the WhatsApp token is a permanent System-User token, not the 24h temp one — if it's temporary, every notification is already silently dead
- [ ] Mobile app `/api/bookings/upgrade/` contract — still sends bare `payment_id`, which now returns 400. Installed apps are broken on this path
- [ ] Pause the hospital dashboard poll on tab hide (reuse `useVisiblePolling`)
- [ ] Raise the 6-char password floor
- [ ] Branch cleanup — 12 local branches, several long dead

## Done

- **2026-08-10** — PR #10's CI flake diagnosed and fixed (`dcd4c16`)
- **2026-08-09** — Slot capacity enforced on the money paths; hospital queue bounded; gunicorn 3×4; daily ops check on `/Adashboard`; OTP caps moved to the DB
