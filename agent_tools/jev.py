"""A tiny client for TypeSafe's Jev, which answers yes/no questions about a text.

Jev does not write anything. You send it some text (the `state`) and a few
questions, and it sends back a probability or a choice for each one.

This uses only the standard library so the Claude Code hooks need nothing
extra installed. Every failure (no key, no network, slow reply, odd answer)
gives None, so a hook can stay silent instead of breaking a session.

The key comes from `TYPESAFE_API_KEY`, or else from the repo's `.env`. It is
never printed or logged, and anything that looks like a key is cut out of the
text before it is sent.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.13.0"  # pinned on purpose: a cut-off is only valid for the version it was tested on
TIMEOUT_SECONDS = 8.0
ROOT = Path(__file__).resolve().parents[1]

SECRET = re.compile(
    r"\b(?:apikey_|sk-|ghp_|gho_|github_pat_|xox[abpr]-|AKIA)[\w-]{8,}"
    r"|\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S+"
)

Questions = dict[str, dict[str, Any]]
Evaluate = Callable[[object, Questions], "dict[str, Any] | None"]


def redact(text: str) -> str:
    """Cut anything that looks like a key or token."""
    return SECRET.sub("[removed]", text)


def _clean(value: object) -> object:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, Mapping):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_clean(v) for v in value]
    return value


def local_key(root: Path = ROOT) -> str | None:
    """`TYPESAFE_API_KEY` from the environment, or else from `root/.env`."""
    key = os.environ.get("TYPESAFE_API_KEY")
    if key:
        return key
    try:
        lines = (root / ".env").read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        name, sep, value = line.strip().removeprefix("export ").partition("=")
        if sep and name.strip() == "TYPESAFE_API_KEY":
            return value.strip().strip("'\"") or None
    return None


def ask(
    key: str, state: object, questions: Questions, timeout: float = TIMEOUT_SECONDS
) -> dict[str, Any] | None:
    """Ask Jev every question about `state`. Returns its response body, or None on any problem."""
    body = json.dumps({"model": MODEL, "state": _clean(state), "questions": questions})
    request = urllib.request.Request(
        ENDPOINT,
        data=body.encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            data = json.load(response)
        answers = data["answers"]
        if not all(q in answers for q in questions):
            return None
        return dict(data)
    except Exception:  # noqa: BLE001 (a hook must never break a session)
        return None


def evaluator(root: Path = ROOT) -> Evaluate | None:
    """A function that asks Jev, or None when there is no key."""
    key = local_key(root)
    if not key:
        return None
    return lambda state, questions: ask(key, state, questions)
