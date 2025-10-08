import { apiFetch, ensureHealth } from './config.js';

const tableBody = document.querySelector('#runsTable tbody');
const refreshBtn = document.getElementById('refreshBtn');
const alertContainer = document.getElementById('alertContainer');
const detailsModalEl = document.getElementById('detailsModal');
const detailsContent = document.getElementById('detailsContent');
const searchInput = document.getElementById('searchInput');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const pageSummary = document.getElementById('pageSummary');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const sortableHeaders = document.querySelectorAll('#runsTable th.sortable');

let detailsModal;
let allRuns = [];
let filteredRuns = [];
let currentPage = 1;
let sortKey = 'createdAt';
let sortDirection = 'desc';
let searchDebounce;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showAlert(message, type = 'danger') {
  const wrapper = document.createElement('div');
  wrapper.className = `alert alert-${type} alert-dismissible fade show`;
  wrapper.innerHTML = `
    ${escapeHtml(String(message))}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  alertContainer?.appendChild(wrapper);
}

function formatParameterSummary(parameters = {}) {
  if (!parameters || typeof parameters !== 'object') {
    return '<span class="text-muted">-</span>';
  }
  const entries = Object.entries(parameters).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  });
  if (!entries.length) {
    return '<span class="text-muted">-</span>';
  }
  const items = entries.map(([key, value]) => {
    let displayValue;
    if (typeof value === 'boolean') {
      displayValue = value ? 'true' : 'false';
    } else if (typeof value === 'number') {
      displayValue = Number.isFinite(value) ? value.toString() : '';
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      displayValue = trimmed || value;
    } else if (Array.isArray(value)) {
      displayValue = value.map((item) => String(item)).join(', ');
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    } else {
      displayValue = String(value);
    }
    if (!displayValue && displayValue !== '0') {
      return '';
    }
    return `<li><span class="param-key">${escapeHtml(key)}</span><span class="param-value">${escapeHtml(displayValue)}</span></li>`;
  }).filter(Boolean);
  if (!items.length) {
    return '<span class="text-muted">-</span>';
  }
  return `<ul class="param-list">${items.join('')}</ul>`;
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
  return `<span class="badge bg-${cls}">${escapeHtml(status)}</span>`;
}

function getPageSize() {
  const value = Number(pageSizeSelect?.value);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function updatePagination(totalItems, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, currentPage * pageSize);
  if (pageSummary) {
    pageSummary.textContent = totalItems
      ? `Showing ${startIndex} – ${endIndex} of ${totalItems} items`
      : 'No runs to display';
  }
  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages || totalItems === 0;
}

function sortRuns(runs) {
  const direction = sortDirection === 'desc' ? -1 : 1;
  return [...runs].sort((a, b) => {
    let valueA;
    let valueB;
    switch (sortKey) {
      case 'createdAt':
      case 'updatedAt':
        valueA = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
        valueB = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
        break;
      case 'status':
        valueA = a.status || '';
        valueB = b.status || '';
        break;
      case 'parameters':
        valueA = JSON.stringify(a.parameters || {}).toLowerCase();
        valueB = JSON.stringify(b.parameters || {}).toLowerCase();
        break;
      case 'targetEnv':
        valueA = (a.parameters?.target_env || '').toLowerCase();
        valueB = (b.parameters?.target_env || '').toLowerCase();
        break;
      case 'id':
      default:
        valueA = (a.id || '').toLowerCase();
        valueB = (b.id || '').toLowerCase();
    }
    if (valueA < valueB) return -1 * direction;
    if (valueA > valueB) return 1 * direction;
    return 0;
  });
}

function applyFilters({ resetPage = false } = {}) {
  const term = searchInput?.value.trim().toLowerCase() ?? '';
  filteredRuns = allRuns.filter((run) => {
    if (!term) return true;
    const haystack = [
      run.id,
      run.parameters?.target_env,
      run.parameters?.target_type,
      JSON.stringify(run.parameters || {}),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
  filteredRuns = sortRuns(filteredRuns);
  if (resetPage) {
    currentPage = 1;
  }
  const pageSize = getPageSize();
  updatePagination(filteredRuns.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredRuns.slice(start, start + pageSize);
  renderRows(pageItems);
}

function updateSortIndicators() {
  sortableHeaders.forEach((header) => {
    const key = header.dataset.sort;
    if (key === sortKey) {
      header.dataset.direction = sortDirection;
    } else {
      header.removeAttribute('data-direction');
    }
  });
}

function renderRows(runs) {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  if (!runs.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="7" class="text-center text-muted py-4">No runs yet.</td>';
    tableBody.appendChild(row);
    return;
  }
  runs.forEach((run) => {
    const row = document.createElement('tr');
    const targetEnv = run.parameters?.target_env ?? '-';
    const parameterSummary = formatParameterSummary(run.parameters);
    const outputLink = run.status === 'Succeeded' && run.outputPrefix
      ? `<a class="btn btn-soft btn-sm" href="/output?prefix=${encodeURIComponent(run.outputPrefix)}">Outputs</a>`
      : '';
    row.innerHTML = `
      <td>${escapeHtml(formatDate(run.createdAt))}</td>
      <td>${escapeHtml(run.id)}</td>
      <td>${parameterSummary}</td>
      <td>${escapeHtml(targetEnv)}</td>
      <td>${statusBadge(run.status)}</td>
      <td>${escapeHtml(formatDate(run.updatedAt))}</td>
      <td>
        <div class="d-inline-flex flex-wrap gap-2">
          <button class="btn btn-soft btn-sm poll-btn" data-id="${run.id}" type="button">Poll</button>
          <button class="btn btn-soft btn-sm details-btn" data-id="${run.id}" type="button">Details</button>
          ${outputLink}
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

async function loadRuns() {
  try {
    const runs = await apiFetch('/runs');
    allRuns = Array.isArray(runs) ? runs : [];
    applyFilters({ resetPage: true });
    updateSortIndicators();
  } catch (error) {
    showAlert(error.message || 'Failed to load runs');
  }
}

async function pollRun(id) {
  try {
    const updated = await apiFetch(`/runs/${id}/poll`, { method: 'POST' });
    showAlert(`Run ${updated.id} status: ${updated.status}`, 'info');
    await loadRuns();
  } catch (error) {
    showAlert(error.message || 'Failed to poll run');
  }
}

function showDetails(run) {
  if (!detailsContent) return;
  detailsContent.textContent = JSON.stringify(run, null, 2);
  detailsModal?.show();
}

function attachEventListeners() {
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadRuns);
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        applyFilters({ resetPage: true });
      }, 200);
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      currentPage = 1;
      applyFilters();
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      applyFilters();
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      const pageSize = getPageSize();
      const totalPages = Math.max(1, Math.ceil(filteredRuns.length / pageSize));
      if (currentPage >= totalPages) return;
      currentPage += 1;
      applyFilters();
    });
  }

  sortableHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      if (!key) return;
      if (sortKey === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDirection = key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc';
      }
      updateSortIndicators();
      applyFilters();
    });
  });

  if (tableBody) {
    tableBody.addEventListener('click', (event) => {
      const pollButton = event.target.closest('.poll-btn');
      if (pollButton) {
        const id = pollButton.getAttribute('data-id');
        if (id) {
          pollRun(id);
        }
        return;
      }
      const detailsButton = event.target.closest('.details-btn');
      if (detailsButton) {
        const id = detailsButton.getAttribute('data-id');
        if (id) {
          const run = allRuns.find((item) => item.id === id);
          if (run) {
            showDetails(run);
          }
        }
      }
    });
  }
}

attachEventListeners();

(async () => {
  try {
    await ensureHealth();
    if (window.bootstrap && detailsModalEl) {
      detailsModal = new window.bootstrap.Modal(detailsModalEl);
    }
    await loadRuns();
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();
