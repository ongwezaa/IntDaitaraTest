import { API_BASE, apiFetch, ensureHealth } from './config.js';

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageSummary = document.getElementById('pageSummary');
const sortableHeaders = document.querySelectorAll('#fileTable th.sortable');
const previewPane = document.getElementById('previewPane');
const alertContainer = document.getElementById('alertContainer');
const breadcrumb = document.getElementById('breadcrumb');

let currentPrefix = 'output/';
let activePreview = { name: '', contentType: '' };
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let sortKey = 'displayName';
let sortDirection = 'asc';
let searchDebounce;

function showAlert(message, type = 'danger') {
  const wrapper = document.createElement('div');
  wrapper.className = `alert alert-${type} alert-dismissible fade show mt-3`;
  wrapper.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  alertContainer.appendChild(wrapper);
}

function normalisePrefix(value) {
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}

function formatSize(bytes) {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getParentPrefix(prefix) {
  const trimmed = prefix.replace(/\/$/, '');
  if (!trimmed) return '';
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash === -1) {
    return '';
  }
  return `${trimmed.slice(0, lastSlash)}/`;
}

function canGoUp() {
  return Boolean(currentPrefix && currentPrefix.replace(/\/$/, ''));
}

function updateUrl() {
  const url = new URL(window.location.href);
  if (currentPrefix) {
    url.searchParams.set('prefix', currentPrefix);
  } else {
    url.searchParams.delete('prefix');
  }
  const search = url.searchParams.toString();
  const next = search ? `${url.pathname}?${search}` : url.pathname;
  window.history.replaceState(null, '', next);
}

function renderBreadcrumb() {
  breadcrumb.innerHTML = '';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'breadcrumb');
  const ol = document.createElement('ol');
  ol.className = 'breadcrumb mb-0';

  const segments = currentPrefix.replace(/\/$/, '').split('/').filter(Boolean);
  const rootLi = document.createElement('li');
  if (!segments.length) {
    rootLi.className = 'breadcrumb-item active';
    rootLi.textContent = 'root';
  } else {
    rootLi.className = 'breadcrumb-item';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'root';
    link.dataset.prefix = '';
    rootLi.appendChild(link);
  }
  ol.appendChild(rootLi);

  let cumulative = '';
  segments.forEach((segment, index) => {
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    const li = document.createElement('li');
    if (index === segments.length - 1) {
      li.className = 'breadcrumb-item active';
      li.textContent = segment;
    } else {
      li.className = 'breadcrumb-item';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = segment;
      link.dataset.prefix = `${cumulative}/`;
      li.appendChild(link);
    }
    ol.appendChild(li);
  });

  nav.appendChild(ol);
  breadcrumb.appendChild(nav);
}

function renderList(items) {
  fileList.innerHTML = '';

  if (canGoUp()) {
    const row = document.createElement('tr');
    row.dataset.kind = 'up';
    row.className = 'parent-row';
    row.innerHTML = `
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="item-icon up" aria-hidden="true"><i class="bi bi-arrow-90deg-up"></i></span>
          <div>
            <div class="fw-semibold text-body-secondary small">Parent folder</div>
            <div class="text-muted small">Back one level</div>
          </div>
        </div>
      </td>
      <td class="text-muted small">Folder</td>
      <td class="text-end text-muted small">-</td>
      <td class="text-muted small">-</td>
      <td class="text-end text-muted small">-</td>
    `;
    fileList.appendChild(row);
  }

  if (!items.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="text-center text-muted py-4">No items found</td>';
    fileList.appendChild(row);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('tr');
    row.dataset.kind = item.kind;
    if (item.kind === 'folder') {
      row.dataset.path = item.name;
      row.classList.add('folder-row');
      row.innerHTML = `
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="item-icon folder" aria-hidden="true"><i class="bi bi-folder"></i></span>
            <span class="fw-semibold">${item.displayName}</span>
          </div>
        </td>
        <td class="text-muted">Folder</td>
        <td class="text-end text-muted">-</td>
        <td class="text-muted">-</td>
        <td class="text-end text-muted small">-</td>
      `;
    } else {
      const timestamp = item.lastModified ? new Date(item.lastModified).toLocaleString() : '-';
      row.dataset.path = item.name;
      row.innerHTML = `
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="item-icon file" aria-hidden="true"><i class="bi bi-file-earmark"></i></span>
            <span class="fw-semibold">${item.displayName}</span>
          </div>
        </td>
        <td>File</td>
        <td class="text-end">${formatSize(item.size ?? 0)}</td>
        <td>${timestamp}</td>
        <td class="text-end">
          <div class="icon-actions d-inline-flex gap-2">
            <button class="btn btn-icon preview-btn" data-name="${item.name}" type="button" title="Preview ${item.displayName}" aria-label="Preview ${item.displayName}">
              <i class="bi bi-eye"></i>
              <span class="visually-hidden">Preview</span>
            </button>
            <a class="btn btn-icon" data-download="true" href="${API_BASE}/output/download?blob=${encodeURIComponent(item.name)}" title="Download ${item.displayName}" aria-label="Download ${item.displayName}" download>
              <i class="bi bi-download"></i>
              <span class="visually-hidden">Download</span>
            </a>
          </div>
        </td>
      `;
    }
    fileList.appendChild(row);
  });
}

