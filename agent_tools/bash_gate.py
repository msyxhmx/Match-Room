"""A Claude Code hook that stops dangerous shell commands before they run.

Claude Code runs this before every Bash call (PreToolUse). It reads the hook's
JSON on stdin and answers in three layers:

1. Plain rules deny what AGENTS.md says not to do: pushing to main, force
   pushes, hard resets, `git clean -f`, `git branch -D`, `gh pr merge` (the
   teammate merges) and committing `.env`. The user runs these themselves.
2. A safe list lets plain read-only commands through (git status, grep,
   `make check`, pytest...). Nothing is sent anywhere.
3. Jev judges everything else. If it thinks the command is harmless it runs;
   otherwise the user is asked. Jev never blocks on its own. In a mode where
   Claude Code already checks commands (auto, accept edits, bypass), the hook
   only asks when Jev thinks something could be destroyed.

With no key, or if Jev is down or slow, layer 3 is skipped and Claude Code's
normal permissions decide, exactly as without the hook.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from collections.abc import Callable, Mapping
from typing import Any

from agent_tools import jev

ALLOW_AT = 0.5
"""Jev's "allow" probability at which a command runs without asking."""

PROTECTED = ("main", "master")

RULES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\bgit\s+push\b[^;&|]*(\s--force\b|\s-\w*f\w*\b|\s--force-with-lease\b|\s\+\S)"),
        "force-pushing rewrites shared history",
    ),
    (
        re.compile(r"\bgit\s+push\b[^;&|]*(?:^|[\s:]|refs/heads/)(?:main|master)(?:\s|$)"),
        "pushing to main (main always has to run; changes go in through a PR)",
    ),
    (re.compile(r"\bgit\s+reset\s+--hard\b"), "a hard reset throws away work"),
    (
        re.compile(r"\bgit\s+clean\s+(?:-\w*f|.*--force)"),
        "git clean -f deletes untracked files for good",
    ),
    (re.compile(r"\bgit\s+branch\s+-D\b"), "branch -D deletes a branch even if unmerged"),
    (re.compile(r"\bgh\s+pr\s+merge\b"), "the teammate reviews and merges PRs"),
    (
        re.compile(r"\bgit\s+(?:add|commit)\b[^;&|]*(?:^|[\s/])\.env(?![\w.-])"),
        "committing .env would leak the keys",
    ),
]

SAFE_PATTERNS = [
    re.compile(p)
    for p in (
        r"git\s+(?:status|diff|log|show|blame|ls-files|rev-parse|remote\s+-v)(?:\s|$)",
        r"git\s+branch(?:\s+(?:--show-current|--list|-a|-v|-vv))?\s*$",
        r"(?:ls|cat|grep|rg|head|tail|wc|pwd|which)(?:\s|$)",
        r"sed\s+-n\s",
        r"find(?:\s|$)",
        r"make\s+(?:check|lint|test|schema|train-quick)\s*$",
        r"\.venv/bin/python\s+-m\s+(?:pytest|ruff)(?:\s|$)",
        r"npm\s+run\s+(?:typecheck|build)\s*$",
    )
]
COMPOUND = re.compile(r"[;&|`<>]|\$\(")
QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2\s*(?:\n|$)", re.S)
SEGMENT = re.compile(r"&&|\|\||;|\|")

BASH_RULES = (
    "This repo's hard rules: never push to main or force-push; never git reset --hard, "
    "git clean -f or git branch -D; never merge a pull request (the teammate does); never "
    "commit .env or print its keys; push and open pull requests only when the user asks."
)


def _plain_push_on_protected(bare: str, branch: str | None) -> bool:
    """A `git push` with no branch named (or `HEAD`), while the current branch is main."""
    if branch not in PROTECTED:
        return False
    for segment in SEGMENT.split(bare):
        try:
            words = shlex.split(segment)
        except ValueError:
            continue
        if "push" in words and "git" in words:
            after = words[words.index("push") + 1 :]
            named = [w for w in after if not w.startswith("-")]
            if len(named) <= 1 or named[1] in ("HEAD", "@"):
                return True
    return False


def rule_for(command: str, branch: str | None = None) -> str | None:
    """Why a plain rule denies `command`, or None.

    Quoted text and heredoc bodies are left out, so `grep "git push --force" docs/`
    or a commit message that mentions `gh pr merge` is not the command itself.
    """
    bare = QUOTED.sub("''", HEREDOC.sub("\n", command))
    for pattern, why in RULES:
        if pattern.search(bare):
            return why
    if _plain_push_on_protected(bare, branch):
        return f"you are on {branch}, so this pushes to main"
    return None


