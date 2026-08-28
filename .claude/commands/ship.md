---
description: Pre-merge gate — prove the change is safe for a live product before it goes near main
---

Run the full gate on the current change. Report each item as ✅ / ❌ / N/A with
evidence, not assertion. **If anything is ❌, stop and tell me — do not merge.**

## 1. Tests actually pass

```bash
cd backend && python manage.py test
CI=true npx react-scripts test --watchAll=false
```

Paste the real pass/fail counts. Baseline as of 2026-08-29: **371 backend (2
skipped), 30 frontend**. If either number dropped, something got deleted; say
so. If it rose, update this line in the same PR — a stale baseline defeats the
check.

## 2. Money paths still green

If this change touched `backend/payments/`, `backend/bookings/`, or fees:

```bash
cd backend && python manage.py test payments.tests_payments payments.tests_integration
```

Then re-read the "Money rules that must not be broken" section of `CLAUDE.md`
and confirm, rule by rule, that this change violates none of them. Pay
particular attention to: patient-only billing, GST exemption on the doctor's
fee, and `SERVICE_ONLY` as the default.

## 3. Migrations are safe

```bash
cd backend && python manage.py makemigrations --check --dry-run
```

For any new migration, answer in writing:

- Is it **additive**? (new nullable column / new table = safe. Dropping or
  renaming a column that live code still reads = not safe.)
- Does existing production data survive it? Real bookings and real ledger rows
  already exist.
- Can it run **before** the new code deploys without breaking the old code?
  Railway migrates and deploys separately.

## 4. No secrets, no debris

```bash
git diff --cached --name-only
git diff --cached | rg -i 'rzp_live_|SECRET_KEY|ACCESS_TOKEN|password\s*=' || echo "clean"
```

Confirm no `.env`, no `db.sqlite3`, no `node_modules`, no stray debug prints.

## 5. The API contract

If `/api/payment/*` changed in any way — request shape, response shape, status
values, error codes — **say so loudly**. The mobile app is a separate repo and
will break silently. List exactly what the app needs to change.

## 6. Verdict

End with one of:

- **SHIP** — everything green, here's the PR title and body
- **HOLD** — here's the specific thing that's wrong

Then push the branch and open the PR. Never merge to `main` yourself.
