# Deploying to Azure

Owner: Ilham (pair with Syahmi), see [workflow.md](workflow.md).

## What's live

| Piece | Azure resource | URL |
|---|---|---|
| Website | Static Web App `halftime-web` | https://victorious-sand-01b516100.2.azurestaticapps.net |
| API | Container App `halftime-api` in environment `halftime-api-env` | https://halftime-api.reddesert-2b0a0b71.southeastasia.azurecontainerapps.io |

Everything is in resource group `halftime-rg` (`southeastasia`). The API runs one replica
(1 CPU, 2 GiB) from the image `ghcr.io/msyxhmx/match-room-api`.

How the pieces connect:

- **Image.** Our subscription can't build images in Azure (ACR Tasks returns
  `TasksOperationsNotAllowed`), so [api-image.yml](../.github/workflows/api-image.yml) builds the
  [Dockerfile](../Dockerfile) on GitHub and pushes it to GitHub Container Registry. Pushes to
  `main` get `:latest` and `:sha-<short sha>`. The package is public, so Azure pulls it without
  credentials.
- **Website → API.** Vite reads `VITE_API_URL` at build time. It's set on the deploy step of
  [the Static Web Apps workflow](../.github/workflows/azure-static-web-apps-victorious-sand-01b516100.yml).
  `web/src/api.ts` derives the `wss://` stream URL from it.
- **API → website.** The API only accepts origins listed in `CORS_ORIGINS`, set on the
  Container App to the website URL plus `http://localhost:5173`.

## Day to day

- **Website:** redeploys on every push to `main`. PRs get a preview URL, but the API doesn't
  allow preview origins, so previews only show the UI.
- **API:** a push to `main` that touches the API builds a new image, but the Container App only
  switches when you tell it to. Use the sha tag so you know which build is running:

  ```bash
  az containerapp update -n halftime-api -g halftime-rg --image ghcr.io/msyxhmx/match-room-api:sha-<short sha>
  ```

- **Check it:** `https://<API>/api/health` shows the model version and whether stories come from
  the LLM (`story_source`, `live_llm`).

## Turning on Azure OpenAI

Without these settings the stories use templates.

1. Create an **Azure OpenAI** resource in `halftime-rg` and deploy a chat model in Azure AI
   Foundry. Note the endpoint, the deployment name and one key.
2. Store the key as a secret, then point the env vars at it:

   ```bash
   az containerapp secret set -n halftime-api -g halftime-rg --secrets aoai-key=<KEY>
   az containerapp update -n halftime-api -g halftime-rg --set-env-vars AZURE_OPENAI_API_KEY=secretref:aoai-key AZURE_OPENAI_ENDPOINT=<ENDPOINT> AZURE_OPENAI_DEPLOYMENT=<DEPLOYMENT_NAME> LIVE_LLM=1
   ```

## Setting it up from scratch

Commands are one line each, so they work in Git Bash and PowerShell.

1. **Sign in.** Our tenant's security defaults block `az login --use-device-code`, and the
   Windows account picker can open hidden. Signing in through the browser works:

   ```bash
   az config set core.enable_broker_on_windows=false
   az login --tenant <TENANT_ID>
   ```

2. **One-time setup:**

   ```bash
   az extension add --name containerapp --upgrade
   az provider register --namespace Microsoft.App --wait
   az provider register --namespace Microsoft.OperationalInsights --wait
   az group create -n halftime-rg -l southeastasia
   az containerapp env create -n halftime-api-env -g halftime-rg -l southeastasia
   ```

3. **API.** Once `api-image.yml` has pushed an image (and the GHCR package is public):

   ```bash
   az containerapp create --name halftime-api --resource-group halftime-rg --environment halftime-api-env --image ghcr.io/msyxhmx/match-room-api:latest --ingress external --target-port 8000 --min-replicas 1 --max-replicas 1 --cpu 1.0 --memory 2.0Gi
   ```

   One replica keeps the in-memory match cache warm and each websocket on one instance.

4. **Website.** Portal → **Create → Static Web App**: resource group `halftime-rg`, Free plan,
   GitHub `msyxhmx/Match-Room` on `main`, app location `web`, output location `dist`, no API
   location. Azure commits a workflow to `.github/workflows/`; add `VITE_API_URL` (the API URL)
   to its deploy step's `env`, through a PR.

5. **CORS:**

   ```bash
   az containerapp update -n halftime-api -g halftime-rg --set-env-vars CORS_ORIGINS=https://<site>.azurestaticapps.net,http://localhost:5173
   ```

## Cost and cleanup

The always-on replica costs a little each day. To pause it, set `--min-replicas 0` (the first
request after a pause is slow). To remove everything: `az group delete -n halftime-rg`.
