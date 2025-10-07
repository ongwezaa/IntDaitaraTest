export type RunStatus =
  | "Queued"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "Canceled"
  | "Unknown";

export interface RunRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  logicRunId: string | null;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  outputPrefix: string;
  trackingUrl?: string | null;
  location?: string | null;
}

export interface TriggerRunRequest {
  fileName: string;
  parameters?: Record<string, unknown>;
}

export interface TriggerRunResponse {
  run: RunRecord;
}
