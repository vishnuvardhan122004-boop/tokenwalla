# TokenWalla — Work Log

A running record of changes so we can cross-check what's done and what's pending.
Newest entry on top. Update the **Status** columns as things land.

- **Branch:** `feat/app-version-gate` + `perf/dashboard-visible-polling` + `feat/hospital-location-picker` (web/backend, all **unmerged**) · `payments-server-priced-checkout` + `feat/hospital-location-picker` (mobile app repo, both **unmerged**)
- **Latest commit at last update:** `e204401` + `aa707e2` + `50fb1e2` (web/backend) · `0c8cef3` + `83236ad` (app)
- **Last updated:** 2026-08-11 (session 2)

### How to update this log
- Add a new `## YYYY-MM-DD — <title>` section **on top** for each working session; keep older sessions below.
- As work lands, flip the **Status** cells (⬜ not started → 🕒 in progress → ✅ done) and tick **Action items** (`- [ ]` → `- [x]`).
- After you commit, bump the two lines above: `Latest commit` = `git rev-parse --short HEAD`, `Last updated` = `date +%Y-%m-%d`.
- Save the log with your work: `git add WORKLOG.md && git commit -m "docs: update worklog"` (then `git push`).
- Keep entries short — one line per change, link the commit hash so it's traceable.

---

## 2026-08-11 (session 2) — Hospital location picker on all three surfaces

Hospitals could save a city and a free-text landmark, never an accurate pin.
Added a map picker to the web profile editor, the web signup page and the app
hospital profile. **Nothing merged; two new branches pushed, same name in both
repos.**

| Change | Repo | Commit | Status |
|---|---|---|---|
| `LocationPicker.js` — modal, fixed centre pin, geolocation, live reverse-geocode | web | `cae5cdc` | ✅ pushed, unmerged |
| Lazy-load Leaflet so patients don't pay 47 kB for a hospital screen | web | `c96ab27` | ✅ pushed, unmerged |
| Same picker on `/Husercreate` + refuse a pin below zoom 14 | web | `50fb1e2` | ✅ pushed, unmerged |
| `LocationPickerModal.tsx` + `placeLabel.ts` + `mapHtml.ts` | app | `83236ad` | ✅ pushed, unmerged |

- **No Google Maps key anywhere.** Stayed on the free key-less rail
  `LocationSearch` already used — OSM tiles + Photon geocoding.
- **No new app dependency, native or JS.** `react-native-maps` would have forced
  an EAS rebuild *and* an Android Maps API key. Leaflet runs in the WebView
  already shipped for Razorpay checkout; `expo-location` was already installed
  with its permission strings already in `app.json`.
- **Confirm is disabled below zoom 14** (web + app). Caught while testing signup:
  the map opens at state zoom with no saved location, and a one-click confirm
  would have pinned the middle of Telangana — patients routed tens of km wrong.
- **`ResizeObserver`, not a timeout**, for Leaflet's stale container size — it
  rendered half a grey panel inside the modal. Also covers rotation and resize.
- **Bundle:** main back to baseline, Leaflet in a 42.9 kB on-demand chunk.
- **`package-lock.json` shed 132 orphaned `react-native-*` entries** left by the
  removed `react-native-razorpay`. Makes that PR's diff look bigger than it is.

**Tests:** web 20 pass (7 new, Photon address mapping) + production build clean;
app 104 pass (15 new), `tsc` 0, lint clean on new files. The web picker was
driven end to end in a browser — drag re-geocodes, both geolocation branches,
zoom guard blocks at z6 and releases at z15. The app's WebView page was
compiled, served and driven with a stubbed `ReactNativeWebView`.

**Not proven:** the app's React Native layer (Modal, WebView wiring,
`expo-location` permission flow) has never run on a device or simulator.
Gate on merging the app branch.

**Also learned:** `gh` is not authenticated on this machine, so a session cannot
open PRs at all — they have to be created by hand from the `pull/new/<branch>`
links. Second session this has cost time.

---

## 2026-08-11 — Back-nav root cause, the update gate, and pre-promotion capacity

**Branches:** `feat/app-version-gate` (backend) · `perf/dashboard-visible-polling` (web) · `payments-server-priced-checkout` (app) — **all three pushed, none merged.**

Context: a promotion is starting, so registration traffic is expected for the
first time. That promoted capacity work deferred on 2026-08-09 and made the
unshipped app build urgent.

