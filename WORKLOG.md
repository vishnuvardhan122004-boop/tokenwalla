# TokenWalla — Work Log

A running record of changes so we can cross-check what's done and what's pending.
Newest entry on top. Update the **Status** columns as things land.

- **Branch:** unmerged — `perf/dashboard-visible-polling` (**no PR**) + this wrap (web/backend) · `feat/popular-doctors-first` (PR #5) in the app. **The backlog is cleared and the branch list is swept** — 34 remote / 37 local merged branches deleted 2026-08-14. Merged 2026-08-14: web/backend PRs #20–#24, app PRs #6–#9; 2026-08-16: PR #25 (session-3 wrap, which triggered the deploy). **Do NOT delete** `develop` (deploys to staging), `harden-password-validators` or `website-cleanup-eslint-deadDep` — the last two look dead but hold unmerged work.
- **Latest commit at last update:** `08363b7` main (web/backend, **deployed & live** — PR #37 threads 4→8) · `9b582c9` main (app, 1.2.0 — **not built for production**; Play is still on 1.1.3, versionCode 37 free)
- **Last updated:** 2026-08-18 — **token rotated (item 4a closed), patient WhatsApp proven, nothing wrong in production.** Threads 4→8 merged (PR #37) and capacity priced out and closed. Only item 5b step 3 remains: the location-picker and walk-in-doctor device checks, then the production build.

> ✅ **The backend is live again.** Railway deployed the 4-day backlog on
> 2026-08-16 (bill paid + PR #25 merged to trigger it), so backend entries below
> are now running — verified against the live API. The remaining gap is the
> **app**: not built since 1.1.3 (36) on 2026-08-08, so no app entry has reached
> a patient until an EAS build ships. Verify app changes against a build, never
> the merge log.

> 🧹 **46 `(auto) — Session update` entries** are sitting in this file from a
> hook that snapshots `git status`. They are noise and they push the real
> entries down. Two more were generated mid-session on 2026-08-14 and removed by
> hand. Worth either deleting them in one pass or turning the hook off.

### How to update this log
- Add a new `## YYYY-MM-DD — <title>` section **on top** for each working session; keep older sessions below.
- As work lands, flip the **Status** cells (⬜ not started → 🕒 in progress → ✅ done) and tick **Action items** (`- [ ]` → `- [x]`).
- After you commit, bump the two lines above: `Latest commit` = `git rev-parse --short HEAD`, `Last updated` = `date +%Y-%m-%d`.
- Save the log with your work: `git add WORKLOG.md && git commit -m "docs: update worklog"` (then `git push`).
- Keep entries short — one line per change, link the commit hash so it's traceable.

---

## 2026-08-17 (session 2) — Token rotated, WhatsApp proven, production is clean

**No code changed.** This session closed the three operational items left over
from session 1. `main` = `1dd33e8a` (backend, deployed & verified) · `9b582c9`
(app). No PRs open except the old `railway-app` bot one (#3).

| Item | Result |
|---|---|
| **WhatsApp token rotated** (item 4a 🔴) | ✅ New System-User token generated in Meta, `WHATSAPP_ACCESS_TOKEN` updated on Railway, service redeployed clean |
| **Patient WhatsApp verified** (5b step 1) | ✅ `whatsapp_opt_in` ticked for user 4 via the new admin field, booking put through, **message arrived** |
| **`APP_LATEST_VERSION` blanked** (5b step 0) | ✅ `/api/app-version/` back to `""` — no install is being nagged |
| **Update prompt verified on device** | ✅ Nag appeared at `1.2.1`; "Not now" survived a background/reopen, proving the 6h cooldown and the new resume re-check |

**One booking proved three things at once.** Rotating a token is unverifiable
until something sends — a bad paste and a good one look identical, and
`send_template` returns rather than raising. Putting a real booking through the
app exercised the new token, the patient-side `booking_confirmation` (whose
opt-in gate had never let a single send through), and the hospital alert in one
action. That is the cheapest possible proof and it should be the standard check
after any WhatsApp credential change.

**Health after the variable change:** `/health/` → `1dd33e8a`, `cache.ok` true,
`/api/doctors/` serving 15. A variable-only deploy restarts the service without
changing the commit, so `/health/` cannot tell you *whether* it redeployed —
only that it came back up. `/api/app-version/` is the check for whether the
variable actually took.

**Still not done, and now the only thing between here and the store:** the
hospital location picker and a walk-in doctor. Both need a device, both are on
the APK already installed (`D7tIwO2…`, commit `67999e5`).

**Cleanup owed:** `preview/integration-2` and `preview/integration-2026-08-17`
are throwaway branches used to build preview APKs while PRs were open.
Everything they carried is merged. Delete them before someone cuts a release
build from one.

---

## 2026-08-18 — Capacity priced out: threads doubled, and the real ceiling found

**Merged:** web/backend **#37** (gunicorn `--threads 4 → 8`).

- **`--threads 4 → 8`** in `backend/Procfile` + `backend/railway.json` (kept in
  sync — two deploy paths, they must match). Checkout holds a thread waiting on
  Razorpay (order create/fetch + payment fetch): pure I/O wait, GIL released, so
  threads ~double simultaneous in-flight payments (~12 → ~24) at negligible RAM.
  DB safe: 3×8 = 24 Postgres connections/replica, under the ~100 default.
- **`backend/stress_test.sh`** — load harness on ApacheBench (already on macOS,
  no new dependency). Read paths plus a **checkout leg** added the same day; see
  the entry below for what the checkout leg refuses to do.
- **The capacity question is answered, and the answer is "not the problem".**
  Daily bookings are bounded by `max_per_slot` × slots × doctors — a few hundred
  a day at 11 doctors — roughly 1,000× below what the server serves. Workers,
  replicas, PgBouncer, async workers and a move to AWS were all considered and
  **rejected**: none of them raise a ceiling set by how many appointment slots
  exist. Recorded in ROADMAP item 7 so it does not get re-litigated.

**No tests added for the threads change** — it is a config value with nothing to
assert. The harness's guards were driven by hand instead.

---

## 2026-08-17 — The app finally left the test runner: five real bugs, found on a device

**Merged:** web/backend **#30 #31 #32 #33 #34** · app **#10 #11 #12**. Both mains
green and deployed. `main` = `8f4b6d8f` (backend, **deploy verified**) ·
`9b582c9` (app, **not built for production**).

**The day's shape:** everything before today was verified by test suites. Today
a preview APK went on a real handset, and it found **five bugs that no test
would ever have caught** — four of them the same root cause.

### 🔴 LEFTOVER THAT MUST BE CLEARED

**`APP_LATEST_VERSION` is set to `1.2.1` on Railway right now.** It was set to
prove the update prompt works, and proving it worked. While it stays set, every
install on 1.1.3 is nagged toward a version that **is not in the Play Store** —
a prompt they cannot satisfy. **Blank it.**

```bash
curl -s https://tokenwalla-production.up.railway.app/api/app-version/
```

### The root cause that produced five bugs

**Every hidden screen in the patient layout is a `Tabs.Screen` (`href: null`),
not a stack screen.** A tab navigator keeps ONE instance alive for the whole
session, so `useEffect(..., [])` runs **once per app session, not per visit**,
and any state not keyed to the current entity survives into the next one.

| Screen | Symptom | PR |
|---|---|---|
| `doctor/[id]` | Second doctor showed the first one's photo/name/fee for ~0.1s | #10 |
| `booking-token` | A patient's **second booking in one session** got no confirmation notification and no ~2.1h reminder | #10 |
| `booking-token`, `my-qr` | Download button stuck spinning after a pending share | #10 |
| `edit-profile` | Carried `otpVerified` across visits → client let an unverified mobile change through (server correctly rejected it) | #10 |
| **`HomeScreen`** | **A patient who logs out and back in received NO push at all** | #11 |

The `HomeScreen` one is the serious one and it was missed in the first sweep
**because it lives in `components/`, not `app/(patient)/`**. The audit boundary
is "is it rendered by a `Tabs.Screen`", not "which directory is it in".

### How the push bug hid — worth remembering

Reported as *"booking notified, cancel didn't"*. That reads like a cancel bug.
It wasn't: `booking-token.tsx` fires its **own local** notification, which
masked the fact that the server push never arrived. Cancel has no local
equivalent, so only cancel looked broken. **One bug, two symptoms, and the
louder symptom pointed at the wrong half.**

Proven from the Railway log, which is the only place it was visible:

```
device registered for user 21     ← old account
logout → login as ...0601         ← now user 4
(no "device registered for user 4")
Booking 21 created for user 4
[push] no registered devices for: ✅ Booking confirmed
```

### The WhatsApp report that was three separate things

*"No WhatsApp, and no rows in whatsapplog either."*

1. **Patient sends never ran.** `whatsapp_opt_in` was False for user 4 — set via
   the website's own opt-out toggle (`MyBookings.js`). The senders `return`
   **before** writing their `WhatsAppLog` row, so an opt-out leaves **no trail
   at all**. And the flag was in no admin fieldset, column or filter, so staff
   could neither see it nor undo it. Fixed in #34.
2. **The token was never the problem** — `hospital_new_booking` sent fine, with
   a `wamid`. That single log line ruled out the whole "rotate broke it" theory.
3. **`(#132001) Template name does not exist`** was `hospital_cancellation` —
   template #10, still in review at Meta. Known, inert, not a bug.

### Deploy verification, closed for good (#33)

`/health/` now reports the commit Railway built (`RAILWAY_GIT_COMMIT_SHA`).
The two previous deploys could only be confirmed because they happened to add
an endpoint to probe; the one before this added none, and "the service is up"
had to stand in for "the new code is live". Those are different claims.

```bash
curl -s .../health/ && git rev-parse --short=8 origin/main   # must match
```

It proved itself the same day: `8f4b6d8f` on both sides.

### The update gate had a hole (#12)

`checkForUpdate()` ran only on a **cold launch** — the root `useEffect` fires
once per app *process*, and on Android a process survives for days. So someone
tapping the "please update" push usually saw **nothing**: the app was resumed,
never relaunched. That silently broke the push → gate chain the push was
designed around.

Now re-checked on `AppState` → `active`, rate-limited: a **block** always
prompts (non-dismissible anyway, and such a build must not become usable by
backgrounding it), a **nag** at most once per 6h. Decision extracted as a pure
`shouldPrompt()` with 6 tests and an injected clock.

**Verified on the device**: prompt appears, "Not now" sticks across a
background/reopen. First time this feature has ever been observed working.

### Also landed

- **`manage.py send_update_push`** (#30) — the nudge half of the update story.
  Payload carries **no `screen` key** on purpose: installed builds route taps
  with a handler baked into the build, so an unknown route needs an app release
  — exactly what an out-of-date install cannot do. Absent the key, the tap just
  opens the app and the gate does the work. Does not send without `--send`.
- **Doctor page: ~30 emoji → Ionicons** (#12). Open/Closed now uses the same
  status dot as the Available pill; Instagram/Facebook use the real brand SVGs
  already in that file for the share sheet. Share *message* keeps its emoji —
  that goes to WhatsApp, where emoji are the right register.
- **Dashboard visible-polling** (#32) and the **session-2 wrap** (#31).

### Process lessons this day earned

1. **Pushing a branch is not opening a PR.** Three branches sat with
   `pull/new/…` links mistaken for PRs; nothing could be merged because nothing
   existed. Verify with the API, not the push output.
2. **A merge is two clicks** — *Merge pull request* then **Confirm merge**. The
   badge must turn purple. `pushed_at` on the repo not moving is proof no merge
   reached GitHub.
3. **Driving Chrome can open PRs; it cannot merge them** — the classifier blocks
   the merge intent. Both automated paths are closed, so merging is Vishnu's,
   always.
4. **Build a preview before a production build.** Preview reuses the version
   code; production auto-increments **permanently**. Three preview builds today
   found five bugs and burned no store version. versionCode 37 is still free.

### Tests

backend **227** (2 skipped) · web **25** · app **139** · zero
`graph.facebook.com` / `exp.host` leaks under `-v 2` · migrations clean ·
`check --deploy` clean under `DEBUG=False`.

---

## 2026-08-16 (session 2) — Readiness audit, the update push, and four stale-state bugs in the app

**Branches:** `feat/app-update-push` (backend) · `fix/doctor-detail-stale-flash`
(app, 3 commits) · this wrap. **All pushed, none merged — `gh` is still not
authenticated, so every PR has to be opened by hand.**

### Readiness audit — the backend half is ready, the app half is undelivered

| Check | Result |
|---|---|
| Backend suite | **225 passed, 2 skipped** (the Postgres-only concurrency pair) |
| `-v 2` outbound leaks | **0** `graph.facebook.com`, **0** `exp.host` — no thread escaped |
| Web tests | 20/20 |
| App tests | 133/133, `tsc` clean |
| `makemigrations --check` | clean |
| Live API | 200; `cache: {backend: redis, ok: true}` |
| Live headers | HSTS+preload, `nosniff`, `X-Frame-Options: DENY`, COOP, referrer-policy |
| Notification wiring | all 10 events fire push **and** WhatsApp, verified call site by call site |

### The update push (backend)

`push_app_update()` + `manage.py send_update_push <version> [--send]`. The
force-update gate already existed end to end and works; what was missing was any
way to reach someone who is not opening the app.

Two decisions worth keeping:

- **The payload carries no `screen` key.** Installed builds route a tap on
  `data.screen` with a handler that ships *with the build*, so an unknown value
  would need an app release to be understood — exactly what an out-of-date
  install cannot do. Absent the key both branches fall through, the tap just
  opens the app, and the launch gate does the blocking. Locked by a test.
- **A broadcast cannot be recalled**, so it does not send without `--send`.

Sent one role at a time so `audience` matches the recipient; otherwise a hospital
staffer finds the notice in their patient tab.

### Four stale-state bugs in the app — all one root cause

**Every hidden screen in the patient layout is a `Tabs.Screen` (`href: null`),
not a stack screen.** A tab navigator keeps ONE instance alive for the whole
session, so any state not keyed to the current entity survives into the next
visit. This is the single most useful thing learned today and it will bite again
the next time a hidden screen is added.

| Screen | Bug | Fix |
|---|---|---|
| `doctor/[id]` | **Reported by Vishnu.** Picking a second doctor showed the first one's photo, name and fee for ~0.1s. `loading` was still false and `doctor` still held the previous one | Reset the four pieces of per-doctor state up front + cancel in-flight requests on `id` change |
| `booking-token` | `notifiedRef` was a boolean set once and never cleared, so a patient's **SECOND booking in one session** got neither `notifyBookingConfirmed` nor the ~2.1h `scheduleAppointmentReminder` | Keyed the ref to the token |
| `booking-token` / `my-qr` | A share left pending kept the Download button spinning and disabled on the next visit | Reset `downloading` per token / on focus |
| `edit-profile` | Loaded the user in a `[]` effect — once per app **session**. Carried `otpVerified` over, so the client gate passed for a number never verified | `useFocusEffect` + reset the OTP fields |

**The `edit-profile` one is NOT a security hole, and the reason matters:**
`MeView.patch` checks a per-number `otp_verified:<mobile>` cache flag and
consumes it, so the server was rejecting these correctly. The client was just
letting the request leave, producing a confusing 400 on a screen that showed the
number as verified. Server-side verification earned its keep again.

**Audited and deliberately unchanged:** `about`/`terms`/`privacy`/`refund` (no
state), `contact` (form state feeds a `mailto:`; persisting it is right, the mail
app may never send), `notifications` (live store via `useNotificationCenter`),
`payment` (**already** reset its fee breakdown per doctor — the pattern the
others were missing). `app/(hospital)/_layout.tsx` is a `Stack`, so the whole
defect class does not apply there.

### What this session could not do, and why

Everything left on the list is behind a credential or is a public release:
rotating the WhatsApp token (Meta login), the store release (Google account),
the Railway env vars (a deploy), and opening the PRs (`gh` unauthenticated).
See ROADMAP item 5a for the ordered runbook.

**One correction to an earlier plan:** setting `APP_LATEST_VERSION` was requested
this session and **deliberately not done**. Play is on **1.1.3**; 1.2.0 has only
ever been a *preview* build. `1.2.0` would nag every install toward something
that is not downloadable, and `1.1.3` is a no-op. The gate is not the blocker —
the missing store release is.

---

## 2026-08-16 (auto) — Session update @ 03:30

Auto-generated snapshot (branch `docs/close-item4-whatsapp`, 1 changed file).

```
M ROADMAP.md
```

---


## 2026-08-16 — Railway deploy unstuck

Four sessions on the top line, closed. Bill paid; the deploy still had to be
triggered by a push to main.

| Change | Repo | PR | Status |
|---|---|---|---|
| Verified Railway resumed deploying the 4-day backlog | backend | #25 (trigger) | ✅ live |
| Item 0 (unpaid bill) + item 2b (`[TEST]`/Heyi API hole) closed | — | — | ✅ |
| WhatsApp token confirmed live on Railway (item 4) | backend | — | ✅ delivered to handset |
| All **7** WhatsApp templates verified delivering | backend | — | ✅ approval + param counts confirmed |
| `WHATSAPP_TEMPLATES.md` "← submit this" markers corrected | backend | — | ✅ doc was stale |
| Push paired with WhatsApp on 2 patient gaps + 3 push-only events | backend | **#27 merged** | ✅ 218 tests, 5 green runs |
| Templates 8–10 submitted to Meta (browser) | — | — | ⏳ **In review**, Utility |
| Live WhatsApp token pasted into chat | — | — | 🔴 **needs rotating** — item 4a |

- **Paying the bill did not redeploy.** Main hadn't changed, so Railway's GitHub
  integration had no new event. Merging PR #25 (session-3 wrap, docs-only) was
  the push-to-main that triggered it.
- **Proven live by re-probing:** `/api/app-version/` → 200, `/health/` →
  `cache.backend=redis, ok=true`, `/api/hospitals/` has `landline`,
  `/api/doctors/` → 0 `[TEST]`, Heyi absent. Migrations applied cleanly.
- **Not verifiable from a session:** the Railway build/migration logs (dashboard
  only). API behaviour covers it.
- **WhatsApp token proven (item 4).** `send_test_whatsapp … --template
  booking_confirmation` in the Railway container → real Meta `wamid` **and the
  message arrived**. A `message_id` alone is not proof (`send_template` never
  raises); delivery is. Path traps: `/app` **is** the backend root, and a local
  run uses the local `.env` token, not Railway's.
- **All seven templates then verified**, not just the one: `booking_confirmation`,
  `doctor_unavailable`, `hospital_new_booking`, `appointment_reminder`,
  `doctor_payout`, `booking_cancelled`, `booking_no_show` — each sent, each
  received. Confirms approval *and* param counts (4–7, differing per template).
- **Two stale docs corrected.** `WHATSAPP_TEMPLATES.md` marked four templates
  "← submit this" and ROADMAP said "all 4 templates approved" (2026-07-27) —
  written before cancel/no-show/payout shipped on 2026-08-06/07. Following
  either would have meant submitting duplicates.
- **No new template needed for registration** (the question asked). A template
  only fires if a `send_*` function names it, and registration/OTP runs on
  **2Factor SMS**, not WhatsApp. Payouts already have `doctor_payout`.
- **Both channels paired** (PR #27). Push already had 9 senders and 5 of 7 events
  were paired; the real gaps were **booking confirmed** (patient got WhatsApp
  while the only push went to the *hospital*) and the **reminder** cron. Then the
  three push-only events got WhatsApp halves. 218 tests, 5 green runs, migration
  0009 is choices-only. **CLAUDE.md trap 1 updated**: the call and QR-scan
  endpoints now spawn a `_whatsapp_async` thread that does a **DB write**, and no
  test covers those paths yet.
- **Templates 8–10 submitted via the browser, not the API** — and the API route
  would have failed twice over. The WABA id supplied was wrong (real one:
  **`973395062366160`**), *and* Meta rejects at submission time: a body may not
  start or end with a variable, and **a trailing full stop does not count as
  text**. Two bodies reworded; param order untouched, so no code change.
- **A live WhatsApp token was pasted into the chat** while debugging a `curl`
  whose real bug was a `$` prefix expanding it to empty. It was never used from
  there, but it **must be rotated** — see ROADMAP item 4a. The lesson: run the
  command where the credential already lives rather than moving the credential.

---

## 2026-08-14 (session 3) — The app leaves the test runner

First session where the app was proven on real hardware rather than in CI.

| Change | Repo | PR | Status |
|---|---|---|---|
| Sentry DSN — crash reporting switched on | app | #9 | ✅ merged, **not built** |
| Preview build 1.2.0 (36) installed on a device | app | — | ✅ **push confirmed working** |
| Full release-gate audit | app | — | ✅ verdict recorded in ROADMAP item 5 |
| Branch sweep: 34 remote + 37 local deleted | both | — | ✅ |
| Production build | app | — | ⛔ **deliberately not run** |

### 1. Push works — and that one result closed three unknowns
A test push reached the device. That simultaneously proves the `.easignore`
mirror delivered `google-services.json` to the EAS builder (the exact failure
`DONE-push-setup.md` step 6 warns about), that the FCM credentials match the
shipped config, and that the `appointments` channel and the build-time
notification icon are correct.

**Getting the token was the hard part**, and it is worth writing down: the app
logs the Expo token only under `__DEV__`, so a preview build never shows it.
The route that worked — log in (registration fires from `HomeScreen`, only
after login), then read `expo_token` from Django admin at
`/admin/notifications/devicetoken/`.

### 2. The compatibility check nobody had run
App 1.2.0 was written against `main`; production runs `2c4ec25`, four days
stale. Diffed the real contract instead of assuming:

- **one route added** since the deployed commit (`/api/app-version/`), and the
  update gate `catch { return }`s a 404
- **`payments/views.py`, `fees.py`, `razorpay_utils.py` are byte-identical** —
  the money path has not drifted at all
- new fields the app reads (`landline`, `announcement_active`) are optional with
  fallbacks

**The app is compatible with the backend actually running.** That was the
biggest unknown in the release and it came back clean.

### 3. Sentry, and why not Crashlytics
The Sentry wiring had existed since 2026-08-08 and was inert — `initSentry()`
returns early on an empty DSN, so every crash in every build went unreported.
One line fixed it. Crashlytics was the obvious question given push already uses
Google, and the answer is that **the app has no Firebase SDK at all** — push
runs through Expo's service using `google-services.json` purely for
credentials. Crashlytics would have meant a first native-module integration, a
config plugin, a rebuild and deleting 69 lines of working code, to land in the
same place.

### 4. The branch labelled "long dead" that was not
Swept 34 remote and 37 local merged branches. Kept `develop` (it deploys to
staging and appeared in the merged list — deleting it would have been bad), and
kept two this file had called long dead: **`harden-password-validators` holds an
unmerged commit enabling Django's password validators** — the open "6-char
password floor" item — and `website-cleanup-eslint-deadDep` still carries an
un-landed eslint re-enable. Reading them beat trusting the label.

### 5. Why the production build did not run
Two things should land first: **app PR #5** (without it the app and website rank
doctors differently), and the **remaining device checks** — the location picker,
a walk-in doctor's missing Book button, Android back, and a real ₹25.37 booking.
Push was the only one completed. A production build auto-increments to
versionCode 37 permanently, and if the picker is broken it costs build 38 plus
another manual Play upload.

### 6. Railway: day four
`/api/app-version/` still 404. The bill is being settled; **verify the deploy
rather than assume it** — this item has survived three sessions of being assumed
fixed.

---

## 2026-08-14 (session 2) — The backlog cleared, and a wrong risk line corrected

Nine PRs merged across both repos. The three-day merge backlog that dominated
this plan is gone, and app `main` finally carries a shippable 1.2.0.

| Change | Repo | PR | Status |
|---|---|---|---|
| Popularity ranking (backend + web) | web/backend | #20 | ✅ merged, **live on Vercel** |
| Wrap docs for 08-13 s3 + 08-14 | docs | #21 | ✅ merged |
| Item 0 exposure claim corrected | docs | #23 | ✅ merged |
| Release branch (1.2.0, checkout fix, ₹15→₹20) | app | #6 | ✅ merged, **not built** |
| Map load timeout | app | #7 | ✅ merged, **not built** |
| Detail screen hides test-hospital doctors | app | #8 | ✅ merged, **not built** |
| Popularity ranking (app half) | app | #5 | 🕒 open |

### 1. The ranking is live, and verified in a browser
`www.tokenwalla.com` serves the new bundle. Checked the rendered page rather
than the merge log: 13 available doctors sort above the unavailable one, and
scores descend cleanly (69, 67, 60, 53, 52, 49, 46, 45, 43, 37, 30, 30, 20).
Popularity contributes 0 to everyone, exactly as predicted — the backend half
is merged but undeployed, and both clients fall back to `|| 0`. No console
errors.

### 2. A risk line this file had carried for three sessions was wrong
Item 0 said "a patient can still be charged ₹388.37 for an appointment that
does not exist." It collapsed two claims — *the server fix isn't deployed*
(true) and *patients are exposed* (false).

| Surface | List | Detail | Live? |
|---|---|---|---|
| Web | ✅ `filterTestDoctors` | ✅ `DoctorsDetails.js:109` | yes |
| App 1.1.3 | ✅ `isTestHospital` | ❌ none | yes, in build 36 |

Verified, not reasoned: the live site renders **14 doctors with Heyi absent
while the API returns 15**, and `git merge-base --is-ancestor <filter> eddf5dd`
puts the app's filter inside the shipped build. Real exposure is API-direct plus
an app deep link.

**The rule earned:** when a risk line is about money, check the surface a
patient actually touches. A server-side gap is not automatically a
patient-facing one — the client may already be defending.

### 3. The gap that correction found, closed the same session
`doctor/[id].tsx` had no test-hospital guard, so a deep link rendered the full
bookable screen for the one `FULL`-collection row in the system. Fixed with the
helper the sibling list already imports and the same
`safeBack(router, '/(patient)/doctors')` the missing-doctor path uses. 12 lines,
`tsc` clean, 133 tests. **The guard itself has no test** — the app has no
screen-test harness; `isTestHospital` is unit-tested, the wiring is not.

### 4. Railway: day four, unchanged
`/api/app-version/` → 404, `/health/` → old body. Nine merges today; none of the
backend ones are running.

---

## 2026-08-14 — The OTP per-IP ceiling, and the app repo audited

One planned slice (ROADMAP item 2c) and one asked-for audit of the app repo.

| Change | Repo | Commit | Status |
|---|---|---|---|
| `OTP_MAX_SENDS_PER_IP_PER_DAY` 200 → 2000, reasoning recorded | backend | `1cd9734` | ✅ merged (PR #22) |
| Test: per-number cap still binds at 10 with the IP ceiling at 2000 | backend | `1cd9734` | ✅ merged (PR #22) |
| 429 message no longer claims "try again tomorrow" | backend | `1cd9734` | ✅ merged (PR #22) |
| Merged `main` into the branch, resolved the `settings.py` conflict | backend | `6097d0f` | ✅ merged (PR #22) |
| ROADMAP + WORKLOG for today | docs | this | 🕒 on PR #21 |

### 1. 200/day was the CGNAT mistake again, slower
The burst on that branch had just been fixed for carrier-grade NAT; the daily
ceiling beside it never got the same scrutiny. One Indian public IPv4 fronts
hundreds to low thousands of subscribers and a signup costs 1–2 sends, so 200
served only ~100–200 real people per carrier per day.

**The part that was not in the original reasoning:** `RateCounter.bump` rolls
its window from the **first** event, so tripping the cap at 08:00 locks that
carrier out until 08:00 tomorrow — not until midnight. One bad morning costs a
full day of signups.

Priced rather than guessed, at ~₹0.25/SMS: an abusive IP is worth ~₹50/day at
200, ~₹500/day at 2000, ~₹7,200/day with only the 20/min burst. 2000 sits an
order of magnitude under burst-only with ~10× headroom over any plausible real
CGNAT population.

### 2. The test that mattered was not the number
The per-number cap (10/day) is the real SMS spend control. The new test pins
the two apart — IP ceiling at 2000, one number still stops at the eleventh
send — so a future bump cannot quietly promote the IP ceiling into that role.
**196 tests, 6 consecutive green runs, zero `graph.facebook.com` lines.**

### 3. The merge conflict was the predicted one
Item 2b's `ANON_RATE` reached `main` via PR #14 while the branch was open; both
sides add a constant beside `DEFAULT_THROTTLE_RATES`. Kept **both** verbatim —
separate scopes, and `RequestOTPView` sets `throttle_classes =
[OTPRateThrottle]`, which *replaces* the defaults, so the raised anon rate never
reaches the OTP path. Git had merged the dict correctly; only comments collided.

### 4. The app repo has not moved since 2026-08-11
Audited on request. App `main` is still **1.1.3**, same as the Play Store build.
Three branches unmerged and **the two that matter have no PR at all** —
`payments-server-priced-checkout` (13 commits, carries the 1.2.0 bump, the
checkout fix and the ₹15→₹20 correction) and `fix/map-load-timeout`. Only the
least urgent one, `feat/popular-doctors-first`, has a PR (#5).

Verified rather than assumed: all three merge **clean** into `main` in any order
(`git merge-tree`), and `5b11bd7` **is** inside the release branch
(`git merge-base --is-ancestor`). The app's popularity branch is safe to ship
ahead of the backend — it `.catch(() => {})`s the view POST and falls back to
`|| 0`.

**Still costing money quietly:** the installed 1.1.3 app advertises **₹15**
while Razorpay charges **₹25.37**. The correction sits in the unmerged branch.

### 5. Two things found on the way
- **A blocked OTP IP is invisible** — a `logger.warning` and nothing else. If
  2000 ever bites a real carrier, you learn it from a user.
- **The production guard false-positived**, blocking a feature-branch push
  because the same compound command mentioned `origin/main` in a read-only
  `git merge-tree`. Surfaced rather than reworded around; noted in **Next** as
  a one-line narrowing that must be its own commit.

### 6. Railway: day four
`/api/app-version/` → **404**, `/health/` → the old body, `landline` → **0**,
and doctor Heyi is still live on `FULL`. The one-click admin mitigation still
has not been applied. `/api/app-version/` is now the cleanest deploy tripwire
we have, since it did not exist before PR #22.

---

## 2026-08-13 (session 3) — Icons site-wide, and popularity ranking

| Change | Repo | Commit | Status |
|---|---|---|---|
| Dashboard emoji → Bootstrap Icons | web | `2496501` | 🕒 pushed, **no PR** |
| Bootstrap Icons site-wide (23 files) + `theme.css` polish layer | web | `e76a02a` | ✅ merged (PR #18) |
| Emoji in the four locale JSON files | web | `b608d06` | ✅ merged (PR #18) |
| `Doctor.view_count` + `POST /doctors/<id>/view/` + ranking | backend + web | `76e0192` | 🕒 pushed, **no PR** |
| Popularity folded into the app's `rankDoctor` | app | `741d0a9` | 🕒 pushed, **no PR** |

### 1. Popular doctors first
The website did not sort its doctor list at all — database id order, so whoever
registered first led forever. The app already ranked; the website now shares
its weights, plus a popularity term in both:
`available +100 · city +50 · experience +1 · slots +2 · popularity +0..30`.

Popularity is `12·log10(1+views)` capped at 30, deliberately: raw click order
is self-reinforcing, and the cap keeps it under the availability weight. A
120-view doctor marked unavailable drops to last — checked in a browser, not
assumed. Counting is its own POST (the dashboard polls `retrieve()` and would
rank whichever doctor staff open most) and one atomic `F()` UPDATE.

Bookings would beat clicks as a signal, but there have been four ever.

### 2. Icons and polish
175 JSX emoji → icons, 74 stripped from label strings, 25 data fields
converted. `theme.css` unifies five shadow strengths, radii 4–18px and three
muted greys into one set of tokens. Surface treatment only — no spacing or
layout changes. Patient CSS 33.74 → 48.35 kB for the icon font, deliberate.

**The first attempt was a regex sweep and it corrupted source** — injected JSX
into a WhatsApp share string, ate the space in `target="_blank" rel=`. Reverted
wholesale, redone as a babel codemod over `JSXText` nodes. It then missed the
locale JSON files entirely, caught only by looking at the rendered page.

### 3. Three branches were believed merged and were not
No PR had ever been opened for any of them. A session cannot open PRs, so a
pushed branch sits silently. Confirmed via the GitHub API before writing these
docs — the alternative was recording another "merged and live" line that was
not true, which is exactly what item 2b did this morning.

### Verification
191 backend · 20 web · 104 app tests. `makemigrations --check` clean, web build
clean, app `tsc` clean. Ranking and view-counting driven in a real browser:
count went 0→1 on open, stayed 1 on reload (session guard), list reordered.

### Action items
- [ ] **Open PRs for the three pushed branches** — `fix/dashboard-icons` first
      (it and `feat/popular-doctors-first` both touch `Hdashboard.js`)
- [ ] Pay the Railway bill; nothing merged since 2026-08-11 is running
- [ ] Delete the dead branches `fix/hide-test-hospitals`, `docs/wrap-2026-08-11-s3`

---

## 2026-08-13 (session 2) — Mobile-responsive hospital screens, and a stuck deploy

Two threads. The planned one was making the hospital screens work on a phone.
The unplanned one was discovering that **nothing has deployed since 2026-08-11**.

| Change | Repo | Commit | Status |
|---|---|---|---|
| Dashboard: 44px tap targets, sticky save, 2×2 tabs, 3-col slot grid | web | `c232fcc` | ✅ merged (PR #16) |
| Dashboard doctor card falls back to landline | web | `c232fcc` | ✅ merged (PR #16) |
| Profile: 44px targets, sticky save, stacked detail rows | web | `0c5a706` | ✅ merged (PR #16) |
| Profile: emoji → Bootstrap Icons, dynamically imported | web | `0c5a706` | ✅ merged (PR #16) |
| App profile: announcement + expiry in the read view | app | `ccd446b` | 🕒 pushed, unmerged |
| ROADMAP/WORKLOG corrections | docs | this | 🕒 pushed |

### 1. The deploy is stuck, and item 2b was wrong
Probed the live API rather than trusting the plan: `landline`,
`announcement_until` and `announcement_active` are all absent, `/health/` still
returns the old body, and `[TEST] Demo Hospital` plus its **₹388.37** doctor
are **still visible to patients**. ROADMAP item 2b said that fix was "merged
and live" — it was merged, never deployed. Cause is an unpaid Railway bill, so
it is Vishnu's to clear. Corrected in ROADMAP as item 0, with a no-deploy
mitigation (flip Heyi to `SERVICE_ONLY` in admin).

### 2. Measure before redesigning
At 375px: **90 tap targets under 44px** on the dashboard, **26** on the
profile, and Save ~2,250px down both forms. Both now 0 undersized with sticky
save bars. Desktop and tablet verified unchanged at 1280 and 768; no horizontal
overflow at any of the three widths — that part was already fine and did not
need touching.

### 3. Two traps worth remembering
- **Bootstrap's `.d-flex` is `!important`**, so a `display:grid` override loses
  silently. The slot picker got its own class instead of an `!important` fight.
- **A static `bootstrap-icons` import cost 13.82 kB gzip** in the bundle every
  patient downloads, for a staff-only screen — the same trap Leaflet fell into
  on 2026-08-11. Dynamic import; main CSS back to its 33.74 kB baseline.

### 4. Cross-repo features finish in one repo
Two gaps from the walk-in work, both presentation so no test caught them: the
web doctor card had no landline fallback (the app did), and the app profile
never showed the announcement back (the web did). Both fixed.

### Verification
181 backend · 20 web · 104 app tests pass. Web production build clean, app
`tsc` clean. The responsive work was measured and re-measured in a real browser
at 375/768/1280, not eyeballed.

### Action items
- [ ] **Pay the Railway bill, then confirm the deploy** (ROADMAP item 0)
- [ ] Merge the app branch `fix/app-profile-announcement-readview`
- [ ] Convert `Hdashboard.js` emoji to Bootstrap Icons (dynamic import)
- [ ] Delete the two dead branches

---

## 2026-08-13 — Walk-in doctors, landline contacts, expiring notices

A hospital visited that day could not be onboarded. One doctor runs the whole
place and cannot promise a slot time, and the clinic answers a **landline**.
Both were hard blocks in the upload form — not preferences, not polish. The
hospital still wanted TokenWalla for what it *could* do: publish timings, post
holidays and offers, and be findable.

| Change | Repo | Commit | Status |
|---|---|---|---|
| Zero slots is a valid doctor — "select at least one time slot" removed | web/backend | `57fb775` | ✅ merged (PR #13) |
| Zero slots is a valid doctor — app dashboard | app | `a5f1788` | 🕒 pushed, unmerged |
| `Hospital.landline` + `Doctor.landline`, `Doctor.mobile` now optional | web/backend | `57fb775` | ✅ merged (PR #13) |
| `Hospital.announcement_until` + server-computed `announcement_active` | web/backend | `57fb775` | ✅ merged (PR #13) |
| Patient walk-in view (hours + days + call button, no booking CTA) | web/backend | `57fb775` | ✅ merged (PR #13) |
| Patient walk-in view + landline fields + expiry input | app | `a5f1788` | 🕒 pushed, unmerged |
| `walk_in_contact` string in all four languages | app | `a5f1788` | 🕒 pushed, unmerged |

### 1. Zero slots — a listing, not a misconfiguration
The rule lived only in the two dashboards' client-side validation; the backend
never required slots. Both patient screens **already** handled an empty list
("No slots configured"), so most of the work was turning that dead-end string
into something useful: hospital hours, the doctor's days, and a call button.

**No booking CTA in walk-in mode**, on purpose. The payment path is built around
a slot — `create-order` validates `slot in doctor.slots` — so there is no token
to sell, and a pay button that produced nothing would be taking money for
nothing. `days` stays required: which days the doctor sits is real information
even without times.

### 2. Landline is a separate column, not a looser `mobile`
The tempting one-line fix — relax the mobile regex — would have been wrong.
`Hospital.mobile` is the **login username** and the OTP destination;
`Doctor.mobile` is where `send_doctor_payout_paid` sends WhatsApp. A landline in
either field breaks something silently. So `landline` is its own column on both
models, a doctor needs **one or the other**, and the two patterns live together
in `tokenwalla/utils.py` so the web and app validators cannot drift from the
server.

Patterns, as specified: mobile `^[6-9][0-9]{9}$`, landline
`^0[1-9][0-9]{1,3}[- ]?[0-9]{6,8}$`.

### 3. Announcements that expire
The hospital wanted to post holidays and offers — `Hospital.announcement`
already did that. What it lacked was an end date, so a "Closed for Sankranti"
notice would sit there in March. One nullable `announcement_until`, plus
`announcement_active` computed **server-side** so the website and the app cannot
disagree, and an older app build that ignores the flag behaves exactly as
before. A date-based holiday calendar was considered and skipped — the free-text
notice plus an expiry covers what was actually asked for.

### Contract and migration safety
Every API change is **additive** — new optional fields on existing endpoints —
so installed 1.1.3 apps are unaffected and the backend could merge before the
app. Both migrations add nullable/blank columns only and are safe to run before
the code that reads them.

### Verification
- 113 tests on `main` (14 new), 181 on the merged docs branch, `makemigrations
  --check` clean, zero `graph.facebook.com` lines under `-v 2`.
- Web production build clean; app `tsc --noEmit` clean.
- **Driven in a real browser** against a local server: created a doctor through
  the actual hospital dashboard with **no mobile, a landline and zero slots** —
  it saved, the card showed the walk-in badge, and the patient page rendered the
  walk-in view with a working `tel:` button. An announcement dated yesterday
  stopped showing. A slotted doctor was unchanged.

### Two things to know
- **The branch was cut from a stale local `main`** (33 commits behind) after the
  session had already read the code on `docs/wrap-2026-08-11-s3`. Nothing was
  lost, but PR #13 collided with `fix/hide-test-hospitals` on a two-line import
  in `backend/hospitals/views.py`. That was resolved inside PR #14, which
  therefore shipped a **patient-facing code fix inside a docs PR** — it is live
  and green, but it is not how it should have gone: the conflict belonged on the
  code branch. Both rules are now in ROADMAP item 1. **Fetch before branching,
  and keep docs branches docs-only.**
- **The local dev sqlite was changed while testing**: migrations applied, the
  Demo Hospital's password hash overwritten with `localdev123` (the original
  cannot be restored — reset it whenever), and a `Walkin Landline Doc` fixture
  left behind. Local only; production was never touched.

### Action items
- [x] Merge `feat/walkin-doctors-landline` (web/backend) — PR #13, live
- [x] Merge the wrap — PR #14, live. Carried `fix/hide-test-hospitals` with it.
- [ ] Merge the app branch `feat/walkin-doctors-landline` (after the 1.2.0 pair)
- [ ] Delete the dead branches `fix/hide-test-hospitals` and `docs/wrap-2026-08-11-s3`
- [ ] Run the app walk-in screen on a device once (`npx expo start`)
- [ ] Reset the local Demo Hospital password if `localdev123` bothers you

---

## 2026-08-11 (session 3) — Release gate, and two production fixes rescued

Asked whether the app could go to the Play Store today. **Answer: no.** Also
found complete-but-uncommitted production bug fixes in the working tree and
landed them before they were lost.

| Change | Repo | Commit | Status |
|---|---|---|---|
| `.easignore` so `google-services.json` reaches EAS | app | PR #2 | ✅ **merged** |
| Map picker: 12s deadline + Try again instead of an endless spinner | app | `a98fa2b` | ✅ pushed, unmerged |
| Hide `[TEST]` hospitals from patients; anon throttle 60→300/min | web | `3197377` | ✅ pushed, unmerged |
| Hospital location picker (profile + signup) | web | PR #12 | ✅ **merged** |

- **Play Store verdict: not ready.** No branch contained a shippable app —
  `main` was 1.1.3 with the picker but none of the 13 release commits, and the
  release branch had 1.2.0 without the picker. A build from `main` would have
  shipped the broken checkout under a non-new version number. Merge is clean and
  yields 1.2.0 with everything.
- **Android push would have been dead in the build.** `google-services.json` is
  gitignored so EAS never got it. `.easignore` *replaces* `.gitignore` for EAS
  rather than extending it, so it had to be a full mirror — a minimal one would
  have uploaded `node_modules` and the local `ios/` Pods tree and flipped EAS
  into a bare-workflow build. Verified by diffing both rule sets: exactly one
  path changes state, and the keystore and service-account keys stay excluded.
- **No crash reporting at all** — `sentryDsn` is `""`, plus
  `SENTRY_DISABLE_AUTO_UPLOAD` on all three profiles. Flagged, not fixed.
- **`[TEST] Demo Hospital` was patient-visible**, and its doctor is the only
  `FULL`-collection row in the system, so a patient could have been charged for
  an appointment that does not exist. Was sitting uncommitted on an
  already-merged branch behind a stale `.git/index.lock`; lock cleared, verified,
  pushed.
- **Two verification methods that were wrong and got corrected:** an ignore-rule
  check using `git check-ignore --no-index --exclude-from` silently ignores the
  exclude file and reported everything as included — redone with
  `git ls-files -o -i -X`. And `$b:app.json` in zsh is a `:a` path modifier, not
  a git revision.

**Tests:** backend 167 pass + `makemigrations --check` clean; app `tsc` clean,
104 pass, lint clean, Android and iOS bundles both build.

**Not proven:** the app's React Native layer — picker, map failure path,
`expo-location` — has still never run. No simulator or Android SDK on this
machine (Command Line Tools only, no Xcode), so it cannot be checked from a
session. Needs a preview build on a real Android phone.

---

## 2026-08-12 (auto) — Session update @ 23:44

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:38

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:32

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:30

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:26

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:20

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:12

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:07

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:04

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


## 2026-08-12 (auto) — Session update @ 12:01

Auto-generated snapshot (branch `docs/wrap-2026-08-11`, 8 changed files).

```
M ROADMAP.md
 M TASKS.md
 M WORKLOG.md
 M backend/doctors/views.py
 M backend/hospitals/models.py
 M backend/hospitals/views.py
 M backend/tokenwalla/settings.py
?? backend/hospitals/tests_test_hospital_visibility.py
```

---


---

## 2026-08-11 (session 3) — verified production, found two live bugs

No merges. This session read production rather than writing to it, and four
items that were open turned out to be already done.

### Verified done — stop re-doing these

| Item | Evidence |
|---|---|
| **Redis** | Online with `redis-volume`; `REDIS_URL` + `USE_REDIS_CACHE` set; canvas draws a `${{...}}` reference edge. **Serving**: live `:1:throttle_user_…` / `:1:throttle_anon_…` keys in the data browser |
| **Payouts cron** | Ran `2026-08-10 20:31:57`, 3s, logged `Ledgered 0 booking(s)…`. Schedule "03:00 pm (UTC)" = 20:30 IST |
| **Reminders cron** | Every 10 min without a gap, 08-10 13:00 → 08-11 14:50, each logging `Reminder run complete. Sent 0 reminder(s).` |
| **EAS build** | Production **1.1.3 (36)**, `eddf5dd`, 8 Aug. `merge-base` proves `cb3d29d` (Razorpay checkout) is in it |

### Two live bugs, fixed in the working tree (UNCOMMITTED — `.git/index.lock`)

| Bug | Why it matters | Fix |
|---|---|---|
| `[TEST] Demo Hospital` publicly listed | Its doctor is the **only** `FULL`-collection row → a patient could be charged **₹388.37** for a fake appointment, and we would owe a payout on it | `TEST_HOSPITAL_PREFIX` + `exclude_test_hospitals()` + `show_test_hospitals_to()`; 9 tests |
| `anon` throttle 60/min, keyed on IP | Indian CGNAT shares one IP across a neighbourhood; ~5 concurrent visitors → 429 for everyone behind that carrier | → `ANON_RATE`, default 300/min, env-overridable |

Backend **167 tests** (158 + 9), 10 consecutive green runs, no migration.

### Found, not fixed

- **The app shows ₹15; the backend charges ₹25.37.** `PLATFORM_FEE` became ₹20
  on 2026-07-28 (`7b2a01c`); build 36 still ships `₹15`. Two weeks live. Last
  booking was 26 July, two days before the change.
- **EAS Submissions is empty** — nothing has ever been submitted through EAS, so
  the Play build was uploaded by hand and EAS cannot say which version is live.
  Only Play Console can answer that.
- **`OTP_MAX_SENDS_PER_IP_PER_DAY=200`** on `feat/app-version-gate` has the same
  CGNAT problem as the burst it was written to fix, but daily and harsher.

### The conclusion that changes the plan

**The funnel is empty, not broken.** The shipped build matches the backend, the
backend is healthy, nothing technical stops a booking. Four bookings ever is a
demand problem, and no further hardening moves it. The bugs above are worth
fixing because they will embarrass a campaign — not because they explain the
silence.

**Also worth naming: the throttle counters only became accurate when Redis went
live.** `DatabaseCache.incr` is a read-modify-write, so every rate limit had been
leaking. The cutover silently tightened limits that had never bitten, days
before a traffic spike. Both throttle findings this session trace back to that.


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
