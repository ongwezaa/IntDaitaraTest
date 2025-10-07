# Logic App Blob UI

This project is a small full-stack prototype for orchestrating Azure Logic App runs against files stored in Azure Blob Storage.
It provides:

- File upload to Blob storage
- Logic App trigger with parameter selection
- Run tracking stored in a lightweight JSON file database
- Output file browsing, preview, and download

## Project structure

```
/apps
  /api        # Node.js + Express + TypeScript backend
  /web        # Static HTML/CSS/JS frontend
```

## Prerequisites

- Node.js 18+
- pnpm 8+
- Azure Storage account and container
- Logic App manual trigger endpoint (or mock)

## Setup

1. Install dependencies (run in the repo root after cloning):

   ```bash
   pnpm install
   ```

2. Copy the API environment file and update it with your Azure details:

   ```bash
   cp apps/api/.env.sample apps/api/.env
   ```

3. Create the data folder that will hold the JSON store for run history (the app will create the file automatically on first run):

   ```bash
   mkdir -p apps/api/data
   ```

4. Start the backend API (development mode watches for changes):

   ```bash
   pnpm dev
   ```

   The API listens on http://localhost:4100 by default.

5. In a new terminal, serve the static frontend from `apps/web`. You can use any static file server; the following command uses
pnpm to download a temporary one:

   ```bash
   pnpm dlx serve apps/web --listen 5173 --single
   ```

   Then open http://localhost:5173 in your browser. The frontend will automatically point to the same origin when possible and falls back to `http://localhost:4100/api`. If you host the API elsewhere, set `window.API_BASE_URL = "https://your-host/api";` in a small script tag before loading any page JavaScript.

## Pushing to GitHub

If you would like to publish this repository to your own GitHub account, you can create a new remote and push the existing history:

```bash
git remote add origin git@github.com:<your-account>/<your-repo>.git
git push -u origin work
```

Replace `<your-account>` and `<your-repo>` with the values for your GitHub project. If the remote already exists (for example, after cloning from GitHub), you only need the final `git push` command.

## Notes

- The backend persists run metadata to a JSON file for easy local development; the path is configurable via `RUNS_DB_PATH`.
- This is a prototype; authentication and production hardening are intentionally left out but the structure allows future integration with Microsoft Entra ID.
- All storage account secrets remain on the server; the frontend communicates solely via the `/api` routes.
