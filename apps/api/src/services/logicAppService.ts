import axios from 'axios';
import { appConfig } from '../config.js';
import { RunStatus } from '../types.js';

interface TriggerResult {
  runId?: string;
  trackingUrl?: string;
  location?: string;
  status: RunStatus;
}

interface TriggerInput {
  payload: Record<string, unknown>;
}

export async function triggerLogicApp({ payload }: TriggerInput): Promise<TriggerResult> {
  const body = {
    config: '',
    sourceMappingPrompt: '',
    selectMappingPrompt: '',
    ...payload,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (appConfig.logicAppBearer) {
    headers.Authorization = `Bearer ${appConfig.logicAppBearer}`;
  }

  const response = await axios.post(appConfig.logicAppUrl, body, {
    headers,
    validateStatus: () => true,
  });

  if (response.status === 202) {
    const location = response.headers['location'] ?? response.headers['Location'];
    return {
      runId: undefined,
      trackingUrl: typeof response.data === 'object' && response.data?.trackingUrl ? String(response.data.trackingUrl) : undefined,
      location: typeof location === 'string' ? location : undefined,
      status: 'Running',
    };
  }

  if (response.status >= 200 && response.status < 300) {
    const body = response.data as Record<string, unknown> | undefined;
    return {
      runId: typeof body?.runId === 'string' ? body.runId : undefined,
      trackingUrl: typeof body?.trackingUrl === 'string' ? body.trackingUrl : undefined,
      location: undefined,
      status: 'Queued',
    };
  }

  throw new Error(`Logic App trigger failed with status ${response.status}`);
}

interface PollInput {
  runId?: string | null;
  trackingUrl?: string | null;
  location?: string | null;
}

export async function pollLogicAppStatus({ runId, trackingUrl, location }: PollInput): Promise<RunStatus> {
  const target = trackingUrl ?? location;
  if (!target) {
    return 'Unknown';
  }
  const headers: Record<string, string> = {};
  if (appConfig.logicAppBearer) {
    headers.Authorization = `Bearer ${appConfig.logicAppBearer}`;
  }
  const response = await axios.get(target, {
    headers,
    validateStatus: () => true,
  });
  if (response.status >= 200 && response.status < 300) {
    const body = response.data as Record<string, unknown> | undefined;
    const status = String(body?.status ?? body?.runtimeStatus ?? '').toLowerCase();
    switch (status) {
      case 'running':
        return 'Running';
      case 'succeeded':
      case 'success':
        return 'Succeeded';
      case 'failed':
      case 'failure':
        return 'Failed';
      case 'cancelled':
      case 'canceled':
        return 'Canceled';
      default:
        return 'Unknown';
    }
  }
  return 'Unknown';
}
