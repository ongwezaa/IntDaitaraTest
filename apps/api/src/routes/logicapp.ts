import { Router } from 'express';
import { ulid } from 'ulid';
import { appConfig } from '../config.js';
import { triggerLogicApp } from '../services/logicAppService.js';
import { RunStore } from '../services/runStore.js';

export function createLogicAppRouter(store: RunStore) {
  const router = Router();

  router.post('/trigger', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const params = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
      const fileParam = params.file;
      if (typeof fileParam !== 'string' || !fileParam.trim()) {
        return res.status(400).json({ ok: false, message: 'file is required' });
      }
      const fileName = fileParam.trim();
      const runId = ulid();
      const payload: Record<string, unknown> = { ...params };

      const triggerResult = await triggerLogicApp({ payload });
      const run = store.create({
        id: runId,
        fileUrl: fileName,
        parameters: params,
        outputPrefix: `${appConfig.outputPrefix}${runId}/`,
        logicRunId: triggerResult.runId ?? null,
        trackingUrl: triggerResult.trackingUrl ?? null,
        location: triggerResult.location ?? null,
        initialStatus: triggerResult.status,
      });
      res.json(run);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
