import { Router } from 'express';
import { ulid } from 'ulid';
import { appConfig } from '../config.js';
import { buildBlobSas } from '../services/blobService.js';
import { triggerLogicApp } from '../services/logicAppService.js';
import { RunStore } from '../services/runStore.js';

export function createLogicAppRouter(store: RunStore) {
  const router = Router();

  router.post('/trigger', async (req, res, next) => {
    try {
      const { fileName, parameters } = req.body ?? {};
      if (!fileName || typeof fileName !== 'string') {
        return res.status(400).json({ ok: false, message: 'fileName is required' });
      }
      const params = (parameters && typeof parameters === 'object') ? parameters : {};
      const runId = ulid();
      const sasUrl = buildBlobSas(fileName, 'r', appConfig.sasExpiryMinutes);
      const triggerResult = await triggerLogicApp({ sasUrl, parameters: params });
      const run = store.create({
        id: runId,
        fileName,
        fileUrl: sasUrl,
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
