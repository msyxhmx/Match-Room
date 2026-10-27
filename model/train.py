"""Train the half-time models on synthetic matches.

    python -m model.train --n 10000          # full run (~7 min)
    python -m model.train --n 1000 --quick --out data/quick   # smoke test

Writes model.joblib and metrics.json to --out (default artifacts/). Always compares
against baselines, from weakest to strongest: the hand-weighted heuristic, pre-match
strength only, half-time score only, and a Dixon-Coles model (score + strengths). Every
model is scored on log loss, accuracy and RPS, with a calibration check.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from model.dixon_coles import DixonColes
from model.evaluation import calibration, score
from model.features import FEATURE_COLUMNS, build_dataset
from model.predict import NEXT_GOAL_CLASSES, RESULT_CLASSES, HeuristicPredictor
from sim.simulator import simulate_season

DATA_DIR = Path("data/processed")
ARTIFACT_DIR = Path("artifacts")


def _code_version() -> str:
    """Short hash of the code that builds the dataset, so a simulator or feature
    change never trains on a stale cache."""
    h = hashlib.sha256()
    for f in ("sim/simulator.py", "sim/chain.py", "sim/teams.py", "model/features.py"):
        h.update((Path(__file__).parent.parent / f).read_bytes())
    return h.hexdigest()[:8]


def load_or_build_dataset(n: int, seed: int) -> pd.DataFrame:
    path = DATA_DIR / f"dataset_n{n}_s{seed}_{_code_version()}.parquet"
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


def _heuristic_proba(X) -> np.ndarray:
    h = HeuristicPredictor()
    rows = [h.predict(r).result for r in X.to_dict("records")]
    proba = np.array([[r.home_win, r.draw, r.away_win] for r in rows])
    return proba / proba.sum(axis=1, keepdims=True)  # its rounded outputs can miss 1 slightly


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--n", type=int, default=10_000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--quick", action="store_true")
    p.add_argument("--out", type=Path, default=ARTIFACT_DIR,
                   help="where to write model.joblib and metrics.json")
    args = p.parse_args()

    df = load_or_build_dataset(args.n, args.seed)
    y_res = df["result"].map(RESULT_CLASSES.index)
    y_ng = df["next_goal"].map(NEXT_GOAL_CLASSES.index)
    X = df[FEATURE_COLUMNS]
    X_tr, X_te, yr_tr, yr_te, yn_tr, yn_te, df_tr, df_te = train_test_split(
        X, y_res, y_ng, df, test_size=0.2, random_state=args.seed, stratify=y_res)

    baseline = LogisticRegression(max_iter=1000).fit(X_tr[["goal_diff"]], yr_tr)
    strength_only = LogisticRegression(max_iter=1000).fit(X_tr[["strength_diff"]], yr_tr)
    dixon_coles = DixonColes().fit(df_tr)
    result_model = _xgb(args.quick).fit(X_tr, yr_tr)
    next_goal_model = _xgb(args.quick).fit(X_tr, yn_tr)

    result_proba = {  # weakest to strongest
        "heuristic": _heuristic_proba(X_te),
        "baseline_strength_only": strength_only.predict_proba(X_te[["strength_diff"]]),
        "baseline_score_only": baseline.predict_proba(X_te[["goal_diff"]]),
        "dixon_coles": dixon_coles.predict_proba(df_te),
        "xgboost": result_model.predict_proba(X_te),
    }
    next_goal_proba = next_goal_model.predict_proba(X_te)
    metrics = {
        "n_matches": int(len(df)),
        "result": {k: score(yr_te, p, ordered=True) for k, p in result_proba.items()},
        "next_goal": {"xgboost": score(yn_te, next_goal_proba)},
        "calibration": {
            "result": {k: calibration(yr_te, p, RESULT_CLASSES)
                       for k, p in result_proba.items()},
            "next_goal": {"xgboost": calibration(yn_te, next_goal_proba, NEXT_GOAL_CLASSES)},
        },
        "dixon_coles_params": dixon_coles.params(),
        "class_balance": df["result"].value_counts(normalize=True).round(3).to_dict(),
    }
    version = f"xgb-{datetime.now(UTC):%Y%m%d-%H%M}"
    args.out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"version": version, "result_model": result_model,
                 "next_goal_model": next_goal_model, "features": FEATURE_COLUMNS},
                args.out / "model.joblib")
    (args.out / "metrics.json").write_text(json.dumps({"version": version, **metrics},
                                                          indent=2))
    print(f"\n{'model':<24}{'log loss':>10}{'RPS':>8}{'accuracy':>10}{'mean ECE':>10}")
    for k, m in metrics["result"].items():
        ece = metrics["calibration"]["result"][k]["mean_ece"]
        print(f"{k:<24}{m['log_loss']:>10.4f}{m['rps']:>8.4f}{m['accuracy']:>10.1%}{ece:>10.4f}")
    xgb = metrics["result"]["xgboost"]
    for name in ("baseline_score_only", "dixon_coles"):
        better = xgb["log_loss"] < metrics["result"][name]["log_loss"]
        print(f"{version}: XGBoost {'beats' if better else 'DOES NOT beat'} {name}")


if __name__ == "__main__":
    main()
