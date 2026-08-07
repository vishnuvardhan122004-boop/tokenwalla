# WhatsApp Message Templates — submission guide

TokenWalla sends business-initiated WhatsApp messages through Meta's **WhatsApp
Cloud API**. Every such message must use a **pre-approved template**. This file
is the source of truth for the exact text to submit in **Meta Business Manager →
WhatsApp Manager → Message templates → Create template**.

The template **name** and **language** must match the values the backend sends
(see `tokenwalla/settings.py` → `WHATSAPP_TEMPLATE_*` and
`WHATSAPP_TEMPLATE_LANG`). Body variables `{{1}}`, `{{2}}`, … are filled **in
order** by the `params` list in `notifications/whatsapp.py`.

> After a template is approved, no code change is needed — the backend already
> references it by name. If you submit under a different name, set the matching
> `WHATSAPP_TEMPLATE_*` env var to that name.

---

## 1. `doctor_unavailable`  ← NEW

Sent when a hospital marks a doctor **unavailable** and the patient has an active
booking for that day. Offers a **free** reschedule.
Sender: `notifications.whatsapp.send_doctor_unavailable(booking)`.

| Field | Value |
|-------|-------|
| **Name** | `doctor_unavailable` |
| **Category** | **Utility** (transactional — do **not** pick Marketing; Utility approves faster and is cheaper) |
| **Language** | English (`en`) |
| **Header** | None |
| **Footer** | `TokenWalla` |
| **Buttons** | None (optional: a "Quick reply" button — not required; the app handles rescheduling) |

**Body** (paste exactly):

```
Hi {{1}}, we're sorry — {{2}} at {{3}} is unavailable for your appointment on {{4}} ({{5}}).

Your token {{6}} can be rescheduled at no charge. Open the TokenWalla app, go to My Bookings and tap Reschedule (free) to pick a new time.

Thank you for your patience.
```

**Variable mapping** (order matters — matches the `params` list in code):

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Patient name   | Rahul |
| `{{2}}` | Doctor name    | Anita Rao |
| `{{3}}` | Hospital name  | City Care Clinic |
| `{{4}}` | Appointment date | 2026-07-22 |
| `{{5}}` | Slot           | 10:30 AM |
| `{{6}}` | Booking token  | TW-024607-E90BC0 |

> Meta requires sample values for every variable at submission, and the body must
> not start or end with a variable — the text above satisfies both.

---

## 2. `hospital_new_booking`  ← NEW

Sent to the **hospital team** (the hospital's own WhatsApp number,
`hospital.mobile`) the moment a patient's booking is paid and confirmed. This
runs alongside the Expo push the hospital app already receives — WhatsApp lands
even when the hospital app is closed or its push token is stale.
Sender: `notifications.whatsapp.send_hospital_new_booking(booking)`.

| Field | Value |
|-------|-------|
| **Name** | `hospital_new_booking` |
| **Category** | **Utility** (transactional) |
| **Language** | English (`en`) |
| **Header** | None |
| **Footer** | `TokenWalla` |
| **Buttons** | None |

**Body** (paste exactly):

```
New appointment at {{1}}.

Patient {{2}} (mobile {{3}}) has booked an appointment with {{4}} on {{5}} at {{6}}. Booking reference {{7}}.

Open the TokenWalla hospital app to view the queue.
```

