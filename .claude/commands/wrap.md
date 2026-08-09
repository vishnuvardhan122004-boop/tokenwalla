---
description: Close the session — leave the repo and the plan in a state my next session can pick up cold
---

Close out today. The goal is that tomorrow's `/start` needs zero re-explaining.

## 1. Land the work

```bash
git status --short
```

Commit what's finished with a real message (`type(scope): what changed`). If
something is half-done, say so plainly rather than committing it as if it works.

## 2. Update ROADMAP.md

This is the part that matters most — it's the file `/start` reads tomorrow.

- Move anything completed to **Done**, with today's date
- If the item was only partly done, rewrite it to describe *what's actually
  left*, not what it originally said
- Add anything new we discovered today to **Now** or **Next**, placed by risk
- If today changed what should come next, reorder — and say why in one line

## 3. Update WORKLOG.md

Add a dated section on top: what changed, what it fixed, what tests prove it.
Keep it short — one line per change. Bump `Latest commit` and `Last updated`.

## 4. Write tomorrow's first move

End your response with exactly this, filled in:

```
NEXT SESSION
  First move:  <the single concrete thing to do first>
  Branch:      <branch to be on>
  Watch out:   <the one gotcha that will bite me if I forget it>
```

Make "First move" specific enough to act on without thinking — a file and a
change, not a theme.
