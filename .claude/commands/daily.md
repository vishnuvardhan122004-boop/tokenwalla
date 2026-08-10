---
description: The 5-minute daily check-in — what happened, what needs Vishnu, what we do today
---

Vishnu's daily check. **Keep it short.** He reads this before deciding how to
spend three hours — it's a briefing, not a report.

## Rules

- Bullets, not paragraphs. Ten lines total is the target.
- Lead with anything that needs a decision or is broken. Good news goes last.
- Never invent numbers. You cannot reach the production database — that's a hard
  rule, not a limitation to route around. If a number isn't in the repo, say
  "check `/Adashboard`" and move on.
- If nothing is wrong, say so in one line. Don't manufacture concern.

## What to gather

From the repo only:

```bash
git branch --show-current
git status --short
git log --oneline --since="1 day ago"
```

Plus the top of `ROADMAP.md` (Now section).

## What to output

```
YESTERDAY
  <what landed, or "nothing committed">

NEEDS YOU
  <decisions, blockers, or anything I can't do without prod access — else "nothing">

TODAY
  <the one ROADMAP item to work, and why it's the one>

CHECK MANUALLY
  <what to eyeball on /Adashboard — payouts owed, stuck bookings, today's sales>
```

Then stop and wait. Don't start work off the back of this — Vishnu picks.

## Payout reminder

Doctor payouts are **manual by design** — Razorpay settles to TokenWalla, Vishnu
pays doctors from the Slice current account, then marks them paid in the admin.
If unpaid ledger rows are piling up, that's a *reminder to Vishnu*, never a
prompt to automate it.
