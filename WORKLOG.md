# TokenWalla — Work Log

A running record of changes so we can cross-check what's done and what's pending.
Newest entry on top. Update the **Status** columns as things land.

- **Branch:** `main`
- **Latest commit at last update:** `b734b10`
- **Last updated:** 2026-07-26

### How to update this log
- Add a new `## YYYY-MM-DD — <title>` section **on top** for each working session; keep older sessions below.
- As work lands, flip the **Status** cells (⬜ not started → 🕒 in progress → ✅ done) and tick **Action items** (`- [ ]` → `- [x]`).
- After you commit, bump the two lines above: `Latest commit` = `git rev-parse --short HEAD`, `Last updated` = `date +%Y-%m-%d`.
- Save the log with your work: `git add WORKLOG.md && git commit -m "docs: update worklog"` (then `git push`).
- Keep entries short — one line per change, link the commit hash so it's traceable.

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
| `booking_confirmation` | Patient: booking confirmed | ⬜ Not yet submitted |
| `appointment_reminder` | Patient: ~2h reminder | ⬜ Not yet submitted |

- Added patient mobile as `{{3}}` in `hospital_new_booking` (`b5a7b27`).
- Reworded `hospital_new_booking` to sentence form — Meta's auto-review rejects
  variable-heavy `Label: {{n}}` bodies; the word "Token" trips the OTP classifier (`3f0610c`).
- Added `python manage.py send_test_whatsapp <mobile> [--template ...]` to verify
  credentials without a real booking (`77ca692`).
- Env: `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` reportedly set.

---

## 4. Action items / still pending

**WhatsApp go-live**
- [ ] Confirm `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` are set on the **server** (Railway vars), then **redeploy/restart**.
- [ ] Verify the token is a **permanent System User token**, not the 24-hour temporary one.
- [ ] If the WhatsApp app is in **Development** mode, add test recipient numbers (Live needs business verification).
- [ ] Test: `python manage.py send_test_whatsapp <your-mobile> --template doctor_unavailable` → expect a `message_id`.
- [ ] Get `hospital_new_booking` **approved** (resubmitted in sentence form).
- [ ] (Optional) Submit `booking_confirmation` + `appointment_reminder`.

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
