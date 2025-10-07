# Logic App Blob Runner

A lightweight prototype for uploading input files to Azure Blob Storage, triggering an Azure Logic App with those files, monitoring the run status, and browsing generated outputs. The project is split between a TypeScript Express API and a static Bootstrap frontend.

## Project structure

```
/apps
  /api           # Express + TypeScript backend
  /web           # Static HTML/CSS/JS frontend
```

## Prerequisites

- Node.js 18+
- pnpm 8+
- An Azure Storage account and container that the app can access
- An Azure Logic App HTTP trigger URL

## Setup

1. Install dependencies (from the repository root):

   ```bash
   pnpm install
   ```

2. Configure environment variables for the API:

   ```bash
   cp apps/api/.env.sample apps/api/.env
   ```

   Update `apps/api/.env` with your storage account name/key, container name, Logic App trigger URL, and desired file prefixes. The default API port is **4100**.

3. (Optional) Create the data folder for run history if it does not exist yet:

   ```bash
   mkdir -p apps/api/data
   echo '{"runs":[]}' > apps/api/data/runs.json
   ```

   The API creates the file automatically on first write, but you can seed it manually if preferred.

## Running locally

Start the backend with pnpm:

```bash
pnpm dev
```

This launches the API on `http://localhost:4100`. The Express server also serves the static frontend from `/apps/web`, so you can open `http://localhost:4100/` directly in the browser.

Alternatively, you can use any static file server to host `/apps/web` and set `window.API_BASE_URL` in the console (or via a custom script) to point at the API origin.

## Frontend features

- **Upload & Trigger (`/`)** – Upload files up to 200 MB to the configured Azure Blob container and trigger the Logic App with selectable parameters.
- **Run Status (`/status`)** – View the 100 most recent runs, poll for updates, inspect run JSON, and jump to the corresponding output prefix.
- **Output Browser (`/output`)** – Browse blobs produced by the Logic App, preview small text-based files inline, or download artifacts.

## Backend highlights

- Uploads files with safe timestamped names and generates short-lived SAS URLs.
- Persists run metadata in a JSON file store (`RUNS_DB_PATH`).
- Calls Logic App HTTP triggers with optional bearer auth and supports both 200 and 202 responses.
- Provides output listing, preview, and download endpoints with content-type aware safeguards.

## Production considerations

This project is intended as a prototype. For production use you should consider:

- Replacing the JSON run store with a durable database.
- Adding authentication (e.g., Microsoft Entra ID) and authorization checks.
- Hardening error handling, input validation, and logging.
- Using Azure Key Vault or similar to manage secrets securely.
- Deploying behind HTTPS with proper CORS restrictions.

## License

MIT
