import { API_BASE, buildApiUrl, checkApiHealth } from "./config.js";
const runsTableBody = document.querySelector("#runsTable tbody");
const statusAlert = document.getElementById("statusAlert");
const runJson = document.getElementById("runJson");
const runModalEl = document.getElementById("runModal");
const modal = runModalEl ? new bootstrap.Modal(runModalEl) : null;

async function parseJsonResponse(res, defaultMessage) {
  const text = await res.text();
  if (!res.ok) {
    let message = defaultMessage ?? `Request failed with status ${res.status}`;
    if (text) {
      try {
        const data = JSON.parse(text);
        if (typeof data.message === "string") {
          message = data.message;
        } else if (typeof data.error === "string") {
          message = data.error;
        }
      } catch {
        const trimmed = text.trim();
        if (trimmed && !trimmed.startsWith("<")) {
          message = trimmed;
        }
      }
    }
    throw new Error(message);
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    if (trimmed.startsWith("<")) {
      throw new Error(
        "Server returned HTML instead of JSON. Ensure the API base URL is correct and the backend is running."
      );
    }
    throw new Error(defaultMessage ?? "Received malformed JSON from server.");
  }
}

function showStatusAlert(message, type = "danger") {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  statusAlert.appendChild(wrapper);
}

function statusBadge(status) {
  const map = {
    Queued: "secondary",
    Running: "primary",
    Succeeded: "success",
    Failed: "danger",
    Canceled: "warning",
    Unknown: "dark",
  };
  const variant = map[status] || "secondary";
  return `<span class="badge bg-${variant}">${status}</span>`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString();
}

async function fetchRuns() {
  try {
    const res = await fetch(buildApiUrl("/runs"));
    const runs = (await parseJsonResponse(res, "Failed to load runs")) ?? [];
    renderRuns(runs);
  } catch (error) {
    showStatusAlert(error.message);
  }
}

function renderRuns(runs) {
  runsTableBody.innerHTML = "";
  if (!Array.isArray(runs) || runs.length === 0) {
    runsTableBody.innerHTML = `
      <tr><td colspan="6" class="text-center py-4 text-muted">No runs yet</td></tr>
    `;
    return;
  }
  for (const run of runs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${run.fileName}</td>
      <td><code>${run.id}</code></td>
      <td>${statusBadge(run.status)}</td>
      <td>${formatDate(run.createdAt)}</td>
      <td>${formatDate(run.updatedAt)}</td>
      <td>
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-primary poll-btn" data-id="${run.id}">Poll</button>
          ${run.status === "Succeeded" ? `<a class="btn btn-outline-success" href="/output?prefix=${encodeURIComponent(run.outputPrefix)}">Output</a>` : ""}
        </div>
      </td>
    `;
    tr.dataset.run = JSON.stringify(run);
    tr.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target.closest("a")) {
        return;
      }
      if (modal) {
        runJson.textContent = JSON.stringify(JSON.parse(tr.dataset.run), null, 2);
        modal.show();
      }
    });
    runsTableBody.appendChild(tr);
  }
}

runsTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".poll-btn");
  if (!button) return;
  const id = button.dataset.id;
  button.disabled = true;
  button.innerText = "Polling...";
  try {
    const res = await fetch(buildApiUrl(`/logicapp/${id}/poll`), { method: "POST" });
    await parseJsonResponse(res, "Failed to poll");
    await fetchRuns();
  } catch (error) {
    showStatusAlert(error.message || "Failed to poll");
  } finally {
    button.disabled = false;
    button.innerText = "Poll";
  }
});

async function init() {
  const health = await checkApiHealth();
  if (!health.ok) {
    showStatusAlert(health.message ?? `Unable to reach API at ${API_BASE}`);
    return;
  }
  await fetchRuns();
}

init();

