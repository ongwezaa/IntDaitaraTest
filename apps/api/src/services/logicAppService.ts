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

function extractRunIdFromUrl(input?: string | null): string | undefined {
  if (!input) return undefined;
  try {
    const parsed = new URL(input);
    const searchParams = parsed.searchParams;
    const paramRunId =
      searchParams.get('runName') ??
      searchParams.get('runId') ??
      searchParams.get('workflowRunId') ??
      searchParams.get('workflowRunName');
    if (paramRunId) {
      return paramRunId;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const matchFromSegments = (...candidates: string[]): string | undefined => {
      for (const candidate of candidates) {
        const index = segments.findIndex((segment) => segment.toLowerCase() === candidate.toLowerCase());
        if (index >= 0 && segments.length > index + 1) {
          return segments[index + 1];
        }
      }
      return undefined;
    };

    return (
      matchFromSegments('runs', 'histories') ??
      (segments.length > 0 ? segments[segments.length - 1] : undefined)
    );
  } catch (error) {
    console.warn('Failed to parse Logic App run identifier from URL', input, error);
    return undefined;
  }
}

function buildRunStatusUrlFromTemplate(runId?: string | null): string | undefined {
  if (!runId) return undefined;
  const template = appConfig.logicAppRunStatusUrlTemplate?.trim();
  if (!template) return undefined;
  const encoded = encodeURIComponent(runId);
  return template
    .replace(/\{\{\s*runIdEncoded\s*\}\}/gi, encoded)
    .replace(/\{\{\s*logicRunIdEncoded\s*\}\}/gi, encoded)
    .replace(/\{\{\s*runId\s*\}\}/gi, runId)
    .replace(/\{\{\s*logicRunId\s*\}\}/gi, runId)
    .replace(/\{runId\}/gi, encoded)
    .replace(/\{logicRunId\}/gi, encoded);
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
  const runIdFromLocation = extractRunIdFromUrl(locationHeader ?? trackingUrlFromHeader);

  if (response.status === 202) {
    const bodyData = response.data as Record<string, unknown> | undefined;
    return {
      runId:
        workflowRunIdHeader ??
        runIdFromLocation ??
        (typeof bodyData?.runId === 'string' ? bodyData.runId : undefined) ??
        (typeof bodyData?.name === 'string' ? bodyData.name : undefined),
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
      runId:
        workflowRunIdHeader ??
        runIdFromLocation ??
        (typeof body?.runId === 'string' ? body.runId : undefined) ??
        (typeof body?.name === 'string' ? body.name : undefined),
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

interface PollResult {
  status: RunStatus;
  runId?: string;
}

export async function pollLogicAppStatus({ runId, trackingUrl, location }: PollInput): Promise<PollResult> {
  const target = trackingUrl ?? location ?? buildRunStatusUrlFromTemplate(runId);
  if (!target) {
    return { status: 'Unknown', runId: runId ?? undefined };
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
    const properties = (body?.properties ?? {}) as Record<string, unknown>;
    const derivedRunId =
      (typeof body?.name === 'string' && body.name) ||
      (typeof properties?.workflowRunId === 'string' && properties.workflowRunId) ||
      (typeof properties?.workflowRunName === 'string' && properties.workflowRunName) ||
      extractRunIdFromUrl(target) ||
      undefined;
    const statusValue =
      body?.status ??
      body?.runtimeStatus ??
      properties?.status ??
      properties?.runtimeStatus ??
      properties?.workflowState;
    const normalizedStatus = String(statusValue ?? '')
      .trim()
      .toLowerCase();
    const compactStatus = normalizedStatus.replace(/[\s_-]+/g, '');

    const resolvedStatus = (() => {
      switch (compactStatus) {
        case 'running':
        case 'executing':
        case 'processing':
        case 'inprogress':
        case 'inflight':
        case 'started':
        case 'starting':
        case 'resuming':
        case 'resumed':
        case 'pausing':
        case 'paused':
        case 'suspended':
          return 'Running' as const;
        case 'waiting':
        case 'queued':
        case 'pending':
        case 'notstarted':
          return 'Queued' as const;
        case 'succeeded':
        case 'success':
        case 'completed':
        case 'complete':
        case 'finished':
        case 'skipped':
        case 'ignored':
          return 'Succeeded' as const;
        case 'failed':
        case 'failure':
        case 'faulted':
        case 'timedout':
        case 'timeout':
        case 'aborted':
        case 'terminated':
        case 'error':
        case 'errored':
          return 'Failed' as const;
        case 'cancelled':
        case 'canceled':
        case 'cancelling':
        case 'stopped':
          return 'Canceled' as const;
        default:
          return undefined;
      }
    })();

    if (resolvedStatus) {
      return { status: resolvedStatus, runId: derivedRunId ?? runId ?? undefined };
    }

    return { status: 'Unknown', runId: derivedRunId ?? runId ?? undefined };
  }
  return { status: 'Unknown', runId: runId ?? extractRunIdFromUrl(target) };
}
