# Match-Room Live: how the engine works

Match-Room Live turns a stream of synthetic match events into explained, personalised match
intelligence, from the first whistle to the season table. This page is the reference for every
metric, threshold and rule, so a judge (or a sceptical producer) can check any number on screen.

Code: [`live/`](../live). Contract: [`contract/live.py`](../contract/live.py).

## The five stages

| Stage | Where | What happens |
|---|---|---|
| **Ingest** | `sim/` | Synthetic events, minute by minute: passes (with end point, ball speed, pressure), shots (xG, ball speed), pressures, tackles, interceptions, fouls, cards, corners, match metadata. Scripted scenarios for demos. |
| **Interpret** | `live/metrics.py` | Per-minute xG, xT, possession, field tilt, PPDA, pass difficulty, momentum, control, chaos, tempo, win projection, player lines. |
| **Explain** | `live/insights.py` | Detects the moments that matter and records the facts and event IDs behind each one. |
| **Render** | `live/narrate.py`, `live/engine.py`, `api/` | Cards in three languages and two depths, timed overlay messages, snapshots, websocket stream. |
| **Personalise** | `live/engine.py` | Casual vs analyst, favourite team, focus player, language. Same facts, different experience. |

Half-time, full-time, catch-up and season views are **roll-ups of the same insight log**, so the
live cards, the briefs and the season story never disagree.

## Design rules

1. **No future leakage.** State at minute *m* uses only events with `minute <= m`.
   `tests/test_live_metrics.py::test_no_future_leakage` rebuilds a match cut at 60' and checks
   every metric and insight up to 60' is identical.
2. **Every number is provable.** Templates contain no digits. Every number or name in a
   sentence must come from that insight's facts; `live/narrate.py::validate()` checks it, and
   `tests/test_narrate.py` runs it over every card in every language and persona.
3. **Evidence or it didn't happen.** Every card cites the event IDs that prove it.
4. **Always a fallback.** No Azure OpenAI keys, an error, or an LLM sentence that fails
   validation: the template text is used. The live feed never breaks.
5. **The core match never changes.** The v1 simulator adds detail from a separate random
   stream, so goals, shots and cards for any seed are identical to v0 and the trained
   half-time model stays valid.

## Synthetic data (Ingest)

`sim/simulator.py` runs in two passes:

- **Core** (unchanged from v0): passes, shots, fouls, cards and corners per minute, driven by
  team strength, pressing, home advantage, a momentum swing per 15-minute block, game state and
  red cards.
- **Enrichment** (v1): pass end points (completed passes average ~22 m, failed ones ~30 m,
  forward-leaning angles), ball speed (passes from length; shots from distance), `pressure`
  events before pressured passes (likelier against high-pressing teams, in the opponent's half
  and on failed passes), and a `tackle` or `interception` after every failed pass, so possession
  changes are explicit.

**Scenarios** (`sim/scenarios.py`) script a storyline (forced goals, red cards, momentum swings,
shot rate) so a demo reliably contains one. Everything else is still simulated, and the engine is
never told what happened: it has to detect it.

| Key | Match | Story |
|---|---|---|
| `comeback` | Northgate City v Kingston Vale | 0-2 at half-time, 3-2 at full time |
| `red-card` | Riverside Rovers v Ashford Albion | Home side lead, red card on 30' |
| `press-and-fade` | Elmstead United v Riverside Rovers | Away side press, then tire |
| `end-to-end` | Harbour Athletic v Northgate City | Shots at 1.7x the normal rate |

## Metrics (Interpret)

Coordinates are 0-100 from the acting team's point of view (x = 100 is the goal they attack);
the pitch is 105 x 68 m.

| Metric | Definition |
|---|---|
| **xG** | Sum of each shot's probability of being scored (from the simulator). |
| **xT added** | For each completed pass, xT(end zone) - xT(start zone) on a 12 x 8 grid. The grid follows the shape of Karun Singh's published xT surface (low everywhere, rising steeply near goal) but is a smooth approximation, not fitted to real data, because the brief forbids real match data. |
| **Possession** | Share of all passes. |
| **Field tilt** | Share of passes played in the final third (x > 66). |
| **Pass difficulty** | 1 - expected completion probability. `p = sigmoid(3.4 - 0.055 x length_m - 0.025 x max(end_x - 60, 0) - 0.7 x under_pressure)`. |
| **PPDA** | Opponent build-up passes (x < 60 in their frame) / our defensive actions (tackles, interceptions, fouls) at x >= 40 in our frame. Lower = more intense pressing. |
| **Momentum** | Recency-weighted share of threat, -1 (away on top) to +1 (home on top). Threat = positive xT added + xG. Decays by 0.85 per minute (half-life about 4 minutes). |
| **Control** (our composite) | Over the last 10 minutes: 0.4 x possession share + 0.4 x field-tilt share + 0.2 x pass-retention share. Home in control above 0.57, away below 0.43. |
| **Chaos** (our composite) | Over the last 10 minutes: 0.4 x turnovers/min + 0.3 x momentum volatility + 0.3 x combined threat/min, each divided by its 90th percentile across simulated matches and capped at 1. Chaotic phase above 0.80. |
| **Tempo** | Passes per minute by both teams over the last 10 minutes. |
| **Win projection** | Current score + Poisson goals in the time left. Each side's scoring rate blends a pre-match rate (strength, home edge) with live xG per minute; the weight on live data is `minute / (minute + 30)`. A red card multiplies the side's rate by 0.72 and the opponent's by 1 / 0.85. Shown as a projection with its drivers, never as odds. |

