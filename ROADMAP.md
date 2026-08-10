# TokenWalla — Roadmap

**The single source of truth for what happens next.** `/start` reads the top of
**Now**. `/wrap` updates it. If work isn't written here, the next session won't
know about it.

Sessions are ~3 hours. Each item below is sized to fit one, and ordered so that
the things that can lose money or break a live booking come first.

- **Last updated:** 2026-08-11
- **Phase:** pre-promotion hardening (live, promotion starting — traffic expected)
- **Rule of thumb:** correctness → safety → capacity → features

---

## Now

**Everything below item 2 is blocked on merging.** The 2026-08-11 session wrote a
lot of code and merged none of it — three branches sit pushed and green, and
nothing in them has reached a patient. That is the top of the list now.

Context that changed the order: **a promotion is starting.** Registration
traffic is expected for the first time, which promotes capacity work that was
deliberately deferred on 2026-08-09 and makes the unshipped app build urgent
rather than merely overdue.

### 1. Merge the three branches — nothing else can start 🔴

None of these are PRs yet; the branches are pushed, CI-green, and need a PR
opened. Merge in this order.

| Order | Branch | Repo | Deploys |
|---|---|---|---|
| 1 | `feat/app-version-gate` (3 commits) | backend | Railway |
| 2 | `perf/dashboard-visible-polling` (1) | web | Vercel |
| 3 | `payments-server-priced-checkout` (13) | app | store, via EAS |
| — | `docs/wrap-2026-08-11` (2, this one) | docs | — |

Backend first: it carries the `/health/` cache probe needed to verify the Redis
switch in item 2, and `/api/app-version/`, which the app build expects. The app
PR merges before the EAS build so the build comes off `main`.

`docs/wrap-2026-08-10` was **never pushed** and is now folded into
`docs/wrap-2026-08-11`, so don't go looking for it separately.

### 2. Turn on Redis — the biggest capacity lever you have 🔴

**Moved up from Later, and the reason matters:** it was deferred on 2026-08-09
*on purpose* because the database cache was genuinely fine at the traffic we
had. A promotion changes that premise. It is config-only, no PR.

DRF's throttles are global, so every single request does a SELECT + UPDATE on
`tw_cache_table` — a write on every read path, on the same Postgres carrying
bookings and payments. `CAPACITY.md`'s "~1,000+ concurrent patients" figure
assumed three fixes; gunicorn 3×4 and the bounded queue shipped, this is the
third and last one.

1. Railway → New → Database → **Add Redis**
2. On the backend service: `REDIS_URL` = `${{Redis.REDIS_PRIVATE_URL}}` (a
   *reference*, not a pasted string) and `USE_REDIS_CACHE=True`
3. `curl https://tokenwalla-production.up.railway.app/health/` → want
   `{"backend": "redis", "ok": true}`

The gate is `USE_REDIS_CACHE and REDIS_URL`. Forget the `${{Redis...}}`
reference and `REDIS_URL` stays empty, you silently stay on the database cache,
and it looks exactly like success — that is what the probe is for. Rollback is
`USE_REDIS_CACHE=False`, instant. Do it at a quiet hour: the cutover clears
in-flight OTP sessions (anyone mid-login needs a fresh code). The OTP *caps* are
in `RateCounter` in Postgres and are unaffected. **Never set the flag locally** —
the stale `redis://localhost` in `.env` is exactly what the opt-in gate prevents.

### 3. Prove the two Railway crons actually ran 🟠

Both services exist as of 2026-08-10. **A cron service that exists is not a cron
service that works.** Without its own config file a service inherits
`railway.json` and boots gunicorn instead of the command — indistinguishable
from a healthy one in the services list, and exactly how the zombie reminder
cron went 14 days unnoticed logging only `Starting Container`.

- **Reminders** (`*/10 * * * *`) — checkable right now, fires every 10 minutes.
  Read the service log for real application output.
