import { apiFetch, showAlert } from "./config.js";

const tableBody = document.querySelector("#runsTable tbody");
const refreshBtn = document.getElementById("refreshBtn");
const alertContainer = document.getElementById("alertContainer");
const modalElement = document.getElementById("detailsModal");
const modalContent = document.getElementById("modalContent");
let modal;

const bootstrapLib = window.bootstrap;
if (modalElement && bootstrapLib?.Modal) {
  modal = new bootstrapLib.Modal(modalElement);
}

const statusClass = (status) => {
  switch (status) {
    case "Succeeded":
      return "bg-success";
    case "Failed":
      return "bg-danger";
    case "Running":
      return "bg-warning text-dark";
    case "Canceled":
      return "bg-secondary";
    case "Queued":
      return "bg-info text-dark";
    default:
      return "bg-light text-dark";
  }
};

const renderRuns = (runs) => {
  tableBody.innerHTML = "";
  runs.forEach((run) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${run.fileName}</td>
      <td>${run.id}</td>
      <td><span class="badge badge-status ${statusClass(run.status)}">${run.status}</span></td>
      <td>${new Date(run.createdAt).toLocaleString()}</td>
      <td>${new Date(run.updatedAt).toLocaleString()}</td>
      <td class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary poll-btn" data-id="${run.id}">Poll</button>
        <button class="btn btn-sm btn-outline-secondary details-btn" data-id="${run.id}">Details</button>
        ${
          run.status === "Succeeded"
            ? `<a class="btn btn-sm btn-success" href="/output?prefix=${encodeURIComponent(run.outputPrefix)}">Open output</a>`
            : ""
        }
      </td>
    `;
    tableBody.appendChild(tr);
  });
};

const loadRuns = async () => {
  try {
    const runs = await apiFetch("/runs");
    if (!Array.isArray(runs)) {
      throw new Error("Unexpected runs response");
    }
    renderRuns(runs);
  } catch (error) {
    showAlert(alertContainer, `Failed to load runs: ${error.message}`);
  }
};

const handleTableClick = async (event) => {
  const pollBtn = event.target.closest(".poll-btn");
  if (pollBtn) {
    const id = pollBtn.dataset.id;
    try {
      await apiFetch(`/runs/${id}/poll`, { method: "POST" });
      await loadRuns();
    } catch (error) {
      showAlert(alertContainer, `Poll failed: ${error.message}`);
    }
    return;
  }
  const detailsBtn = event.target.closest(".details-btn");
  if (detailsBtn) {
    const id = detailsBtn.dataset.id;
    try {
      const run = await apiFetch(`/runs/${id}`);
      modalContent.textContent = JSON.stringify(run, null, 2);
      modal?.show();
    } catch (error) {
      showAlert(alertContainer, `Failed to fetch run: ${error.message}`);
    }
  }
};

tableBody?.addEventListener("click", handleTableClick);
refreshBtn?.addEventListener("click", loadRuns);

loadRuns();
