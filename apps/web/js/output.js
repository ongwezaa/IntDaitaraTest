import { API_BASE, apiFetch, ensureHealth } from './config.js';

const prefixInput = document.getElementById('prefixInput');
const listBtn = document.getElementById('listBtn');
const fileList = document.getElementById('fileList');
const previewPane = document.getElementById('previewPane');
const alertContainer = document.getElementById('alertContainer');

function showAlert(message, type = 'danger') {
  const wrapper = document.createElement('div');
  wrapper.className = `alert alert-${type} alert-dismissible fade show mt-3`;
  wrapper.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  alertContainer.appendChild(wrapper);
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderList(items) {
  fileList.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = 'No files found';
    fileList.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <div>
        <div class="fw-semibold">${item.name}</div>
        <small class="text-muted">${formatSize(item.size)} • ${new Date(item.lastModified).toLocaleString()}</small>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary me-2 preview-btn" data-name="${item.name}">Preview</button>
        <a class="btn btn-sm btn-success" href="${API_BASE}/output/download?blob=${encodeURIComponent(item.name)}">Download</a>
      </div>
    `;
    fileList.appendChild(li);
  });
}

function renderPreview(content, contentType) {
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(content);
      previewPane.textContent = JSON.stringify(parsed, null, 2);
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
        const td = document.createElement(index === 0 ? 'th' : 'td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    previewPane.innerHTML = '';
    previewPane.appendChild(table);
    return;
  }
  previewPane.textContent = content;
}

async function loadList() {
  try {
    const prefix = prefixInput.value || 'output/';
    const items = await apiFetch(`/output/list?prefix=${encodeURIComponent(prefix)}`);
    renderList(items);
  } catch (error) {
    showAlert(error.message || 'Failed to list output files');
  }
}

async function previewBlob(name) {
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
    const text = await response.text();
    renderPreview(text, contentType);
  } catch (error) {
    previewPane.textContent = 'Preview failed.';
    showAlert(error.message || 'Preview failed');
  }
}

listBtn.addEventListener('click', loadList);

fileList.addEventListener('click', (event) => {
  const button = event.target.closest('.preview-btn');
  if (button) {
    const name = button.getAttribute('data-name');
    previewBlob(name);
  }
});

(async () => {
  try {
    await ensureHealth();
    const params = new URLSearchParams(window.location.search);
    const prefix = params.get('prefix') || 'output/';
    prefixInput.value = prefix;
    await loadList();
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();
