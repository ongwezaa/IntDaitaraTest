const GLOBAL_BASE_KEYS = [
  "API_BASE_URL",
  "__API_BASE__",
  "VITE_API_BASE_URL",
];

function sanitizeBase(base) {
  return base.replace(/\/+$/, "");
}

function resolveFromWindow() {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of GLOBAL_BASE_KEYS) {
    const value = window[key];
    if (typeof value === "string" && value.trim()) {
      return sanitizeBase(value.trim());
    }
  }

  const origin = window.location && window.location.origin;
  if (origin && origin !== "null") {
    return sanitizeBase(origin) + "/api";
  }

  return null;
}

function resolveApiBase() {
  const fromWindow = resolveFromWindow();
  if (fromWindow) {
    return fromWindow;
  }
  return "http://localhost:4000/api";
}

export const API_BASE = resolveApiBase();

export function buildApiUrl(path) {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  return `${API_BASE}${path}`;
}

export async function checkApiHealth(timeoutMs = 5000) {
  const url = buildApiUrl("/health");
  const supportsAbort = typeof AbortController !== "undefined";
  const controller = supportsAbort ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (timer) {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = `API at ${url} responded with status ${res.status}.`;
      const trimmed = text.trim();
      if (trimmed) {
        if (trimmed.startsWith("<")) {
          message += " Received HTML; check that the API base URL is correct.";
        } else {
          message += ` ${trimmed}`;
        }
      }
      return { ok: false, message };
    }

    return { ok: true };
  } catch (error) {
    let message = `Unable to reach API at ${url}.`;
    if (error && typeof error === "object") {
      if (error.name === "AbortError") {
        message += " Request timed out.";
      } else if (typeof error.message === "string" && error.message) {
        message += ` ${error.message}`;
      }
    }
    return { ok: false, message };
  }
}
