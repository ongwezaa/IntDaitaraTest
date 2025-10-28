import axios, { AxiosResponseHeaders } from 'axios';
import { appConfig } from '../config.js';
import { RunStatus } from '../types.js';

interface TriggerResult {
  runId?: string;
  trackingUrl?: string;
  location?: string;
  status: RunStatus;
  rawResponse: {
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
    data: unknown;
  };
}

interface TriggerInput {
  payload: Record<string, unknown>;
}

type HeaderLike = AxiosResponseHeaders | Partial<Record<string, unknown>>;

function extractStringFromRecord(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (typeof rawKey !== 'string') continue;
    const normalisedKey = rawKey.toLowerCase();
    const targetKey = keys.find((key) => key.toLowerCase() === normalisedKey);
    if (targetKey) {
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }
  return undefined;
}

function findStringDeep(sources: Array<Record<string, unknown> | undefined>, keys: string[]): string | undefined {
  const queue: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  for (const source of sources) {
    if (source) {
      queue.push(source);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    const direct = extractStringFromRecord(current, keys);
    if (direct) {
      return direct;
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        queue.push(value as Record<string, unknown>);
      }
    }
  }
  return undefined;
}

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

  const serialisedHeaders = (() => {
    const source = response.headers as AxiosResponseHeaders & {
      toJSON?: () => Record<string, unknown>;
    };
    if (source && typeof source.toJSON === 'function') {
      return source.toJSON();
    }
    return Object.fromEntries(
      Object.entries(source ?? {}).map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key, value.join(', ')];
        }
        return [key, value];
      }),
    );
  })();

  const workflowRunIdHeader = getHeader(response.headers, 'x-ms-workflow-run-id');
  const asyncOperationHeader =
    getHeader(response.headers, 'azure-asyncoperation') ?? getHeader(response.headers, 'azure-async-operation');
  const locationHeader = getHeader(response.headers, 'location');
  const operationLocationHeader = getHeader(response.headers, 'operation-location');
  const trackingUrlFromHeader = asyncOperationHeader ?? operationLocationHeader ?? undefined;
  const runIdFromLocation = extractRunIdFromUrl(locationHeader ?? trackingUrlFromHeader);
  const bodyData = response.data as Record<string, unknown> | undefined;
  const properties = (bodyData?.properties ?? {}) as Record<string, unknown>;
  const runIdFromBody =
    findStringDeep(
      [
        bodyData as Record<string, unknown> | undefined,
        properties,
        (properties?.workflowRun as Record<string, unknown> | undefined) ?? undefined,
        (properties?.workflowRun as { properties?: Record<string, unknown> })?.properties,
      ],
      ['runId', 'name', 'workflowRunId', 'workflowRunName'],
    ) ?? undefined;

  const trackingUrlFromBody =
    findStringDeep(
      [
        bodyData as Record<string, unknown> | undefined,
        properties,
        (properties?.links as Record<string, unknown> | undefined) ?? undefined,
        (properties?.outputs as Record<string, unknown> | undefined) ?? undefined,
        (properties?.response as Record<string, unknown> | undefined) ?? undefined,
        (properties?.workflowRun as Record<string, unknown> | undefined) ?? undefined,
        (properties?.workflowRun as { properties?: Record<string, unknown> })?.properties,
      ],
      ['trackingUrl', 'statusUrl', 'statusLink', 'statusEndpoint', 'statusQueryGetUri', 'url'],
    ) ?? undefined;
  const resolvedRunId =
    workflowRunIdHeader ??
    runIdFromLocation ??
    runIdFromBody ??
    extractRunIdFromUrl(trackingUrlFromBody ?? locationHeader ?? undefined);
  const resolvedTrackingUrl =
    trackingUrlFromHeader ??
    trackingUrlFromBody ??
    locationHeader;

  const baseResult = {
    runId: resolvedRunId,
    trackingUrl: resolvedTrackingUrl,
    location: locationHeader,
    rawResponse: {
      status: response.status,
      statusText: response.statusText,
      headers: serialisedHeaders,
      data: response.data,
    },
  } as const;

  if (response.status === 202) {
    return {
      ...baseResult,
      status: 'Running',
    };
  }

  if (response.status >= 200 && response.status < 300) {
    return {
      ...baseResult,
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
  const target = trackingUrl ?? location;
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
