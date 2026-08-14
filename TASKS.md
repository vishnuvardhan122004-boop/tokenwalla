# Tasks

Working task list for TokenWalla. `ROADMAP.md` stays the source of truth for
*what ships next*; this file tracks the day-to-day items, including the ones
that aren't code.

**Last updated:** 2026-08-11

---

## Open right now

### 00. Two live production bugs, fixed in the working tree 2026-08-11 🔴

Found by probing the live API. Both are patient-facing and both would be found
within hours by a promotion. **Uncommitted** — the stale `.git/index.lock`
blocked the commit again.

**1. `[TEST] Demo Hospital` was publicly visible.** `/api/doctors/` returned its
doctor "Heyi" to anonymous callers alongside the real ones, and there was no
test-hospital filter anywhere in `doctors/views.py`. That doctor is the **only**
row in the system with `payment_collection_mode='FULL'`, so a patient could be
charged **₹388.37** for an appointment that does not exist — and TokenWalla
would then owe a payout against it. Fixed: `hospitals/models.py` gains
`TEST_HOSPITAL_PREFIX` + `exclude_test_hospitals()` + `show_test_hospitals_to()`;
applied to the public doctor and hospital lists. Staff and admins still see them.
9 new tests, including the case where the demo hospital's id is passed directly
as a filter (hiding it from the list is not enough on its own).

**2. `anon` throttle raised 60/min → 300/min**, env-overridable via `ANON_RATE`.
AnonRateThrottle keys on client IP, and Indian carrier NAT puts a whole
neighbourhood behind one address — four or five simultaneous visitors exhausted
the bucket and everyone behind that carrier got 429s. Under a campaign that
reads as "nobody is booking" rather than "we are turning them away". Note the
sting: the counter only became *accurate* when Redis went live, because
`DatabaseCache.incr` is a read-modify-write that under-counted. The cutover
quietly tightened a limit that had never really bitten.

- [ ] Clear `.git/index.lock`, branch off `feat/app-version-gate` (it touches the
      same `DEFAULT_THROTTLE_RATES` block, so basing on it avoids a conflict),
      commit, PR
- [ ] **Review the `OTP_MAX_SENDS_PER_IP_PER_DAY=200` ceiling on
      `feat/app-version-gate` before merging.** Same CGNAT logic applies, and a
      *daily* per-IP cap is harsher than a per-minute one — 200 OTP sends across
      a whole carrier could stall signups city-wide mid-campaign. The per-number
      DB cap is the real spend control; this one may want to be much higher.

Backend suite: **167 tests** (158 + 9), 10 consecutive green runs,
`makemigrations --check` clean, no migration needed.

### 0. Merge the three branches — everything is blocked on this 🔴

Written, pushed, CI-green, **not merged**. No PRs exist yet; the branches need
one opened. Order matters.

- [ ] `feat/app-version-gate` (backend, 3 commits) — **first**, it carries the
      `/health/` probe needed to verify Redis and the `/api/app-version/`
      endpoint the app build expects
- [ ] `perf/dashboard-visible-polling` (web, 1 commit)
- [ ] `payments-server-priced-checkout` (app, 13 commits) — then the EAS build
- [ ] `docs/wrap-2026-08-11` (docs, 2 commits — includes the 2026-08-10 wrap
      that was never pushed)

### ~~0b. Turn on Redis~~ ✅ 2026-08-11 — already done, verified live

**Do not do this again.** Checked the Railway dashboard directly: the Redis
service exists, is Online with a `redis-volume`, `REDIS_URL` and
`USE_REDIS_CACHE` are both on the backend service, and the canvas shows a
reference edge from `tokenwalla` → `Redis` (so it is a `${{...}}` reference, not
a pasted string).

**Proof it is actually serving, not silently falling back to the DB cache:** the
Redis data browser currently holds live Django keys —
`:1:throttle_user_…` and `:1:throttle_anon_…`, ttl 41. The `:1:` prefix is
Django's cache key version. Nothing writes those unless the Redis backend is
the active cache.

The `/health/` probe on `feat/app-version-gate` is still worth merging, but it
is now a convenience rather than the only way to know.

### ~~1. Verify the two Railway crons~~ ✅ 2026-08-11 — both confirmed working

Read both service logs on the Railway dashboard. Neither is a zombie.

- **Payouts** — ran `2026-08-10 20:31:57`, 3s, succeeded. Log line verbatim:
  `Ledgered 0 booking(s). Payouts are manual — see the admin payouts page.`
  Schedule shows "Runs at 03:00 pm (UTC)" = 20:30 IST. Correct.
- **Reminders** — firing every 10 minutes without a gap, from 2026-08-10 13:00
  through 2026-08-11 14:50, each one logging
  `Reminder run complete. Sent 0 reminder(s).` Real application output, not
  `Starting Container` on its own.

Both "Sent 0" and "Ledgered 0" are correct given 4 lifetime bookings and no
doctor on `FULL` collection. The crons are fine; there is simply nothing for
them to do yet.

### 2. Confirm the permanent WhatsApp token reached Railway 🟠

Permanent in Meta ≠ in use in production. `WHATSAPP_ACCESS_TOKEN` has to be
updated on the Railway service *and* the service redeployed. `send_template`
fails silently by design — it logs a warning and returns, never raises — so a
stale token looks exactly like a working one.

