export type RunStatus =
  | 'Queued'
  | 'Running'
  | 'Succeeded'
  | 'Failed'
  | 'Canceled'
  | 'Unknown';

export interface RunRecord {
  id: string;
  fileUrl: string;
  logicRunId?: string | null;
  trackingUrl?: string | null;
  location?: string | null;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  outputPrefix: string;
  parameters: Record<string, unknown>;
  triggerResponse?: unknown;
}

export interface ListBlobItem {
  name: string;
  displayName: string;
  kind: 'file' | 'folder';
  size?: number;
  lastModified?: string;
  contentType?: string;
}
