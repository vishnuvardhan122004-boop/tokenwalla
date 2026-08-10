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

**PR #10 is open and CI is RED.** Branch `fix/enforce-slot-capacity`, 20 commits,
pushed. Website job passes; the backend job fails. Nothing merges until it's green.

### 1. Get PR #10's backend job green 🔴

Open the Backend tests job on the PR, search the log for `ERROR:` or `FAIL:`,
and read the traceback under it.

**If it says `database table is locked`** — another test is leaking the
notification background thread. See "Four traps" in `CLAUDE.md`; the fix is to
patch `payments.views._dispatch_booking_notifications` on the offending class.
One fix for this already landed (`1aa50cc`) and was not enough, so look for a
second offender rather than assuming it's the same one.

**If it says anything else** — it's a real failure the local suite didn't hit.

A single local run proves nothing here; this class of flake is roughly 1-in-7.
Loop it:

```bash
cd backend
export SECRET_KEY=ci DEBUG=True DATABASE_URL="sqlite:///test.db"
for i in $(seq 1 15); do
  out=$(python manage.py test 2>&1)
  echo "$out" | grep -q '^FAILED' && { echo "run $i FAILED"; echo "$out" | grep -A 25 -E '^(ERROR|FAIL): '; break; }
done
rm -f test.db
```

### 2. Then merge 🔴

Everything in the branch is done code; none of it protects a patient until it
is on `main`.

Then `/ship` for the gate, open the PR, let CI run, merge.

**There IS one migration: `users/0003_ratecounter`.** It is a plain
`CreateModel` — a new table, nothing dropped or renamed — so it is safe under
the additive-only rule and safe to run BEFORE the code that uses it, which is
the order Railway does it in. No existing booking, payment or ledger row is
touched.

CI now runs on the PR itself (it used to run only after a merge, which was too
late to stop anything), and gates on `makemigrations --check`.

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

### ~~3. Delete the zombie reminder cron~~ ✅ 2026-08-09 — deleted

Audited on Railway and removed. Kept for the record of what to look for:



`tokenwalla-reminders-cron` on Railway is a duplicate of the working
`send_appointment_reminders` service, and it is dead:

- its active deployment is from **2026-07-26** — 14 days stale
- every deployment since has **failed**: `service config at 'railway.cron.json'
  not found` (the path needs the `backend/` prefix)
- its logs contain only `Starting Container`, every 10 minutes, all day, with no
  application output at all

It boots a container 144 times a day and does nothing. Delete the service.
`send_appointment_reminders` is the correctly-wired one — leave that alone.

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