- [ ] `manage.py send_test_whatsapp <your mobile> --template booking_confirmation`
      — proves it end to end with no test booking and no real money

### 3. Ship the mobile app — EAS checked 2026-08-11, and it answers the big question 🔴

**The funnel is EMPTY, not broken.** Latest production build is **1.1.3 (36)**,
git ref `eddf5dd`, built 2026-08-08. Confirmed by `git merge-base` that
`cb3d29d` — the server-priced Razorpay checkout — **is an ancestor of that
build**. So the shipped app does match the backend's payment contract. The
three-session-old "is the checkout broken?" question is closed: it isn't.

That means the campaign is not walking patients into a broken checkout, and the
reason for 4 lifetime bookings is demand, not defect.

**But one real gap, found today:** EAS **Submissions is completely empty** —
"Create your first submission." Nothing has ever been submitted to a store
through EAS. So whatever is on Play was uploaded by hand from the `.aab`, and
EAS cannot tell you which version that is.

- [ ] **Open Google Play Console and confirm which versionCode is actually live.**
      This is now the only unknown in the funnel. EAS cannot answer it.
- [ ] `5b11bd7` (the checkout fixes) is **not** in build 36 — it needs the next build
- [ ] `eas submit` is still unconfigured, so the next release is another manual
      upload unless it gets set up
- [ ] Android only. No iOS build has ever run.

### 4. Housekeeping

- [ ] **Check the 2Factor SMS balance** — a promotion drives OTP sends, it's real
      money, invisible from the code, and sends just fail when it runs dry
- [ ] `grep oversold_refund` in the Railway logs — any hit means a patient was
      charged and auto-refunded, worth knowing why
- [ ] Confirm the hospital dashboard still shows Today / Tomorrow / All correctly
- [ ] Authorize the connectors this session couldn't reach: Linear, Slack, Notion,
      Atlassian, Datadog, ClickUp, Monday
- [ ] `gh` is not authenticated on this machine — `gh auth login`, or PRs have to
      be opened by hand every time

---

## The thing the roadmap isn't tracking

Live numbers, 2026-08-10: 27 users · 11 hospitals live · 8 doctors · **4 bookings
ever** · ₹60 lifetime revenue · **last booking 2026-07-26**.

**Settled 2026-08-11: the funnel is empty, not broken.** The shipped build
(1.1.3 (36), `eddf5dd`, 8 Aug) contains the Razorpay checkout. Backend is
healthy — both crons running, Redis live, deploys green. Nothing technical is
stopping a patient from booking.

So the campaign is not spending money into a broken checkout. It is spending it
into a product that works and that nobody has used since 26 July. **That makes
this a demand problem, and it is now the only real problem.** No further
backend hardening changes this number.

The hardening shipped this week — slot capacity, queue bounds, 3×4 gunicorn, the
Redis-ready cache — is correct work and had to happen before traffic arrives. But
nothing is currently stressing any of it, no doctor has opted into `FULL`
collection, and the payout machinery has never carried a rupee.

- [ ] Decide whether the next session goes to demand — getting the 11 live
      hospitals actually booking — rather than more infrastructure

---

## Next up (from ROADMAP)

- [ ] Backend observability — no error tracking on the API at all
- [ ] Nothing consumes `GET /api/payment/receipt/<pk>/` — a finished GST receipt
      with no caller in either the app or the website
- [ ] App has no WhatsApp opt-in toggle (the website has one)
- [ ] Sentry source maps disabled in production builds
- [ ] `eas submit` unconfigured; no iOS build profile at all
- [ ] No component/screen tests in the app — all 118 are pure logic
- [ ] Raise the 6-char password floor
- [ ] Branch cleanup — 12 local branches, several long dead

---

## Done

### 2026-08-11

> Written and pushed, **not merged and not deployed.** Nothing here has reached
> a patient yet.

- **The back button, diagnosed correctly the second time.** `doctor/[id]`,
  `payment`, `my-qr`, `edit-profile` and `booking-token` are `Tabs.Screen`s with
  `href: null`, so back was governed by the tab router's `firstRoute` default —
  "return to the first defined route", which is Home. `safeBack` (`d9b0420`)
  never fired because it only acts when `canGoBack()` is false. One line fixed
  all of them: `backBehavior="history"` (`411c311`).
- **Android hardware back** wired on 21 screens (`843e76a`), with `payment`
  swallowing back while money is in flight and `booking-token` going forward to
  my-bookings instead of back into the funnel.
- **App update gate** — `/api/app-version/` (`0e744ff`) + the launch prompt
  (`6a48655`). Only reaches builds that contain it, so it protects from 1.2.0 on.
- **OTP throttle** — burst 5→20/min, new 200/day per-IP ceiling (`2fd23a7`).
- **`/health/` cache probe** (`e204401`) so the Redis switch is verifiable.
- **Dashboard polling paused on hidden tab** (`aa707e2`) + the hook's first tests.
- **₹15 → ₹20** in all four languages, checked against `PLATFORM_FEE`.
- Search typeahead, chip icons, notification icon wired, branding, dev tooling,
  **v1.2.0**.
- Tests: backend 158→**172**, app 100→**118**, web 13→**18**.

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
