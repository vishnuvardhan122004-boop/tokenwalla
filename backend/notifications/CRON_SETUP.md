# WhatsApp appointment-reminder cron (Railway)

The reminder is **not** sent inline like the booking confirmation — it is sent by a
scheduled management command that must run every ~10 minutes:

    python manage.py send_appointment_reminders

It finds `CONFIRMED` bookings whose slot starts in ~1h50m–2h10m and sends one WhatsApp
reminder each (idempotent — `reminder_sent` flag prevents duplicates).

## One-time Railway setup

> **Critical:** the cron service must use its own config file, `railway.cron.json`.
> Railway's config-as-code overrides the dashboard, so the root `railway.json`
> (`startCommand: gunicorn …`) will hijack a cron service that uses the default
> config — it would boot a web server instead of the reminder command and never
> send anything.

1. Open the backend project in Railway → **New → GitHub Repo** → pick this same repo
   (`vishnuvardhan122004-boop/tokenwalla`). This creates a second service.
2. On the new service → **Settings → Config-as-code → Railway Config File**, set the
   path to an **absolute path from the repo root**. Railway does NOT prefix this field
   with the service's Root Directory, so a bare `railway.cron.json` fails to resolve
   ("service config at 'railway.cron.json' not found") and the deploy dies at snapshot:

       backend/railway.cron.json

   Also set the service's **Root Directory** to `backend` so `manage.py` is found at
   run time.
   That file already contains the start command (`python manage.py
   send_appointment_reminders`), the schedule (`*/10 * * * *`), and
   `restartPolicyType: NEVER` (so it doesn't loop after the command exits).
   You do **not** need to set a Custom Start Command or Cron Schedule in the dashboard —
   the file supplies both.
3. **Variables** — copy every var from the web service so it hits the same DB and the
   same WhatsApp credentials. Required ones:
   - `DATABASE_URL` (same Postgres as web — reference the shared DB variable)
   - `DJANGO_SETTINGS_MODULE`, `SECRET_KEY`, `DEBUG`
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_REMINDER`,
     `WHATSAPP_TEMPLATE_LANG`
4. Deploy. Each cron tick the container boots, runs the command once, prints
   `Reminder run complete. Sent N reminder(s).`, and exits.

> The web service keeps using the root `railway.json` unchanged — leave its config
> file path alone.

## Verify it's working

- Railway → cron service → **Deployments/Logs**: each run logs the "Reminder run complete" line.
- Django admin → **Notifications → WhatsApp logs**: rows with
  `event_type = appointment_reminder`, `status = sent`.
- Manual dry-run any time (web service shell or locally):

       python manage.py send_appointment_reminders

## Gotchas that silently block real sends (code is fine — check these)

- The Meta template `appointment_reminder` must be **approved** with exactly 6 body
  params in order: patient name, doctor, hospital, date, slot, token.
- `WHATSAPP_TEMPLATE_REMINDER` must be the template **NAME** (`appointment_reminder`),
  **not** a numeric template ID and **not** the booking template's name. A wrong value
  → Meta `132001 template does not exist` and no reminder is sent. Simplest: leave the
  variable unset so the code default (`appointment_reminder`) is used.
- `WHATSAPP_ACCESS_TOKEN` must be a **permanent** System-User token, not a 24h dev token.
- Booking slot strings must be `"HH:MM AM/PM"` (e.g. `09:00 AM`) — the parser expects that.

---

# Doctor ledger cron

One more scheduled management command, set up as its own Railway cron service
exactly like the reminder one above (own config file, Root Directory `backend`,
same DB/env vars):

| Command | Config file | Schedule | Purpose |
|---|---|---|---|
| `python manage.py run_daily_payouts` | `backend/railway.payouts.cron.json` | `0 15 * * *` (daily, 20:30 IST) | Ledger completed bookings so each doctor's outstanding balance is up to date |

Notes:
- **Railway cron schedules are UTC.** `0 15 * * *` is 20:30 IST — late enough
  that Razorpay's settlement for the day has landed. Writing the IST time
  directly (`30 20 * * *`) would run it at 02:00 IST the *next* day, ahead of
  some settlements, and the run would look fine in the logs while ledgering
  less than it should.
- **Nothing is deducted from a doctor or billed to a hospital.** TokenWalla's
  revenue is the patient's service fee, collected at checkout. The amount owed
  is exactly `Payment.doctor_fee`.
- **Idempotent** — safe to re-run: a booking already ledgered is skipped.
- **Payouts themselves are MANUAL.** This command only writes ledger rows. To
  actually pay a doctor, transfer the money from TokenWalla's own bank account
  or UPI, then mark it paid on the admin Doctor Payouts page
  (`/Adashboard/payouts`) so the ledger clears. No payment-gateway payout API
  is involved, and no payout keys or webhooks need configuring.

---

# Doctor-ledger cron (Railway) — `run_daily_payouts`

**Status: this service has never been created.** Everything below is the
one-time setup. Until it exists, completed bookings never get a `DoctorLedger`
row, so doctors simply never appear on the admin payouts page and nothing tells
you — the failure is silent. The admin daily check now raises
`ledger_not_running` when completed bookings sit more than two days without a
ledger row, which is the alarm for exactly this.

    python manage.py run_daily_payouts

**It does not move money.** Doctor payouts are manual by design: this command
only writes the ledger rows that say who is owed what. Vishnu wires the money
from the Slice current account and marks it paid at `/Adashboard/payouts`.

## Setup

Same shape as the reminder cron above, with two differences — the config file
and the schedule:

1. Railway → **New → GitHub Repo** → the same repo. This creates a third service.
2. **Settings → Config-as-code → Railway Config File**:

       backend/railway.payouts.cron.json

   and **Root Directory** = `backend`.

   > Same trap as the reminder cron: the path is from the repo root, not from
   > the Root Directory. A bare `railway.payouts.cron.json` fails to resolve and
   > the deploy dies at snapshot. And without its own config file the service
   > inherits the root `railway.json` and boots gunicorn instead — a web server
   > pretending to be a cron, which looks healthy and does nothing.

3. **Variables** — it needs the database and nothing else exotic:
   - `DATABASE_URL` (the same Postgres as web — reference the shared variable)
   - `DJANGO_SETTINGS_MODULE`, `SECRET_KEY`, `DEBUG`
   - `WHATSAPP_*` only if you want the "payout marked paid" message to send
     from this service too; the mark-paid action itself runs on web.

4. Deploy.

## Schedule

`railway.payouts.cron.json` uses `0 15 * * *`. Railway cron is **UTC**, so that
is **20:30 IST** — deliberately after Razorpay's settlement to our account has
landed, so a ledger row is never written for money we haven't received.

Don't "fix" this to `0 20 * * *` thinking it's IST. That would run at 01:30 IST
the next morning and attribute the day's bookings to the wrong day.

## Verify

- Railway → this service → **Logs**: each run prints
  `Ledgered N booking(s). Payouts are manual — see the admin payouts page.`
- Admin → `/Adashboard/payouts`: doctors with completed bookings now appear.
- Admin dashboard → **Today's check**: the `ledger_not_running` alert clears on
  its own once rows are being written.

Idempotent — a booking already `PROCESSING`/`PAID` is skipped, so a double run
cannot double-pay anyone.
