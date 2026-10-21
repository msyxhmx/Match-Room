# Halftime Insights

At the half-time break, explain what happened in the first half and predict how the second half will go.

Our entry for the Microsoft × Premier League **Inside the Game** developer hackathon
(*The Synthetic Match Insights Engine for Premier League Studio*). All match data is **synthetic**.

Three outputs at half-time:

1. **Half-time story**: 3–5 insight cards on what happened and why it mattered, each linked to the events that prove it.
2. **Second-half prediction**: win / draw / loss and next-goal probabilities, with the top factors behind them.
3. **What to watch**: things that would change the prediction.

## Pitch

Halftime Insights is a half-time match analysis engine that turns a synthetic first half into a readable story and a second-half prediction. It addresses the 15-minute half-time window where fans, analysts and studios need to understand what happened and what is likely to happen next. The app replays the first half, generates 3-5 evidence-linked insight cards, forecasts result and next-goal probabilities, and lists the factors that would change the prediction. It is built with Python, FastAPI, React and XGBoost with SHAP explanations, on synthetic match data only. Azure OpenAI is integrated as an optional story generator with a template fallback, and Azure deployment is planned but not yet live.

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

## Repo layout

```
contract/   the API contract (Pydantic) + JSON schema + sample report   ← both
sim/        synthetic match simulator                                  ← Ingest
model/      features, XGBoost + SHAP, story, report builder            ← Interpret, Explain
api/        FastAPI backend                                            ← Render
web/        React + Vite half-time page                                ← Render
tests/      pytest suite
scripts/    export_contract.py (schema + mock JSON)
docs/       architecture, API contract, workflow, Azure deploy, demo script
```

## Model performance

Trained on 10,000 synthetic matches, evaluated on a held-out 20%
(from `artifacts/metrics.json`; regenerate with `make train`):

| Final result | Log loss (lower is better) | Accuracy |
|---|---|---|
| Baseline: half-time score only | 0.748 | 64.8% |
| XGBoost on first-half features | **0.689** | **68.4%** |

Next-goal model (home / away / none): log loss 1.006, accuracy 51.3%.
Simulated outcomes: 44.5% home wins, 21.5% draws, 34.0% away wins, ~2.9 goals per match.

## Docs

- [Architecture and the five challenge stages](docs/architecture.md)
- [API contract](docs/api-contract.md)
- [Team workflow](docs/workflow.md)
- [Deploying to Azure](docs/deploy-azure.md)
- [Demo script](docs/demo-script.md)

## Team

Syahmi (data science, modelling, AI analysis) and Ilham (web, API, deployment).
