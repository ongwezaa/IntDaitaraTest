# Logic App Blob UI

This project is a small full-stack prototype for orchestrating Azure Logic App runs against files stored in Azure Blob Storage. It provides:

- File upload to Blob storage
- Logic App trigger with parameter selection
- Run tracking stored in SQLite
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

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the API environment file:

   ```bash
   cp apps/api/.env.sample apps/api/.env
   ```

   Update the values to match your Azure resources.

3. Initialize the SQLite database directory:

   ```bash
   mkdir -p apps/api/data
   ```

4. Start the API server:

   ```bash
   pnpm dev
   ```

   The API runs on http://localhost:4000.

5. Serve the frontend statically (for example with the VS Code Live Server extension) from `apps/web`. The pages expect the API at `http://localhost:4000`.

## Pushing to GitHub

If you would like to publish this repository to your own GitHub account, you can create a new remote and push the existing history:

```bash
git remote add origin git@github.com:<your-account>/<your-repo>.git
git push -u origin work
```

Replace `<your-account>` and `<your-repo>` with the values for your GitHub project. If the remote already exists (for example, after cloning from GitHub), you only need the final `git push` command.

## Notes

- The backend automatically migrates the SQLite database on boot.
- This is a prototype; authentication and production hardening are intentionally left out but the structure allows future integration with Microsoft Entra ID.
- All storage account secrets remain on the server; the frontend communicates solely via the `/api` routes.
