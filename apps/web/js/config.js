const DEFAULT_API_BASE = "http://localhost:4100/api";

const detectApiBase = () => {
  if (window.API_BASE_URL) {
    return window.API_BASE_URL.replace(/\/$/, "");
  }
  const { origin } = window.location;
  if (origin.includes(":4100")) {
    return `${origin.replace(/\/$/, "")}/api`;
  }
  return DEFAULT_API_BASE;
};

export const apiBase = detectApiBase();

export const apiFetch = async (path, options = {}) => {
  const { headers, ...rest } = options;
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    ...rest,
  });
  const text = await response.text();
  if (!response.ok) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { message: text || response.statusText };
    }
    const error = new Error(payload.message || `Request failed (${response.status})`);
    throw error;
  }
  if (response.status === 204 || text.length === 0) {
    return null;
  }
  return JSON.parse(text);
};

export const apiFetchRaw = async (path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, options);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response;
};

export const showAlert = (container, message, type = "danger") => {
  const div = document.createElement("div");
  div.className = `alert alert-${type} alert-dismissible fade show`;
  div.role = "alert";
  div.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  container.appendChild(div);
};
