# Match-Room Live

Explain the match, don't just score it: live, evidence-checked match intelligence from the
first whistle to the season table, in the viewer's language and at their depth.

Our entry for the Microsoft × Premier League **Inside the Game** developer hackathon
(*The Synthetic Match Insights Engine for Premier League Studio*). All match data is **synthetic**.

**Try it: [match-room-preview.pages.dev](https://match-room-preview.pages.dev)**
- It's a preview build that plays the saved synthetic match in your browser, with no backend
  needed. It opens at kick-off at ×60, on desktop or phone.
- The on-page controls play, pause, restart and switch speed. The top bar switches language and
  casual / analyst.
- The broadcast page with the pitch: [/overlay?minute=74&plate=1](https://match-room-preview.pages.dev/overlay?minute=74&plate=1).

**Full app on Azure: [victorious-sand-01b516100.2.azurestaticapps.net](https://victorious-sand-01b516100.2.azurestaticapps.net)**
- The website talks to the real API ([API docs](https://halftime-api.reddesert-2b0a0b71.southeastasia.azurecontainerapps.io/docs)),
  including the live websocket stream. The first load after a restart takes a few seconds.

What it produces from a stream of synthetic events:

1. **Live cards**: "why it matters" insights as they happen (a goal against the run of play, a
   momentum flip, a pressing spike, a chaos phase), each with the facts and events that prove it.
2. **Control vs chaos**: our own transparent composite of who is dictating the game and how
   wild it is, minute by minute, plus momentum, PPDA, xT and an explained win projection.
3. **Broadcast overlays**: timed, machine-readable graphics messages for a studio or stream.
4. **Roll-ups**: half-time brief, full-time story with turning points, "I just joined"
   catch-up, and a season table with storylines.
5. **Personalisation**: casual or analyst, favourite team, focus player, English / Malay /
   Spanish. Same facts, different experience.

## Pitch

Match-Room Live is an explained-match engine for Premier League Studios and its fans. It ingests
synthetic events minute by minute, turns them into named, defined metrics (xG, xT, PPDA, field
tilt, momentum and a "control vs chaos" index), detects the moments that matter and explains why,
then renders them as cards, broadcast overlay messages and half-time / full-time briefs. Every
number on screen is traceable: templates contain no digits, a validator rejects any number or name
not backed by the insight's facts, and every card links to the events behind it. The same insight
log is personalised for casual and analyst viewers, a favourite team, a focus player and three
languages including Malay. Built with Python, FastAPI (REST + websocket), React, XGBoost + SHAP
for the half-time model, and Azure OpenAI as an optional, validated rewriter with a template
fallback. The half-time story is written by two Azure OpenAI agents: an analyst that investigates
the first half through tools and a fact-checker that sends unsupported cards back; the page shows
their trace. It runs on Azure: Container Apps for the API, Static Web Apps for the website.

## Quick start

Needs Python 3.11+ and Node 20+.

```bash
make setup     # venv + Python deps + web deps
make api       # terminal 1: API on http://localhost:8000 (docs at /docs)
make web       # terminal 2: site on http://localhost:5173
```

No `make` (e.g. Windows)? See the commands in the [Makefile](Makefile), e.g.
`python -m venv .venv`, `.venv\Scripts\pip install -e ".[all]"`, `cd web && npm install`.

The repo ships with a trained model in `artifacts/`. To retrain on fresh synthetic matches:

```bash
make train     # 10,000 matches, ~7 min
```

Azure OpenAI is optional: copy `.env.example` to `.env` and fill in the keys to get
LLM-written stories. Without keys the story uses templates and everything still works.

Try the live engine with the API running:

```bash
curl "localhost:8000/api/scenarios"
curl "localhost:8000/api/matches/SCN-comeback/live?minute=67&lang=ms&persona=casual&team=NGC"
curl "localhost:8000/api/matches/SCN-comeback/brief/fulltime?persona=analyst"
# websocket: ws://localhost:8000/api/matches/SCN-comeback/stream?speed=60
```

## Repo layout

```
contract/   API contracts (Pydantic) + JSON schemas + real samples          ← both
sim/        synthetic match simulator + scripted scenarios                 ← Ingest
live/       metrics, insights, narration + validator, engine, season       ← Interpret, Explain, Personalise
model/      half-time features, XGBoost + SHAP, half-time story + agents   ← Interpret, Explain
api/        FastAPI backend: REST + websocket stream                       ← Render
web/        React + Vite site                                              ← Render
tests/      pytest suite
scripts/    export_contract.py (schemas + mocks), calibrate_live.py
docs/       live engine, frontend guide, architecture, API contract, workflow, deploy, demo
```

## Model performance (half-time model)

Trained on 10,000 synthetic matches, evaluated on a held-out 20%
(from `artifacts/metrics.json`; regenerate with `make train`). Lower is better for log loss,
RPS (ranked probability score, the standard for home / draw / away) and calibration error
(the average gap between the probability we said and how often it happened).

| Final result | Log loss | RPS | Accuracy | Calibration error |
|---|---|---|---|---|
| Heuristic fallback | 0.767 | 0.137 | 64.2% | 0.044 |
| Baseline: pre-match strength only | 0.990 | 0.203 | 53.2% | 0.012 |
| Baseline: half-time score only | 0.818 | 0.152 | 60.8% | 0.009 |
| Baseline: Dixon-Coles (score + strengths) | 0.797 | 0.147 | 63.0% | 0.023 |
| XGBoost on first-half features | **0.748** | **0.134** | **65.3%** | 0.023 |

XGBoost beats every baseline, including Dixon-Coles, a classic football model that knows the
half-time score and team strengths but not how the first half was played. On the v1 simulator
they tied (0.666 vs 0.664): first-half play carried no information. The v2 possession-chain
simulator fixed that, so the model's "why" factors now point at something real.

Next-goal model (home / away / none): log loss 0.982, accuracy 52.8%.
Simulated outcomes: 40.8% home wins, 24.7% draws, 34.5% away wins, ~3.2 goals per match.

**Live win projection** (`make live-calibration`, 2,000 fresh matches,
`artifacts/live_calibration.json`): calibration error 0.012-0.042 from minute 10 to 85. It still
under-predicts draws a little (about 21% said, 25% real).

## Docs

- [How the live engine works: every metric, threshold and rule](docs/live-engine.md)
- [Frontend guide: which endpoint powers which screen](docs/frontend-guide.md)
- [Architecture and the five challenge stages](docs/architecture.md)
- [API contract](docs/api-contract.md)
- [Team workflow](docs/workflow.md)
- [Deploying to Azure](docs/deploy-azure.md)
- [Demo script](docs/demo-script.md)

## Team

Syahmi (backend: simulator, live engine, model, API) and Ilham (frontend: web, deployment).
