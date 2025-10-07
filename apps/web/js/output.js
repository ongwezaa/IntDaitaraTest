import { API_BASE, apiFetch, ensureHealth } from './config.js';

const prefixInput = document.getElementById('prefixInput');
const listBtn = document.getElementById('listBtn');
const fileList = document.getElementById('fileList');
const previewPane = document.getElementById('previewPane');
const alertContainer = document.getElementById('alertContainer');
const breadcrumb = document.getElementById('breadcrumb');
const upBtn = document.getElementById('upBtn');

let currentPrefix = 'output/';
let activePreview = { name: '', contentType: '' };

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
  upBtn.toggleAttribute('disabled', !canGoUp());
}

function renderList(items) {
  fileList.innerHTML = '';
  if (canGoUp()) {
    const li = document.createElement('li');
    li.className = 'list-group-item list-group-item-action d-flex align-items-center gap-2';
    li.dataset.kind = 'up';
    li.innerHTML = '<span class="folder-icon">⬆️</span><span class="fw-semibold">..</span>';
    fileList.appendChild(li);
  }

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'list-group-item text-muted';
    li.textContent = 'This folder is empty';
    fileList.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    if (item.kind === 'folder') {
      li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
      li.dataset.kind = 'folder';
      li.dataset.path = item.name;
      li.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <span class="folder-icon">📁</span>
          <span class="fw-semibold">${item.displayName}</span>
        </div>
        <span class="badge text-bg-light">Folder</span>
      `;
    } else {
      li.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2';
      li.dataset.kind = 'file';
      li.dataset.path = item.name;
      const timestamp = item.lastModified ? new Date(item.lastModified).toLocaleString() : '-';
      li.innerHTML = `
        <div>
          <div class="d-flex align-items-center gap-2">
            <span class="file-icon">📄</span>
            <span class="fw-semibold">${item.displayName}</span>
          </div>
          <small class="text-muted d-block">${formatSize(item.size ?? 0)} • ${timestamp}</small>
        </div>
        <div class="d-flex align-items-center">
          <button class="btn btn-sm btn-outline-primary me-2 preview-btn" data-name="${item.name}">Preview</button>
          <a class="btn btn-sm btn-success" data-download="true" href="${API_BASE}/output/download?blob=${encodeURIComponent(item.name)}">Download</a>
        </div>
      `;
    }
    fileList.appendChild(li);
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
    renderList(items);
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
  prefixInput.value = currentPrefix;
  renderBreadcrumb();
  updateUrl();
}

listBtn.addEventListener('click', () => {
  setCurrentPrefix(prefixInput.value.trim());
  loadList();
});

upBtn.addEventListener('click', () => {
  if (!canGoUp()) return;
  setCurrentPrefix(getParentPrefix(currentPrefix));
  loadList();
});

breadcrumb.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-prefix]');
  if (!link) return;
  event.preventDefault();
  setCurrentPrefix(link.dataset.prefix ?? '');
  loadList();
});

fileList.addEventListener('click', (event) => {
  const upItem = event.target.closest('li[data-kind="up"]');
  if (upItem) {
    setCurrentPrefix(getParentPrefix(currentPrefix));
    loadList();
    return;
  }

  const folderItem = event.target.closest('li[data-kind="folder"]');
  if (folderItem) {
    const path = folderItem.dataset.path;
    if (path) {
      setCurrentPrefix(path);
      loadList();
      previewPane.textContent = 'Select a file to preview';
    }
    return;
  }

  const button = event.target.closest('.preview-btn');
  if (button) {
    const name = button.getAttribute('data-name');
    if (name) {
      previewBlob(name);
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
