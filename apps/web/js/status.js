import { apiFetch, ensureHealth } from './config.js';

const tableBody = document.querySelector('#runsTable tbody');
const refreshBtn = document.getElementById('refreshBtn');
const alertContainer = document.getElementById('alertContainer');
const detailsModalEl = document.getElementById('detailsModal');
const detailsContent = document.getElementById('detailsContent');
let detailsModal;

function showAlert(message, type = 'danger') {
  const wrapper = document.createElement('div');
  wrapper.className = `alert alert-${type} alert-dismissible fade show`;
  wrapper.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  alertContainer.appendChild(wrapper);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadge(status) {
  const map = {
    Queued: 'secondary',
    Running: 'info',
    Succeeded: 'success',
    Failed: 'danger',
    Canceled: 'warning',
    Unknown: 'secondary',
  };
  const cls = map[status] || 'secondary';
  return `<span class="badge bg-${cls}">${status}</span>`;
}

function renderRows(runs) {
  tableBody.innerHTML = '';
  if (!runs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'No runs yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }
  runs.forEach((run) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${run.fileName}</td>
      <td>${run.id}</td>
      <td>${statusBadge(run.status)}</td>
      <td>${formatDate(run.createdAt)}</td>
      <td>${formatDate(run.updatedAt)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary poll-btn" data-id="${run.id}">Poll</button>
        ${run.status === 'Succeeded' ? `<a class="btn btn-sm btn-success ms-2" href="/output?prefix=${encodeURIComponent(run.outputPrefix)}">Outputs</a>` : ''}
      </td>
    `;
    row.addEventListener('click', (event) => {
      if ((event.target).classList.contains('poll-btn')) {
        return;
      }
      detailsContent.textContent = JSON.stringify(run, null, 2);
      detailsModal.show();
    });
    tableBody.appendChild(row);
  });
}

async function loadRuns() {
  try {
    const runs = await apiFetch('/runs');
    renderRows(runs);
  } catch (error) {
    showAlert(error.message || 'Failed to load runs');
  }
}

async function pollRun(id) {
  try {
    const updated = await apiFetch(`/runs/${id}/poll`, { method: 'POST' });
    const runs = await apiFetch('/runs');
    renderRows(runs);
    showAlert(`Run ${updated.id} status: ${updated.status}`, 'info');
  } catch (error) {
    showAlert(error.message || 'Failed to poll run');
  }
}

refreshBtn.addEventListener('click', loadRuns);

tableBody.addEventListener('click', (event) => {
  const button = event.target.closest('.poll-btn');
  if (button) {
    event.stopPropagation();
    const id = button.getAttribute('data-id');
    pollRun(id);
  }
});

(async () => {
  try {
    await ensureHealth();
    await loadRuns();
    detailsModal = new bootstrap.Modal(detailsModalEl);
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();
