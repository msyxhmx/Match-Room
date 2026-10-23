# Frontend guide: building on Match-Room Live

For Ilham. Everything the screens need is already served by the API, and every response has a
real sample in [`web/src/mock/live/`](../web/src/mock/live) so you can build offline.

- Types: [`web/src/types/live.ts`](../web/src/types/live.ts)
- Client: `liveApi` in [`web/src/api.ts`](../web/src/api.ts)
- Full contract and endpoint list: [api-contract.md](api-contract.md)
- How the numbers are made: [live-engine.md](live-engine.md)

## Screens and where their data comes from

| Screen | Call | Sample |
|---|---|---|
| Match picker (lead with the scenarios) | `liveApi.scenarios()`, `api.matches()` | — |
| Profile picker (team, player, language, casual/analyst) | `liveApi.lineups(id)` | `lineups.json` |
| **Live match** (main screen) | `liveApi.streamUrl(id, {...})` over a websocket, or `liveApi.snapshot(id, minute, profile)` for a scrubber | `tick.json`, `snapshot.json` |
| **Half-time brief** | the stream's `halftime` message, or `liveApi.brief(id, "halftime", profile)` | `brief.halftime.json` |
| **Full-time story** | the stream's `fulltime` message, or `liveApi.brief(id, "fulltime", profile)` | `brief.fulltime.json` |
| "I just joined" | `liveApi.catchup(id, minute, profile)` | `catchup.json` |
| Broadcast overlay (OBS / studio view) | stream `new_overlays`, or `liveApi.overlays(id, until, profile)` | `overlays.json` |
| Season | `liveApi.season(profile)` | `season.json` |

The existing half-time page (`api.halftime`) still works unchanged.

## The live stream

```ts
const ws = new WebSocket(liveApi.streamUrl("SCN-comeback", { speed: 60, lang: "en", team: "NGC" }));
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data) as StreamMessage;
  switch (msg.type) {
    case "tick":      /* score, control, projection, metrics, new_events, new_cards, new_overlays */ break;
    case "halftime":  /* msg.brief: MatchBrief */ break;
    case "fulltime":  /* msg.brief: MatchBrief */ break;
    case "end":       ws.close(); break;
    case "error":     console.warn(msg.detail); break;
  }
};
// Switch language or depth mid-match (applies from the next minute):
ws.send(JSON.stringify({ profile: { language: "ms", persona: "analyst" } }));
```

- `speed` is times faster than real time: `60` = one match minute per second (a 90-second
  match), `10` = 6 seconds per minute. Use `fromMinute` to start mid-match.
- One `tick` per match minute. `new_events` holds every event in that minute (about 15) if you
  want to animate the pitch; `new_cards` and `new_overlays` hold only what's new.
- In dev, Vite proxies the websocket too (`ws: true` in `vite.config.ts`).

## Rendering a card

| Field | Use |
|---|---|
| `headline`, `body` | The card text, already in the viewer's language and depth. |
| `why[]` | "Why it matters" lines. Casual gets one; analyst gets the definitions. |
| `facts_used[]` | The trust trail: show it behind a "Facts used" toggle. Each `value` appears exactly in the text. |
| `evidence[]` | The events that prove it (minute + description). Tap to jump the pitch or timeline there. |
| `priority` | 1 = big moment (goal, red card), 2 = notable, 3 = detail. |
| `tags` | `your_team`, `against_your_team`, `focus_player`: use for colour or highlight. |
| `side` | `home` / `away` / `null` (whole-match insights such as chaos). |

## Charts worth drawing

- **Momentum / control / chaos timeline:** `snapshot.series` (one value per minute from 0').
  Momentum is -1..1 (above zero = home on top), control 0..1, chaos 0..1.
- **Win projection:** `series.home_win`, `draw`, `away_win`. Always show `projection.note` near
  it; it's a projection, not odds.
- **Phase badge:** `control.label` is already localised, e.g. "Northgate City menguasai
  permainan".
- **Stats panel:** `metrics[]` has `label`, `unit` and a `definition` for a tap/hover tooltip.

## Overlay messages

Each message is one graphic: `graphic` picks the template, `fields` fills it (all strings),
`ttl_s` is how long it stays up at real speed (divide by your playback speed), and `seq` orders
them. An HTML overlay page with a transparent background can be loaded in OBS as a Browser
Source to show "studio-ready output" in the demo.

## Things to keep in mind

- Everything is synthetic; keep the "Synthetic data" label visible (`meta.synthetic`).
- Scenario matches are scripted storylines: show `meta.scenario_title` so nobody mistakes them
  for organic matches.
- If the API is down, the mocks in `web/src/mock/live/` are real responses for the comeback
  match (snapshot at 67', tick at 61', catch-up at 70'; casual, English, team NGC, focus player
  L. Quinn; `snapshot.analyst.ms.json` is the analyst view in Malay). Regenerate with
  `make schema`.
