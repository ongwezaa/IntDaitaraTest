const API_BASE = "http://localhost:4000/api";
const runsTableBody = document.querySelector("#runsTable tbody");
const statusAlert = document.getElementById("statusAlert");
const runJson = document.getElementById("runJson");
const runModalEl = document.getElementById("runModal");
const modal = runModalEl ? new bootstrap.Modal(runModalEl) : null;

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
    const res = await fetch(`${API_BASE}/runs`);
    if (!res.ok) throw new Error("Failed to load runs");
    const runs = await res.json();
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
          ${run.status === "Succeeded" ? `<a class="btn btn-outline-success" href="output.html?prefix=${encodeURIComponent(run.outputPrefix)}">Output</a>` : ""}
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
    const res = await fetch(`${API_BASE}/logicapp/${id}/poll`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to poll" }));
      throw new Error(err.message || "Failed to poll");
    }
    await fetchRuns();
  } catch (error) {
    showStatusAlert(error.message || "Failed to poll");
  } finally {
    button.disabled = false;
    button.innerText = "Poll";
  }
});

fetchRuns();

