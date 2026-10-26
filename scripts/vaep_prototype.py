"""VAEP prototype: value every action, defensive ones included. Offline analysis only.

    .venv/bin/python scripts/vaep_prototype.py --train 1500 --test 500

VAEP (Decroos et al., 2019) asks of each action: did it make my team more likely to score
soon, or less likely to concede? Two classifiers estimate, after each action, the chance
the acting team scores (P_score) or concedes (P_concede) within the next 10 actions. An
action's value is the change it caused:

    VAEP = (P_score now - P_score before) - (P_concede now - P_concede before)

where "before" is the previous action, seen from this team's side (if the other team had the
ball, their P_concede is our P_score). Compared here with xT, which only credits completed
passes. Not wired into the product: it needs two trained models inside a live metric.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss, roc_auc_score
from xgboost import XGBClassifier

from live import metrics as M
from sim import simulate_season

ACTIONS = ["pass", "shot", "tackle", "interception", "foul"]
HORIZON = 10


def actions(ev: pd.DataFrame) -> pd.DataFrame:
    """On-ball actions with labels: does the acting team score / concede within 10 actions."""
    a = ev[ev["type"].isin(ACTIONS)].reset_index(drop=True).copy()
    goal = (a["type"] == "shot") & (a["outcome"] == "goal")
    side = a["side"].to_numpy()
    goal_side = np.where(goal, side, "")
    n = len(a)
    score, concede = np.zeros(n), np.zeros(n)
    for i in range(n):
        ahead = goal_side[i: i + HORIZON]
        score[i] = float((ahead == side[i]).any())
        concede[i] = float(((ahead != "") & (ahead != side[i])).any())
    a["score"], a["concede"] = score, concede
    return a


def features(a: pd.DataFrame) -> pd.DataFrame:
    f = pd.DataFrame(index=a.index)
    for t in ACTIONS:
        f[f"is_{t}"] = (a["type"] == t).astype(float)
    f["success"] = a["outcome"].isin(["complete", "won", "goal"]).astype(float)
    f["x"], f["y"] = a["x"], a["y"]
    f["end_x"] = a["end_x"].fillna(a["x"])
    f["end_y"] = a["end_y"].fillna(a["y"])
    dx, dy = (100 - f["end_x"]) * 1.05, (f["end_y"] - 50) * 0.68
    f["end_dist"] = np.hypot(dx, dy)
    f["xt_end"] = M.xt_at(f["end_x"], f["end_y"])
    prev_same = (a["side"] == a["side"].shift(1)).astype(float)
    f["prev_same_team"] = prev_same
    f["prev_x"] = a["x"].shift(1).fillna(50)
    f["prev_is_shot"] = (a["type"].shift(1) == "shot").astype(float)
    goals = ((a["type"] == "shot") & (a["outcome"] == "goal"))
    home_g = (goals & (a["side"] == "home")).cumsum().shift(1).fillna(0)
    away_g = (goals & (a["side"] == "away")).cumsum().shift(1).fillna(0)
    f["goal_diff"] = np.where(a["side"] == "home", home_g - away_g, away_g - home_g)
    f["minute"] = a["minute"]
    return f.astype(float)


def build(matches) -> tuple[pd.DataFrame, pd.DataFrame]:
    acts = [actions(m.events).assign(match_id=m.match_id) for m in matches]
    a = pd.concat(acts, ignore_index=True)
    f = pd.concat([features(x) for x in acts], ignore_index=True)
    return a, f


def vaep_values(a: pd.DataFrame, ps: np.ndarray, pc: np.ndarray) -> np.ndarray:
    prev_s, prev_c = np.roll(ps, 1), np.roll(pc, 1)
    same = (a["side"].to_numpy() == np.roll(a["side"].to_numpy(), 1))
    before_s = np.where(same, prev_s, prev_c)
    before_c = np.where(same, prev_c, prev_s)
    first = (a["match_id"].to_numpy() != np.roll(a["match_id"].to_numpy(), 1))
    before_s[first], before_c[first] = ps[first], pc[first]
    goal = ((a["type"] == "shot") & (a["outcome"] == "goal")).to_numpy()
    after_s = np.where(goal, 1.0, ps)  # a goal is worth a full goal
    return (after_s - before_s) - (pc - before_c)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--train", type=int, default=1500)
    p.add_argument("--test", type=int, default=500)
    p.add_argument("--out", type=Path, default=None, help="optional JSON summary")
    args = p.parse_args()

    a_tr, f_tr = build(simulate_season(args.train, seed=606))
    a_te, f_te = build(simulate_season(args.test, seed=707))
    summary: dict = {"train_matches": args.train, "test_matches": args.test,
                     "test_actions": int(len(a_te))}
    probs = {}
    for label in ("score", "concede"):
        clf = XGBClassifier(n_estimators=300, max_depth=4, learning_rate=0.05,
                            subsample=0.9, eval_metric="logloss")
        clf.fit(f_tr, a_tr[label])
        pr = clf.predict_proba(f_te)[:, 1]
        probs[label] = pr
        base = np.full_like(pr, a_tr[label].mean())
        summary[label] = {"rate": round(float(a_te[label].mean()), 4),
                          "log_loss": round(log_loss(a_te[label], pr), 5),
                          "log_loss_base_rate": round(log_loss(a_te[label], base), 5),
                          "auc": round(roc_auc_score(a_te[label], pr), 4)}
    a_te["vaep"] = vaep_values(a_te, probs["score"], probs["concede"])

    ann = pd.concat([M.annotate(m.events) for m in simulate_season(args.test, seed=707)],
                    ignore_index=True)
    xt_by_player = ann.groupby(["team_id", "player"])["xt_added"].sum()
    by_type = a_te.groupby("type")["vaep"].agg(["mean", "sum", "count"])
    summary["vaep_by_action_type"] = {t: {"mean": round(float(r["mean"]), 5),
                                          "total_per_match": round(float(r["sum"]) / args.test,
                                                                   3)}
                                      for t, r in by_type.iterrows()}
    players = a_te.groupby(["team_id", "player"])["vaep"].sum().to_frame("vaep")
    players["xt"] = xt_by_player.reindex(players.index).fillna(0)
    summary["player_rank_correlation"] = round(
        float(players["vaep"].rank().corr(players["xt"].rank())), 3)
    defenders = a_te[a_te["type"].isin(["tackle", "interception"])]
    summary["defensive_share_of_positive_value"] = round(
        float(defenders["vaep"].clip(lower=0).sum() / a_te["vaep"].clip(lower=0).sum()), 3)
    print(json.dumps(summary, indent=2))
    if args.out:
        args.out.write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
