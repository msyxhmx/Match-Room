# Common commands. On Windows without make, run the command on the right directly.
PY ?= .venv/bin/python

.PHONY: setup sim train train-quick live-calibration schema api web test lint format check

setup:            ## create venv, install Python + web deps
	python3 -m venv .venv
	$(PY) -m pip install -U pip
	$(PY) -m pip install -e ".[all]"
	cd web && npm install

sim:              ## generate 5 sample matches to data/raw/events.csv
	$(PY) -m sim --n 5

train:            ## train on 10k synthetic matches (~7 min)
	$(PY) -m model.train --n 10000

train-quick:      ## fast smoke-test training
	$(PY) -m model.train --n 1000 --quick --out data/quick

live-calibration: ## score the live win projection minute by minute (~4 min)
	$(PY) scripts/check_live_calibration.py --n 2000

schema:           ## regenerate contract JSON schema + sample/mock JSON
	$(PY) scripts/export_contract.py

api:              ## run the API on :8000
	$(PY) -m uvicorn api.main:app --reload --port 8000

web:              ## run the website on :5173
	cd web && npm run dev

test:
	$(PY) -m pytest -q

lint:
	$(PY) -m ruff check .
	cd web && npm run typecheck && npm run check:tokens && npm run check:raw

format:
	$(PY) -m ruff check . --fix
	$(PY) -m ruff format .

check: lint test  ## run before opening a PR
