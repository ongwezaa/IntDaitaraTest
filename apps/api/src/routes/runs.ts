import { Router } from 'express';
import { pollLogicAppStatus } from '../services/logicAppService.js';
import { RunStore } from '../services/runStore.js';
import { RunRecord, RunStatus } from '../types.js';

const IN_PROGRESS_STATUSES: RunStatus[] = ['Queued', 'Running', 'Unknown'];

function shouldPoll(run: RunRecord): boolean {
  if (!run.trackingUrl && !run.location) {
    return false;
  }
  return IN_PROGRESS_STATUSES.includes(run.status);
}

export function createRunsRouter(store: RunStore) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const runs = store.list(100);
      const targets = runs.filter(shouldPoll);
      if (targets.length > 0) {
        await Promise.allSettled(
          targets.map(async (run) => {
            try {
              const result = await pollLogicAppStatus({
                runId: run.logicRunId,
                trackingUrl: run.trackingUrl,
                location: run.location,
              });
              const patch: Partial<RunRecord> = {};
              if (result.status && result.status !== run.status) {
                patch.status = result.status;
              }
              if (!run.logicRunId && result.runId) {
                patch.logicRunId = result.runId;
              }
              if (Object.keys(patch).length > 0) {
                store.update(run.id, patch);
              }
            } catch (error) {
              // Swallow polling errors so a single failed status update does not block the list response
              console.error('Failed to poll Logic App status', run.id, error);
            }
          }),
        );
      }
      const refreshedRuns = targets.length > 0 ? store.list(100) : runs;
      res.json(refreshedRuns);
    } catch (error) {
      next(error);
    }
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
      const result = await pollLogicAppStatus({
        runId: run.logicRunId,
        trackingUrl: run.trackingUrl,
        location: run.location,
      });
      const patch: Partial<RunRecord> = { status: result.status };
      if (!run.logicRunId && result.runId) {
        patch.logicRunId = result.runId;
      }
      const updated = store.update(run.id, patch);
      res.json(updated ?? run);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