"Control" and "chaos" are **our own transparent composites**, not industry-standard metrics.
`scripts/calibrate_live.py` prints the distributions behind the normalisers and thresholds; with
the current settings about 21-24% of minutes are each side in control, 17% chaos and 38% balanced.

## Insights (Explain)

| Type | Fires when | Priority |
|---|---|---|
| `goal` | A goal. Variant `against_run` if the scorer's side had momentum <= -0.2 or the opponent was in control; `deserved` if they led xG by 0.5+ or were in control. | 1 |
| `red_card` | A red card, with the win projection before and after. | 1 |
| `big_chance` | A missed shot with xG >= 0.30. | 2 |
| `momentum_flip` | Momentum passes ±0.35 for a new side and holds for 2 minutes (cooldown 8'). | 2 |
| `control_shift` | A side holds the control phase for 3 minutes (cooldown 10'). | 2 |
| `chaos_phase` | The chaos phase starts (cooldown 12'). | 2 |
| `pressure_spike` | 10-minute PPDA <= 4.8, at most 65% of the previous 10 minutes, with 4+ high ball wins (cooldown 12' per side). | 2 |
| `win_prob_swing` | A side's win projection moves 15+ points in 5 minutes without a goal or red card. | 3 |
| `tempo_shift` | Tempo changes 25%+ against the previous 10 minutes (cooldown 15'). | 3 |
| `pass_of_the_moment` | A completed pass with difficulty >= 50% and xT added >= 0.04 (one per 15 minutes). | 3 |
| `shot_speed` | A shot at 115 km/h or more (cooldown 20'). | 3 |
| `player_milestone` | First player to 40 completed passes, and first to 8 ball wins. | 3 |
| `player_focus` | Every 15 minutes for the viewer's focus player. | 2 |

About 22 insights fire per match (range 16-34 over 40 simulated matches).

## Personalisation

| Profile field | Effect |
|---|---|
| `persona=casual` | Plain-language body, one reason why; sees priority 1, priority 2 (except pressing detail), and anything about their team or focus player. |
| `persona=analyst` | Metric-level body, definitions in "why"; sees everything. |
| `team` | Cards tagged `your_team` / `against_your_team`; casual viewers also get their team's detail cards. A "your team" storyline leads the season view. |
| `player` | `player_focus` cards every 15', a focus-player line on every snapshot and in the briefs. |
| `lang` | `en`, `ms` (Malay) or `es`. Numbers are formatted per language (e.g. `0,42` in Spanish); the validator checks the formatted numbers. |

The Malay and Spanish templates were written for the hackathon; have a native speaker review
them before any broadcast.

## Optional LLM polish

With Azure OpenAI keys in `.env` (and `LIVE_LLM` not set to `0`), the half-time and full-time
summaries are rewritten by the LLM for the viewer's persona and language, using only the facts
passed in. The result goes through the same validator; if it contains any number, player or team
not in the facts, the template is kept and `summary_source` stays `template`. Live cards stay on
templates for speed (a card must be ready within the same minute).

## Overlays (Render)

`/api/matches/{id}/overlays` and the stream's `new_overlays` give one message per graphic:
`seq`, match clock, `graphic` (`alert`, `lower_third`, `player_tag`, `stat_bug`,
`momentum_bar`), `priority`, `ttl_s` and a flat `fields` map of strings, so it binds directly to
a graphics template (`${headline}`, `${player}`, `${stat_value}`...) or the HTML overlay. A
`momentum_bar` message is emitted every 5 minutes.

## Known limits

- Synthetic data only: xT grid, xPass coefficients and thresholds are calibrated on the
  simulator, not real football.
- No tracking data, so no player speed or distance covered; speed metrics are ball speeds.
- The win projection is a simple Poisson model, deliberately explainable rather than optimal.
  The trained XGBoost half-time model (`/api/matches/{id}/halftime`) is still available.
