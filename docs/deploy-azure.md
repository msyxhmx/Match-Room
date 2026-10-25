# Deploying to Azure (draft: Ilham to confirm)

Two pieces: the API as a container, the website as a static site.

## API → Azure Container Apps

```bash
az login
az group create -n halftime-rg -l southeastasia
az containerapp up \
  --name halftime-api \
  --resource-group halftime-rg \
  --source . \
  --ingress external --target-port 8000 \
  --env-vars CORS_ORIGINS=https://<your-static-web-app>.azurestaticapps.net
```

If the build fails with `TasksOperationsNotAllowed` (some subscriptions can't build in Azure),
use the image that [api-image.yml](../.github/workflows/api-image.yml) pushes to GitHub
Container Registry instead:

```bash
az containerapp up --name halftime-api --resource-group halftime-rg --image ghcr.io/msyxhmx/match-room-api:latest --ingress external --target-port 8000
```

Add Azure OpenAI settings as secrets (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`,
`AZURE_OPENAI_DEPLOYMENT`) in the Container App's configuration. Without them the
story uses templates.

## Website → Azure Static Web Apps

- App location: `web`, output location: `dist`, build command: `npm run build`.
- Set the build-time variable `VITE_API_URL` to the Container App URL.
- `web/public/staticwebapp.config.json` already handles client-side routing.

## Before the deadline

- Deploy a basic version by 23 Oct.
- Record the demo video from the deployed site on 25 Oct.