> **Why sentence form, not a `Label: {{n}}` list:** Meta's automated review
> flags variable-heavy, form-like bodies ("This message template will be
> rejected"), and the word **Token** next to a code-like value trips the
> **Authentication/OTP** classifier. Keep the copy conversational and avoid
> "token"/"OTP"/"code" — the variable order below is unchanged, so no code change
> is needed.

**Variable mapping** (order matters — matches the `params` list in code):

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Hospital name  | City Care Clinic |
| `{{2}}` | Patient name   | Rahul |
| `{{3}}` | Patient mobile | 9876543210 |
| `{{4}}` | Doctor name    | Anita Rao |
| `{{5}}` | Appointment date | 2026-07-22 |
| `{{6}}` | Slot           | 10:30 AM |
| `{{7}}` | Booking reference (booking token) | TW-024607-E90BC0 |

> This message is NOT gated on `whatsapp_opt_in` (that flag belongs to the
> patient) — the hospital always wants to hear about a new booking. If the
> hospital has no `mobile` on file the sender simply no-ops.

> Set `WHATSAPP_TEMPLATE_HOSPITAL_NEW_BOOKING` (default `hospital_new_booking`)
> only if you submit the template under a different name.

---

## 3. `booking_confirmation` (existing — for reference)

Sender: `send_booking_confirmation(booking)`. Category: **Utility**, lang `en`.
Params, in order: `{{1}}` patient, `{{2}}` doctor, `{{3}}` hospital,
`{{4}}` date, `{{5}}` slot, `{{6}}` token.

## 4. `appointment_reminder`  ← submit this

Sent ~2 hours before the slot by the cron command `send_appointment_reminders`
(see `notifications/CRON_SETUP.md`). Sender: `send_appointment_reminder(booking)`.

| Field | Value |
|-------|-------|
| **Name** | `appointment_reminder` |
| **Category** | **Utility** |
| **Language** | English (`en`) |
| **Header** | None |
| **Footer** | `TokenWalla` |
| **Buttons** | None |

**Body** (sentence form — paste exactly; avoids the "form-like"/"token" flags):

```
Hi {{1}}, this is a reminder for your appointment with {{2}} at {{3}} on {{4}} at {{5}}.

Please arrive a few minutes early. Booking reference {{6}}. Track your live queue position in the TokenWalla app.
```

**Variable mapping** (order matters — matches the `params` list in code):

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Patient name   | Rahul |
| `{{2}}` | Doctor name    | Anita Rao |
| `{{3}}` | Hospital name  | City Care Clinic |
| `{{4}}` | Appointment date | 2026-07-26 |
| `{{5}}` | Slot           | 10:30 AM |
| `{{6}}` | Booking reference (booking token) | TW-024607-E90BC0 |

---

## 5. `doctor_payout`  ← submit this

Sent when an admin marks a doctor's pending balance as paid on
`/Adashboard/payouts` (`payments.views.MarkPayoutPaidView`). Sender:
`send_doctor_payout_paid(batch)`.

Doctors have **no TokenWalla login** — the `Doctor` model carries a `mobile`,
not a `User` — so there is no push token to send to and WhatsApp is the only
channel that reaches them. Goes to `doctor.mobile`, so no patient
`whatsapp_opt_in` gate applies.

| Field | Value |
|-------|-------|
| **Name** | `doctor_payout` |
| **Category** | **Utility** (transactional) |
| **Language** | English (`en`) |
| **Header** | None |
| **Footer** | `TokenWalla` |
| **Buttons** | None |

**Body** (sentence form — paste exactly):

```
Hi {{1}}, your TokenWalla payout of ₹{{2}} for consultations at {{3}} has been transferred.

Reference {{4}}. Please allow a few hours for it to reflect in your account.
```

**Variable mapping** (order matters — matches the `params` list in code):

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Doctor name | Anita Rao |
| `{{2}}` | Amount paid, 2 decimals | 1250.00 |
| `{{3}}` | Hospital name | City Care Clinic |
| `{{4}}` | Payment reference / UTR (`NA` when the admin left it blank) | UTR123456789 |

> Meta rejects blank template params, so an empty reference is sent as `NA`
> rather than `''`.

Env var: `WHATSAPP_TEMPLATE_DOCTOR_PAYOUT` (default `doctor_payout`).

---

## Submission checklist

1. WhatsApp Manager → **Message templates** → **Create template**.
2. Category **Utility**, language **English**, name exactly as above.
3. Paste the body; add the sample values from the table so review can render it.
4. Submit. Approval is usually minutes to a few hours.
5. Confirm the approved name matches `WHATSAPP_TEMPLATE_DOCTOR_UNAVAILABLE`
   (default `doctor_unavailable`). Override via env var only if you renamed it.
6. Ensure these env vars are set on the server (see `settings.py`):
   `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`.
   Without a token the sender no-ops in dev and logs a warning (never crashes).

## Testing

- Templates only send to numbers that have opted in (`user.whatsapp_opt_in`).
- Every send is recorded in `WhatsAppLog` (`event_type='doctor_unavailable'`,
  `status='sent'|'failed'`), so you can verify delivery in Django admin.
