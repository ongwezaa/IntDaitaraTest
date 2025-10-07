const DEFAULT_API_BASE = 'http://localhost:4100/api';

function resolveApiBase() {
  const override = window.localStorage.getItem('logicapp_api_base');
  if (override) {
    return override;
  }
  const { protocol, hostname, port } = window.location;
  const currentPort = port ? Number(port) : protocol === 'https:' ? 443 : 80;
  if (currentPort === 4100) {
    return `${protocol}//${hostname}:${currentPort}/api`;
  }
  return DEFAULT_API_BASE;
}

export const API_BASE = resolveApiBase();

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) {
      const message = data?.message || 'Request failed';
      throw new Error(message);
    }
    return data;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

export async function ensureHealth() {
  await apiFetch('/health', { method: 'GET' });
}