- **Payouts** (`0 15 * * *` UTC = **20:30 IST**) — look for
  `Ledgered 0 booking(s). Payouts are manual — see the admin payouts page.`
  That line appearing **at all** is the proof.

The schedule is correct. If it ever looks wrong, do **not** rewrite it as
`30 20` — Railway cron is UTC and that bug was already fixed once (`cfc751e`).

> **The admin dashboard cannot verify the payouts cron.** Checked live after the
> merge: the Today's check card reads "Nothing needs you", so `ledger_not_running`
> is not firing and cannot clear. With no doctor on `FULL` collection there are no
> ledger rows to write either. The run leaves **no trace in the UI** — the Railway
> service log is the only signal. An earlier version of this file said otherwise.

### 4. Confirm the permanent WhatsApp token reached Railway 🟠

A permanent System-User token was generated in Meta on 2026-08-10. That changes
nothing on its own: `WHATSAPP_ACCESS_TOKEN` has to be updated on the Railway
service **and** the service redeployed. `send_template` fails silently by design
— it logs a warning and returns, never raises — so a stale token is
indistinguishable from a working one without testing.

```bash
manage.py send_test_whatsapp <mobile> --template booking_confirmation
```

Proves it end to end with no test booking and no real money.

### 5. Ship the mobile app — now 13 commits deep 🔴

The branch has grown from one commit to thirteen and is version **1.2.0**.
Nothing in it reaches a patient without an EAS build.

**First check the EAS build list for what is actually in the store** —
`app.json` uses `appVersionSource: "remote"` and the repo has no tags, so the
repo cannot tell you. If the last production build predates 2026-08-05,
patients are running a checkout that no longer matches the backend, and that
outranks everything else on this page.

Carries: the checkout fix, both navigation fixes, the launch-time update gate,
the ₹15→₹20 price correction, search typeahead, and the notification icon
(baked in at build time — it cannot be added later without another release).

### 6. Watch the first day live 🟡

- `grep oversold_refund` in the Railway logs — any hit means a patient was
  charged and auto-refunded, and it is worth knowing why
- the hospital dashboard still shows Today / Tomorrow / All correctly
- **check the 2Factor SMS balance** — new 2026-08-11. A promotion drives OTP
  sends, the balance is real money, it is invisible from the code, and it can
  run dry mid-campaign. Nothing in the app will tell you; OTP sends just fail.

### 7. The item this roadmap has been avoiding 🔴

**27 users · 11 hospitals live · 8 doctors · 4 bookings ever · ₹60 lifetime ·
last booking 2026-07-26.** No doctor has opted into `FULL` collection, so the
payout machinery has never carried a rupee.

A week of hardening went into a load that has not arrived. That was the right
order — capacity, refunds and locking had to exist before patients did — but it
cannot be the next week too. The unresolved question is whether the funnel is
**broken** (a store build older than the backend, a checkout that fails) or
**empty** (nobody arriving). Those need opposite responses and are currently
indistinguishable. Item 5 settles it in an afternoon.

**Still unanswered as of 2026-08-11**, and now a second session has ended
without answering it. Every piece of hardening since has assumed *empty*. If it
turns out to be *broken*, the promotion spends money driving users into a
checkout that doesn't work. Answer it before, not after, the campaign ramps.

---

## Next

- **Backend observability** — new 2026-08-10, and more pressing now that traffic
  is expected. There is no error tracking on the API and no way to see whether a
  WhatsApp send succeeded without reading a Railway log by hand. Every
  silent-failure hunt this week cost time that a `WhatsAppLog` view in Django
  admin would have saved outright. Under promotion traffic you will learn about
  a failure from a user, not a dashboard.
- **Nothing consumes the receipt endpoint** — new 2026-08-11. `BookingReceiptView`
  (`GET /api/payment/receipt/<pk>/`) is a finished, GST-compliant receipt —
  taxable value, GST, SAC code, consultation fee marked exempt, readable by the
  booking's own patient. **Neither the app nor the website calls it.** For a paid
  healthcare service in India this is the most substantive product gap open.
