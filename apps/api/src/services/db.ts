import Database from "better-sqlite3";
import { RunRecord, RunStatus } from "../types.js";

export class RunsRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.migrate();
  }

  private migrate() {
    this.db
      .prepare(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          fileName TEXT NOT NULL,
          fileUrl TEXT NOT NULL,
          logicRunId TEXT,
          status TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          outputPrefix TEXT NOT NULL,
          trackingUrl TEXT,
          location TEXT
        )
      `)
      .run();
  }

  public create(run: RunRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO runs (
        id, fileName, fileUrl, logicRunId, status,
        createdAt, updatedAt, outputPrefix, trackingUrl, location
      ) VALUES (@id, @fileName, @fileUrl, @logicRunId, @status,
        @createdAt, @updatedAt, @outputPrefix, @trackingUrl, @location)
    `);
    stmt.run(run);
    return run;
  }

  public list(limit = 100): RunRecord[] {
    const stmt = this.db.prepare(
      `SELECT * FROM runs ORDER BY datetime(createdAt) DESC LIMIT ?`
    );
    return stmt.all(limit) as RunRecord[];
  }

  public get(id: string): RunRecord | undefined {
    const stmt = this.db.prepare(`SELECT * FROM runs WHERE id = ?`);
    return stmt.get(id) as RunRecord | undefined;
  }

  public update(id: string, patch: Partial<Omit<RunRecord, "id">>) {
    const run = this.get(id);
    if (!run) return undefined;
    const updated: RunRecord = { ...run, ...patch, id };
    updated.updatedAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE runs SET
        fileName=@fileName,
        fileUrl=@fileUrl,
        logicRunId=@logicRunId,
        status=@status,
        createdAt=@createdAt,
        updatedAt=@updatedAt,
        outputPrefix=@outputPrefix,
        trackingUrl=@trackingUrl,
        location=@location
      WHERE id=@id
    `);
    stmt.run(updated);
    return updated;
  }

  public updateStatus(
    id: string,
    status: RunStatus,
    extra: Partial<RunRecord> = {}
  ) {
    return this.update(id, { status, ...extra });
  }
}
