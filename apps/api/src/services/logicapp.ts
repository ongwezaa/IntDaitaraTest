import "../env.js";
import axios from "axios";
import { RunStatus } from "../types.js";

const triggerUrl = process.env.LOGIC_APP_TRIGGER_URL;
if (!triggerUrl) {
  throw new Error("LOGIC_APP_TRIGGER_URL must be configured");
}

const bearer = process.env.LOGIC_APP_BEARER;

interface TriggerOptions {
  sasUrl: string;
  params?: Record<string, unknown>;
}

export async function triggerRun({ sasUrl, params }: TriggerOptions) {
  const payload = {
    file: sasUrl,
    config: "",
    sourceMappingPrompt: "",
    selectMappingPrompt: "",
    ...params,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (bearer) {
    headers["Authorization"] = `Bearer ${bearer}`;
  }

  const response = await axios.post(triggerUrl, payload, {
    validateStatus: () => true,
    headers,
  });

  if (response.status >= 400) {
    throw new Error(
      `Logic App trigger failed: ${response.status} ${response.statusText}`
    );
  }

  const location = response.headers["location"] as string | undefined;
  let runId: string | undefined;
  let trackingUrl: string | undefined;

  if (typeof response.data === "object" && response.data) {
    const data = response.data as Record<string, unknown>;
    if (typeof data["runId"] === "string") {
      runId = data["runId"] as string;
    }
    if (typeof data["trackingUrl"] === "string") {
      trackingUrl = data["trackingUrl"] as string;
    }
    if (!trackingUrl && typeof data["statusQueryGetUri"] === "string") {
      trackingUrl = data["statusQueryGetUri"] as string;
    }
  }

  return { runId, trackingUrl, location };
}

interface PollOptions {
  runId?: string | null;
  trackingUrl?: string | null;
  location?: string | null;
}

export async function pollStatus({
  runId,
  trackingUrl,
  location,
}: PollOptions): Promise<RunStatus | "Unknown"> {
  const url = trackingUrl || location;
  if (!url) {
    return "Unknown";
  }

  const headers: Record<string, string> = {};
  if (bearer) {
    headers["Authorization"] = `Bearer ${bearer}`;
  }

  const response = await axios.get(url, {
    validateStatus: () => true,
    headers,
  });

  if (response.status === 202) {
    return "Running";
  }

  if (response.status >= 400) {
    return "Failed";
  }

  const data = response.data;
  if (data && typeof data === "object") {
    const status = normalizeStatus((data as Record<string, unknown>)["status"]);
    if (status !== "Unknown") {
      return status;
    }
  }

  if (runId && typeof response.headers["x-ms-status"] === "string") {
    const status = normalizeStatus(response.headers["x-ms-status"]);
    if (status !== "Unknown") {
      return status;
    }
  }

  return "Unknown";
}

function normalizeStatus(value: unknown): RunStatus | "Unknown" {
  if (typeof value !== "string") return "Unknown";
  const normalized = value.toLowerCase();
  switch (normalized) {
    case "queued":
      return "Queued";
    case "running":
    case "inprogress":
      return "Running";
    case "succeeded":
    case "success":
      return "Succeeded";
    case "failed":
    case "failure":
      return "Failed";
    case "cancelled":
    case "canceled":
      return "Canceled";
    default:
      return "Unknown";
  }
}
