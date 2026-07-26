# TokenWalla — Work Log

A running record of changes so we can cross-check what's done and what's pending.
Newest entry on top. Update the **Status** columns as things land.

- **Branch:** `main`
- **Latest commit at last update:** `7bd643f`
- **Last updated:** 2026-07-26

### How to update this log
- Add a new `## YYYY-MM-DD — <title>` section **on top** for each working session; keep older sessions below.
- As work lands, flip the **Status** cells (⬜ not started → 🕒 in progress → ✅ done) and tick **Action items** (`- [ ]` → `- [x]`).
- After you commit, bump the two lines above: `Latest commit` = `git rev-parse --short HEAD`, `Last updated` = `date +%Y-%m-%d`.
- Save the log with your work: `git add WORKLOG.md && git commit -m "docs: update worklog"` (then `git push`).
- Keep entries short — one line per change, link the commit hash so it's traceable.

---

## ⏭️ Next session plan (2026-07-27)

**P0 — protect what's already live**
- [ ] Confirm the WhatsApp token is a **permanent System-User token** (not the 24h temp one) — otherwise every WhatsApp send stops tomorrow. Regenerate if unsure and update env on **both** web + cron services.
- [ ] Confirm **web + cron** services are both on the latest commit; run `python manage.py migrate` on web so migration `0008` (queue-payment unique index) is applied.

**P1 — finish WhatsApp**
- [ ] Verify the cron actually fires: cron **Logs** show `Reminder run complete` each tick; do one real ~2h booking end-to-end (WhatsAppLog `status=sent`).
- [ ] Get `hospital_new_booking` **approved** in Meta, then `send_test_whatsapp <mobile> --template hospital_new_booking`.
- [ ] (Optional) Draft + submit `booking_confirmation` — the last of the 4 templates.

**P2 — security follow-ups (from the review)**
- [ ] **#9:** update the **mobile app** to send `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature` to `/api/bookings/upgrade/` (the old bare `payment_id` now returns 400).
- [x] **SMS-send abuse** protection on `RequestOTP` — per-number **daily send cap** (10/day, atomic `add`+`incr`), returns 429 past the cap. Test `test_daily_send_cap_blocks_sms_flood` (22/22 pass).
- [ ] Toward 10/10 (remaining): move cache to **Redis** (needs a Railway Redis addon — the `CACHES` block is currently `DatabaseCache` despite the "Redis" header comment), raise the **6-char** password floor.

**P3 — polish (optional)**
- [ ] Reword the approved `doctor_unavailable` Meta body to drop "Dr." (cosmetic consistency with the app).

---

## 2026-07-26 (session 2) — Ticket download, "book for someone else", OTP cap, show-password

> Spans **three** repos: this website, the backend (`backend/`), and the **mobile app**
> (`~/Desktop/app /Tokenwalla`, remote `tokenwalla.app.git`). Mobile changes are tracked
> in that repo, noted here for cross-reference.

### 1. Book for someone else  ← NEW feature
Account holders can book an appointment for another person (**name + phone**).
Notifications still go to the account holder; the **hospital** sees the beneficiary.

| Layer | Change | Status |
|-------|--------|--------|
| Backend | `Booking.booked_for_name` / `booked_for_mobile` + `patient_display_name/mobile` props (migration `0009`) | ✅ |
| Backend | `_handle_new_booking` reads/validates `bookedForName`/`bookedForMobile`; serializer surfaces `patient_name`→beneficiary, `patient_mobile`, `is_for_other` | ✅ |
| Backend | QR-scan result, "in consultation" message, and `hospital_new_booking` WhatsApp show the beneficiary | ✅ |
| Website | `Payment.js` toggle + name/phone fields + validation; `MyBookings.js` "For <name>" chip + ticket uses beneficiary | ✅ |
| Mobile | `payment.tsx` toggle (`Switch`) + fields + validation; `my-bookings.tsx` "For <name>" tag | ✅ |
| Tests | `BookForOtherTests` — 4 cases (beneficiary stored, self fallback, mobile-without-name ignored, serializer) | ✅ |

**Decisions:** fields = name + phone; notifications → account holder only.

### 2. Downloadable appointment ticket  ← NEW feature
- **Website:** `services/downloadTicket.js` renders a PNG ticket (token + details + QR)
  via `QRCodeCanvas` + canvas (no heavy dep — `react-dom/client`, ~+5 kB). Buttons on
  `BookingToken.js` (confirmation) and `MyBookings.js`.