def is_safe(command: str) -> bool:
    """A single read-only command: no chaining, redirection or substitution."""
    text = command.strip()
    if not text or COMPOUND.search(text) or re.search(r"(?:^|[\s/])\.env(?![\w.-])", text):
        return False  # reading .env would print the keys
    if re.match(r"find\b", text) and re.search(r"-(delete|exec|ok)\b", text):
        return False
    return any(p.match(text) for p in SAFE_PATTERNS)


def decide(probabilities: Mapping[str, float]) -> str:
    return "allow" if float(probabilities.get("allow", 0.0)) >= ALLOW_AT else "ask"


HANDS_OFF_MODES = {"auto", "acceptEdits", "bypassPermissions"}


def destructive(probabilities: Mapping[str, float]) -> bool:
    return float(probabilities.get("block", 0.0)) >= float(probabilities.get("ask", 0.0))


def why_ask(probabilities: Mapping[str, float]) -> str:
    block = float(probabilities.get("block", 0.0))
    ask = float(probabilities.get("ask", 0.0))
    if destructive(probabilities):
        risk = (
            "Jev thinks this may destroy something that cannot be undone, or break a "
            f"repo rule ({block:.0%} sure)"
        )
    else:
        risk = f"Jev thinks this changes something you may want to check first ({ask:.0%} sure)"
    return f"{risk}. Run it anyway?"


def gate(
    command: str,
    ask_jev: Callable[[str], Mapping[str, float] | None] | None,
    mode: str = "default",
    branch: str | None = None,
) -> tuple[str | None, str]:
    """The whole decision for one command: (answer, reason). Answer None means no opinion."""
    why = rule_for(command, branch)
    if why:
        return "deny", f"Blocked by the repo's rules: {why}. Only the user runs this, themselves."
    if is_safe(command):
        return "allow", "read-only"
    if ask_jev is None:
        return None, "Jev unavailable; normal permissions apply"
    try:
        probabilities = ask_jev(command)
    except Exception as error:  # noqa: BLE001 (the gate must never break a session)
        return None, f"Jev failed ({type(error).__name__}); normal permissions apply"
    if not probabilities:
        return None, "Jev unavailable; normal permissions apply"
    if decide(probabilities) == "allow":
        return "allow", f"Jev: harmless ({float(probabilities.get('allow', 0.0)):.0%} sure)"
    if mode in HANDS_OFF_MODES and not destructive(probabilities):
        return None, f"left to the {mode} mode: {why_ask(probabilities)}"
    return "ask", why_ask(probabilities)


def jev_asker(evaluate: jev.Evaluate, cwd: str) -> Callable[[str], Mapping[str, float] | None]:
    """Turn a Jev evaluate function into `command -> {allow, ask, block}` probabilities."""

    def ask(command: str) -> Mapping[str, float] | None:
        state = {"command": command[:12_000], "cwd": cwd, "rules": BASH_RULES}
        questions = {
            "gate": {
                "type": "choice",
                "instructions": "An AI coding agent wants to run `command` in a software repo "
                "with `rules`. Read every part of it, including anything after && or ; and any "
                "code passed to python -c or node -e. What should happen?",
                "criteria": {
                    "allow": "Only reads, or changes nothing that matters and is trivially "
                    "undone: listing, searching, viewing git history, running tests, linters or "
                    "type checks, or writing files only inside a temporary scratch folder",
                    "ask": "Changes things that can be undone, or is allowed only when the user "
                    "says so: a commit, an ordinary push, installing packages, editing a file, "
                    "opening a pull request, deleting an untracked file in the repo",
                    "block": "Irreversible, destroys work or history, or breaks a hard rule in "
                    "`rules`: pushing to main, force-pushing, hard resets, mass deletes, "
                    "overwriting secrets, piping a download into a shell",
                },
            }
        }
        body = evaluate(state, questions)
        if not body:
            return None
        return dict(body["answers"]["gate"]["probabilities"])

    return ask


def current_branch(cwd: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=3,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return out or None


def main() -> int:
    """Claude Code PreToolUse hook: JSON in on stdin, a decision out on stdout."""
    try:
        event: dict[str, Any] = json.load(sys.stdin)
        command = str((event.get("tool_input") or {}).get("command") or "")
        if event.get("tool_name") != "Bash" or not command:
            return 0
        cwd = str(event.get("cwd") or os.getcwd())
        mode = str(event.get("permission_mode") or "default")
        evaluate = jev.evaluator()
        asker = jev_asker(evaluate, cwd) if evaluate else None
        answer, reason = gate(command, asker, mode, current_branch(cwd))
    except Exception:  # noqa: BLE001 (a hook must never break a session)
        return 0
    if answer:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": answer,
                        "permissionDecisionReason": reason,
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
