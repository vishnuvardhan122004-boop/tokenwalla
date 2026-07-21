# WhatsApp appointment-reminder cron (Railway)

The reminder is **not** sent inline like the booking confirmation — it is sent by a
scheduled management command that must run every ~10 minutes:

    python manage.py send_appointment_reminders

It finds `waiting` bookings whose slot starts in ~1h50m–2h10m and sends one WhatsApp
reminder each (idempotent — `reminder_sent` flag prevents duplicates).

## One-time Railway setup

1. Open the backend project in Railway → **New → GitHub Repo** → pick this same repo
   (`vishnuvardhan122004-boop/tokenwalla`). This creates a second service that shares
   the build but runs on a schedule.
2. On the new service → **Settings → Deploy → Custom Start Command**, set:

       python manage.py send_appointment_reminders

   (This overrides the `gunicorn` start command inherited from `railway.json`.)
3. **Settings → Cron Schedule**:

       */10 * * * *

4. **Variables** — copy every var from the web service so it hits the same DB and the
   same WhatsApp credentials. Required ones:
   - `DATABASE_URL` (same Postgres as web — reference the shared DB variable)
   - `DJANGO_SETTINGS_MODULE`, `SECRET_KEY`, `DEBUG`
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_REMINDER`,
     `WHATSAPP_TEMPLATE_LANG`
5. Deploy. Each cron tick the container boots, runs the command once, prints
   `Reminder run complete. Sent N reminder(s).`, and exits.

## Verify it's working

- Railway → cron service → **Deployments/Logs**: each run logs the "Reminder run complete" line.
- Django admin → **Notifications → WhatsApp logs**: rows with
  `event_type = appointment_reminder`, `status = sent`.
- Manual dry-run any time (web service shell or locally):

       python manage.py send_appointment_reminders

## Gotchas that silently block real sends (code is fine — check these)

- The Meta template `appointment_reminder` must be **approved** with exactly 6 body
  params in order: patient name, doctor, hospital, date, slot, token.
- `WHATSAPP_ACCESS_TOKEN` must be a **permanent** System-User token, not a 24h dev token.
- Booking slot strings must be `"HH:MM AM/PM"` (e.g. `09:00 AM`) — the parser expects that.
