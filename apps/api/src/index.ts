import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from './config.js';
import { filesRouter } from './routes/files.js';
import { createLogicAppRouter } from './routes/logicapp.js';
import { createRunsRouter } from './routes/runs.js';
import { outputRouter } from './routes/output.js';
import { RunStore } from './services/runStore.js';
import { noCache } from './middleware/noCache.js';

const app = express();
app.set('etag', false);
const runStore = new RunStore(appConfig.runStorePath);

const corsOrigins = appConfig.corsOrigins.length ? appConfig.corsOrigins : undefined;
app.use(
  cors({
    origin: corsOrigins ?? '*',
  }),
);
app.use(express.json());
app.use('/api', noCache);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/files', filesRouter);
app.use('/api/logicapp', createLogicAppRouter(runStore));
app.use('/api/runs', createRunsRouter(runStore));
app.use('/api/output', outputRouter);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = appConfig.webRoot ?? path.resolve(currentDir, '../../web');

app.use('/web', express.static(staticRoot));

function sendHtml(res: Response, fileName: string) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
  res.sendFile(path.join(staticRoot, fileName), { cacheControl: false });
}

app.get('/', (req, res) => sendHtml(res, 'index.html'));
app.get('/status', (req, res) => sendHtml(res, 'status.html'));
app.get('/output', (req, res) => sendHtml(res, 'output.html'));

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  res.status(500).json({ ok: false, message: 'Internal server error' });
});

app.listen(appConfig.port, () => {
  console.log(`API listening on port ${appConfig.port}`);
});