- **App has no WhatsApp opt-in toggle** — new 2026-08-11. The website calls
  `PATCH /auth/me/whatsapp-opt-in/` (`MyBookings.js:111`); the app never does, so
  mobile patients cannot turn WhatsApp messages off. That is a consent control.
- **Sentry ships blind in production** — `SENTRY_DISABLE_AUTO_UPLOAD=true` on all
  three EAS profiles, so production crashes arrive minified and unsymbolicated.
  Correct while there is no `SENTRY_AUTH_TOKEN`; turn it back on for production
  once that is in EAS secrets.
- **`eas submit` is unconfigured** — `"submit": {"production": {}}` is empty: no
  service-account key, no track. And there is no iOS build profile at all
  (production sets only `android.buildType`), so this is Android-only in
  practice despite the `ios/` directory.
- **No component or screen tests in the app** — all 118 are pure logic. Nothing
  renders a screen; there is no `@testing-library/react-native`. This is why the
  `useAndroidBack` hook shipped without one.
- **Raise the 6-char password floor**
- **Branch cleanup** — 12 local branches, several long dead

Resolved and deliberately removed, so they don't get re-added:

- ~~Verify the WhatsApp token is permanent~~ — generated 2026-08-10; the
  remaining half (is it live on Railway?) is item 2 in **Now**.
- ~~Mobile app `/api/bookings/upgrade/` contract~~ — **not a thing.** Audited the
  app repo 2026-08-10: zero references to `upgrade`, and the endpoint isn't in
  `bookings/urls.py` at all. Both this and WORKLOG #9 were chasing a problem
  that doesn't exist.
- ~~Confirm the deploy target~~ — settled. `deploy.yml` runs **tests only**; the
  Render POST steps are gone and the file's own header says so. Railway and
  Vercel each deploy off their GitHub integration.

---

## Later

- **Automated doctor payouts — NOT BEFORE ~OCTOBER 2026, and only if Vishnu says
  so.** Manual is the deliberate design (see `CLAUDE.md`). Don't start this
  because it looks like an obvious improvement; the human checkpoint is the point.
- ~~Redis cache — deferred 2026-08-09~~ → **promoted to Now, item 2** on
  2026-08-11. The deferral was correct for the traffic we had; a promotion
  changes the premise it rested on.
- Server-Sent Events (or push) for queue updates instead of polling — polling is
  what makes concurrent users expensive. Partly mitigated 2026-08-11 (the
  hospital dashboard now pauses when hidden), but an open tab that someone *is*
  looking at still polls every 10s.
- Per-day booking archive/purge so queue tables stay small
- Load-test the checkout path specifically — the only path holding an external
  HTTP call
- Notify-the-beneficiary option for "book for someone else"
- Reword the approved `doctor_unavailable` Meta template to drop "Dr."

---

## Done

> **2026-08-11 caveat:** everything dated 2026-08-11 is **committed and pushed,
> not merged and not deployed.** Three branches, zero patients reached. "Done"
> here means the code is written and green, nothing more.

- **2026-08-11** — **Back navigation fixed properly, after one wrong diagnosis.**
  The real cause was never the buttons: `doctor/[id]`, `payment`, `my-qr`,
  `edit-profile` and `booking-token` are all `Tabs.Screen`s with `href: null`,
  and React Navigation 7's tab router defaults to `backBehavior='firstRoute'` —
  "return to the first defined route", which is Home. The first fix (`d9b0420`,
  `safeBack` on 8 buttons) only helped when `canGoBack()` was false, and under
  `firstRoute` it is true, so the fallback never ran. `411c311` sets
  `backBehavior="history"` on the patient Tabs and fixes every hidden screen at
  once. `843e76a` separately wired Android hardware back on 21 screens
  (`hooks/useAndroidBack.ts`), with `payment` swallowing back while money is in
  flight and `booking-token` going *forward* to my-bookings rather than back
  into the funnel.
