"""Dixon-Coles half-time baseline: a classic football scoring model to measure XGBoost against.

Second-half goals for each side are Poisson, with rates from the pre-match strengths and a
home edge. Dixon and Coles (1997) add one correction, `rho`, for how often low scores (0-0,
1-0, 0-1, 1-1) happen compared with independent Poissons. The final result comes from adding
the second-half goal grid to the half-time score.

    log mu_home = c + home + att * log(home_attack) - dfn * log(away_defence)
    log mu_away = c        + att * log(away_attack) - dfn * log(home_defence)

It sees only the half-time score and the pre-match strengths, so it is a stronger baseline
than the score-only one but still knows nothing about how the first half was played.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson

MAX_GOALS = 10
COLUMNS = ["home_attack", "home_defence", "away_attack", "away_defence", "ht_home", "ht_away"]
TARGETS = ["h2_home", "h2_away"]


def _tau(x: np.ndarray, y: np.ndarray, mu_h: np.ndarray, mu_a: np.ndarray,
         rho: float) -> np.ndarray:
    """Dixon-Coles low-score correction; 1 everywhere except 0-0, 1-0, 0-1, 1-1."""
    t = np.ones_like(mu_h, dtype=float)
    t = np.where((x == 0) & (y == 0), 1 - mu_h * mu_a * rho, t)
    t = np.where((x == 0) & (y == 1), 1 + mu_h * rho, t)
    t = np.where((x == 1) & (y == 0), 1 + mu_a * rho, t)
    t = np.where((x == 1) & (y == 1), 1 - rho, t)
    return np.maximum(t, 1e-10)


@dataclass
class DixonColes:
    c: float = 0.0
    home: float = 0.0
    att: float = 1.0
    dfn: float = 1.0
    rho: float = 0.0

    def rates(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        mu_h = np.exp(self.c + self.home + self.att * np.log(df["home_attack"])
                      - self.dfn * np.log(df["away_defence"]))
        mu_a = np.exp(self.c + self.att * np.log(df["away_attack"])
                      - self.dfn * np.log(df["home_defence"]))
        return mu_h.to_numpy(float), mu_a.to_numpy(float)

    def fit(self, df: pd.DataFrame) -> DixonColes:
        x, y = df["h2_home"].to_numpy(int), df["h2_away"].to_numpy(int)

        def nll(params: np.ndarray) -> float:
            self.c, self.home, self.att, self.dfn, self.rho = params
            mu_h, mu_a = self.rates(df)
            ll = (poisson.logpmf(x, mu_h) + poisson.logpmf(y, mu_a)
                  + np.log(_tau(x, y, mu_h, mu_a, self.rho)))
            return -float(ll.sum())

        res = minimize(nll, x0=[0.3, 0.1, 1.0, 1.0, 0.0], method="L-BFGS-B",
                       bounds=[(-3, 3), (-1, 1), (-5, 5), (-5, 5), (-0.3, 0.3)])
        self.c, self.home, self.att, self.dfn, self.rho = (float(v) for v in res.x)
        return self

    def predict_proba(self, df: pd.DataFrame) -> np.ndarray:
        """Columns: home_win, draw, away_win."""
        mu_h, mu_a = self.rates(df)
        g = np.arange(MAX_GOALS + 1)
        out = np.zeros((len(df), 3))
        ht_diff = (df["ht_home"] - df["ht_away"]).to_numpy(int)
        diff = np.subtract.outer(g, g)  # second-half home goals minus away goals
        gx, gy = np.meshgrid(g, g, indexing="ij")
        for i in range(len(df)):
            grid = np.outer(poisson.pmf(g, mu_h[i]), poisson.pmf(g, mu_a[i]))
            grid *= _tau(gx, gy, np.full(gx.shape, mu_h[i]), np.full(gx.shape, mu_a[i]),
                         self.rho)
            grid /= grid.sum()
            final = ht_diff[i] + diff
            out[i] = [grid[final > 0].sum(), grid[final == 0].sum(), grid[final < 0].sum()]
        return out

    def params(self) -> dict[str, float]:
        return {k: round(v, 4) for k, v in
                {"c": self.c, "home": self.home, "att": self.att, "dfn": self.dfn,
                 "rho": self.rho}.items()}