| Change | What it fixed | Proof | Status |
|---|---|---|---|
| `411c311` `backBehavior="history"` on the patient Tabs | **The actual back-button bug.** Hidden `Tabs.Screen`s (`href: null`) fell through to the tab router's `firstRoute` default → every back went to Home | Verified against the installed `@react-navigation/routers` source (`TabRouter.tsx:197`) | 🕒 needs EAS build |
| `d9b0420` `safeBack` on 8 back buttons | Stranded users on deep links / notification taps where `canGoBack()` is false | 3 tests | 🕒 needs EAS build |
| `843e76a` `hooks/useAndroidBack.ts` on 21 screens | Android hardware back ignored entirely; hospital/auth stacks exited the app | tsc + 103 jest; cross-checked hw back vs button on all 21 | 🕒 needs EAS build |
| `0e744ff` `GET /api/app-version/` | No way to tell installed apps to update without a store release | 5 tests; blank default = no prompt | ⬜ unmerged |
| `6a48655` launch-time update prompt | — | 14 tests on the compare/decide logic | 🕒 needs EAS build |
| `6a48655` `/app-version/` added to `PUBLIC_ROUTES` | Caught in review: a stale token would 401 the launch check and trigger refresh-retry, **logging the patient out over a version check** | 1 test | 🕒 needs EAS build |
| `2fd23a7` OTP per-IP burst 5→20/min + new 200/day ceiling | 5/min per IP 429s real signups behind carrier NAT — the exact lesson `OTPVerifyRateThrottle` already recorded for verify but never applied to sends | 4 tests; ~36× tighter on sustained abuse than before | ⬜ unmerged |
| `e204401` `/health/` cache probe | Redis cutover had no confirmation step; the `USE_REDIS_CACHE and REDIS_URL` gate fails *silently* if the `${{Redis…}}` reference is missing | 5 tests, incl. "unreachable cache must not 500 or flip status" | ⬜ unmerged |
| `aa707e2` hospital dashboard uses `useVisiblePolling` | Dashboard polled `/bookings/queue/:id/` every 10s all day behind other windows | 5 new tests (the hook had none) | ⬜ unmerged |
| `9280e4e` ₹15 → ₹20 in 4 languages | App quoted a price the backend stopped charging | Checked against `PLATFORM_FEE = 20.00` | 🕒 needs EAS build |
| `f1790a8` notification small icon wired into the plugin | `expo-notifications` had `color` but no `icon` | Asset verified 96×96, 82% transparent, opaque px pure white | 🕒 needs EAS build |
| `e57245e` `622b148` `754e8ff` `4ace625` `421c6ec` `0c8cef3` | Search typeahead, chip icons, branding, dev tooling, EAS Sentry flag, **v1.2.0** | tsc clean, 118 jest | 🕒 needs EAS build |

**Tests:** backend 158 → **172** · app 100 → **118** · web 13 → **18**.

**The correction worth remembering:** `d9b0420` was described as fixing the
jump-to-Home. It did not. `safeBack` only acts when `canGoBack()` is false, and
under `backBehavior: 'firstRoute'` it is true — so `back()` ran and the tab
router went to Home anyway. The fix was one line in the layout, found only by
reading the router source instead of trusting the first plausible story.

**Action items**
- [ ] Open + merge the three PRs (backend → web → app)
- [ ] Attach Redis, set the two vars, confirm via `/health/`
- [ ] EAS build — **check the existing build list first**
- [ ] Verify both crons and the WhatsApp token
- [ ] Check the 2Factor SMS balance before the campaign ramps

---

## 2026-08-10 — PR #10 shipped; the CI flake was three leaks, not one

**Branch:** `fix/enforce-slot-capacity` → merged as `b719378` · **App:** `5b11bd7`

| Change | What it fixed | Proof | Status |
|---|---|---|---|
| `dcd4c16` patch `_notify_doctor_payout_async` + `_notify_doctor_unavailable` in tests | The red CI job. `database table is locked` on a random unrelated test | Reproduced ~1 run in 4; **57 consecutive green runs** after | ✅ |
| `dcd4c16` drop the last hard-coded date literal | `tests_integration` reschedule test would have rotted past the 2h cutoff | Computed from `timezone.localdate()` | ✅ |
| PR #10 merged + deployed | Slot capacity, queue bounds, gunicorn 3×4, daily-ops card now live | Vercel READY on `b719378`; `/api/payment/daily-summary/` 200 from Railway; card renders | ✅ |
| App `5b11bd7` — `date`/`slot` top-level on `create-order/` | App never got the pre-payment rejection; every collision charged then refunded | `tsc` clean, jest 100/100 | 🕒 needs EAS build |
| App `5b11bd7` — error handler reads server message before `e.message` | axios's `"Request failed with status code 409"` was masking the real explanation | same | 🕒 needs EAS build |
| App `5b11bd7` — stop retrying 4xx on `/verify/` | 409 is final; retrying added ~4.5s before the patient heard it | same | 🕒 needs EAS build |

### What the flake actually was

`1aa50cc` patched `_dispatch_booking_notifications` and was not enough because
there are **four** notification threads in views, not one, and two more were
unpatched: the payout mark-paid path and the doctor-unavailable toggle. Both
open their own DB connection and make a **real outbound WhatsApp call** during
the suite. The thread's output lands on whichever test is running when it
finishes, so the reported failing test is never the offender.

**The check that actually proves it:** `manage.py test -v 2` with zero
`graph.facebook.com` lines. Recorded in `CLAUDE.md` with the full table.

### Corrections to earlier notes (all were wrong, all verified today)

- The app is **fully on Razorpay**. Line 7 of this file said Cashfree — stale
  since `cb3d29d` (2026-08-05).