function sortItems(items) {
  const sorted = [...items];
  const key = sortKey;
  const direction = sortDirection === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    if (key !== 'kind' && a.kind !== b.kind) {
      return a.kind === 'folder' ? -1 : 1;
    }

    let valueA;
    let valueB;

    switch (key) {
      case 'size':
        valueA = a.size ?? -1;
        valueB = b.size ?? -1;
        break;
      case 'lastModified':
        valueA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        valueB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        break;
      case 'kind':
        valueA = a.kind;
        valueB = b.kind;
        break;
      default:
        valueA = a.displayName.toLowerCase();
        valueB = b.displayName.toLowerCase();
    }

    if (valueA < valueB) return -1 * direction;
    if (valueA > valueB) return 1 * direction;
    return 0;
  });
  return sorted;
}

function getPageSize() {
  const value = Number(pageSizeSelect.value);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function updatePagination(totalItems, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, currentPage * pageSize);
  pageSummary.textContent = totalItems
    ? `Showing ${startIndex} – ${endIndex} of ${totalItems} items`
    : 'No items to display';
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages || totalItems === 0;
}

function applyFilters({ resetPage = false } = {}) {
  const term = searchInput.value.trim().toLowerCase();
  filteredItems = allItems.filter((item) => {
    if (!term) return true;
    return item.displayName.toLowerCase().includes(term);
  });
  filteredItems = sortItems(filteredItems);
  if (resetPage) {
    currentPage = 1;
  }
  const pageSize = getPageSize();
  updatePagination(filteredItems.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredItems.slice(start, start + pageSize);
  renderList(pageItems);
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

function renderPreview(content, contentType) {
  previewPane.innerHTML = '';
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(content);
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(parsed, null, 2);
      previewPane.appendChild(pre);
      return;
    } catch {
      // fall through
    }
  }

  if (contentType.includes('text/csv')) {
    const rows = content.trim().split(/\r?\n/);
    const table = document.createElement('table');
    table.className = 'table table-striped table-sm';
    rows.slice(0, 2000).forEach((row, index) => {
      const tr = document.createElement('tr');
      row.split(',').forEach((cell) => {
        const cellEl = document.createElement(index === 0 ? 'th' : 'td');
        cellEl.textContent = cell;
        tr.appendChild(cellEl);
      });
      table.appendChild(tr);
    });
    previewPane.appendChild(table);
    return;
  }

  if (contentType.includes('sql') || activePreview.name.toLowerCase().endsWith('.sql')) {
    try {
      if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
        const formatted = window.sqlFormatter.format(content, { language: 'sql' });
        const pre = document.createElement('pre');
        pre.textContent = formatted;
        previewPane.appendChild(pre);
        return;
      }
    } catch {
      // ignore formatter errors
    }
  }

  const pre = document.createElement('pre');
  pre.textContent = content;
  previewPane.appendChild(pre);
}

async function loadList() {
  try {
    const items = await apiFetch(`/output/list?prefix=${encodeURIComponent(currentPrefix)}`);
    allItems = Array.isArray(items) ? items : [];
    applyFilters({ resetPage: true });
    updateSortIndicators();
  } catch (error) {
    showAlert(error.message || 'Failed to list output files');
  }
}

async function previewBlob(name) {
  activePreview = { name, contentType: '' };
  previewPane.textContent = 'Loading preview...';
  try {
    const response = await fetch(`${API_BASE}/output/preview?blob=${encodeURIComponent(name)}`);
    if (response.status === 413) {
      previewPane.textContent = 'File is too large or not previewable. Please download instead.';
      return;
    }
    if (!response.ok) {
      throw new Error('Unable to preview file');
    }
    const contentType = response.headers.get('content-type') || 'text/plain';
    activePreview.contentType = contentType;
    const text = await response.text();
    renderPreview(text, contentType);
  } catch (error) {
    previewPane.textContent = 'Preview failed.';
    showAlert(error.message || 'Preview failed');
  }
}

function setCurrentPrefix(prefix) {
  currentPrefix = normalisePrefix(prefix);
  renderBreadcrumb();
  updateUrl();
}

searchInput.addEventListener('input', () => {
  if (searchDebounce) {
    clearTimeout(searchDebounce);
  }
  searchDebounce = setTimeout(() => {
    applyFilters({ resetPage: true });
  }, 200);
});

pageSizeSelect.addEventListener('change', () => {
  currentPage = 1;
  applyFilters();
});

prevPageBtn.addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  applyFilters();
});

nextPageBtn.addEventListener('click', () => {
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  if (currentPage >= totalPages) return;
  currentPage += 1;
  applyFilters();
});

sortableHeaders.forEach((header) => {
  header.addEventListener('click', () => {
    const key = header.dataset.sort;
    if (!key) return;
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = key === 'size' || key === 'lastModified' ? 'desc' : 'asc';
    }
    updateSortIndicators();
    applyFilters();
  });
});

breadcrumb.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-prefix]');
  if (!link) return;
  event.preventDefault();
  setCurrentPrefix(link.dataset.prefix ?? '');
  loadList();
});

fileList.addEventListener('click', (event) => {
  const upItem = event.target.closest('tr[data-kind="up"]');
  if (upItem) {
    setCurrentPrefix(getParentPrefix(currentPrefix));
    loadList();
    return;
  }

  const button = event.target.closest('.preview-btn');
  if (button) {
    const name = button.getAttribute('data-name');
    if (name) {
      previewBlob(name);
    }
    return;
  }

  const folderRow = event.target.closest('tr[data-kind="folder"]');
  if (folderRow && !event.target.closest('a, button')) {
    const path = folderRow.dataset.path;
    if (path) {
      setCurrentPrefix(path);
      loadList();
      previewPane.textContent = 'Select a file to preview';
    }
  }
});

(async () => {
  try {
    await ensureHealth();
    const params = new URLSearchParams(window.location.search);
    const prefix = params.get('prefix') || 'output/';
    setCurrentPrefix(prefix);
    await loadList();
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();
