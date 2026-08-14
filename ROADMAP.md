# TokenWalla — Roadmap

**The single source of truth for what happens next.** `/start` reads the top of
**Now**. `/wrap` updates it. If work isn't written here, the next session won't
know about it.

Sessions are ~3 hours. Each item below is sized to fit one, and ordered so that
the things that can lose money or break a live booking come first.

- **Last updated:** 2026-08-14
- **Phase:** pre-promotion hardening (live, promotion starting — traffic expected)
- **Rule of thumb:** correctness → safety → capacity → features

---

## Now

### 0. RAILWAY IS NOT DEPLOYING — UNPAID BILL 🔴🔴

**Nothing merged since 2026-08-11 is running in production.** Re-probed
**2026-08-14** — this is the **fourth consecutive day**. The last code Railway
actually deployed is `2c4ec25` (PR #12, the location picker).

**Cause is known: the Railway bill is unpaid.** Vishnu said so on 2026-08-13.
It is not a build failure, not a CI hold — CI is green on every merge — and
not something a session can fix. **Pay the bill, then confirm the deploy.**

Confirm with. The first check is **new as of 2026-08-14 and is the best one** —
`/api/app-version/` did not exist before PR #22, so a 200 proves the running
code is current rather than merely newer than it was:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tokenwalla-production.up.railway.app/api/app-version/  # want 200, not 404
curl -s https://tokenwalla-production.up.railway.app/health/                             # want the cache probe body
curl -s https://tokenwalla-production.up.railway.app/api/hospitals/ | grep -c landline   # want >0
```

Measured 2026-08-14: **404**, the old `{"status": "ok", "version": "1.0.0"}`
body, and **0**. All three still wrong.

**What is stuck behind it, and this is the part that matters:**

- **The `[TEST]` hospital fix is NOT live.** As of 2026-08-13 `/api/hospitals/`
  still returns `[TEST] Demo Hospital`, and `/api/doctors/` still returns its
  doctor **Heyi** — `payment_collection_mode='FULL'`, ₹363 fee, **₹388.37**
  final. A patient can still be charged ₹388.37 for an appointment that does
  not exist. Item 2b said this was shipped; it was merged, not deployed.
- **The whole walk-in / landline feature is inert.** The deployed serializer
  still requires `Doctor.mobile`, so the landline-only clinic that prompted the
  work still cannot be onboarded.
- **Re-verified 2026-08-13 session 3**, ~7 hours after the first check:
  `landline` still absent, `[TEST] Demo Hospital` still exposed. Nothing moved.
- **Re-verified again 2026-08-14.** Doctor **Heyi** (id 10) is still returned by
  the live `/api/doctors/` with `payment_collection_mode='FULL'`, alongside 14
  real doctors. **The one-click mitigation below has not been applied** — four
  days in, that is now the single cheapest risk reduction available and it does
  not need the bill paid.

**One-click mitigation that needs no deploy**, if the bill will take a while:
in Django admin set doctor **Heyi**'s `payment_collection_mode` to
`SERVICE_ONLY`. That drops the exposure from ₹388.37 to the ~₹25 service fee.
Deactivating the hospital does **not** work — the deployed `/api/doctors/` has
no filter on test hospitals *or* on hospital status, so the doctor stays
listed. Only deleting the doctor row removes the listing without a deploy.

### 1. Everything below is blocked on merging.

**Everything below item 2 is blocked on merging.** The 2026-08-11 session wrote a
lot of code and merged none of it — three branches sit pushed and green, and
nothing in them has reached a patient. That is the top of the list now.

Context that changed the order: **a promotion is starting.** Registration
traffic is expected for the first time, which promotes capacity work that was
deliberately deferred on 2026-08-09 and makes the unshipped app build urgent
rather than merely overdue.

### 1. Merge what's left — the app repo is now the whole queue 🔴

**Updated 2026-08-14.** Four merged since the last wrap. What remains:

| Order | Branch | Repo | PR | Deploys | Note |
|---|---|---|---|---|---|
| 1 | `payments-server-priced-checkout` (13) | app | **none opened** | store, via EAS | **the 1.2.0 version bump lives here**, plus the checkout fix |
| 2 | `fix/map-load-timeout` (1) | app | **none opened** | store, via EAS | map failure handling |
| 3 | `feat/popular-doctors-first` (1) | app | #5 open | store, via EAS | **same branch name as the web one — check the repo** |
| 4 | `feat/popular-doctors-first` (1) | backend + web | #20 open | Railway + Vercel | most-viewed doctors rank first |
| 5 | `docs/wrap-2026-08-13-s3` | docs | #21 open | — | carries this wrap too; see the note below |
| — | `perf/dashboard-visible-polling` (1) | web | **none opened** | Vercel | oldest, lowest risk |

**Merged 2026-08-14:** `feat/app-version-gate` (**PR #22**) — that closed item
2c as well, see Done.
**Merged 2026-08-13:** `fix/dashboard-icons` (PR #19), `feat/website-icons-polish`
(PR #18), and PRs #13–#17 earlier the same day.

> ⚠️ **Pushed ≠ merged ≠ deployed, and all three are still different states
> here.** On 2026-08-13 three branches were pushed and believed merged with no
> PR ever opened. That has partly corrected itself — PRs #20, #21, #22 and app
> #5 now exist — but **the two app branches that matter most still have no PR
> at all**, and they are the ones blocking the 1.2.0 release. A session cannot
> open PRs (`gh` is unauthenticated here), so a pushed branch sits silently
> until someone clicks. Check with:
> `curl -s https://api.github.com/repos/<owner>/<repo>/pulls?state=all | head`

> 📄 **PR #21 now carries two days of docs.** Today's wrap was committed onto
> `docs/wrap-2026-08-13-s3` rather than a fresh branch, because that branch was
> still unmerged and `main`'s ROADMAP was a session behind. Writing today's wrap
> off `main` would have let PR #21 later overwrite it with stale content. If a
> wrap branch is ever still open at `/wrap` time, extend it instead of forking
> beside it.

Already merged 2026-08-11: `docs/wrap-2026-08-11`, `feat/hospital-location-picker`
(web, PR #12), `feat/hospital-location-picker` (app, PR #1),
`fix/eas-include-google-services` (app, PR #2).
**Already merged 2026-08-13:** `feat/walkin-doctors-landline` (web/backend
PR #13, app PR #3), `docs/wrap-2026-08-13` (PR #14),
`docs/fix-merge-state-2026-08-13` (PR #15) and `fix/hospital-dashboard-mobile`
(PR #16). 181 backend tests, 20 web tests, 104 app tests pass.

> ⛔ **NOTHING WEB OR BACKEND HAS DEPLOYED SINCE 2026-08-11.** See item 0.

> **`fix/hide-test-hospitals` and `docs/wrap-2026-08-11-s3` are both dead
> branches — every commit in them is on `main`.** They rode in inside PR #14 and
> should be deleted rather than merged again. The `[TEST]` hospital fix
> (`3197377`) is live: patients no longer see the demo hospital or the ₹388.37
> `FULL`-collection doctor behind it.

**Two process rules this day earned, both worth keeping:**

1. **Fetch before branching.** The session started on `docs/wrap-2026-08-11-s3`,
   read the code there, then cut its working branch from a **stale local `main`**
   (33 commits behind). Files changed underneath mid-edit. Nothing was lost, but
   PR #13 came out based on the wrong tree and collided with
   `fix/hide-test-hospitals` — a two-line import clash in
   `backend/hospitals/views.py` (`is_valid_landline` vs `exclude_test_hospitals`).
   Always: `git fetch origin && git checkout -b <branch> origin/main`.
2. **A docs branch stays docs-only.** PR #14 was meant to be ROADMAP + WORKLOG
   and ended up carrying a patient-facing code fix, because resolving the
   conflict from rule 1 was easiest there. It worked and it is live and green —
   but a docs PR is reviewed like docs, and a security fix inside one does not
   get the reading it deserves. Resolve the conflict on the **code** branch next
   time, even when the docs branch is right there.

**The app pair (1 and 2) is the release blocker — see item 5.** App `main` is
still version **1.1.3**; the 1.2.0 bump is only on the release branch, so a
build from `main` today is not even a new version to the Play Store.

**Re-verified 2026-08-14, in the app repo, with `git merge-tree`:** all three
app branches merge into `main` **clean**, in any order, and
`git merge-base --is-ancestor 5b11bd7` confirms the checkout fix is inside
`payments-server-priced-checkout`. Merging 1 yields 1.2.0 with everything.

The backend half is no longer a gate — `feat/app-version-gate` merged as PR #22,
so `/api/app-version/` exists in `main` and the app build has its endpoint. It
is still not *deployed* (item 0), but that does not block the merge.

**3 and 4 are last on purpose** — hospital-facing polish must not delay the
overdue 1.2.0 patient release. **Ordering between them does not matter:** the
app half calls `API.post('/doctors/<id>/view/').catch(() => {})` and reads
`view_count?` with a `|| 0` fallback, so shipping the app before the backend
deploys just scores every doctor's popularity at 0 and ranks on the existing
weights. Verified by reading the diff on 2026-08-14. **Same branch name in both
repos** — check which repo you are in before pushing.

> **PRs cannot be opened from a session.** `gh` is not authenticated on this
> machine (`gh auth status` → not logged into any host, no `GH_TOKEN`) and
> `gh auth login` needs an interactive terminal, which a session is not. Every
> branch above has to be turned into a PR by hand from its
> `.../pull/new/<branch>` link. This has now cost time in two sessions —
> running `gh auth login` once removes it permanently.

`docs/wrap-2026-08-10` was **never pushed** and is now folded into
`docs/wrap-2026-08-11`, so don't go looking for it separately.

### ~~2. Turn on Redis~~ ✅ 2026-08-11 — already done, verified serving

**Do not do this again.** Checked the Railway dashboard directly: the Redis
service is Online with a `redis-volume`, `REDIS_URL` and `USE_REDIS_CACHE` are
both on the backend service, and the project canvas draws a reference edge from
`tokenwalla` → `Redis` — so it is a `${{...}}` reference and not a pasted string.

**Proof it is actually the active cache rather than silently falling back:** the
Redis data browser holds live Django keys right now — `:1:throttle_user_…` and
`:1:throttle_anon_…`, ttl 41. The `:1:` prefix is Django's cache key version.
Nothing writes those unless the Redis backend is serving.

`CAPACITY.md`'s third and last fix is therefore in place: gunicorn 3×4, the
bounded queue, and the cache are all shipped.

**One consequence nobody predicted, and it is the origin of item 2b below.** The
throttle counters only became *accurate* with Redis. `DatabaseCache` inherits
`BaseCache.incr`, a read-modify-write, so concurrent requests under-counted and
every rate limit leaked. Redis counts correctly — meaning the cutover quietly
tightened limits that had never really bitten, days before a traffic spike.

### 2b. Two live production bugs — MERGED BUT **NOT DEPLOYED** 🔴

**Corrected 2026-08-13 session 2. An earlier version of this line said "merged
and live" — that was wrong and it was the most dangerous wrong line in this
file.** `3197377` reached `main` inside PR #14, but Railway has not deployed
since 2026-08-11 (item 0), so the fix is not running. `[TEST] Demo Hospital`
and its ₹388.37 doctor **are still visible to patients right now**. Verified by
probing the live API, not assumed. This closes only when item 0 does.

Session-3 history: the stale `.git/index.lock` was removed (0 bytes, no git
process running) and the work committed as `fix/hide-test-hospitals`. It had
been sitting uncommitted on `docs/wrap-2026-08-11`, a branch already merged, so
it was one `git checkout` away from being lost.

Both found on 2026-08-11 by probing the live API, both patient-facing, both
would be found within hours by a promotion.

**`[TEST] Demo Hospital` was publicly visible.** `/api/doctors/` returned its
doctor "Heyi" to anonymous callers next to the real ones; there was no
test-hospital filter anywhere in `doctors/views.py`. That doctor is the **only**
row in the system with `payment_collection_mode='FULL'`, so a patient could be
charged **₹388.37** for an appointment that does not exist, and TokenWalla would
then owe a payout against it. This was the single most dangerous thing in
production.

Fixed with `TEST_HOSPITAL_PREFIX` + `exclude_test_hospitals()` +
`show_test_hospitals_to()` in `hospitals/models.py`, applied to the public
doctor and hospital lists; staff and admins still see them. A name convention
rather than an `is_test` column **on purpose** — a real flag would need
production rows edited to set it, which a session should not do.

9 tests, including the two easy misses: passing the demo hospital's id directly
as a `?hospital=` filter still returns nothing (the id is guessable, so hiding
it from the unfiltered list is not enough), and a real hospital merely
*containing* the word test is not swept up, because the marker is a prefix.

**`anon` throttle raised 60/min → 300/min**, env-overridable as `ANON_RATE`.
`AnonRateThrottle` keys on client IP, and carrier-grade NAT in India puts a
whole neighbourhood behind one address — four or five simultaneous visitors
exhausted the bucket and everyone behind that carrier got 429s. Under a campaign
that reads as "nobody is booking" rather than "we are turning them away", which
is the worst failure shape available: silent and self-confirming. The same
lesson has now been learned three times here (OTP verify, OTP send, and this).

Backend suite **167 tests** (158 + 9), 10 consecutive green runs,
`makemigrations --check` clean, no migration.

~~**Branch off `feat/app-version-gate`, not `main`**~~ — stale as of 2026-08-14.
Both are on `main` now; the collision was resolved inside PR #22.

### ~~2c. Review the OTP daily per-IP ceiling~~ ✅ 2026-08-14 — raised to 2000

Done, merged in PR #22. See Done for the reasoning and the number.

### ~~3. Prove the two Railway crons actually ran~~ ✅ 2026-08-11 — both confirmed

Read both service logs on the Railway dashboard. Neither is a zombie.

- **Payouts** — ran `2026-08-10 20:31:57`, 3s, succeeded, logging verbatim:
  `Ledgered 0 booking(s). Payouts are manual — see the admin payouts page.`
  Schedule reads "Runs at 03:00 pm (UTC)" = 20:30 IST. Correct — and if it ever
  looks wrong, do **not** rewrite it as `30 20` (`cfc751e` fixed that once).
- **Reminders** — firing every 10 minutes without a gap from 2026-08-10 13:00
  through 2026-08-11 14:50, each logging
  `Reminder run complete. Sent 0 reminder(s).` Real output, not bare
  `Starting Container`.

"Sent 0" and "Ledgered 0" are both correct at 4 lifetime bookings with no doctor
on `FULL`. The crons work; there is nothing for them to do yet.

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

### 5. Ship the mobile app — release gate run 2026-08-11 session 3 🔴

> **Verdict that session: NOT ready to push to the Play Store.** Checked against
> the repo, not guessed. Three findings, in order of severity:
>
> 1. **No branch contains a shippable app.** `main` = 1.1.3 with the picker but
>    none of the 13 release commits; `payments-server-priced-checkout` = 1.2.0
>    with the release work but no picker and no map-timeout fix. Building either
>    ships something incomplete, and `main` isn't even a new version number.
>    **The checkout fix is in those 13 commits** — the thing item 7 cares about.
>    Merge is clean and yields 1.2.0 with everything.
> 2. **Push would have been dead in the build.** `google-services.json` is
>    gitignored, so EAS never received it — `DONE-push-setup.md` step 6 names
>    this exact failure. Fixed by `.easignore` (app PR #2, merged). Note
>    `.easignore` *replaces* `.gitignore` for EAS rather than adding to it, so it
>    is a full mirror minus the Firebase client config; a minimal one would have
>    uploaded `node_modules` and the local `ios/` Pods tree and flipped EAS into
>    a bare-workflow build. **Still unproven end to end** — only a real preview
>    build with a working push confirms it.
> 3. **No crash reporting at all.** `sentryDsn` is `""` so Sentry is disabled
>    outright, plus `SENTRY_DISABLE_AUTO_UPLOAD: "true"` on all three profiles.
>    Releasing into a promotion means learning about crashes from users.
>
> Checked and **fine**: the update gate handles a missing `/api/app-version/`
> with `catch { return }`, so the unmerged backend branch is not a blocker;
> `appVersionSource: "remote"` + `autoIncrement` handles versionCode;
> `google-services.json` content is valid and the package matches. `eas submit`
> is still unconfigured, so the AAB goes to Play Console by hand.
>
> **Order: merge 1 and 2 → preview build → install and actually use it → only
> then production.** The picker and its offline path have still never run on a
> device; there is no simulator or Android SDK on this machine (Command Line
> Tools only, no Xcode), so that check cannot be done from a session.


**The store build is NOT stale, and that settles item 7 below.** Latest
production build is **1.1.3 (36)**, git ref `eddf5dd`, built 2026-08-08.
`git merge-base --is-ancestor cb3d29d eddf5dd` confirms the server-priced
Razorpay checkout **is** in it. The shipped app matches the backend's payment
contract. The funnel is empty, not broken.

**But a real price bug is live right now.** `PLATFORM_FEE` became ₹20.00 on
**2026-07-28** (`7b2a01c`). Build 36 still ships `₹15` in its i18n strings, so a
patient reads ₹15 and Razorpay asks for **₹25.37**. Two weeks live. The last
booking was 26 July — two days before the fee changed. Four bookings is far too
few to call that causation, but "advertised price does not match the charge" is
an ordinary reason to abandon a checkout, and it costs nothing to stop assuming
it is fine.

**And a gap nobody had noticed: EAS Submissions is completely empty.** Nothing
has ever been submitted to a store through EAS — so whatever is live on Play was
uploaded by hand from the `.aab`, and EAS cannot tell you which version that is.

- **Open Google Play Console and confirm the live versionCode.** This is now the
  only unknown left in the funnel; EAS cannot answer it.
- `5b11bd7` (the checkout fixes) is **not** in build 36 — it needs the next build.
- `eas submit` is still unconfigured, so the next release is another manual
  upload unless it gets set up.
- Android only. No iOS build has ever run.

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

### 7. Demand is now the only real problem 🔴

**27 users · 11 hospitals live · 11 doctors · 4 bookings ever · ₹60 lifetime ·
last booking 2026-07-26.** No real doctor has opted into `FULL` collection, so
the payout machinery has never carried a rupee. (Doctor count rose 8 → 11 on
2026-08-11 — someone is still onboarding.)

**The broken-vs-empty question is answered: EMPTY.** The shipped build contains
the current checkout (item 5), the backend is healthy, both crons run, Redis
serves, deploys are green. Nothing technical stops a patient from booking.

So the campaign is not spending money into a broken product. It is spending it
into a working one that nobody has used since 26 July. **No further backend
hardening moves this number.** The two bugs in item 2b and the price mismatch in
item 5 are worth fixing because they will embarrass a campaign — not because
they explain the silence.

What would actually move it: one hospital doing ten bookings a week, and one
real doctor on `FULL` so the payout path carries money and teaches you which of
the careful edge cases were the right ones.

---

## Next

- **Check both repos when a feature spans them** — new 2026-08-13 (session 2),
  and it has now bitten twice in one day. The walk-in/landline work shipped
  with the landline fallback in the app doctor card but not the web one, and
  with the announcement read-view on web but not in the app. Neither was caught
  by tests, because both are presentation. When a feature touches web + app,
  diff the two surfaces before calling it done.
- **A blocked OTP IP is invisible** — new 2026-08-14, and it is the concrete
  reason the observability item below should move up. Hitting
  `OTP_MAX_SENDS_PER_IP_PER_DAY` produces a `logger.warning` and nothing else.
  If the raised 2000 ceiling ever *does* bite a real carrier mid-promotion, you
  find out from a user, not a dashboard — the same silent, self-confirming
  failure shape the ceiling was raised to avoid. A count of 429s by reason,
  visible anywhere, would settle it in seconds.
- **The production guard false-positives on read-only `origin/main`** — new
  2026-08-14. `.claude/hooks/guard-production.py` blocked a
  `git push origin feat/app-version-gate` because the *same compound command*
  also contained a read-only `git merge-tree --write-tree origin/main HEAD`.
  The push was to a feature branch, which is exactly what the guard's own
  message instructs. Narrowing it to match only actual push targets is a
  one-line change — but it must be **its own deliberate commit**, never folded
  into a feature PR. Until then, keep pushes in their own command.
- **The walk-in doctor page has never run on a device** — new 2026-08-13. The
  web half was driven in a real browser (walk-in view renders, call button
  dials, expired announcement disappears, slotted doctors unchanged). The app
  half is `tsc`-clean and reads only additive fields, but no screen has
  rendered. Same gap as the location picker, same five-minute fix:
  `npx expo start`, open a slotless doctor.
- **Nothing tells a hospital its landline is unreachable by WhatsApp** — new
  2026-08-13. A landline-only doctor silently gets no payout WhatsApp
  (`send_doctor_payout_paid` skips a blank `mobile`, and a landline is a
  different column, so it never even tries). Correct behaviour, invisible
  consequence. If landline-only clinics become common, the payouts page should
  say who cannot be notified.
- **The app location picker has never run on a device** — new 2026-08-11
  (session 2), and this is a **gate on merging branch 5**, not a nice-to-have.
  `tsc`, lint and 104 unit tests are green, and the WebView page itself was
  compiled, served and driven in a real browser (tiles render, drag emits
  `{type:'move'}` with correct coordinates, injected `__fly()` pans to target).
  But the React Native half — Modal presentation, the WebView wiring,
  the `expo-location` permission flow — has not executed once. iOS has no build
  profile in `eas.json`, so there was no cheap simulator path.
  `npx expo start` and open the hospital profile; five minutes settles it.
- **`placeLabel.ts` is a deliberate copy of the website's `describe()`** — new
  2026-08-11 (session 2). Two repos, no shared package, so the address string a
  hospital sees can silently diverge between web and app. Both files say so in a
  header comment. Change one, change the other — or extract a shared package if
  a third copy ever appears.
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

> **2026-08-11 caveat, revised in session 3:** four of the day's branches DID
> merge — web docs, web picker, app picker, app `.easignore`. Four remain
> unmerged (item 1). So "Done" below is now a mix: check the merge table before
> assuming anything reached a patient. Nothing has reached a **patient** yet
> regardless, because the app release branch is still unmerged and unbuilt.

- **2026-08-14** — **The OTP per-IP daily ceiling raised 200 → 2000**, closing
  item 2c, merged as **PR #22** along with the rest of `feat/app-version-gate`.
  200/day was the same CGNAT mistake the *burst* on that branch had just been
  fixed for, in a slower form: one Indian public IPv4 fronts hundreds to low
  thousands of subscribers and a signup costs 1–2 sends, so 200 served only
  ~100–200 real people before a whole carrier started getting 429s.
  **The sharp edge nobody had noticed:** `RateCounter.bump` rolls its window
  from the **first** event, so tripping the cap at 08:00 locks that carrier out
  until 08:00 *tomorrow*, not until midnight. A single bad morning costs a full
  day of signups.
  The number is argued from cost, not taste — priced at ~₹0.25/SMS through
  2Factor, one abusive IP is worth ~₹50/day at 200, ~₹500/day at 2000, and
  ~₹7,200/day if only the 20/min burst bounded it. 2000 keeps a runaway IP an
  order of magnitude below the burst-only cost while leaving ~10× headroom over
  any plausible legitimate CGNAT population. The failure modes are not
  symmetric: an abusive IP costs a few hundred rupees and shows up in the
  2Factor balance, whereas a false 429 mid-promotion is silent, self-confirming
  and reads as "nobody wants to sign up".
  **The per-number cap (10/day) stays the actual SMS spend control**, and a new
  test pins the two apart — with the IP ceiling at 2000, one number still stops
  at the eleventh send. Without it, a future bump could quietly promote the IP
  ceiling into that role and let one number be texted 2000 times a day.
  Also corrected the 429 message, which said "try again tomorrow" — untrue under
  a rolling window. **196 tests, 6 consecutive green runs, zero
  `graph.facebook.com` lines, no migration.**
  The burst was deliberately left at 20/min: it was already reasoned about
  correctly for CGNAT, and widening both at once would make a bad outcome hard
  to attribute.
- **2026-08-14** — **PR #22 merged, emptying the web/backend queue.** It carried
  `/api/app-version/`, the `/health/` cache probe and the OTP work. One conflict
  in `settings.py`, the predicted one: item 2b's `ANON_RATE` had reached `main`
  via PR #14 while this branch was open, and both sides add a constant beside
  `DEFAULT_THROTTLE_RATES`. Resolved by keeping **both** verbatim — they are
  separate scopes (`anon` 300/min for public reads, `otp` 20/min for sends), git
  had already merged the dict itself correctly, and `RequestOTPView` sets
  `throttle_classes = [OTPRateThrottle]`, which *replaces* the defaults rather
  than adding to them, so the raised anon rate never reaches the OTP path.
  Only the comment blocks collided, so neither author's reasoning was rewritten.
- **2026-08-13 (session 3)** — **Most-viewed doctors rank first.** Patients had
  no signal about which doctor other patients actually pick, and the website
  did not sort its list *at all* — it rendered in database id order, so whoever
  registered first sat at the top forever. The app already ranked (available
  +100, city +50, experience, slots×2); the website now uses the same weights,
  with a popularity term added to both. `Doctor.view_count` plus
  `POST /api/doctors/<id>/view/`, fired once per session from the doctor page.
  **Popularity is capped and log-scaled on purpose** — `12·log10(1+views)`, max
  +30. Ordering by raw clicks makes the top spot self-reinforcing (first place
  earns clicks *because* it is first) and nobody new can climb; the log makes
  the 10th view worth as much as the next ninety, and the cap sits below the
  availability weight so an off-duty doctor never leads. Verified: a 120-view
  doctor marked unavailable drops to **last**.
  Counting is a separate POST rather than folded into `retrieve()`, because the
  hospital dashboard and admin poll that endpoint and would rank whichever
  doctor *staff* open most. One atomic `UPDATE … F()` — read-modify-write loses
  counts when two patients open a page at once (`assertNumQueries(1)`).
  Bookings would be the stronger signal, but there have been **four in the
  product's lifetime** — too sparse to rank anything. Revisit at volume.
  Only a counter is stored, never who viewed. 10 new tests.
  **Pushed, no PR opened — see item 1.**
- **2026-08-13 (session 3)** — **Bootstrap Icons site-wide + a shared polish
  layer** (PR #18, merged). 175 emoji in JSX became icons, 74 were stripped from
  label strings that cannot hold an `<i>`, and 25 `{ icon: '…' }` data fields
  became icon classes. `theme.css` collapses five shadow strengths, radii from
  4px to 18px and three greys-for-muted into one radius, two shadows, one blue,
  one ink — surface treatment only, no spacing or layout changes, because those
  are what break pages. Icon CSS moved from per-page dynamic imports to one
  eager import now that every surface uses it: patient CSS 33.74 → 48.35 kB,
  the deliberate trade.
  **Two things this cost, worth not repeating.** The first attempt was a regex
  sweep, which cannot tell JSX text from a string literal — it injected markup
  into a WhatsApp share message and ate the space in `target="_blank" rel=`.
  Reverted wholesale and redone as a babel codemod walking `JSXText` nodes only.
  And the codemod only walked `.js`, so three UI strings kept their emoji in
  **all four locale JSON files** — caught only by looking at the rendered page.
  A bulk edit that looks mechanical usually is not.
- **2026-08-13 (session 2)** — **The hospital dashboard and profile made
  usable on a phone.** Reception staff run these one-handed at a desk, so the
  phone layout is the real one. Measured at 375px before touching anything
  rather than eyeballing it: **90 tap targets under the 44px finger minimum on
  the dashboard** (71 of them 31px) and **26 on the profile**, and both long
  forms put Save at the very bottom — 2,262px down on the dashboard, 2,258px on
  the profile. Both are now 0 undersized, with the save bar sticky at the
  viewport bottom. The slot picker was the worst single offender: 48 chips at
  79×31, now a 3-column grid at 44px. Tabs became a 2×2 grid and the day filter
  a 3-column row so neither wraps raggedly once the pills are finger-sized. The
  header now shows the hospital name on mobile — it was hidden below 576px, but
  on a shared phone which *account* you are in matters more than the wordmark.
  Detail rows stack label-above-value, because a pasted Maps URL is one long
  unbreakable token that was crushing the value column to a sliver.
  **Desktop and tablet are untouched** — verified at 1280 and 768.
  Two things worth remembering. Bootstrap's `.d-flex` carries `!important`, so
  a `display:grid` override loses silently; the slot picker got its own class
  rather than an `!important` fight. And the icon swap (emoji → Bootstrap
  Icons, matching the Ionicons the app already uses) **nearly repeated the
  Leaflet mistake**: a static stylesheet import put **13.82 kB gzip** of
  icon definitions into the bundle every patient downloads, for a staff-only
  screen. A dynamic import gives it its own chunk — main CSS back to its 33.74 kB
  baseline. `bootstrap-icons` was already a dependency; nothing new installed.
- **2026-08-13 (session 2)** — **Dashboard icons brought in line with the
  profile page.** All 40-odd emoji in `Hdashboard.js` replaced with Bootstrap
  Icons, so the two hospital screens finally match each other and the app. The
  icon stylesheet is imported dynamically here too and webpack shares the one
  chunk between both pages — main CSS stayed at its 33.74 kB baseline, main JS
  +434 B. Tab labels shortened to Queue / Doctors / Payments / Scanner, which
  an icon plus a short word fits the 2×2 mobile grid far better than the old
  full phrases did.
- **2026-08-13 (session 2)** — **Two landline gaps closed that the original
  feature missed.** The web doctor card rendered `doc.mobile` alone, so a
  landline-only doctor showed a bare phone icon and no number at all — the app
  card already had the fallback, the web one did not. And the app's hospital
  profile never showed the announcement back in its read view, so a hospital
  could save a holiday notice and see nothing, then have it silently stop
  reaching patients when the expiry passed. Both are the same shape of bug:
  building a feature across two repos and finishing it in only one.
- **2026-08-13** — **Walk-in doctors, landline contacts, expiring notices.**
  A one-doctor clinic signed that day could not use TokenWalla at all: the
  doctor runs the whole hospital and cannot commit to fixed slot times, and the
  clinic has a landline rather than a mobile. Both were **hard blocks in the
  upload form**, not preferences. Three changes, merged as PR #13 (web/backend,
  live) with the app half still pending.
  **Zero slots is now a valid doctor.** The "select at least one time slot" rule
  is gone from both dashboards. Both patient screens already handled an empty
  slot list, so they now show the hospital's hours, the doctor's days and a call
  button where the grid would be — and **no booking CTA at all**, because the
  payment path needs a slot and charging without one would take money for
  nothing. Days stay required: which days the doctor sits is still real
  information.
  **Landline is a new column on Hospital and Doctor, deliberately not a
  loosening of `mobile`.** `mobile` is the hospital's login identity, the OTP
  destination and the only number `send_doctor_payout_paid` ever texts — a
  landline in that field would break login and send WhatsApp into the void. A
  doctor now needs a mobile **or** a landline, each validated by its own
  pattern in `tokenwalla/utils.py`.
  **Announcements take an optional expiry date.** `announcement_active` is
  computed server-side, so the website and the app cannot disagree about when a
  holiday notice stops showing, and an app build that predates the flag behaves
  exactly as before. This is the "communicate holidays and offers" the hospital
  actually asked for — it did not need a new holiday calendar.
  All API changes additive; installed 1.1.3 apps are unaffected. Both migrations
  add nullable/blank columns only. 14 new tests (113 on `main`, 181 on the
  merged docs branch). Verified end to end against a local server: a doctor with
  no mobile, a landline and zero slots was created through the real dashboard,
  and the patient page rendered the walk-in view.
- **2026-08-11 (session 3)** — **Play Store release gate run, and it failed.**
  Asked whether the app was ready to push today; it was not, for three reasons
  now recorded in item 5. The one that mattered most was structural: no branch
  contained a shippable app, and `main` was still versioned 1.1.3 while the
  1.2.0 bump sat on the unmerged release branch — so a build from `main` would
  have shipped the picker *and* the broken checkout, under a version number the
  Play Store would have rejected as not new.
- **2026-08-11 (session 3)** — **`.easignore` so Android push survives the
  build** (app PR #2, merged). `google-services.json` is gitignored, so EAS
  never received it and push would have been silently dead in the shipped APK.
  The subtlety worth keeping: `.easignore` **replaces** `.gitignore` for EAS, it
  does not extend it — so it must be a complete mirror. Verified by diffing both
  rule sets across the working tree: exactly one path changes state
  (`google-services.json`), nothing becomes newly excluded, and the keystore,
  service-account keys and `.env.local` all stay out.
- **2026-08-11 (session 3)** — **The map picker no longer spins forever**
  (`fix/map-load-timeout`, unmerged). Leaflet loads from a CDN inside the
  WebView; a hard failure was already caught, but a *slow or hanging* CDN posted
  nothing and left the spinner up indefinitely. `onError` cannot help — with
  `source={{html}}` the page always loads, so a failed subresource is invisible
  — so readiness is now proved by the map's own first message against a 12s
  deadline, with a Try again that remounts the WebView. Search still works when
  the map is down, so a hospital can still set its city.
- **2026-08-11 (session 3)** — **Rescued the two production bug fixes from a
  merged branch.** They were complete but uncommitted on
  `docs/wrap-2026-08-11`, which had already been merged, and the stale
  `.git/index.lock` had blocked the commit twice. Lock cleared, work verified
  (167 tests, migrations clean) and pushed as `fix/hide-test-hospitals`.

- **2026-08-11 (session 2)** — **Hospital location picker, all three surfaces.**
  Hospitals could save a city and a free-text landmark but never an accurate
  pin. Now a modal on the web profile editor, the web signup page and the app
  hospital profile: drag the map under a fixed centre pin, "use my location",
  search to jump, address reverse-geocoded live under the pin.
  **Stayed on the free key-less rail `LocationSearch` already used** —
  OpenStreetMap tiles + Photon — rather than a Google Maps key and a billing
  account. On the app that mattered twice over: `react-native-maps` is a native
  module, so it would have forced an EAS rebuild *and* an Android Maps API key;
  Leaflet inside the WebView already shipped for Razorpay checkout, plus
  `expo-location` (already installed, permission strings already in `app.json`),
  meant **zero new dependencies, native or JS**.
  Two things worth remembering: Leaflet latches container size at build time and
  renders half a grey panel inside a modal — a `ResizeObserver` fixes it and also
  covers rotation; and the static import put 47 kB gzip of Leaflet in the bundle
  *every patient* downloads for a hospital-only screen, so it is `lazy()` behind
  the button (main back to baseline, Leaflet an on-demand chunk).
- **2026-08-11 (session 2)** — **Refused a pin set too far out.** Found while
  testing signup: with no saved location the map opens at state zoom and Confirm
  was enabled there. One click would have pinned the middle of Telangana and
  routed every patient tens of km wrong — worse than no pin, because it looks
  deliberate. Confirm is now disabled below zoom 14 on web and app, with the
  reason shown. Existing pins open at zoom 16 and are unaffected.
- **2026-08-11 (session 2)** — **132 orphaned `react-native-*` entries pruned
  from the web `package-lock.json`**, left behind when `react-native-razorpay`
  was removed. Nothing in `package.json` referenced them; the prune was a side
  effect of installing `leaflet` and the production build passes. It makes that
  PR's diff look far bigger than it is.

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