- **Mobile:** `my-qr.tsx` + `booking-token.tsx` capture the card with `react-native-view-shot`
  and open the share sheet via `expo-sharing`. i18n key `download_ticket` in en/hi/te/kn.
  ⚠️ **Needs a dev-client/EAS rebuild** (new native modules).

### 3. OTP daily SMS-send cap (security)
- Per-number **daily send cap** (10/day, atomic `add`+`incr`) on `RequestOTP` → 429 past cap.
  Test `test_daily_send_cap_blocks_sms_flood`.

### 4. Login show/hide password toggle
- `Login.js` + `authStyles.js` — eye toggle on the patient login password field.

**Tests:** `python manage.py test tokenwalla.tests_security` → **26/26 pass**.
**Website:** `npm run build` → Compiled successfully. **Mobile:** `tsc --noEmit` → 0 errors.

> ⏭️ Not done: runtime end-to-end test of the payment/book-for-other flow on each platform;
> notify-the-beneficiary option; rebuild the mobile dev client for the download + book-for-other UI.

---

## 2026-07-26 — Security review + "Dr." cleanup + WhatsApp notifications

### 1. Security review fixes (all committed in `558c77e`)

A max-effort code review of the last commit surfaced 15 findings; 2 extra
hardening items were added on request. Status below.

| # | Area | Issue | Status |
|---|------|-------|--------|
| 1 | OTP | Login endpoints could burn a victim's in-flight OTP (DoS keyed on phone number) | ✅ Fixed |
| 2 | OTP | Attempt-cap counter was non-atomic (brute-force race) | ✅ Fixed (atomic incr) |
| 3 | OTP | `hmac.compare_digest` crashed (500) on non-ASCII input | ✅ Fixed (byte-safe) |
| 4 | Payments | `payment_id` reuse was a TOCTOU check with no DB uniqueness | ✅ Fixed (dedicated field + partial unique index, migration `0008`) |
| 5 | OTP | Shared 5/min throttle 429'd normal logins / NAT-locked users | ✅ Fixed (`otp_verify` scope, 30/min) |
| 6 | Payments | Queue upgrade overwrote the booking's original payment fields | ✅ Fixed (separate `queue_payment_id`/`queue_order_id`) |
| 7 | Payments | Queue price duplicated in two files (drift risk) | ✅ Fixed (shared `payments/razorpay_utils.py`) |
| 8 | Payments | `int(order amount)` could 500 on a None amount | ✅ Fixed (`or 0`, inside try) |
| 9 | Payments | Upgrade endpoint contract change breaks legacy clients | ⚠️ **Skipped (intentional)** — see Action Items |
| 10 | Payments | Razorpay verify logic duplicated from `VerifyPaymentView` | ✅ Fixed (shared helper) |
| 11 | Tests | No test for successful/mismatch/reused queue upgrade | ✅ Fixed (3 new tests) |
| 12 | Frontend | "Dr." removed in 2 spots only → inconsistent | ✅ Fixed (full sweep, see §2) |
| 13 | Config | `DEBUG` default flipped to False with no template | ✅ Fixed (`backend/.env.example`) |
| 14 | Tests | Shared LocMemCache without `cache.clear()` (flaky throttle) | ✅ Fixed |
| 15 | Cleanup | `_register_otp_failure` dead return value | ✅ Fixed |
| H1 | Access | `create-admin` used non-constant-time key compare + no throttle | ✅ Fixed (constant-time + `admin_setup` 10/hr throttle) |
| H2 | Access | Any hospital could edit/delete another hospital's doctor | ✅ Fixed (per-hospital object ownership) |

