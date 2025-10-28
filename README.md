# Logic App Runner

A lightweight sample that lets you upload source files to Azure Blob Storage, trigger an Azure Logic App with the selected file, track run history, and browse generated outputs. The stack uses a TypeScript Express API, JSON-backed persistence, and static Bootstrap frontend pages served by the API.

## Project layout

```
/apps
  /api              # TypeScript Express backend
  /web              # Static HTML/JS frontend
```

## Prerequisites

* Node.js 18+
* pnpm 9+
* Azure Storage account and Logic App trigger URL

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp apps/api/.env.sample apps/api/.env
# edit .env with your storage account + Logic App details
```

At minimum set `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_ACCOUNT_KEY`, `AZURE_STORAGE_CONTAINER`, and `LOGIC_APP_TRIGGER_URL`.
If you want the API to refresh run history statuses using Logic App run identifiers, also set `LOGIC_APP_RUN_STATUS_URL_TEMPLATE`
to an Azure Management API URL that includes `{{runId}}` or `{runId}` where the workflow run name should be inserted.

### 3. Start the API (also serves the frontend)

```bash
pnpm --filter @logicapp/api dev
```

The API starts on http://localhost:4100 and hosts the static frontend at the same origin.
Open http://localhost:4100/ to upload files, trigger runs, view history, and browse outputs.

### Optional: run API and frontend separately

If you want to host the frontend with another static server:

```bash
# terminal 1 - API only
pnpm --filter @logicapp/api start

# terminal 2 - serve the static assets (example using pnpm dlx serve)
pnpm dlx serve apps/web --listen 5173
```

In the separate-host setup, set `localStorage.setItem('logicapp_api_base', 'http://localhost:4100/api')`
in the browser console (or adjust `apps/web/js/config.js`) so the pages call the right API origin.

## Production build

```bash
pnpm build
pnpm start
```

The backend persists run history in `apps/api/data/runs.json`. The directory is created automatically; you can back up or delete it between runs if needed.

## Frontend overrides

If you prefer to host the frontend separately, set `WEB_ROOT` in `.env` to a folder containing the static assets and serve them with your own tooling. Update the API base override in `apps/web/js/config.js` (or via `logicapp_api_base` in `localStorage`) if the API runs on a non-default origin.

