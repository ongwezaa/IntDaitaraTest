import axios from "axios";
import { env } from "../env.js";
import { LogicPollResult, LogicTriggerResult, RunStatus } from "../types.js";

const client = axios.create({
  timeout: 30000,
});

const authHeaders = () => {
  if (!env.logicAppBearer) {
    return {};
  }
  return {
    Authorization: `Bearer ${env.logicAppBearer}`,
  };
};

export const triggerRun = async (
  sasUrl: string,
  parameters: Record<string, unknown>
): Promise<LogicTriggerResult> => {
  const payload = {
    file: sasUrl,
    config: "",
    sourceMappingPrompt: "",
    selectMappingPrompt: "",
    ...parameters,
  };

  const response = await client.post(env.logicAppUrl, payload, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    validateStatus: () => true,
  });

  if (response.status === 202) {
    const location = response.headers["location"];
    return {
      location: typeof location === "string" ? location : undefined,
    };
  }

  if (response.status >= 200 && response.status < 300) {
    const data = response.data ?? {};
    return {
      runId: typeof data.runId === "string" ? data.runId : undefined,
      trackingUrl:
        typeof data.trackingUrl === "string" ? data.trackingUrl : undefined,
    };
  }

  throw new Error(`Logic App trigger failed with status ${response.status}`);
};

const normalizeStatus = (value: unknown): RunStatus => {
  const status = typeof value === "string" ? value : "";
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "running":
      return "Running";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "cancelled":
    case "canceled":
      return "Canceled";
    case "queued":
    case "accepted":
      return "Queued";
    default:
      return "Unknown";
  }
};

export const pollStatus = async (
  { runId, trackingUrl, location }: { runId?: string | null; trackingUrl?: string | null; location?: string | null }
): Promise<LogicPollResult> => {
  const url = trackingUrl ?? location ?? undefined;
  if (!url) {
    return { status: "Unknown" };
  }
  const response = await client.get(url, {
    headers: {
      ...authHeaders(),
    },
    validateStatus: () => true,
  });

  if (response.status === 202) {
    return { status: "Running" };
  }

  if (response.status >= 200 && response.status < 300) {
    const data = response.data ?? {};
    const statusField =
      (data.status as unknown) ??
      (data.properties as { status?: unknown } | undefined)?.status ??
      (data.runtimeStatus as unknown);
    return { status: normalizeStatus(statusField) };
  }

  if (response.status >= 400 && response.status < 500) {
    return { status: "Failed" };
  }

  return { status: "Unknown" };
};
