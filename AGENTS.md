# AGENTS.md

Halftime Insights: a hackathon app that explains a football match's first half and predicts the
second, on **synthetic** data. Start with [README.md](README.md) for setup and layout.

## Before you change code

- Anything in `model/` or `sim/` → read the design rules in
  [docs/architecture.md](docs/architecture.md). They are hard rules: features never read events
  after minute 45, every stage keeps its fallback, every story card cites real event IDs.
- Commands live in the [Makefile](Makefile). Use `.venv/bin/python`, not the system Python.
  On Windows, run the Makefile's commands directly.

## Contract changes

`contract/models.py` is the handover between the data side and the web side. When you change it,
in the same PR:

1. Run `make schema` to regenerate the JSON schema and mock JSON.
2. Update `web/src/types/halftime.ts` to match.
3. Tick the "Contract changed" box in the PR description.

## Retraining

You may run `make train` (~7 min) and commit the result. Commit `artifacts/model.joblib` and
`artifacts/metrics.json` together, and update the "Model performance" table in the README from
the new `metrics.json`. Use `make train-quick` for a fast smoke test you don't commit.

## Git and PRs

- Work on a branch named `feat/...` or `fix/...`; `main` always runs.
- `make check` passes before you push.
- Push and open the PR yourself, filling in [the PR template](.github/pull_request_template.md).
  The other teammate reviews and merges.
- Any folder is open to edit. Owners are listed in [docs/workflow.md](docs/workflow.md); name the
  owner in the PR when you change their area.

## Models and helpers (Claude Code)

On Opus, hand checkable pieces to the helper agents in `.claude/agents/`; on Sonnet, call the
advisor (Opus) before choosing an approach, when stuck, and before saying a task is done. The
details are in [the orchestrate skill](.claude/skills/orchestrate/SKILL.md). Two hooks in
`.claude/settings.json` use Jev (`TYPESAFE_API_KEY`, optional): a bash gate that blocks pushes to
`main`, force pushes and the like, and a prompt-injection check on fetched pages.

## Secrets

Azure OpenAI keys go in `.env` (copied from `.env.example`), which stays out of git. Everything
must still work with no keys.
