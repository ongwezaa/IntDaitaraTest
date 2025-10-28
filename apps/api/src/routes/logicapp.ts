import { Router } from 'express';
import { ulid } from 'ulid';
import { appConfig } from '../config.js';
import { triggerLogicApp } from '../services/logicAppService.js';
import { RunStore } from '../services/runStore.js';

function formatTimestampDigits(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function normaliseTimestamp(input: unknown) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{14}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatTimestampDigits(parsed);
    }
  } else if (input instanceof Date) {
    return formatTimestampDigits(input);
  } else if (typeof input === 'number' && Number.isFinite(input)) {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return formatTimestampDigits(parsed);
    }
  }
  return formatTimestampDigits(new Date());
}

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

      const timestampParam = normaliseTimestamp(params.timestamp);
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
        triggerResponse: triggerResult.rawResponse,
      });
      res.json(run);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
