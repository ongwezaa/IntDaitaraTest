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
  logicRunId?: string | null;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  outputPrefix: string;
  trackingUrl?: string | null;
  location?: string | null;
}

export interface TriggerParams {
  fileName: string;
  parameters: Record<string, unknown>;
}

export interface LogicTriggerResult {
  runId?: string;
  trackingUrl?: string;
  location?: string;
}

export interface LogicPollResult {
  status: RunStatus;
}
