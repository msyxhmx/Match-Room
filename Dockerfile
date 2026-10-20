# API image for Azure Container Apps / App Service.
# Build after `make train` so artifacts/model.joblib is baked in
# (without it the API runs on the heuristic predictor).
FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY contract ./contract
COPY sim ./sim
COPY model ./model
COPY api ./api
RUN pip install --no-cache-dir ".[model,api,llm]"
COPY artifacts ./artifacts

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
