import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 4100),
  storageAccount: requiredEnv("AZURE_STORAGE_ACCOUNT_NAME"),
  storageKey: requiredEnv("AZURE_STORAGE_ACCOUNT_KEY"),
  container: requiredEnv("AZURE_STORAGE_CONTAINER"),
  inputPrefix: process.env.INPUT_PREFIX ?? "input/",
  outputPrefix: process.env.OUTPUT_PREFIX ?? "output/",
  logicAppUrl: requiredEnv("LOGIC_APP_TRIGGER_URL"),
  logicAppBearer: process.env.LOGIC_APP_BEARER,
  blobSasExpiryMinutes: Number(process.env.BLOB_SAS_EXPIRY_MINUTES ?? 30),
  runsDbPath: path.resolve(process.cwd(), process.env.RUNS_DB_PATH ?? "./data/runs.json"),
  webRoot: path.resolve(process.cwd(), process.env.WEB_ROOT ?? "../web"),
};
