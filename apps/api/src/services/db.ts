import { promises as fs } from "node:fs";
import path from "node:path";
import { RunRecord } from "../types.js";
import { env } from "../env.js";

interface RunsFileSchema {
  runs: RunRecord[];
}

const defaultData: RunsFileSchema = { runs: [] };

const ensureDir = async (filePath: string) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const readFile = async (): Promise<RunsFileSchema> => {
  try {
    const raw = await fs.readFile(env.runsDbPath, "utf-8");
    return JSON.parse(raw) as RunsFileSchema;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await ensureDir(env.runsDbPath);
      await fs.writeFile(env.runsDbPath, JSON.stringify(defaultData, null, 2));
      return { ...defaultData };
    }
    throw error;
  }
};

const writeFile = async (data: RunsFileSchema) => {
  await ensureDir(env.runsDbPath);
  await fs.writeFile(env.runsDbPath, JSON.stringify(data, null, 2));
};

export const listRuns = async (limit = 100): Promise<RunRecord[]> => {
  const data = await readFile();
  return data.runs
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
};

export const getRun = async (id: string): Promise<RunRecord | undefined> => {
  const data = await readFile();
  return data.runs.find((run) => run.id === id);
};

export const saveRun = async (run: RunRecord): Promise<void> => {
  const data = await readFile();
  const index = data.runs.findIndex((existing) => existing.id === run.id);
  if (index >= 0) {
    data.runs[index] = run;
  } else {
    data.runs.push(run);
  }
  await writeFile(data);
};