- **2026-08-11** — **App update gate, both halves.** `GET /api/app-version/`
  (public, env-driven, blank = no prompt) plus a launch-time check that nags
  below `latest_version` and blocks below `min_version`. Caught in review: the
  route had to join `PUBLIC_ROUTES`, or a stale token would 401 it and drag the
  launch path into the refresh-retry flow — logging a patient out over a version
  check. **Only reaches builds that contain it**: everyone on ≤1.1.3 will never
  call it, so this protects from 1.2.0 onward.
- **2026-08-11** — **OTP throttle: looser burst, tighter day.** The per-IP send
  bucket was 5/min, which 429s real signups behind carrier-grade NAT — the same
  lesson `OTPVerifyRateThrottle` already recorded, never applied to sends.
  Burst 5→20/min, plus a per-IP daily ceiling that did not exist (200/day).
  5/min allowed ~7,200 sends a day from one address; this is ~36× tighter on
  sustained abuse while friendlier to real bursts. Catches what the per-number
  cap cannot see: one host walking a thousand numbers.
- **2026-08-11** — **`/health/` now probes the cache**, so the Redis cutover can
  be confirmed rather than inferred from Postgres metrics. Stays 200 and
  `status: ok` when the cache is down, deliberately — Railway restarts on a
  failed healthcheck and restarting does not fix an unreachable Redis.
- **2026-08-11** — **Hospital dashboard stops polling on a hidden tab**
  (`aa707e2`, web). One line wiring the existing `useVisiblePolling`, which the
  patient pages already used; the dashboard was the caller left out. Plus the
  hook's first tests — it is now the polling control on three surfaces.
- **2026-08-11** — **₹15 → ₹20 corrected in all four languages.** Verified
  against `payments/fees.py` (`PLATFORM_FEE = 20.00`); the app had been quoting
  a price the backend stopped charging. Note the card shows the platform fee
  alone — a service-only booking settles at ₹25.37.
- **2026-08-11** — Search typeahead (`constants/searchKeywords.ts`, tested),
  specialty chip icons, hospital-only dashboard row on Profile, refreshed icons,
  the Android notification small icon finally wired into the plugin, push-test
  script, expo 54.0.36, app bumped to **1.2.0**.
- **2026-08-10** — **PR #10 shipped.** `b719378` on `main`, 23 commits,
  +3,985/−99. Vercel production READY; Railway confirmed live via
  `/api/payment/daily-summary/` returning 200 and the Today's check card
  rendering on `/Adashboard`. All three migrations applied.
- **2026-08-10** — **The CI flake, diagnosed and fixed** (`dcd4c16`).
  `database table is locked` was a leaking notification thread — but
  `_dispatch_booking_notifications` was only the **first of three** sources.
  `_notify_doctor_payout_async` (mark-paid) and `_notify_doctor_unavailable`
  (availability toggle) were never patched, and were making real outbound
  WhatsApp calls during the suite. Reproduced ~1 run in 4; 57 consecutive green
  runs after. The generalisation is now in `CLAUDE.md`: every `threading.Thread`
  in a view is a test-isolation hazard, and a verbose run with zero
  `graph.facebook.com` lines is the check that proves it.
- **2026-08-10** — **Mobile app checkout fixed** (`5b11bd7`, app repo). Three
  fixes: `create-order/` now sends `date`/`slot` top-level so a full slot is
  refused *before* charging; the error handler reads the server's message rather
  than axios's `"Request failed with status code 409"`; `/verify/` no longer
  retries a 4xx. `tsc` clean, jest 100/100. **Not shipped — needs an EAS build.**
- **2026-08-10** — **Two roadmap items deleted as non-issues.** The app is fully
  on Razorpay (WORKLOG line 7 was stale) and never calls `/api/bookings/upgrade/`.
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
