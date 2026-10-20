"""Train the half-time models on synthetic matches.

    python -m model.train --n 10000          # full run (~4 min to simulate)
    python -m model.train --n 1000 --quick   # smoke test

Writes artifacts/model.joblib and artifacts/metrics.json. Always compares
against the baseline from the plan (half-time score only), so the pitch can
show the model actually beats it.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from model.features import FEATURE_COLUMNS, build_dataset
from model.predict import NEXT_GOAL_CLASSES, RESULT_CLASSES
from sim.simulator import simulate_season

DATA_DIR = Path("data/processed")
ARTIFACT_DIR = Path("artifacts")


def load_or_build_dataset(n: int, seed: int) -> pd.DataFrame:
    path = DATA_DIR / f"dataset_n{n}_s{seed}.parquet"
    if path.exists():
        print(f"using cached dataset {path}")
        return pd.read_parquet(path)
    t = time.time()
    df = build_dataset(simulate_season(n, seed=seed))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)
    print(f"simulated {n} matches in {time.time() - t:.0f}s -> {path}")
    return df


def _xgb(quick: bool) -> XGBClassifier:
    return XGBClassifier(
        n_estimators=150 if quick else 400, max_depth=3, learning_rate=0.05, subsample=0.9,
        colsample_bytree=0.9, objective="multi:softprob", eval_metric="mlogloss",
    )


def _score(y_true, proba) -> dict[str, float]:
    return {"log_loss": round(log_loss(y_true, proba, labels=[0, 1, 2]), 4),
            "accuracy": round(accuracy_score(y_true, proba.argmax(axis=1)), 4)}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--n", type=int, default=10_000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--quick", action="store_true")
    args = p.parse_args()

    df = load_or_build_dataset(args.n, args.seed)
    y_res = df["result"].map(RESULT_CLASSES.index)
    y_ng = df["next_goal"].map(NEXT_GOAL_CLASSES.index)
    X = df[FEATURE_COLUMNS]
    X_tr, X_te, yr_tr, yr_te, yn_tr, yn_te = train_test_split(
        X, y_res, y_ng, test_size=0.2, random_state=args.seed, stratify=y_res)

    baseline = LogisticRegression(max_iter=1000).fit(X_tr[["goal_diff"]], yr_tr)
    result_model = _xgb(args.quick).fit(X_tr, yr_tr)
    next_goal_model = _xgb(args.quick).fit(X_tr, yn_tr)

    metrics = {
        "n_matches": int(len(df)),
        "result": {
            "baseline_score_only": _score(yr_te, baseline.predict_proba(X_te[["goal_diff"]])),
            "xgboost": _score(yr_te, result_model.predict_proba(X_te)),
        },
        "next_goal": {"xgboost": _score(yn_te, next_goal_model.predict_proba(X_te))},
        "class_balance": df["result"].value_counts(normalize=True).round(3).to_dict(),
    }
    version = f"xgb-{datetime.now(UTC):%Y%m%d-%H%M}"
    ARTIFACT_DIR.mkdir(exist_ok=True)
    joblib.dump({"version": version, "result_model": result_model,
                 "next_goal_model": next_goal_model, "features": FEATURE_COLUMNS},
                ARTIFACT_DIR / "model.joblib")
    (ARTIFACT_DIR / "metrics.json").write_text(json.dumps({"version": version, **metrics},
                                                          indent=2))
    print(json.dumps(metrics, indent=2))
    better = (metrics["result"]["xgboost"]["log_loss"]
              < metrics["result"]["baseline_score_only"]["log_loss"])
    print(f"\n{version}: XGBoost {'beats' if better else 'DOES NOT beat'} the score-only baseline")


if __name__ == "__main__":
    main()
