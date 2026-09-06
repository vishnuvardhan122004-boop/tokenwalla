# ACTIVE TASK SPECIFICATION

**Status**: COMPLETED  
**Date**: 2026-09-06  
**Owner**: Cloud Code Execution Agent  
**Source**: Gemini Spark (AI PM)  

---

## 1. Context & Objectives
1. Fix password regex rejection on web signup (`profilecreate.js`).
2. Add WhatsApp notification fallback for the Appointment Pass expiry nudge (Item 14c).
3. Ensure 100% test pass rate and update `WORKLOG.md`.

---

## 2. Technical Specifications

### Task A: Fix Password Regex (`src/pages/profilecreate.js`)
- **Location**: Around lines 34-35.
- **Problem**: Client-side regex currently rejects standard special characters, blocking valid passwords like `Test@1234` that Django's `validate_password` permits.
- **Requirement**: Update the regex to permit standard symbols (`@$!%*?&#` etc.) so client validation matches backend validation.
- **Verification**: Run `CI=true npm test` to ensure frontend tests pass.

### Task B: Pass Expiry Nudge Delivery Fallback (Item 14c)
- **Location**: Pass expiry reminder command/cron (`REMIND_DAYS_BEFORE = 3`).
- **Problem**: Nudge currently dispatches only Expo push notifications. Active users are web-only and have no push tokens, leaving the reminder silent.
- **Requirement**:
  - Check for user push token. If present, send Expo push.
  - If no push token is present (or if user has `whatsapp_opt_in=True`), dispatch an automated WhatsApp template alert notifying them that their remaining pass visits expire in 3 days.
  - Ensure the notification remains idempotent (do not send duplicate reminders for the same pass validity cycle).
- **Verification**: Add/update unit tests to verify both push and WhatsApp dispatch paths.

---

## 3. Verification & Safety Gates
1. Run backend tests: `python manage.py test` (must pass 495+ tests).
2. Check migrations: `python manage.py makemigrations --check`.
3. Verify zero unhandled exceptions or thread leaks.

---

## 4. Completion Protocol
When all steps are executed and verified:
1. Update **Status** at the top of this file to `COMPLETED`.
2. Append a concise execution summary to `WORKLOG.md`.
3. Create a clean git commit on a feature branch: `fix/web-password-regex-and-pass-nudge`.

---

## 5. Execution Record — 2026-09-06

Both tasks were **already implemented and committed on this branch** before this
file existed. Nothing was re-implemented; the gates below were run to verify.

| Task | Commit | Outcome |
|---|---|---|
| A — password regex | `b2d5dbe` | ✅ done |
| B — pass expiry nudge on WhatsApp | `01f95fd` | ✅ code done · ⏳ **delivery blocked**, see below |
| Gate 3 — thread leak found and fixed | this commit | ✅ done |

**Two corrections to the spec above**, kept here rather than edited into it so
the original ask stays readable:

- **Task A path.** The file is `src/componets/profilecreate.js` (that spelling),
  not `src/pages/`. The fix is `^(?=.*[A-Za-z])(?=.*\d).{6,}$` — a bare `.` and
  deliberately **not** the `@$!%*?&#` whitelist the spec suggests: the server is
  the real gate (`check_password_strength`, min_length 6), and a whitelist only
  moves the bug to the first symbol it forgets (`Test-1234`, `Test_1234`).
- **Task B dispatch shape.** Not push-then-fallback. Both channels fire
  unconditionally in `send_pass_expiry_reminders.py`, and each declines on its
  own terms — push when the patient has no registered `DeviceToken`, WhatsApp on
  `whatsapp_opt_in`. Same delivery outcome, and the decision stays next to the
  thing that knows. Idempotency is the single `expiry_reminder_sent` flag, set
  whether or not either channel got through (conditional on success it would
  re-send every 10 minutes for as long as a channel stayed broken).

**⏳ Task B does not deliver yet, and this file being COMPLETED does not change
that.** The `pass_expiring` Meta template is **not submitted**, so `send_template`
logs a warning, returns, and the run writes a `failed` WhatsAppLog row carrying
Meta's `132001`. Inert, not broken. Submission is manual and is Vishnu's —
paste-ready body in `backend/notifications/WHATSAPP_TEMPLATES.md` §15.
**ROADMAP 14c stays 🔴** and closes on two observations: both `complete` lines in
the Railway cron log, AND one `pass_expiring` WhatsAppLog row reading `sent`.

### Gate results

| Gate | Result |
|---|---|
| `python manage.py test` | **503 passed, 2 skipped** — the 495+ floor is met. Note the baseline recorded in WORKLOG/CLAUDE.md as **500 is stale**; measured 503 twice. |
| `CI=true npx react-scripts test --watchAll=false` | **49 passed**, 11 suites |
| `makemigrations --check` | No changes detected |
| Thread leaks | **One found and fixed.** `payments/tests_scan_checkout.CentrePayoutTests` posts to `/payouts/mark-paid/` without patching `_notify_doctor_payout_async`, and the escaped thread logged `push_to_hospital(1) failed: database table is locked: users_user` — CLAUDE.md trap #1, a flake that lands on an unrelated later test. Patched at class level; the re-run has zero `table is locked` and zero `graph.facebook.com` lines. |

Nothing was pushed, no PR opened, no production anything touched.