- `/api/bookings/upgrade/` does not return 400. It **does not exist** — not in
  `bookings/urls.py`, and the app has zero references to it. Item #9 below is dead.
- The branch carried **three** migrations, not one (`users/0003_ratecounter`
  plus `notifications/0007` and `0008`). All additive.
- `run_daily_payouts` will **not** ledger a backlog: every booking is ₹15
  service-fee-only, so `doctor_fee` is 0 and nothing is owed.
- `ledger_not_running` is **not** firing, so it cannot clear as proof the cron
  ran. The Railway service log is the only signal.

### The number that isn't in any table

27 users · 11 hospitals live · 8 doctors · **4 bookings ever** · ₹60 lifetime ·
last booking **2026-07-26**. The hardening shipped this week is correct work for
a load that has not arrived. Whether the funnel is broken or empty is unresolved
and is now item 5 in ROADMAP **Now**.

---

## 2026-08-07 (auto) — Session update @ 22:55

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 4 changed files).

```
M WORKLOG.md
 M backend/bookings/views.py
 M backend/notifications/push.py
 M backend/payments/views.py
```

---


## 2026-08-07 (auto) — Session update @ 22:54

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 3 changed files).

```
M backend/notifications/push.py
 M src/ADMIN/Payouts.js
?? src/ADMIN/Payouts.test.js
```

---


## 2026-08-06 (auto) — Session update @ 14:28

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-06 (auto) — Session update @ 14:26

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 3 changed files).

```
M WORKLOG.md
 M backend/payments/views.py
 M src/ADMIN/Payouts.js
```

---


## 2026-08-06 (auto) — Session update @ 12:58

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-06 (auto) — Session update @ 12:56

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-06 (auto) — Session update @ 11:41

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-06 (auto) — Session update @ 03:33

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-06 (auto) — Session update @ 03:28

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-05 (auto) — Session update @ 22:22

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-05 (auto) — Session update @ 22:20

Auto-generated snapshot (branch `fix/token-page-pay-at-clinic-note`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-05 (auto) — Session update @ 22:19

Auto-generated snapshot (branch `main`, 3 changed files).

```
M WORKLOG.md
 M src/componets/BookingToken.js
 M src/componets/Payment.js
```

---


## 2026-08-05 (auto) — Session update @ 22:09

Auto-generated snapshot (branch `main`, 1 changed file).

```
M WORKLOG.md
```

---


## 2026-08-05 (auto) — Session update @ 22:02

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 1 changed file).

```
M CLAUDE.md
```

---


## 2026-08-05 (auto) — Session update @ 21:20

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 10 changed files).

```
M backend/doctors/models.py
 M backend/doctors/tests_payment_details.py
 M backend/payments/fees.py
 M backend/payments/tests_integration.py
 M backend/payments/tests_payments.py
 M backend/tokenwalla/tests_security.py
 M src/componets/Payment.js
 M src/hospital/HPayments.js
 M src/services/fees.js
?? backend/doctors/migrations/0010_alter_doctor_payment_collection_mode.py
```

---


## 2026-08-05 — Back to Razorpay + manual doctor payouts 🆕

Reverted the payment stack from Cashfree to **Razorpay**, and replaced the
automated payout integration with a **manual payout flow**: we collect the full
amount via Razorpay, then pay each doctor by hand from TokenWalla's own bank
account and record it on a new admin page. Cashfree is fully removed.

**Why:** Cashfree Payouts never cleared its mandatory 2FA / IP-whitelist gate
(403 on every call, sandbox included — see the 2026-08-02 entry), so no doctor
payout could ever actually be sent. Rather than keep waiting on that gate, the
payout leg is now a bookkeeping operation with no gateway dependency at all.

> Scope: **backend** (`backend/`) + **React web** (`src/`). The Expo/RN **mobile
> app** (separate repo) still needs its checkout SDK swapped back to Razorpay —
> the `/payment/verify/` contract itself is unchanged.

### 1. Gateway swap — Razorpay PG
Verification stayed **server-side**: we deliberately ignore the signature
Razorpay Checkout hands the browser and re-fetch the order + its payments
instead. So `/payment/verify/` still takes only `{ order_id }` and the frontend
contract never changed.

