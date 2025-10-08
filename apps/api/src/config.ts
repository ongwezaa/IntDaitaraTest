import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv();

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function parseNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for ${name}`);
  }
  return parsed;
}

function parseOrigins(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const appConfig = {
  port: parseNumber('PORT', 4100),
  storageAccount: getRequired('AZURE_STORAGE_ACCOUNT_NAME'),
  storageKey: getRequired('AZURE_STORAGE_ACCOUNT_KEY'),
  container: getRequired('AZURE_STORAGE_CONTAINER'),
  inputPrefix: process.env.INPUT_PREFIX ?? 'input/',
  outputPrefix: process.env.OUTPUT_PREFIX ?? 'output/',
  logicAppUrl: getRequired('LOGIC_APP_TRIGGER_URL'),
  logicAppBearer: process.env.LOGIC_APP_BEARER ?? '',
  sasExpiryMinutes: parseNumber('BLOB_SAS_EXPIRY_MINUTES', 30),
  runStorePath: path.resolve(process.cwd(), process.env.RUNS_DB_PATH ?? './data/runs.json'),
  webRoot: process.env.WEB_ROOT ? path.resolve(process.cwd(), process.env.WEB_ROOT) : undefined,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS) ?? [],
};
