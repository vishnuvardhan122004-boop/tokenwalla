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

> ## Status: read the marker on each section, not this block.
> **Sections 1–7 were verified on 2026-08-16** — each was sent through
> `send_test_whatsapp` against the **live Railway service** and **arrived on a
> real handset**, so their names, language, approval state and param counts are
> all confirmed to match what `notifications/whatsapp.py` sends. Those seven need
> **no** submitting; treat them as a record of what was approved.
>
> **§11 (`scan_report_ready`) is ⏳ NOT SUBMITTED — added 2026-08-18 with scan
> reports. §1–10 are all ✅.**
> Any section marked ⏳ SUBMIT THIS is NOT approved yet and does need
> submitting. Templates get added whenever a new sender is written, so this block
> deliberately does not name a total — check the per-section marker, which is the
> only thing that stays true.
>
> **✅ means approved by Meta. It does not mean proven.** §1–7 carry a *verified*
> date because each actually arrived on a handset; §8–10 have approval only. An
> approved template with mismatched params fails at send time, in production —
> see ROADMAP item 4b.
>
> **An unapproved template is inert, not broken:** `send_template` logs a warning
> and returns, so the paired push still fires and nothing fails.
>
> Verify any one of them with (inside the Railway container, where `/app` *is*
> the backend root — a local run reads the local `.env` token and proves nothing
> about production):
>
> ```bash
> python manage.py send_test_whatsapp <mobile> --template booking_confirmation
> ```
>
> If the command errors with `No built-in sample params`, pass them explicitly
> with `--params` in the order documented in that section.

---

## 1. `doctor_unavailable`  ✅ approved & delivering (verified 2026-08-16)

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

## 2. `hospital_new_booking`  ✅ approved & delivering (verified 2026-08-16)

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

## 3. `booking_confirmation`  ✅ approved & delivering (verified 2026-08-16)

Sender: `send_booking_confirmation(booking)`. Category: **Utility**, lang `en`.
Params, in order: `{{1}}` patient, `{{2}}` doctor, `{{3}}` hospital,
`{{4}}` date, `{{5}}` slot, `{{6}}` token.

## 4. `appointment_reminder`  ✅ approved & delivering (verified 2026-08-16)

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

## 5. `doctor_payout`  ✅ approved & delivering (verified 2026-08-16)

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

## 6. `booking_cancelled`  ✅ approved & delivering (verified 2026-08-16)

Sent when a patient cancels their own booking (`bookings.views.CancelBookingView`).
Sender: `send_booking_cancelled(booking, refund_info)`.

Money moves on this one and the tiered refund is rarely 100%, so the patient
needs a durable record — this is the event most likely to become a support
conversation. Also pushed in-app; WhatsApp is the copy that survives.

| Field | Value |
|-------|-------|
| **Name** | `booking_cancelled` |
| **Category** | **Utility** (transactional) |
| **Language** | English (`en`) |
| **Header** | None |
| **Footer** | `TokenWalla` |
| **Buttons** | None |

**Body** (sentence form — paste exactly):

```
Hi {{1}}, your appointment with {{2}} at {{3}} on {{4}} has been cancelled.

Booking reference {{5}}. {{6}}.
```

**Variable mapping** (order matters — matches the `params` list in code):

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Patient name | Rahul |
| `{{2}}` | Doctor name | Anita Rao |
| `{{3}}` | Hospital name | City Care Clinic |
| `{{4}}` | Appointment date | 2026-08-12 |
| `{{5}}` | Booking reference (token) | TW-024607-E90BC0 |
| `{{6}}` | Refund line | A refund of ₹112.50 will reach you in 5-7 working days |

> `{{6}}` is a **pre-rendered sentence**, not just an amount — Meta templates are
> fixed text, so the refunded / not-refunded wording has to be chosen in code.
> The other value it takes is `No refund was due on this booking`.

Env var: `WHATSAPP_TEMPLATE_BOOKING_CANCELLED` (default `booking_cancelled`).

---

## 7. `booking_no_show`  ✅ approved & delivering (verified 2026-08-16)

Sent when hospital staff mark a patient as a no-show (`bookings.views.NoShowView`).
Sender: `send_booking_no_show(booking)`.

Terminal and non-refundable, and the patient was by definition not there to be
told — so this is the status most often disputed afterwards. The timestamped
WhatsApp record is what settles it.

