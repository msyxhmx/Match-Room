# Website (`web/`)

The Match-Room Live website: React 19 + Vite + TypeScript. Owner: Ilham. Everything the browser
shows lives in this folder; the backend (Syahmi) only reaches it through the API and the files in
`src/types/` and `src/mock/`.

## Run it

```bash
make api   # terminal 1: API on http://localhost:8000
make web   # terminal 2: site on http://localhost:5173 (reloads on save)
```

Vite forwards `/api` requests and the websocket to port 8000 (`vite.config.ts`). If the API is
off, build against the mocks below.

## What's where

| Path | What it is | Notes |
|---|---|---|
| `src/main.tsx` | Starts React | Leave as is |
| `src/App.tsx` | The page today: match picker → first-half replay → half-time report | Being replaced by the live match flow |
| `src/components/Scoreboard.tsx` | Team names, score, clock | Reusable on the live screen |
| `src/components/Replay.tsx` | Animated first-half replay | Old flow |
| `src/components/Halftime.tsx` | Old half-time report | Old flow; the live briefs replace it |
| `src/styles.css` | All styling | One file for now |
| `src/api.ts` | Typed API client. `api` = old half-time endpoints, `liveApi` = every live endpoint + `streamUrl()` for the websocket | Already written; use it, don't call `fetch` directly |
| `src/types/live.ts` | Types for every live response and stream message | Hand-written mirror of `contract/live.py` (see below) |
| `src/types/halftime.ts` | Types for the old half-time report | Hand-written mirror of `contract/models.py` |
| `src/mock/live/*.json` | Real API responses for the comeback match | Build screens against these first |
| `src/mock/halftime.json` | Sample old half-time report | Used when the API is down |
| `public/staticwebapp.config.json` | Azure Static Web Apps routing | For deployment |
| `.env.example` | `VITE_API_URL`, the API address in production | Empty in dev (the proxy handles it) |

## Which mock goes with which screen

All mocks are `SCN-comeback` (Northgate City v Kingston Vale), casual, English, team NGC, focus
player L. Quinn, unless noted.

| Screen | Live data | Mock |
|---|---|---|
| Live match | websocket `tick` messages via `liveApi.streamUrl(id, {...})` | `tick.json` (61'), `snapshot.json` (67') |
| Card feed | `tick.new_cards`, or `liveApi.cards(id)` | `cards.json` |
| Language / depth switch | send `{profile: {language, persona}}` on the open websocket | `snapshot.analyst.ms.json` (analyst, Malay) |
| Half-time brief | stream `halftime` message, or `liveApi.brief(id, "halftime")` | `brief.halftime.json` |
| Full-time story | stream `fulltime` message, or `liveApi.brief(id, "fulltime")` | `brief.fulltime.json` |
| Profile picker | `liveApi.lineups(id)` | `lineups.json` |
| "I just joined" | `liveApi.catchup(id, minute)` | `catchup.json` |
| Broadcast overlay | `tick.new_overlays`, or `liveApi.overlays(id)` | `overlays.json` |
| Season | `liveApi.season()` | `season.json` |

Field-by-field details (what `why`, `facts_used`, `evidence`, `priority` and `tags` mean on a
card; how to draw the charts): [docs/frontend-guide.md](../docs/frontend-guide.md).

## Rules for this folder

- Keep the "Synthetic data" label and the scenario title visible on every match screen.
- Show `projection.note` next to any win projection; it's a projection, not betting odds.
- The page must still work with the API down: fall back to the mocks.
- `src/types/` and `src/mock/` belong to the contract with the backend. Don't edit the mocks by
  hand; `make schema` regenerates them. Change a type only together with the Python contract
  (`contract/`), in the same PR, and tell Syahmi.

## Before you push

```bash
make check                   # Python lint + tests, and the web typecheck
npm --prefix web run build   # CI also builds the site
```

Work on a `feat/...` branch and open a PR with
[the template](../.github/pull_request_template.md) filled in; Syahmi reviews.

## Plan for the live site

In demo order (see [docs/demo-script.md](../docs/demo-script.md)):

1. Live match screen: scoreboard, card feed, control vs chaos bar, momentum line, win projection
2. "Facts used" and evidence toggle on each card
3. Language / casual-analyst / favourite-team switcher
4. Half-time and full-time briefs, including the agents' trace
5. Rename "Halftime Insights" to Match-Room Live
6. Stretch: broadcast overlay page, season table
