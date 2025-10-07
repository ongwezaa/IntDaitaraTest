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

```bash
pnpm install
cp apps/api/.env.sample apps/api/.env
# edit .env with your storage account + Logic App details
pnpm dev
```

The dev script launches the API on http://localhost:4100. The API serves the static frontend at `/` so you can open http://localhost:4100/ in a browser to use the UI.

## Production build

```bash
pnpm build
pnpm start
```

The backend persists run history in `apps/api/data/runs.json`. The directory is created automatically; you can back up or delete it between runs if needed.

## Frontend overrides

If you prefer to host the frontend separately, set `WEB_ROOT` in `.env` to a folder containing the static assets and serve them with your own tooling. Update `VITE_API_BASE_URL` (or similar) in `apps/web/js/config.js` if the API runs on a non-default origin.