| Field | Value |
|-------|-------|
| **Name** | `booking_no_show` |
| **Category** | **Utility** (transactional) |
| **Language** | English (`en`) |
| **Header** | None |
| **Footer** | `TokenWalla` |
| **Buttons** | None |

**Body** (sentence form — paste exactly):

```
Hi {{1}}, your appointment with {{2}} at {{3}} on {{4}} was marked as a no-show because the token was not presented.

Booking reference {{5}}. No refund applies to a no-show. You can book again any time in the TokenWalla app.
```

**Variable mapping** (order matters — matches the `params` list in code):

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Patient name | Rahul |
| `{{2}}` | Doctor name | Anita Rao |
| `{{3}}` | Hospital name | City Care Clinic |
| `{{4}}` | Appointment date | 2026-08-12 |
| `{{5}}` | Booking reference (token) | TW-024607-E90BC0 |

Env var: `WHATSAPP_TEMPLATE_NO_SHOW` (default `booking_no_show`).

---

## 8. `queue_advance`  ✅ approved 2026-08-18 (not yet sent to a handset)

Sent when hospital staff call the patient in (`CONFIRMED/WAITING → IN_PROGRESS`),
from both the dashboard Call button and the QR scanner. Push already covers this;
WhatsApp reaches the patient who booked from the **website** or never installed
the app.

**Time-critical** — the patient has to walk in now, so keep the body short.

```
Hi {{1}}, you're next! {{2}} at {{3}} is ready to see you now.

Booking reference {{4}}. Please head to the reception desk.
```

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Patient name | Rahul |
| `{{2}}` | Doctor name | Anita Rao |
| `{{3}}` | Hospital name | City Care Clinic |
| `{{4}}` | Booking reference (token) | TW-024607-E90BC0 |

Env var: `WHATSAPP_TEMPLATE_QUEUE_ADVANCE` (default `queue_advance`).

---

## 9. `booking_on_hold`  ✅ approved 2026-08-18 (not yet sent to a handset)

Sent when staff put a waiting patient on hold, so the queue visibly moves past
them. Must say they are **still in the queue** — a patient who thinks they were
dropped walks out.

```
Hi {{1}}, your place in the queue for {{2}} at {{3}} is on hold — the doctor has been called away briefly.

You have NOT lost your turn. Booking reference {{4}} is still active and staff will call you shortly.
```

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Patient name | Rahul |
| `{{2}}` | Doctor name | Anita Rao |
| `{{3}}` | Hospital name | City Care Clinic |
| `{{4}}` | Booking reference (token) | TW-024607-E90BC0 |

Env var: `WHATSAPP_TEMPLATE_ON_HOLD` (default `booking_on_hold`).

---

## 10. `hospital_cancellation`  ✅ approved 2026-08-18 (not yet sent to a handset)

Goes to the **hospital**, not the patient — the other half of
`hospital_new_booking`. The hospital is told when a booking arrives, so it should
be told when one goes away and the slot can be reused. Never gated on the
patient's `whatsapp_opt_in`.

```
A booking at {{1}} has been cancelled.

Patient {{2}} with {{3}} on {{4}} at {{5}} is cancelled. Booking reference {{6}}. The slot is free again.
```

| Placeholder | Meaning | Sample value for review |
|-------------|---------|-------------------------|
| `{{1}}` | Hospital name | City Care Clinic |
| `{{2}}` | Patient name | Rahul |
| `{{3}}` | Doctor name | Anita Rao |
| `{{4}}` | Appointment date | 2026-08-12 |
| `{{5}}` | Slot | 10:30 AM |
| `{{6}}` | Booking reference (token) | TW-024607-E90BC0 |

Env var: `WHATSAPP_TEMPLATE_HOSPITAL_CANCELLED` (default `hospital_cancellation`).

> **Meta's two hard content rules, learned by being rejected on 2026-08-16.**
> These are enforced at submission — not review — so a body that breaks them
> never even reaches a reviewer:
>
> 1. **A body may not start OR end with a variable.** `queue_advance` was
>    rejected with *"Leading or trailing params not allowed"* because it ended
>    `Booking reference {{4}}.` — the trailing full stop does **not** count as
>    text. Fixed by moving the reference earlier so the message ends on a real
>    sentence. `hospital_cancellation` had the mirror-image problem: it opened
>    with `{{1}}:` and now opens `A booking at {{1}} …`.
> 2. **Pick Utility, not the default.** The wizard defaults to **Marketing**,
>    which costs more and needs marketing opt-in. Confirm the category shown
>    under the template name before submitting.
>
> The bodies below are the ones **actually submitted**, so they can be pasted
> as-is. Param order is unchanged throughout — no code change was needed.

