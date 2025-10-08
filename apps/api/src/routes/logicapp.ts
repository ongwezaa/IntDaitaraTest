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
      const { parameters } = req.body ?? {};
      const params = parameters && typeof parameters === 'object' ? (parameters as Record<string, unknown>) : {};
      const fileParam = params.file;
      if (typeof fileParam !== 'string' || !fileParam.trim()) {
        return res.status(400).json({ ok: false, message: 'parameters.file is required' });
      }
      const fileName = fileParam.trim();
      const runId = ulid();
      const fileKeys = ['file', 'config', 'sourceMappingPrompt', 'selectMappingPrompt'] as const;
      const payload: Record<string, unknown> = { ...params };

      fileKeys.forEach((key) => {
        const value = params[key];
        if (typeof value === 'string' && value.trim()) {
          payload[key] = buildBlobSas(value.trim(), 'r', appConfig.sasExpiryMinutes);
        }
      });

      const triggerResult = await triggerLogicApp({ payload });
      const run = store.create({
        id: runId,
        fileName,
        fileUrl: typeof payload.file === 'string' ? String(payload.file) : buildBlobSas(fileName, 'r', appConfig.sasExpiryMinutes),
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