**Tests:** `python manage.py test tokenwalla.tests_security` → **21/21 pass**.
**Security posture:** ~**9/10** (see §4 for what's left).

### 2. "Dr." prefix removal — app-wide consistency

Doctor names now render **without** a hard-coded `Dr.` prefix everywhere the user
sees them (names may already include a title). Committed across
`d56d4f9`, `93aa415`, `ec6ed76`.

- **Patient UI:** Hero, AllDoctor, BookingToken, BookingQR, DoctorsDetails, Payment, MyBookings.
- **Staff UI:** hospital dashboard, QR scanner, admin doctor table + edit modal.
- **Prose/toasts/payment descriptions:** cancel & reschedule dialogs, Razorpay descriptions, share text, availability + delete toasts.
- **i18n demo card:** en / hi / kn / te.
- **Backend:** `Doctor.__str__`, admin force-delete action, `force_delete` API message, push-notification bodies; add-doctor placeholder `"Dr. John Smith"` → `"John Smith"`.
- **Left on purpose:** image `alt` text (non-visible), and announcement *example* placeholders (hospital-authored prose, e.g. "Dr. Ravi on leave Friday").

### 3. WhatsApp notifications

Backend already sends templates by name (see `backend/notifications/whatsapp.py`);
text lives in **Meta**, code only fills the `{{ }}` at send time. Doc of record:
`backend/notifications/WHATSAPP_TEMPLATES.md`.

| Template | Purpose | Meta status |
|----------|---------|-------------|
| `doctor_unavailable` | Patient: doctor unavailable, free reschedule | ✅ **Approved** |
| `hospital_new_booking` | Hospital team: new booking (now incl. patient **mobile**) | 🕒 Submitted (reworded to sentence form to pass review) |
| `booking_confirmation` | Patient: booking confirmed | ⬜ Not yet submitted (no body drafted yet) |
| `appointment_reminder` | Patient: ~2h reminder (cron) | ✅ **Approved + verified sending** (test `message_id` received 2026-07-26) |

- Added patient mobile as `{{3}}` in `hospital_new_booking` (`b5a7b27`).
- Reworded `hospital_new_booking` to sentence form — Meta's auto-review rejects
  variable-heavy `Label: {{n}}` bodies; the word "Token" trips the OTP classifier (`3f0610c`).
- Added `python manage.py send_test_whatsapp <mobile> [--template ...]` to verify
  credentials without a real booking (`77ca692`).
- Env: `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` reportedly set.

---

## 4. Action items / still pending

**WhatsApp go-live**
- [x] `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` set on the server; services redeployed.
- [x] Test send verified — `send_test_whatsapp ... --template appointment_reminder` returned a `message_id`.
- [x] `appointment_reminder` approved and sending.
- [x] Cron service Config File path fixed to `/backend/railway.cron.json` (Root Directory `backend`); deploy succeeds.
- [ ] Verify the token is a **permanent** System-User token (not the 24h temp one) so it doesn't expire.
- [ ] Confirm the cron actually fires: cron logs show `Reminder run complete`, and a real ~2h booking lands (WhatsAppLog `status=sent`).
- [ ] Get `hospital_new_booking` **approved** (submitted, sentence form).
- [ ] (Optional) Draft + submit `booking_confirmation`.

**Security follow-ups**
- [ ] **#9:** Update the out-of-repo **mobile app** to send `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature` to `/api/bookings/upgrade/` before deploying (old bare `payment_id` now returns 400).
- [ ] Toward 10/10: move cache to **Redis** (fully-atomic OTP counter), raise the 6-char password floor, add SMS-send abuse protection on `RequestOTP`.

---

## Commit log (this session, on top of `bb4eeb6`)

| Commit | When | Summary |
|--------|------|---------|
| `77ca692` | 2026-07-26 00:55 | Add `send_test_whatsapp` management command |
| `3f0610c` | 2026-07-26 00:44 | Reword `hospital_new_booking` to sentence form (Meta review) |
| `b5a7b27` | 2026-07-26 00:33 | Include patient mobile in `hospital_new_booking` |
| `ec6ed76` | 2026-07-26 00:31 | Drop "Dr." in add-doctor placeholder + backend renders |
| `93aa415` | 2026-07-26 00:26 | Sweep remaining "Dr." (prose, toasts, payment, i18n) |
| `d56d4f9` | 2026-07-26 00:15 | Drop "Dr." in staff dashboards |
| `558c77e` | 2026-07-26 00:10 | Security-review fixes (OTP, payments, access control) |

## How to verify

```bash
# Backend security regression suite
cd backend && python manage.py test tokenwalla.tests_security

# Django config / migration state
python manage.py check
python manage.py makemigrations --check --dry-run

# Fire a test WhatsApp (needs env vars set)
python manage.py send_test_whatsapp 9XXXXXXXXX --template doctor_unavailable
```
