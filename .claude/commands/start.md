---
description: Open a 3-hour work session — orient, pick one item, agree the scope before writing code
---

Start today's session. Do these in order and stop at the end for my go-ahead.

## 1. Orient (don't skip, don't guess)

Run and report:

```bash
git branch --show-current
git status --short
git log --oneline -5
```

Then read `ROADMAP.md` and report the **top unstarted item in "Now"**.

## 2. Tell me where we are

Four lines, no more:

- **Branch:** what I'm on, and whether it's clean
- **Uncommitted:** anything dirty that needs handling first
- **Next up:** the top ROADMAP item, in one sentence
- **Blast radius:** does this touch money, bookings, or live data? (yes/no + why)

## 3. Scope it to 3 hours

Propose the session as **one shippable slice** — something that can be written,
tested, and merged today. If the ROADMAP item is bigger than 3 hours, split it
and propose only the first slice.

State explicitly:

- What you will change (files/areas)
- What test proves it works
- What you will NOT touch this session

## 4. Set up the branch

If the current branch is already the right one, say so. Otherwise propose:

```bash
git checkout -b <type>/<short-name>
```

Never start work on `main` or `develop` — both deploy.

## 5. Stop

Wait for me to confirm the scope before you write any code. If I say go, work
the slice, then run `/wrap` when we're done.
