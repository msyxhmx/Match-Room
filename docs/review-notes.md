# Data-side review notes (23 Oct 2026)

A read-through of Syahmi's areas before the feature freeze (night of 24 Oct). Findings come from
reading the code; none have been fixed yet.

## Ownership (from [workflow.md](workflow.md))

| Stage | Files |
|---|---|
| Ingest | `sim/simulator.py`, `sim/teams.py`, `sim/__main__.py` |
| Interpret | `model/features.py` |
| Explain: prediction | `model/predict.py`, `model/train.py`, `artifacts/` |
| Explain: story | `model/story.py`, `model/prompts/halftime_story.md` |
| Report assembly | `model/halftime.py` |
| Shared with Ilham | `contract/models.py` |
| Write-up | `docs/`, README |

## P0: bugs to fix before the freeze

1. **Red cards never weaken defence.** `defence` is rebuilt from the team profiles every minute in
   `simulate_match`, so `defence[side] *= 0.85` is undone a minute later. Build it once, before the
   loop, like `attack`.
2. **Card events can precede their foul and go to another player.** The card's second and player
   are drawn independently of the foul's. Reuse the foul's second and player.
3. **No timeout on the LLM call.** `AzureOpenAI(...)` in `llm_story` uses the SDK default (about
   10 minutes, plus retries), so a slow response stalls the page instead of falling back. Set
   `timeout=10, max_retries=1`.
4. **Stale dataset cache.** `train.py` caches by `n` and `seed` only, so after a simulator change
   it trains on old data. Add a simulator version to the cache filename.
5. **`make train-quick` overwrites the committed model.** Add an `--out` option and point quick
   runs elsewhere.
6. **No feature check on load.** The bundle stores `features`, but `load_predictor` never compares
   it with `FEATURE_COLUMNS`. Fall back to the heuristic on a mismatch.

After 1 and 2, retrain with `make train` and commit `model.joblib`, `metrics.json` and the README
table together.

## P1: evidence gaps in the story

- The territory card cites late shots from either side, not evidence for the side that owns the
  territory.
- The set-pieces card cites nothing, though corner events exist.
- The discipline card says one side is "down to ten" when both teams have a red.
- No test that invented LLM event IDs are dropped, or that an LLM error falls back to the template.

## P2: model quality

- Report the heuristic and a pre-match-strength-only baseline in `metrics.json`.
- Add Brier score or a calibration check.
- The heuristic's next-goal `none` probability is fixed at 0.2; set it from the simulated rate.
- Read the prompt with `encoding="utf-8"` (Windows).
- `train.py`'s docstring says ~4 min; the Makefile says ~7 min.

## P3: docs and polish

- `workflow.md` mentions RAG, but there is no retrieval in the code.
- `demo-script.md` is still a draft.
- Shot `x` is not clipped to 100 and can occasionally exceed it.

## The AI agent gap

There is no agent in the app today. `llm_story()` makes one Azure OpenAI call and returns JSON
cards; there is no tool use, loop or self-check. The landscape research lists "agentic design &
innovation" as 20% of the rubric, and multi-agent setups as the field's baseline.

A small design that fits before the freeze, all in `model/story.py`:

1. **Analyst agent with tools** (`get_key_events`, `get_stats`, `get_momentum`,
   `get_top_factors`) wrapping existing feature and prediction code.
2. **Fact-checker agent** that checks each card against its cited events and sends failures back
   for one retry.
3. **Keep the template fallback** so the page still works with no keys.
4. **Show the trace** (tool calls, rejected cards) in `ReportMeta`. This is a contract change, so
   regenerate the schema and update `web/src/types/halftime.ts`.

## Status (24 Oct)

- Agent work: done in `feat/story-agents` (`model/agents.py`, trace in `ReportMeta`).
- P0 3 (LLM timeout): done for the story agents; `live/narrate.py`'s `llm_rewrite` still has none.
- P1 (LLM tests): invented event ids and LLM errors are now covered in `tests/test_agents.py`.

## Suggested order

Agent work first, since new features stop at the freeze. Then the P0 simulator fixes and a
retrain. Fixes are still allowed after the freeze.