| Layer | Change | Status |
|-------|--------|--------|
| Backend | `payments/razorpay_utils.py` replaces `cashfree_utils.py` (same function shapes → callers barely changed); `confirm_order_paid()` looks for a `captured` payment on the order | ✅ |
| Backend | Paise conversion confined to the gateway boundary — money stays rupee `Decimal` internally; dead `fees.to_paise()` deleted | ✅ |
| Backend | Refunds re-keyed to the **payment** id (Razorpay) instead of the order id (Cashfree) | ✅ |
| Backend | `create-order` now returns the public `key` instead of `payment_session_id`/`mode`; `settings.py` + `.env`/`.env.example` down to just `RAZORPAY_KEY_ID`/`_SECRET`; `cashfree-pg` + `cryptography` dropped from requirements | ✅ |
| Web | `Payment.js` + `MyBookings.js` (reschedule) load the Razorpay CDN and open Checkout; `REACT_APP_CASHFREE_MODE` retired (key now comes from the order response, so test/live can't drift) | ✅ |

### 2. Manual doctor payouts (replaces Cashfree Payouts)
No payout API, no payout keys, no webhooks. `run_daily_payouts` now **only**
writes ledger rows; a human moves the money and records it.

| Piece | Change | Status |
|-------|--------|--------|
| Backend | `payments/payout_utils.py` keeps only `payout_target` (salaried doctor → hospital account) + `choose_mode` (UPI/IMPS rail); `cashfree_payouts_utils.py` deleted | ✅ |
| Backend | `run_daily_payouts` reduced to ledger-writing only — no batching, no gateway dispatch | ✅ |
| Backend | New admin endpoints `GET /api/payment/payouts/pending/` + `POST /api/payment/payouts/mark-paid/`; mark-paid locks the doctor's unbatched ledger rows, batches them `PROCESSED`, flips bookings to payout-PAID | ✅ |
| Backend | `PayoutBatch` gained mode `OTHER` (paid in cash / no bank details on file) — migration `0010`; `razorpay_payout_id` now stores a hand-entered UTR; payout webhook + `/api/payment/webhook/` route deleted | ✅ |
| Web | **New admin page `src/ADMIN/Payouts.js`** at `/Adashboard/payouts` ("💸 Doctor Payouts" in the sidebar): who's owed, how much, which account + rail, and a Mark Paid button that prompts for a UTR | ✅ |

### 3. Website copy — gateway rename across every surface
Every patient-facing mention of the gateway swept so nothing still advertises
Cashfree:

| Surface | Change | Status |
|---------|--------|--------|
| Hero / features | "Secure Payments" card → "encrypted via **Razorpay**" across **en / hi / kn / te** | ✅ |
| Doctor details | Booking card note → "Secured by **Razorpay** · UPI · Cards · Wallets" | ✅ |
| Payment page | Trust badge → "Secured by **Razorpay**" | ✅ |
| Legal | `Terms.js`, `Privacy.js`, `Refund.js`, `LegalPages.js` — payment-partner, KYC, data-sharing and processor-table rows re-pointed (incl. the privacy-policy link → `razorpay.com/privacy`) | ✅ |
| Admin | `Settings.js` system-info row `Payment Gateway: Razorpay`; `Adashboard.js` nav + page label for the new Payouts page | ✅ |

### 4. Docs & tooling cleanup
- `CLAUDE.md` rewritten: was 100% Cashfree skill-package routing pointing at
  deleted files. Now documents the real stack — Razorpay, server-side
  verification, rupee-Decimal convention, the manual payout flow, and the money
  rules that must not be broken.
- `.claude/skills/` (18 Cashfree skills, ~1 MB) deleted — gitignored, local only.
- `backend/notifications/CRON_SETUP.md` payout section rewritten for the manual flow.

### Verification
- **`python manage.py test` → 103/103 pass**; `makemigrations --check` → no drift.
- Web compiles clean; frontend suite 2/2.
- **Payouts page exercised end-to-end in-browser** against seeded data: ₹200
  outstanding → Mark Paid → list cleared, DB showing `PROCESSED / IMPS /
  ref=UTR-DEMO-99` and the booking payout-PAID. No console errors. Demo data removed.

### ⚠️ Follow-ups / flags
- [ ] 🔴 **Add the Razorpay keys.** `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are
      empty in `backend/.env` — checkout cannot charge until they're filled in.
- [ ] 🔴 **Revoke the old Cashfree credentials.** The deleted `.env` block held a
      **live production** secret (`cfsk_ma_prod_…`) plus a payouts test key and the
      2FA public key. Removing them from the file doesn't invalidate them — revoke
      in the Cashfree dashboard.
- [ ] **Mobile app (separate repo):** swap the checkout SDK back to Razorpay. The
      `/payment/verify/` payload is unchanged, so only the SDK + order-response
      fields (`key` instead of `payment_session_id`/`mode`) differ.
- [ ] The payouts cron service can stay as-is — `run_daily_payouts` still runs
      daily, it just no longer pays anyone. Payouts happen on the admin page.

---

## 2026-08-05 (auto) — Session update @ 17:23

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 40 changed files).

```
M CLAUDE.md
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/notifications/CRON_SETUP.md
 D backend/payments/cashfree_payouts_utils.py
 D backend/payments/cashfree_utils.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 M backend/payments/refunds.py
 M backend/payments/tests_integration.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 D backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M src/ADMIN/Adashboard.js
 M src/ADMIN/Settings.js
 M src/Router/Routing.js
 M src/componets/DoctorsDetails.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? backend/payments/migrations/0010_alter_payoutbatch_payout_mode.py
?? backend/payments/payout_utils.py
?? backend/payments/razorpay_utils.py
?? src/ADMIN/Payouts.js
```

---


## 2026-08-05 (auto) — Session update @ 17:16

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 39 changed files).

```
M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/notifications/CRON_SETUP.md
 D backend/payments/cashfree_payouts_utils.py
 D backend/payments/cashfree_utils.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 M backend/payments/refunds.py
 M backend/payments/tests_integration.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 D backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M src/ADMIN/Adashboard.js
 M src/ADMIN/Settings.js
 M src/Router/Routing.js
 M src/componets/DoctorsDetails.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? backend/payments/migrations/0010_alter_payoutbatch_payout_mode.py
?? backend/payments/payout_utils.py
?? backend/payments/razorpay_utils.py
?? src/ADMIN/Payouts.js
```

---


## 2026-08-05 (auto) — Session update @ 11:01

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 39 changed files).

```
M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/notifications/CRON_SETUP.md
 D backend/payments/cashfree_payouts_utils.py
 D backend/payments/cashfree_utils.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 M backend/payments/refunds.py
 M backend/payments/tests_integration.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 D backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M src/ADMIN/Adashboard.js
 M src/ADMIN/Settings.js
 M src/Router/Routing.js
 M src/componets/DoctorsDetails.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? backend/payments/migrations/0010_alter_payoutbatch_payout_mode.py
?? backend/payments/payout_utils.py
?? backend/payments/razorpay_utils.py
?? src/ADMIN/Payouts.js
```

---


## 2026-08-04 (auto) — Session update @ 19:13

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 8 changed files).

```
M WORKLOG.md
 M backend/.env.example
 M backend/payments/cashfree_utils.py
 M backend/payments/tests_integration.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M src/componets/MyBookings.js
 M src/componets/Payment.js
```

---


## 2026-08-04 (auto) — Session update @ 19:12

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 7 changed files).

```
M backend/.env.example
 M backend/payments/cashfree_utils.py
 M backend/payments/tests_integration.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M src/componets/MyBookings.js
 M src/componets/Payment.js
```

---


## 2026-08-02 (auto) — Session update @ 15:09

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 3 changed files).

```
M backend/doctors/tests_payment_details.py
 M backend/doctors/views.py
 M src/hospital/HPayments.js
```

---


## 2026-08-02 (auto) — Session update @ 15:03

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 2 changed files).

```
M backend/doctors/tests_payment_details.py
 M backend/doctors/views.py
```

---


## 2026-08-01 (auto) — Session update @ 11:22

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 11:21

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:46

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:43

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:42

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:40

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:40

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:36

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:35

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:34

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:32

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:30

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 51 changed files).

```
M .gitignore
 M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? CLAUDE.md
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:27

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 49 changed files).

