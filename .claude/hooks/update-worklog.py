#!/usr/bin/env python3
"""Append an auto-generated snapshot entry to WORKLOG.md."""
import datetime
import pathlib
import subprocess
import sys


def run(args, cwd):
    return subprocess.run(args, capture_output=True, text=True, cwd=cwd).stdout.strip()


def main():
    repo = run(["git", "rev-parse", "--show-toplevel"], cwd=None)
    if not repo:
        sys.exit(0)

    worklog = pathlib.Path(repo) / "WORKLOG.md"
    if not worklog.exists():
        sys.exit(0)

    status = run(["git", "status", "--porcelain"], cwd=repo)
    if not status:
        sys.exit(0)  # nothing changed, don't spam the log

    branch = run(["git", "branch", "--show-current"], cwd=repo)
    now = datetime.datetime.now()
    changed_files = status.splitlines()

    entry = (
        f"## {now:%Y-%m-%d} (auto) — Session update @ {now:%H:%M}\n\n"
        f"Auto-generated snapshot (branch `{branch}`, "
        f"{len(changed_files)} changed file{'s' if len(changed_files) != 1 else ''}).\n\n"
        "```\n" + status + "\n```\n\n---\n\n"
    )

    text = worklog.read_text()
    marker = "---\n"
    idx = text.find(marker)
    if idx == -1:
        new_text = entry + text
    else:
        insert_at = idx + len(marker)
        new_text = text[:insert_at] + "\n" + entry + text[insert_at:]

    worklog.write_text(new_text)


if __name__ == "__main__":
    main()
