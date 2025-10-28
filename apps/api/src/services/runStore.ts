import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { RunRecord, RunStatus } from '../types.js';

interface RunCreateInput {
  id?: string;
  fileUrl: string;
  parameters: Record<string, unknown>;
  outputPrefix: string;
  logicRunId?: string | null;
  trackingUrl?: string | null;
  location?: string | null;
  initialStatus: RunStatus;
  triggerResponse?: unknown;
}

export class RunStore {
  private cache = new Map<string, RunRecord>();

  constructor(private readonly filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed: (RunRecord & { fileName?: string })[] = JSON.parse(raw);
        parsed.forEach((item) => {
          const { fileName: _ignored, ...rest } = item;
          this.cache.set(rest.id, rest);
        });
      } catch (error) {
        console.error('Failed to read run store, starting empty', error);
      }
    }
  }

  private persist(): void {
    const data = Array.from(this.cache.values());
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  list(limit = 100): RunRecord[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  get(id: string): RunRecord | undefined {
    return this.cache.get(id);
  }

  create(input: RunCreateInput): RunRecord {
    const now = new Date().toISOString();
    const id = input.id ?? ulid();
    const run: RunRecord = {
      id,
      fileUrl: input.fileUrl,
      logicRunId: input.logicRunId ?? null,
      trackingUrl: input.trackingUrl ?? null,
      location: input.location ?? null,
      status: input.initialStatus,
      createdAt: now,
      updatedAt: now,
      outputPrefix: input.outputPrefix,
      parameters: input.parameters,
      triggerResponse: input.triggerResponse ?? null,
    };
    this.cache.set(run.id, run);
    this.persist();
    return run;
  }

  update(id: string, patch: Partial<Omit<RunRecord, 'id' | 'createdAt'>>): RunRecord | undefined {
    const existing = this.cache.get(id);
    if (!existing) return undefined;
    const updated: RunRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.cache.set(id, updated);
    this.persist();
    return updated;
  }
}