```
M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-08-01 (auto) — Session update @ 01:21

Auto-generated snapshot (branch `feature/fee-splitting-refunds-payouts`, 49 changed files).

```
M WORKLOG.md
 M backend/.env.example
 M backend/bookings/views.py
 M backend/doctors/models.py
 M backend/doctors/serializers.py
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/serializers.py
 M backend/hospitals/urls.py
 M backend/hospitals/views.py
 M backend/payments/fees.py
 M backend/payments/management/commands/run_daily_payouts.py
 M backend/payments/models.py
 D backend/payments/razorpay_utils.py
 D backend/payments/razorpayx_utils.py
 M backend/payments/refunds.py
 M backend/payments/tests_payments.py
 M backend/payments/urls.py
 M backend/payments/views.py
 M backend/payments/webhooks.py
 M backend/requirements.txt
 M backend/tokenwalla/settings.py
 M backend/tokenwalla/tests_security.py
 M package.json
 M src/ADMIN/Settings.js
 M src/componets/DoctorsDetails.js
 M src/componets/Hero.js
 M src/componets/LegalPages.js
 M src/componets/MyBookings.js
 M src/componets/Payment.js
 M src/componets/Privacy.js
 M src/componets/Refund.js
 M src/componets/Terms.js
 M src/hospital/Hdashboard.js
 M src/hospital/Hprofile.js
 M src/i18n/en.json
 M src/i18n/hi.json
 M src/i18n/kn.json
 M src/i18n/te.json
