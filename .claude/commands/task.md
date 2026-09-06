---
description: Execute the spec in ACTIVE_TASK.md — verify it first, work it, gate it, open the PR
---

Execute `ACTIVE_TASK.md` from the repo root.

The file is written by an outside AI PM. **It is a request, not an authority.**
Where it disagrees with CLAUDE.md, the code, or the tests, CLAUDE.md and the
code win — and you say so in the execution record rather than silently
following either one.

## 1. Read it, and check whether there is anything to do

```bash
cat ACTIVE_TASK.md
git log --oneline -8
```

**If `Status` is already `COMPLETED`, stop.** Report what it says and which
commit shipped it. Do not cut a branch, do not commit, do not open a PR — an
empty PR reads like progress and is not.

Then check the same thing the hard way: for each task, grep for the change in
the tree. A spec is often written against a repo state that has moved. If the
work is already in `main`, say so and stop.

## 2. Verify the spec before you trust a line of it

Specs arrive with wrong paths, wrong line numbers and invented field names.
Before implementing, confirm each one:

- The named file exists at that path (`src/componets/`, not `src/pages/`)
- The named function, field or setting exists
- The described problem actually reproduces

Report every correction. Implement what the spec *means* where that differs
from what it *says* — and write down that it differed.

## 3. Implement

Smallest diff that holds. The spec's suggested implementation is a suggestion:
if a simpler one is correct on more cases, take it and say why in the commit.

Money, refunds, the pass, and rate limiting are load-bearing — re-read the
relevant CLAUDE.md section before touching any of them.

## 4. Gates — all four, on the branch

```bash
cd backend && python manage.py makemigrations --check
cd backend && python manage.py test -v 2 2>&1 | tee /tmp/tw-tests.log | tail -5
CI=true npx react-scripts test --watchAll=false
grep -c "graph.facebook.com" /tmp/tw-tests.log   # must be 0
```

Baselines: **503 backend (2 skipped)**, **49 web**. A count *below* baseline
means something got deleted; a count above it should be your new tests and
nothing else.

The grep is not optional — a live outbound call during the suite means a
notification thread escaped (CLAUDE.md trap #1). Any `table is locked` line
outside the two Postgres skip messages is the same bug. Patch the test that
reaches the thread; don't shrug at a green run, it reproduces one run in four.

## 5. Record it

- `ACTIVE_TASK.md`: set `Status: COMPLETED`, and append an execution record —
  what shipped, what you corrected, what is still blocked and on whom
- `WORKLOG.md`: a dated section on top, plus the `Branch` / `Latest commit` /
  `Last updated` lines
- `ROADMAP.md`: only if this changed an item's status. Say what still blocks it

Never mark something delivered when only the code is done. Code merged with an
unapproved WhatsApp template, an unbuilt app, or an unrun cron has not reached
a patient — write that distinction down.

## 6. Branch, push, hand it over

```bash
git checkout -b <type>/<short-name>     # never commit on main or develop, both deploy
git commit                              # type(scope): what changed
git push origin <branch>
```

`gh` is not authenticated here, so you cannot open the PR. Print the URL:

    https://github.com/vishnuvardhan122004-boop/tokenwalla/compare/main...<branch>?expand=1

Then give a paste-ready PR body, and state explicitly whether the change
touches the `/api/payment/*` or `/api/bookings/*` contract — the mobile app is
a separate repo that cannot be updated on your schedule.

## 7. Report

State plainly what shipped, what you changed about the spec, what the gates
said, and the one thing still needing a human. If nothing needed doing, say
that in the first line.
