# API contract

Source of truth: [`contract/models.py`](../contract/models.py).
Machine-readable: [`contract/halftime.schema.json`](../contract/halftime.schema.json).
Real example: [`contract/examples/halftime.sample.json`](../contract/examples/halftime.sample.json).
TypeScript mirror: [`web/src/types/halftime.ts`](../web/src/types/halftime.ts).

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{status, model_version, story_source}` |
| GET | `/api/matches` | `MatchSummary[]`: demo matches available for replay |
| GET | `/api/matches/{id}/events?until=45` | `Event[]` up to that minute, for the replay |
| GET | `/api/matches/{id}/halftime` | `HalftimeReport` |

Interactive docs at `http://localhost:8000/docs` when the API is running.

## HalftimeReport at a glance

| Field | Meaning |
|---|---|
| `home`, `away`, `score` | Teams and half-time score |
| `stats[]` | First-half stat lines (`key`, `label`, `home`, `away`) |
| `momentum[]` | Home share of final-third play per 15-minute block (0.5 = even) |
| `story[]` | 3–5 insight cards, each with `evidence[]` event references |
| `prediction.result` | `home_win` / `draw` / `away_win` probabilities |
| `prediction.next_goal` | `home` / `away` / `none` probabilities |
| `prediction.factors[]` | Top 3 drivers; `impact` > 0 pushes toward a home win |
| `what_to_watch[]` | 2–3 things that would change the prediction |
| `meta` | Model version, `story_source` (`llm` or `template`), `synthetic: true` |

## Changing the contract

1. Edit `contract/models.py`.
2. `make schema` (regenerates the schema, sample and the web mock).
3. Update `web/src/types/halftime.ts`.
4. Say so in the PR. Both of you build against this, so no silent changes.
