import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { RunRecord, RunStatus } from "../types.js";

type RunsData = {
  runs: RunRecord[];
};

export class RunsRepository {
  private filePath: string;
  private data: RunsData;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.ensureStore();
    this.data = this.read();
  }

  private ensureStore() {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      const initial: RunsData = { runs: [] };
      writeFileSync(this.filePath, JSON.stringify(initial, null, 2), "utf8");
    }
  }

  private read(): RunsData {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as RunsData;
      if (!parsed.runs) {
        return { runs: [] };
      }
      return { runs: [...parsed.runs] };
    } catch {
      return { runs: [] };
    }
  }

  private persist() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  public create(run: RunRecord) {
    this.data.runs.push(run);
    this.persist();
    return run;
  }

  public list(limit = 100): RunRecord[] {
    return [...this.data.runs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  public get(id: string): RunRecord | undefined {
    return this.data.runs.find((run) => run.id === id);
  }

  public update(id: string, patch: Partial<Omit<RunRecord, "id">>) {
    const index = this.data.runs.findIndex((run) => run.id === id);
    if (index === -1) return undefined;
    const existing = this.data.runs[index];
    const updated: RunRecord = { ...existing, ...patch, id };
    updated.updatedAt = new Date().toISOString();
    this.data.runs[index] = updated;
    this.persist();
    return updated;
  }

  public updateStatus(id: string, status: RunStatus, extra: Partial<RunRecord> = {}) {
    return this.update(id, { status, ...extra });
  }
}
