# Methodology options: how to keep improving Match-Room

Compiled 26 Oct 2026 for Syahmi (backend: `sim/`, `live/`, `model/`). It answers one question:
how would a football-analytics developer keep improving this project, and which open-source
tools and methods would help? Nothing here is built yet.

**Source marks**

- 🔎 a library or repo named from memory; open it and check the API and licence before using it
- **Inference:** our judgement about this codebase, not a sourced fact

**The hard limit.** The brief is the *Synthetic* Match Insights Engine and every match must be
synthetic. Real open data (StatsBomb, Metrica) is at most for offline sanity checks, if the
rules allow even that. Nothing below needs real data in the product.

## Where the project stands (26 Oct)

- Half-time model (XGBoost, 13 first-half features): log loss **0.665** vs **0.730** for the
  score-only baseline, accuracy 69.1%. Next-goal model: log loss 1.016, accuracy 51.6%.
- xT is a hand-drawn 12 × 8 surface shaped like Karun Singh's, not fitted
  ([live-engine.md](../live-engine.md)).
- The simulator draws events per minute, independently. A shot's location is derived *from*
  its xG, which is the reverse of real data.
- Momentum flips, chaos phases and other cards use fixed thresholds.
- The live win projection is a simple Poisson model with a pre-match/live blend.

**Inference:** the biggest lever is the simulator, because every metric, card and model
inherits its realism. The cheapest credibility gain is fitting the hand-drawn pieces on our
own simulated matches, which stays inside the synthetic-only rule.

## 1. Simulator realism

| Idea | What it gives us | Effort |
|---|---|---|
| **Possession-chain (Markov) simulator.** Each possession moves between pitch zones (pass, carry, shot, turnover) instead of counting events per minute. | Shots come from where the ball is; xT and VAEP become meaningful | Days |
| **Game-state effects.** Trailing teams push forward, leading teams sit deeper. | More believable comebacks and momentum cards | Hours (part exists: `chase` term) |
| **Self-exciting (Hawkes) processes** for attacks that cluster in time. | A principled momentum model, and a way to test "is momentum real?" | A day |
| **Synthetic tracking data** from Google Research Football (agent-played, open source 🔎 `google-research/football`). | Player positions, so **pitch control** overlays (Spearman's model) | Days |

Reference implementation for pitch control and EPV: Laurie Shaw's *LaurieOnTracking*
(🔎 `Friends-of-Tracking-Data-FoTD/LaurieOnTracking`).

## 2. Libraries and standard formats

| Tool | Use for us |
|---|---|
| **socceraction** (KU Leuven, 🔎 `ML-KULeuven/socceraction`) | The SPADL action format, plus xT and **VAEP**. VAEP values every action, defensive ones included. |
| **kloppy** (PySport, 🔎 `PySport/kloppy`) | Converts provider formats (Opta, StatsBomb, etc.) into one model. An adapter lets us say "ready for a real feed". |
| **penaltyblog** (🔎 `martineastwood/penaltyblog`) | Dixon-Coles, bivariate Poisson, Elo and pi-ratings, and RPS. Fits the win projection and the season table. |
| **mplsoccer** (Python) / **d3-soccer** (JS) (🔎) | Pitch plots, pass networks, heatmaps. d3-soccer fits the React frontend. |
| **floodlight**, **databallpy** (🔎) | Analysis toolkits for tracking and event data, if we add positions. |
| **ruptures** (🔎 `deepcharles/ruptures`) | Change-point detection. |
| **MAPIE** (🔎 `scikit-learn-contrib/MAPIE`) | Conformal prediction intervals. |
| **hypothesis**, **pandera** | Property-based tests (no-leakage rule) and event-schema validation. |

Learning resource: the **Friends of Tracking** YouTube series and its GitHub repos.

## 3. Modelling methods

- **Fit xT on our own simulated matches** with Karun Singh's value-iteration method instead
  of the hand-drawn surface. Then try VAEP. Fully synthetic, so within the rules.
- **Evaluate the way the field does.** Add the **Ranked Probability Score** (the standard for
  home/draw/away) and calibration plots (isotonic calibration if it's off). Compare against a
  **Dixon-Coles** in-play baseline as well as the score-only one.
- **Calibrate the live win projection per minute.** We have 10,000 simulated matches with known
  outcomes: check calibration at minute 20, 60, 85.
- **Show uncertainty** with conformal intervals (MAPIE).
- **Detect momentum flips with change-points** (ruptures) instead of the fixed ±0.35 rule.
- **Test whether insights predict anything.** Does a momentum flip predict the next goal better
  than chance? The next-goal model can answer this.
- **Pass networks** (networkx centrality) to give the focus-player persona real structure.

## 4. Story and card quality

- Measure how often cards fire per match, and check for repeats, so the feed never spams.
- Score stories with an LLM-as-judge rubric, on top of the fact validator.
- The data-to-text literature (e.g. the RotoWire benchmark) has methods for judging which facts
  a story picks.

## Recommended order

Sorted by whether it can change what the demo shows.

**Safe before the demo recording (adds numbers only):**

1. RPS, a calibration check and a Dixon-Coles baseline in `model/train.py`, `metrics.json` and
   the README table. About an hour plus one retrain.
2. A "Methodology and roadmap" section in the README naming the tools above. Judges read the
   write-up.

**After recording (changes live metrics and cards, so storyboard shots may shift):**

3. Fit xT (then VAEP) from simulated matches with socceraction.
4. Change-point detection for momentum flips.

**If there's time before judging ends (10 Nov):**

5. kloppy adapter, possession-chain simulator, synthetic tracking + pitch control.

**Inference:** 1 and 2 give the best return for the least risk right now. 3 is the strongest
technical upgrade but needs a re-check of the demo scenario afterwards (dump every scenario's
goals, cards and turning points before and after, as we did for the red-card fix in #19).
