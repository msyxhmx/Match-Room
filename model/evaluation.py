"""Scores for probability forecasts, shared by training and the live calibration check.

- RPS (ranked probability score): the standard score for home / draw / away. It knows the
  classes are ordered, so calling a draw when the away side wins costs less than calling a
  home win. Lower is better; 0 is perfect.
- Calibration: when we say 70%, does it happen about 70% of the time? Reported as a
  reliability table per class plus the expected calibration error (ECE), the average gap
  between what we said and what happened, weighted by how many forecasts fall in each bin.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics import accuracy_score, log_loss

N_BINS = 10


def rps(y_true, proba) -> float:
    """Mean ranked probability score for ordered classes (columns in order)."""
    proba = np.asarray(proba, dtype=float)
    y = np.asarray(y_true, dtype=int)
    k = proba.shape[1]
    outcome = np.zeros_like(proba)
    outcome[np.arange(len(y)), y] = 1.0
    gap = np.cumsum(proba, axis=1) - np.cumsum(outcome, axis=1)
    return float(np.mean(np.sum(gap[:, :-1] ** 2, axis=1) / (k - 1)))


def reliability(hit, p, n_bins: int = N_BINS) -> tuple[float, list[dict]]:
    """ECE and the reliability table for one class: `hit` is 1 when the class happened."""
    hit = np.asarray(hit, dtype=float)
    p = np.asarray(p, dtype=float)
    idx = np.minimum((p * n_bins).astype(int), n_bins - 1)
    rows, ece = [], 0.0
    for b in range(n_bins):
        mask = idx == b
        if not mask.any():
            continue
        said, happened = float(p[mask].mean()), float(hit[mask].mean())
        ece += mask.mean() * abs(said - happened)
        rows.append({"bin": f"{b / n_bins:.1f}-{(b + 1) / n_bins:.1f}", "n": int(mask.sum()),
                     "predicted": round(said, 3), "observed": round(happened, 3)})
    return round(float(ece), 4), rows


def calibration(y_true, proba, classes: list[str]) -> dict:
    """Per-class ECE and reliability table, plus the mean ECE across classes."""
    proba = np.asarray(proba, dtype=float)
    y = np.asarray(y_true, dtype=int)
    out: dict = {"per_class": {}}
    for i, name in enumerate(classes):
        ece, table = reliability(y == i, proba[:, i])
        out["per_class"][name] = {"ece": ece, "table": table}
    out["mean_ece"] = round(float(np.mean([c["ece"] for c in out["per_class"].values()])), 4)
    return out


def score(y_true, proba, ordered: bool = False) -> dict[str, float]:
    """Log loss and accuracy, plus RPS when the classes are ordered."""
    proba = np.asarray(proba, dtype=float)
    proba = proba / proba.sum(axis=1, keepdims=True)  # float32 model output can miss 1 by 1e-7
    out = {"log_loss": round(log_loss(y_true, proba, labels=list(range(proba.shape[1]))), 4),
           "accuracy": round(accuracy_score(y_true, proba.argmax(axis=1)), 4)}
    if ordered:
        out["rps"] = round(rps(y_true, proba), 4)
    return out
