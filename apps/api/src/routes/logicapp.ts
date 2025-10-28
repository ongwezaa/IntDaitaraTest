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

      const timestampParam =
        typeof params.timestamp === 'string' && params.timestamp.trim()
          ? params.timestamp.trim()
          : new Date().toISOString();
      const projectParam =
        typeof params.project === 'string' && params.project.trim()
          ? params.project.trim()
          : null;
      const runParams: Record<string, unknown> = {
        ...params,
        timestamp: timestampParam,
        ...(projectParam ? { project: projectParam } : {}),
      };
      const payload: Record<string, unknown> = { ...runParams };

      const outputPrefix = projectParam
        ? `${appConfig.outputPrefix}${projectParam}/${timestampParam}/`
        : `${appConfig.outputPrefix}${runId}/`;

      const triggerResult = await triggerLogicApp({ payload });
      const run = store.create({
        id: runId,
        fileUrl: fileName,
        parameters: runParams,
        outputPrefix,
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