?? backend/doctors/migrations/0008_doctor_account_holder_name_doctor_bank_name_and_more.py
?? backend/doctors/tests_payment_details.py
?? backend/hospitals/migrations/0009_hospital_account_holder_name_and_more.py
?? backend/hospitals/tests_payment_details.py
?? backend/payments/cashfree_payouts_utils.py
?? backend/payments/cashfree_utils.py
?? backend/payments/migrations/0007_payment_uniq_payment_payment_id_nonblank.py
?? backend/payments/migrations/0008_payment_offline_doctor_fee.py
?? backend/payments/tests_integration.py
?? src/hospital/HPayments.js
```

---


## 2026-07-28 (session 2) — Website copy fix + mobile app: statuses & full-fee checkout 🆕

Cleared the two client-side follow-ups from the fee-splitting session so the
**website** and **mobile app** both match the new full-fee backend. Also
confirmed WhatsApp is fully live and flagged RazorpayX as the one remaining
blocker to actually paying doctors.

### 1. Website (`src/`) — pricing copy now matches full-fee ✅
The old flat **₹15** was stale everywhere the new model (doctor fee + ₹20
platform + ₹1.50 gateway + 18% GST) applies.

| Change | Status |
|--------|--------|
| Hero pricing card: `₹15 / Queue View` → **`₹20` "Booking Fee"** + sub "doctor's consultation fee shown at checkout" + note "+ payment gateway & 18% GST" (`Hero.js` + `.price-note` style) | ✅ |
| i18n reworded across **en / hi / kn / te**: `hero.pricing.planName/planSub` + new `note` key; "How it works → Pay ₹15" step reworded to "pay the consultation fee" | ✅ |
| `DoctorsDetails.js`: removed vestigial `PLANS` array (`price: 15`) + dead `fee`/`amount` nav params (Payment.js already ignores them; server is authoritative) | ✅ |
| `npm run build` → **Compiled successfully**; pricing card verified in-browser (₹20 + notes render) | ✅ |

### 2. Mobile app (`~/Desktop/app /Tokenwalla`, repo `tokenwalla.app.git`) ✅
The deployed app read the old lowercase booking statuses and used the legacy
flat-₹15 checkout — both would break against the new backend.

**Booking statuses (was breaking):** the API now serialises the new UPPERCASE
lifecycle (`waiting`→`CONFIRMED`, `held`→`ON_HOLD`, + `NO_SHOW`, etc.). The app
compared against `'waiting'`/`'in_progress'`/`'completed'`/`'cancelled'`, so
active bookings, QR cards, scanner state and reminders would all silently fail.

| Change | Status |
|--------|--------|
| New `normalizeBookingStatus()` in `utils/booking.ts` — folds any backend value (new UPPERCASE **or** legacy lowercase) to the 4 canonical UI keys; safe against old+new backends | ✅ |
| Applied in `my-bookings.tsx`, `my-qr.tsx`, `scanner.tsx`, `services/notifications.ts` (reminder scheduling). Hospital dashboard untouched — it reads grouped response-key arrays (`data.waiting`/`completed`), which the backend preserved | ✅ |
| 3 new unit tests (UPPERCASE fold, legacy pass-through, unknown/nullish → waiting) | ✅ |

**Full-fee checkout (was undercharging):** the app sent `amount: 1500` (no
`doctorId`), hitting the backend's **legacy ₹15 path** — so it collected only
₹15 and never funded the split/payout. Reworked to mirror the website.

| Change | Status |
|--------|--------|
| New `utils/fees.ts` — client mirror of `payments/fees.py` (platform ₹20 / gateway ₹1.50 / GST 18%) for the receipt preview | ✅ |
| `payment.tsx`: reads `doctorFee`, shows **itemised receipt** (consultation + platform + gateway + GST + total), sends only **`doctorId`** to `/payment/create-order/`, Razorpay + Pay button use the server amount, dropped client `amount`/`fee` from create-order & verify | ✅ |
| `doctor/[id].tsx`: removed `PLAN` `{price:15}`; passes `doctorFee: doctor.fee`; card shows **"Consultation Fee ₹{fee}"** + "+ platform fee & GST shown at checkout"; button → **"Pay & Book Appointment"** | ✅ |
| **Security #9 (upgrade endpoint):** N/A to the app — it has no queue-upgrade/paid-reschedule call that hits `/bookings/upgrade/`, so nothing to migrate | ✅ n/a |
| `tsc --noEmit` → **0 errors**; `jest` → **75/75 pass** | ✅ |

> ⚠️ Mobile still needs the **dev-client/EAS rebuild** before release (unchanged
> from prior sessions — native modules), and these changes are **staged but not
> committed** in the app repo.

### 3. WhatsApp — confirmed fully live ✅
- ✅ **Permanent System-User token in place** (not the 24h temp token) — sends won't expire.
- ✅ **Appointment reminders confirmed working well** end-to-end (cron firing, patients receiving ~2h reminders). All 4 templates approved + delivering (see prior session).

### 4. RazorpayX — the one remaining blocker 🔴
Payouts are still **SIMULATED**. This is now the **top priority — get it live ASAP**:
KYC/current-account activation → `RAZORPAYX_ENABLED=true` + account number →
implement `_live_payout()` → set webhook secret + subscribe payout events.
Until then, doctors are not actually paid; the entire split/ledger/batch
pipeline upstream is built and just waiting on activation.

---

## 2026-07-28 — Fee splitting, refunds & automated doctor payouts 🆕

Turned TokenWalla into the money-movement layer: checkout now collects the
**full patient bill** (doctor fee + platform + gateway + GST), every payment is
stored as a **named split**, cancellations get **tiered refunds**, and doctors
are **paid out automatically** (net of a per-hospital commission) with a monthly
GST invoice to hospitals. Built on the real stack after reconciling 4 spec
assumptions (no Celery → Railway cron mgmt-commands; RazorpayX not live → payout
call **stubbed** behind a flag; economics reworked from the old flat ₹15).

> Scope: **backend** (`backend/`) + **React web** (`src/`). The Expo/RN **mobile
> app** (separate repo) still needs parallel status + checkout changes before release.

### 0. Booking lifecycle rename (foundational)
Renamed `Booking.STATUS` → spec superset `PENDING / CONFIRMED / IN_PROGRESS /
ON_HOLD / COMPLETED / CANCELLED / NO_SHOW` (kept queue states; no-show now its own
terminal state). Gates money: refunds only **before COMPLETED**, payouts only
**from COMPLETED**.

| Layer | Change | Status |
|-------|--------|--------|
| Backend | Data migration `0010_rename_statuses` remaps all existing rows; `NoShowView` sets `NO_SHOW`; added `Booking.scheduled_datetime` + shared `bookings/utils.py` slot parser | ✅ |
| Backend | Swept all view/serializer/admin status literals (kept API **response keys** like `waiting`/`completed`); reminder cron uses `CONFIRMED` | ✅ |
| Web | Re-keyed `STATUS_MAP`/`STATUS_STYLE(S)` + compares in `MyBookings`, `QRScanner`, `Reports`, `Adashboard`, `Hdashboard` (Hero i18n demo data left) | ✅ |

### 1. Fee model + full-fee checkout (revenue-critical)
`gst = 18% × (platform ₹20 + gateway ₹1.50)` (doctor fee GST-exempt);
`total = doctor_fee + platform + gateway + gst`. Server-authoritative — client
sends only `doctorId`.

| Layer | Change | Status |
|-------|--------|--------|
| Backend | `payments/fees.py` (single source of fee math); `Payment` extended with `doctor_fee/platform_fee/gateway_fee/gst_amount/final_amount` + `CREATED/PAID/FAILED`; backfill migrations `0004`/`0005` | ✅ |
| Backend | `CreateOrderView` computes the order from `doctor.fee`; `VerifyPaymentView` re-derives the split, asserts it == captured amount, stores it. Legacy ₹15 clients still work | ✅ |
| Web | `Payment.js` sends `doctorId`, renders itemised receipt (`src/services/fees.js` mirror); `DoctorsDetails.js` passes `doctorFee` | ✅ |

### 2. Tiered cancellation refunds
70/60/50/0% by hours-before-slot; refunds `(doctor_fee + platform_fee)` only
(gateway + GST never returned), split proportionally.

| Layer | Change | Status |
|-------|--------|--------|
| Backend | `payments/refunds.py` (`get_refund_percentage`, `compute_refund_split`, `process_cancellation_refund`); `refund_payment()` helper | ✅ |
| Backend | Wired idempotently into `CancelBookingView` (aborts cancel if gateway refund fails); doctor-absence-after-completion → negative `ABSENCE_REFUND` ledger entry (`POST /bookings/absence-refund/<pk>/`) | ✅ |

### 3–5. Ledger, payouts (stubbed), monthly invoice
`DoctorLedger` / `PayoutBatch` / `HospitalCommissionInvoice` models; `Doctor` payout
fields (`upi_vpa`/`bank_account_number`/`ifsc`); per-hospital `commission_rate`
(`= rate + 18% GST`); `Booking.doctor_payout_status`.

| Piece | Change | Status |
|-------|--------|--------|
| RazorpayX | `payments/razorpayx_utils.py` — `create_payout()` behind `RAZORPAYX_ENABLED` (**SIMULATED** until KYC/current-account activation) | ✅ stub |
| Daily cron | `run_daily_payouts` (mgmt cmd + `railway.payouts.cron.json`): ledger completed bookings → one `PayoutBatch` per doctor (UPI else IMPS), idempotency key `payout_{doctor}_{date}` | ✅ |
| Webhook | `payments/webhooks.py` (`/api/payment/webhook/`, HMAC-verified, idempotent): `payout.processed`→PAID; `failed`/`reversed`→alert + release ledger for retry | ✅ |
| Monthly cron | `generate_commission_invoices` (+ `railway.invoices.cron.json`): B2B GST invoice per hospital, taxable value + GST split for ITC | ✅ |

### 6. GST-compliant receipt
`GET /api/payment/receipt/<pk>/` — GSTIN, SAC code, taxable value + tax shown
separately, doctor fee marked exempt. Access: owner / hospital staff / admin.

### 7. Doctor page cleanup
`DoctorsDetails.js` booking card: removed the stale "Choose Plan / Queue View ₹15"
block; `Total Amount ₹15` → **`Consultation Fee ₹{doctor.fee}`**; button → **"Pay & Book"**;
added "+ platform fee & GST shown at checkout" note. ✅

### 🐛 Caught & fixed along the way
`DoctorLedger.Meta.ordering = ['-created_at']` silently broke a `DISTINCT` (a
doctor returned once per row) **and** would have made the invoice `GROUP BY`
under-aggregate hospitals with multiple bookings. Fixed with `.order_by()` +
added a multi-booking regression test.

### Verification
- **`python manage.py test` → 46/46 pass** (26 existing + **20 new** in `payments/tests_payments.py`: fee math, refund tiers/split, payout pipeline + idempotency, webhook idempotency, invoice aggregation, receipt access).
- Migrations apply; existing rows remapped & verified; `makemigrations --check` → no drift.
- Web compiles clean (no console errors); doctor booking card verified in-browser.

### ⚠️ Follow-ups / flags
- [ ] 🔴 **RazorpayX go-live — TOP PRIORITY, sort out ASAP.** Payouts are still SIMULATED. Finish KYC/current-account activation, set `RAZORPAYX_ENABLED=true` + `RAZORPAYX_ACCOUNT_NUMBER`, implement `_live_payout()`, set `RAZORPAY_WEBHOOK_SECRET` + subscribe payout events. Until this lands, doctors are not actually being paid — everything upstream (splits, ledger, batches) is ready and waiting on it.
- [x] **Mobile app (separate repo):** parallel status-value + full-fee checkout changes — ✅ done 2026-07-28 (see session below). Still needs the dev-client/EAS rebuild before release.
- [x] **Marketing copy:** Hero "Pay ₹15" reworked to the full-fee model (₹20 booking fee + "doctor's fee & GST at checkout") across en/hi/kn/te — ✅ done 2026-07-28.
- [ ] Set up the 2 new Railway cron services (see `backend/notifications/CRON_SETUP.md`, updated).
- [x] **Committed** — the fee-splitting session landed as `7b2a01c` on `feature/fee-splitting-refunds-payouts`.

---

## 2026-07-27 — WhatsApp templates verified live ✅

All **4 Meta WhatsApp templates are approved and delivering** (tested end-to-end
via `send_test_whatsapp 9959330601` — each returned a real `wamid`, messages
received):

| Template | Sent to | Vars | Status |
|----------|---------|------|--------|
| `booking_confirmation` | patient | 6 | ✅ live |
| `appointment_reminder` | patient | 6 | ✅ live |
| `doctor_unavailable`   | patient | 6 | ✅ live |
| `hospital_new_booking` | hospital | 7 | ✅ live |

**Doctor-unavailable → free reschedule loop — confirmed working:**
- Hospital marks doctor unavailable → `doctors/views.py:_notify_doctor_unavailable`
  flags today's `waiting`/`held` bookings `free_reschedule=True` and fires
  push + WhatsApp (`doctor_unavailable`) per patient (background thread).
- Patient taps **Reschedule (free)** → `MyBookings.js` detects `free_reschedule`
  and hits the no-payment endpoint `PATCH /bookings/reschedule/<pk>/`.
- `RescheduleBookingView` (`bookings/views.py:313`) validates booking is
  `waiting`, flag is set, new date+slot given, and `slot ∈ doctor.slots`; updates
  date/slot and **consumes the flag** (one-time waiver). Any later reschedule
  falls back to the paid ₹5 flow.
- ✅ **Capacity check added** (`bookings/views.py` `RescheduleBookingView`): a free
  reschedule now rejects a slot that's already at `doctor.max_per_slot` (counting
  `waiting`+`in_progress`, excluding the booking itself), done atomically with
  `select_for_update` so two concurrent reschedules can't both overflow. Returns
  `Slot "<slot>" on <date> is full. Please pick another slot.`
  - Uses the same capacity definition as `doctors/views.py:slot_availability`.
  - ⚠️ Note the **paid** new-booking path (`payments/views.py:_handle_new_booking`)
    still doesn't enforce `max_per_slot` server-side — capacity there is
    frontend-only via `slot_availability`. Separate follow-up if we want it hard-enforced.

---

## ⏭️ Next session plan (2026-07-27)

**🚀 Deployment status (2026-07-26)**
- ✅ **Website — LIVE.** `www.tokenwalla.com` is serving book-for-other + downloadable
  ticket + login show-password (Vercel auto-deployed the pushed `main`).
- ✅ **Backend — LIVE.** Railway migrated (`0009` present); book-for-other saves in prod.
- ⏸️ **Mobile app — HOLD until after 2026-08-01** (per decision). The download +
  book-for-other UI is committed & pushed but needs a **dev-client/EAS rebuild** (native
  modules `react-native-view-shot`/`expo-sharing`). Do NOT ship the app before Aug 1;
  build & submit after: `eas build --profile production --platform all`.

**P0 — protect what's already live**
- [ ] Confirm the WhatsApp token is a **permanent System-User token** (not the 24h temp one) — otherwise every WhatsApp send stops tomorrow. Regenerate if unsure and update env on **both** web + cron services.
- [ ] Confirm **web + cron** services are both on the latest commit; run `python manage.py migrate` on web so migration `0008` (queue-payment unique index) is applied.

**P1 — finish WhatsApp**
- [ ] Verify the cron actually fires: cron **Logs** show `Reminder run complete` each tick; do one real ~2h booking end-to-end (WhatsAppLog `status=sent`).
- [x] Get `hospital_new_booking` **approved** in Meta, then `send_test_whatsapp <mobile> --template hospital_new_booking`. ✅ approved + test-sent 2026-07-27.
- [x] (Optional) Draft + submit `booking_confirmation` — the last of the 4 templates. ✅ approved + test-sent 2026-07-27.

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
  `my-bookings.tsx` — per-booking "Download Ticket" button that snapshots a dedicated
  **off-screen ticket view with a QR** (the list cards have none) and shares it. No new deps.
  ⚠️ **Needs a dev-client/EAS rebuild** (native modules).

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
