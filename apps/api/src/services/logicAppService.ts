import axios, { AxiosResponseHeaders } from 'axios';
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

type HeaderLike = AxiosResponseHeaders | Partial<Record<string, unknown>>;

function getHeader(headers: HeaderLike, name: string): string | undefined {
  if (headers && typeof (headers as AxiosResponseHeaders).get === 'function') {
    const value = (headers as AxiosResponseHeaders).get(name);
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  const lowerName = name.toLowerCase();
  const record = headers as Record<string, unknown>;
  const direct = record[lowerName] ?? record[name];
  if (typeof direct === 'string' && direct) {
    return direct;
  }
  if (Array.isArray(direct)) {
    return direct.filter((item) => typeof item === 'string').join(', ');
  }
  return undefined;
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

  const workflowRunIdHeader = getHeader(response.headers, 'x-ms-workflow-run-id');
  const asyncOperationHeader =
    getHeader(response.headers, 'azure-asyncoperation') ?? getHeader(response.headers, 'azure-async-operation');
  const locationHeader = getHeader(response.headers, 'location');
  const operationLocationHeader = getHeader(response.headers, 'operation-location');
  const trackingUrlFromHeader = asyncOperationHeader ?? operationLocationHeader ?? undefined;

  if (response.status === 202) {
    const bodyData = response.data as Record<string, unknown> | undefined;
    return {
      runId: workflowRunIdHeader ?? (typeof bodyData?.runId === 'string' ? bodyData.runId : undefined),
      trackingUrl:
        trackingUrlFromHeader ??
        (typeof bodyData === 'object' && bodyData?.trackingUrl ? String(bodyData.trackingUrl) : undefined),
      location: locationHeader,
      status: 'Running',
    };
  }

  if (response.status >= 200 && response.status < 300) {
    const body = response.data as Record<string, unknown> | undefined;
    return {
      runId: workflowRunIdHeader ?? (typeof body?.runId === 'string' ? body.runId : undefined),
      trackingUrl:
        trackingUrlFromHeader ?? (typeof body?.trackingUrl === 'string' ? body.trackingUrl : undefined),
      location: locationHeader,
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
