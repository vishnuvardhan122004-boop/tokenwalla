#!/usr/bin/env python3
"""
TokenWalla production guard — PreToolUse hook on Bash.

TokenWalla is live. Real patients hold tokens and real money moves through
Razorpay. This hook is the hard stop between a normal dev session and an
irreversible action against production data.

Protocol: read the tool call on stdin, exit 2 to BLOCK (stderr goes back to
Claude as the reason), exit 0 to allow.

Permission deny-lists in settings.json match command *prefixes*, so they miss
anything wrapped in a subshell, a pipe, or `cd x && ...`. These regexes match
anywhere in the command string, which is what you actually want for a guard.
"""

import json
import re
import sys

# (regex, why it's blocked, what to do instead)
BLOCKED = [
    (
        r"\brailway\s+(run|connect|ssh)\b",
        "runs against the PRODUCTION Railway database",
        "Reproduce locally against backend/db.sqlite3, or run it yourself in the Railway shell after taking a backup.",
    ),
    (
        r"\b(psql|pg_dump|pg_restore|dropdb|createdb)\b",
        "direct Postgres access — prod is the only Postgres in this project",
        "Use the Django ORM or a management command against your local DB.",
    ),
    (
        r"manage\.py\s+(flush|sqlflush|reset_db|dbshell)\b",
        "wipes or opens a shell on a database",
        "If you truly need a clean local DB, delete backend/db.sqlite3 yourself and re-migrate.",
    ),
    (
        r"manage\.py\s+.*--database[= ]\s*(?!default)",
        "targets a non-default database",
        "Only the default (local) database is in scope for a Claude session.",
    ),
    (
        r"\bgit\s+push\b.*(--force|-f)\b",
        "force-push rewrites shared history",
        "Push normally. If history really needs fixing, do it by hand.",
    ),
    (
        r"\bgit\s+push\b.*\b(origin\s+)?(main|develop)\b",
        "pushes straight to a deploying branch — main deploys to production, develop to staging",
        "Push your feature branch and open a PR. CI runs the tests before anything deploys.",
    ),
    (
        r"\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)",
        "destroys uncommitted work",
        "Use `git stash` so the work is recoverable.",
    ),
    (
        r"\bvercel\b.*(--prod|deploy)",
        "deploys the website to production",
        "Deploys happen through git push + PR merge, not from a session.",
    ),
    (
        r"\bcurl\b.*deploy[_-]?hook",
        "triggers a production deploy hook",
        "Let CI do it on merge to main.",
    ),
    (
        r"\brm\s+-[a-z]*r[a-z]*f?\s+(/|~|\$HOME)",
        "recursive delete of a root or home path",
        "Delete specific paths inside the project instead.",
    ),
    (
        r"rzp_live_",
        "a LIVE Razorpay key — a live key charges a real card on every test payment",
        "Local checkout must use the rzp_test_ key pair. Razorpay has no sandbox for live credentials.",
    ),
]

# Warn but allow — worth a beat of attention, not a wall.
WARN = [
    (
        r"manage\.py\s+migrate\b",
        "Migrations are forward-only against prod. Confirm this one is reversible and additive.",
    ),
    (
        r"manage\.py\s+run_daily_payouts\b",
        "This writes DoctorLedger rows. Safe locally; never run it against prod from here.",
    ),
]


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0  # malformed input is not our problem to enforce

    command = payload.get("tool_input", {}).get("command", "")
    if not command:
        return 0

    for pattern, reason, remedy in BLOCKED:
        if re.search(pattern, command, re.IGNORECASE):
            print(
                f"BLOCKED by TokenWalla production guard.\n\n"
                f"  Command: {command}\n"
                f"  Reason:  {reason}\n"
                f"  Instead: {remedy}\n\n"
                f"TokenWalla is live with real patients and real payments. "
                f"Do not work around this guard — surface it to Vishnu and let him "
                f"decide. If the rule itself is wrong, edit "
                f".claude/hooks/guard-production.py deliberately, as its own commit.",
                file=sys.stderr,
            )
            return 2  # exit 2 = block, stderr is fed back to Claude

    for pattern, note in WARN:
        if re.search(pattern, command, re.IGNORECASE):
            print(f"⚠️  {note}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
