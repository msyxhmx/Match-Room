# Team workflow

- **Daily 15-minute check-in**: what I finished, what's next, what's blocking me.
- **GitHub Projects board**: To do / Doing / Done. Every task is an issue with one owner (use the *Task* issue template).
- **One branch per feature**: `feat/simulator`, `feat/halftime-page`, `fix/...`. Open a PR; the other person reviews before merging.
- **`main` always runs.** Run `make check` before opening a PR. CI runs lint, tests and the web build on every PR.
- **Ship ugly first**: crude end to end before polishing any one part.
- **Feature freeze 24 Oct night**: after that, only fixes, deployment and the demo.

## Who owns what

| Area | Owner | Folder |
|---|---|---|
| Simulator | Syahmi | `sim/` |
| Features, model, SHAP | Syahmi | `model/features.py`, `model/predict.py`, `model/train.py` |
| Half-time story (prompt, RAG) | Syahmi (Ilham: Azure OpenAI setup) | `model/story.py`, `model/prompts/` |
| Contract | Both | `contract/` |
| API | Ilham | `api/` |
| Website | Ilham | `web/` |
| Azure deployment | Ilham (pair with Syahmi) | `Dockerfile`, `docs/deploy-azure.md` |
| Demo video, README, write-up | Syahmi | `docs/` |

## Git cheat sheet

```bash
git checkout main && git pull
git checkout -b feat/my-thing
# ...work...
make check
git add -A && git commit -m "Add my thing"
git push -u origin feat/my-thing   # then open a PR on GitHub
```
