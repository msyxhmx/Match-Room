"""Second-half prediction + "why" factors (Explain stage).

`load_predictor()` returns the trained XGBoost model (with SHAP factors) if
`artifacts/model.joblib` exists, otherwise a transparent hand-weighted
heuristic. Both return the same contract objects, so the API and website work
from minute one, before any training has happened.
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
import pandas as pd

from contract import Factor, NextGoalProbs, Prediction, ResultProbs
from model.features import FEATURE_COLUMNS, FEATURE_LABELS

log = logging.getLogger(__name__)

ARTIFACT_PATH = Path(os.getenv("MODEL_ARTIFACT", "artifacts/model.joblib"))
RESULT_CLASSES = ["home_win", "draw", "away_win"]
NEXT_GOAL_CLASSES = ["home", "away", "none"]
TOP_K = 3


class Predictor(Protocol):
    version: str

    def predict(self, features: dict[str, float]) -> Prediction: ...


def _factor(name: str, value: float, impact: float) -> Factor:
    return Factor(feature=name, label=FEATURE_LABELS.get(name, name), value=round(value, 3),
                  impact=round(float(impact), 4), favours="home" if impact >= 0 else "away")


def _top_factors(features: dict[str, float], impacts: dict[str, float]) -> list[Factor]:
    ranked = sorted(impacts.items(), key=lambda kv: abs(kv[1]), reverse=True)[:TOP_K]
    return [_factor(n, features[n], imp) for n, imp in ranked]


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


@dataclass
class HeuristicPredictor:
    """Ordered-logit style rule of thumb. Not a model: a fallback and a sanity baseline."""

    version: str = "heuristic-v0"
    weights: dict[str, float] | None = None

    def __post_init__(self) -> None:
        self.weights = self.weights or {
            "goal_diff": 0.95,
            "xg_diff": 0.45,
            "strength_diff": 0.70,
            "tilt_home": 1.2,  # applied to (value - 0.5)
            "momentum_last15": 0.6,  # applied to (value - 0.5)
            "red_diff": -0.9,
        }

    def _impacts(self, f: dict[str, float]) -> dict[str, float]:
        centred = {"tilt_home", "momentum_last15"}
        return {k: w * (f[k] - 0.5 if k in centred else f[k]) for k, w in self.weights.items()}

    def predict(self, features: dict[str, float]) -> Prediction:
        impacts = self._impacts(features)
        score = sum(impacts.values()) + 0.12  # small home edge
        cut = 0.62
        p_home, p_away = _sigmoid(score - cut), _sigmoid(-score - cut)
        p_draw = max(0.0, 1.0 - p_home - p_away)

        p_none = 0.2
        home_share = _sigmoid(0.5 * features["xg_diff"] + 2.0 * (features["tilt_home"] - 0.5)
                              + 0.5 * features["strength_diff"] - 0.7 * features["red_diff"])
        return Prediction(
            result=ResultProbs(home_win=round(p_home, 3), draw=round(p_draw, 3),
                               away_win=round(p_away, 3)),
            next_goal=NextGoalProbs(home=round((1 - p_none) * home_share, 3),
                                    away=round((1 - p_none) * (1 - home_share), 3), none=p_none),
            factors=_top_factors(features, impacts),
        )


class TrainedPredictor:
    def __init__(self, bundle: dict) -> None:
        import shap  # imported lazily: heavy, and only needed once a model exists

        self.version = bundle["version"]
        self.result_model = bundle["result_model"]
        self.next_goal_model = bundle["next_goal_model"]
        self.explainer = shap.TreeExplainer(self.result_model)

    def _home_impacts(self, x: pd.DataFrame) -> dict[str, float]:
        sv = self.explainer.shap_values(x)
        # shap returns (n, features, classes) or a list per class depending on version
        arr = np.stack(sv, axis=-1) if isinstance(sv, list) else np.asarray(sv)
        home = RESULT_CLASSES.index("home_win")
        away = RESULT_CLASSES.index("away_win")
        net = arr[0, :, home] - arr[0, :, away]  # log-odds pushed toward home over away
        return dict(zip(FEATURE_COLUMNS, net.tolist(), strict=True))

    def predict(self, features: dict[str, float]) -> Prediction:
        x = pd.DataFrame([[features[c] for c in FEATURE_COLUMNS]], columns=FEATURE_COLUMNS)
        r = self.result_model.predict_proba(x)[0]
        g = self.next_goal_model.predict_proba(x)[0]
        return Prediction(
            result=ResultProbs(**{c: round(float(p), 3) for c, p in zip(RESULT_CLASSES, r,
                                                                        strict=True)}),
            next_goal=NextGoalProbs(**{c: round(float(p), 3) for c, p in zip(NEXT_GOAL_CLASSES, g,
                                                                             strict=True)}),
            factors=_top_factors(features, self._home_impacts(x)),
        )


def load_predictor(path: Path = ARTIFACT_PATH) -> Predictor:
    if path.exists():
        try:
            import joblib

            return TrainedPredictor(joblib.load(path))
        except Exception as exc:  # noqa: BLE001 - never break half-time on a bad artifact
            log.warning(
                "Could not load model artifact %s (%s); using heuristic predictor.",
                path,
                exc,
            )
    return HeuristicPredictor()