> **Wording note, 2026-08-16:** all three bodies originally said "token {{n}}"
> and were reworded to **"Booking reference {{n}}"** before submission. §2 of
> this file already records why — the word *token* beside a code-like value trips
> Meta's **Authentication/OTP** classifier and gets the template rejected — and
> the two templates that sailed through review (§4, §7) both use "Booking
> reference". Only the copy changed; the param order is untouched, so no code
> change was needed.

> **Approved 2026-08-18 — all three cleared Meta review.** No code change was
> needed: the names already match the `WHATSAPP_TEMPLATE_*` defaults and the
> param order never moved. They are now live senders, not inert ones.
>
> **Still unproven on a handset.** §1–7 carry a "verified" date because each was
> actually delivered; these three have only Meta's approval. Send one of each to
> close that gap:
> `send_test_whatsapp <mobile> --template queue_advance` (sample params for all
> three are built into the command).

---

## 11. `scan_report_ready`  ⏳ SUBMIT THIS (added 2026-08-18, not yet submitted)

Sent when a scanning centre uploads a result file for a completed scan booking
(`POST /api/bookings/<id>/reports/`). The push half fires today regardless, so
until this is approved the patient is still told — just on one channel.

**Category: Utility.** Language: `en`.

**Carries NO link, deliberately.** The report is medical PII and is served only
behind an ownership check. A WhatsApp message is forwardable, so a URL in it
would hand the report to whoever the message reaches. The patient opens the app
or the site, where their session proves who they are.

Params, in the order `notifications.whatsapp.send_scan_report_ready` sends them:

| | |
|---|---|
| `{{1}}` | patient name |
| `{{2}}` | scan name (e.g. "MRI Brain") |
| `{{3}}` | centre name |
| `{{4}}` | booking reference |

Suggested body — note it opens and closes with text, never a variable, which is
the rule that got §8–10 rejected the first time:

```
Hello {{1}}, your report for {{2}} at {{3}} is ready. Booking reference {{4}}.
Open TokenWalla to view and download it. Please contact the centre if you have
any questions.
```

**"Booking reference", never "token"** — the word *token* beside a code-like
value trips Meta's Authentication/OTP classifier (see §2).

Verify after approval:

```bash
python manage.py send_test_whatsapp <mobile> --template scan_report_ready
```

Sample params are built into the command.

## Submission checklist

1. WhatsApp Manager → **Message templates** → **Create template**.
2. Category **Utility**, language **English**, name exactly as above.
3. Paste the body; add the sample values from the table so review can render it.
   **Type the body by hand, do not paste `{{1}}` into the composer.** The editor
   auto-closes braces, so typing `{{1}}` yields `{{1}}1}}`. Either type `{{1`
   and let it close itself, or use the **+ Add variable** button — but note that
   button trims the space before the variable, so check the preview pane reads
   `Hello {{1}}, ...` and not `Hello{{1}}, ...` before submitting.
4. Submit. Approval is usually minutes to a few hours. **Re-open the list and
   confirm the row is actually there** — a failed submit can return you to the
   list looking like it worked.
5. Confirm the approved name matches the `WHATSAPP_TEMPLATE_*` setting that the
   sender reads — they are listed in `settings.py` around line 318. For §11 that
   is `WHATSAPP_TEMPLATE_SCAN_REPORT` (default `scan_report_ready`); for §1–10
   the name is the section heading. Override via env var only if you renamed it.
6. Ensure these env vars are set on the server (see `settings.py`):
   `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`.
   Without a token the sender no-ops in dev and logs a warning (never crashes).

## Testing

- Templates only send to numbers that have opted in (`user.whatsapp_opt_in`).
- Every send is recorded in `WhatsAppLog` (`event_type` matches the sender —
  e.g. `'scan_report_ready'`, `'doctor_unavailable'`; `status='sent'|'failed'`),
  so you can verify delivery in Django admin. A `failed` row's `error` field
  carries Meta's reason — `132001` means the template is not approved under that
  exact name.
