# Team workflow

- **Daily 15-minute check-in**: what I finished, what's next, what's blocking me.
- **GitHub Projects board**: To do / Doing / Done. Every task is an issue with one owner (use the *Task* issue template).
- **One branch per feature**: `feat/simulator`, `feat/halftime-page`, `fix/...`. Open a PR; the other person reviews before merging.
- **`main` always runs.** Run `make check` before opening a PR. CI runs lint, tests and the web build on every PR.
- **Ship ugly first**: crude end to end before polishing any one part.

## Who owns what

Split agreed 23 Oct: Syahmi owns the backend, Ilham owns the frontend.

| Area | Owner | Folder |
|---|---|---|
| Simulator + scenarios | Syahmi | `sim/` |
| Live engine (metrics, insights, narration, roll-ups, season) | Syahmi | `live/` |
| Half-time model, SHAP, story | Syahmi (Ilham: Azure OpenAI setup) | `model/` |
| API (REST + websocket) | Syahmi | `api/` |
| Contract | Both | `contract/`, `web/src/types/` |
| Website, overlay page, typed client | Ilham | `web/` |
| Azure deployment | Ilham (pair with Syahmi) | `Dockerfile`, `docs/deploy-azure.md` |
| Demo video and script | Ilham (handed over 25 Oct) | `docs/demo-script.md`, `web/STORYBOARD.md` |
| README, write-up | Syahmi | `docs/` |

## Git cheat sheet

```bash
git checkout main && git pull
git checkout -b feat/my-thing
# ...work...
make check
git add -A && git commit -m "Add my thing"
git push -u origin feat/my-thing   # then open a PR on GitHub
```
