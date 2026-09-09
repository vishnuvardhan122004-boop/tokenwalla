#!/usr/bin/env python3
"""Self-check for guard-production.py. Run: python3 .claude/hooks/test_guard_production.py

Covers the item-18 false positive: a `main`/`develop` token belonging to a
LATER, unrelated command in the same chain (e.g. `git log main..HEAD`) must
not trip the push-to-deploying-branch rule.
"""

import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).parent / "guard-production.py"


def run(command: str) -> int:
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
    )
    return proc.returncode


SHOULD_BLOCK = [
    "git push origin main",
    "git push origin develop",
    "git push -u origin main",
    "git push --force origin main",
    "git push origin main | cat",
]

SHOULD_ALLOW = [
    "git push origin fix/guard-push-regex && git log --oneline main..HEAD",
    "git push origin feature/foo; git diff main..HEAD",
    "git push origin fix/foo | cat && git log --oneline main..HEAD",
]

for cmd in SHOULD_BLOCK:
    assert run(cmd) == 2, f"should block: {cmd}"

for cmd in SHOULD_ALLOW:
    assert run(cmd) == 0, f"should NOT block: {cmd}"

print(f"guard-production.py: {len(SHOULD_BLOCK)} blocked, {len(SHOULD_ALLOW)} allowed — OK")
