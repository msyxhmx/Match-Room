# API contract

Two contracts, both Pydantic, both mirrored in TypeScript:

| | Half-time report (v0) | Match-Room Live |
|---|---|---|
| Source of truth | [`contract/models.py`](../contract/models.py) | [`contract/live.py`](../contract/live.py) |
| JSON Schema | [`halftime.schema.json`](../contract/halftime.schema.json) | [`live.schema.json`](../contract/live.schema.json) |
| Real examples | [`halftime.sample.json`](../contract/examples/halftime.sample.json) | [`contract/examples/live/`](../contract/examples/live) |
| TypeScript | [`types/halftime.ts`](../web/src/types/halftime.ts) | [`types/live.ts`](../web/src/types/live.ts) |

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{status, model_version, story_source, live_engine, live_llm, languages, personas}` |
| GET | `/api/matches` | `MatchSummary[]`: demo matches, including scenario matches (`scenario`, `title`) |
| GET | `/api/matches/{id}/events?until=45` | `Event[]` up to that minute (all event types) |
| GET | `/api/matches/{id}/halftime` | `HalftimeReport` (XGBoost + SHAP half-time report) |
| GET | `/api/scenarios` | `ScenarioInfo[]`: scripted demo storylines and their match ids |
| GET | `/api/matches/{id}/lineups` | `Lineups`: squads, shirt numbers, match metadata |
| GET | `/api/matches/{id}/live?minute=67` | `LiveSnapshot`: everything a screen needs at that minute |
| GET | `/api/matches/{id}/cards?until=90` | `LiveCard[]`, chronological |
| GET | `/api/matches/{id}/overlays?until=90` | `OverlayMessage[]`, timed broadcast graphics |
| GET | `/api/matches/{id}/brief/halftime` | `MatchBrief` (also `/brief/fulltime`) |
| GET | `/api/matches/{id}/catchup?minute=67` | `CatchUp`: the story so far in up to 5 cards |
| GET | `/api/season` | `SeasonReport`: synthetic round-robin table + storylines |
| WS | `/api/matches/{id}/stream?speed=60&from_minute=0` | `StreamTick` per minute, `StreamBrief` at 45' and 90', then `{"type": "end"}` |

### Profile parameters

Every Live endpoint that returns words accepts the same query parameters:

| Param | Values | Default |
|---|---|---|
| `persona` | `casual`, `analyst` | `casual` |
| `lang` | `en`, `ms` (Malay), `es` | `en` |
| `team` | team id, e.g. `NGC` | none |
| `player` | player name, e.g. `L. Quinn` (from `/lineups`) | none |

Unknown `lang`/`persona` values return 422; an unknown team or player is ignored.

### Websocket stream

`speed` = times faster than real time (1-6000; 60 = one match minute per second).
Send `{"profile": {"language": "ms"}}` (any `Profile` fields) at any time to switch from the
next minute. Unknown match: one `{"type": "error"}` message, then close code 4404.

## Live types at a glance

| Type | Key fields |
|---|---|
| `LiveCard` | `headline`, `body`, `why[]`, `facts_used[]` (trust trail), `evidence[]`, `priority`, `tags[]` |
| `ControlState` | `home_share` (control), `chaos`, `tempo`, `momentum`, `phase`, localised `label` |
| `WinProjection` | `home_win`, `draw`, `away_win`, `drivers[]`, `note` (not betting odds) |
| `OverlayMessage` | `seq`, `clock`, `graphic`, `priority`, `ttl_s`, flat `fields` map |
| `MatchBrief` | `headline`, `summary`, `what_happened[]`, `why[]`, `what_to_watch[]`, `turning_points[]`, `control_profile`, `player_of_the_match` |

Metric definitions and thresholds: [live-engine.md](live-engine.md).

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

1. Edit `contract/models.py` or `contract/live.py`.
2. `make schema` (regenerates both schemas, the samples and the web mocks).
3. Update `web/src/types/halftime.ts` or `web/src/types/live.ts`.
4. Say so in the PR. Both of you build against this, so no silent changes.
