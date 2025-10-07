export type RunStatus =
  | 'Queued'
  | 'Running'
  | 'Succeeded'
  | 'Failed'
  | 'Canceled'
  | 'Unknown';

export interface RunRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  logicRunId?: string | null;
  trackingUrl?: string | null;
  location?: string | null;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  outputPrefix: string;
  parameters: Record<string, unknown>;
}

export interface ListBlobItem {
  name: string;
  size: number;
  lastModified: string;
  contentType?: string;
}
