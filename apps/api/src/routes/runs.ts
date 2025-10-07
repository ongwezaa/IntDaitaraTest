import { Router } from 'express';
import { pollLogicAppStatus } from '../services/logicAppService.js';
import { RunStore } from '../services/runStore.js';

export function createRunsRouter(store: RunStore) {
  const router = Router();

  router.get('/', (req, res) => {
    const runs = store.list(100);
    res.json(runs);
  });

  router.get('/:id', (req, res) => {
    const run = store.get(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, message: 'Run not found' });
    }
    res.json(run);
  });

  router.post('/:id/poll', async (req, res, next) => {
    try {
      const run = store.get(req.params.id);
      if (!run) {
        return res.status(404).json({ ok: false, message: 'Run not found' });
      }
      const status = await pollLogicAppStatus({
        runId: run.logicRunId,
        trackingUrl: run.trackingUrl,
        location: run.location,
      });
      const updated = store.update(run.id, { status });
      res.json(updated ?? run);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
