import { API_BASE, apiFetch, ensureHealth } from './config.js';
import { initProjectControls, onProjectChange, getSelectedProject, resolveOutputRoot, DEFAULT_PROJECT } from './projects.js';

const defaultOutputRoot = resolveOutputRoot(DEFAULT_PROJECT);
let currentProject = getSelectedProject();
let outputRoot = resolveOutputRoot(currentProject);

function updateOutputGlobals() {
  if (typeof window === 'undefined') {
    return;
  }
  window.basePrefix = outputRoot;
  window.outputBasePrefix = outputRoot;
  window.outputCurrentPrefix = currentPrefix;
}

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageSummary = document.getElementById('pageSummary');
const sortableHeaders = document.querySelectorAll('#fileTable th.sortable');
const previewPane = document.getElementById('previewPane');
const copyPreviewBtn = document.getElementById('copyPreviewBtn');
const copyPreviewLabel = copyPreviewBtn ? copyPreviewBtn.querySelector('.btn-copy-label') : null;
const alertContainer = document.getElementById('alertContainer');
const breadcrumb = document.getElementById('breadcrumb');

let currentPrefix = outputRoot;
updateOutputGlobals();
let activePreview = { name: '', contentType: '' };
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let sortKey = 'lastModified';
let sortDirection = 'desc';
let sortOverrideActive = false;
let searchDebounce;
let lastPreviewText = '';
let listRequestToken = 0;
const copyButtonDefaultLabel = copyPreviewLabel ? copyPreviewLabel.textContent.trim() : 'Copy';

const urlParams = new URLSearchParams(window.location.search);
let pendingInitialPrefix = urlParams.get('prefix');

function appendPreviewBlock(text) {
  if (!previewPane) return;
  const pre = document.createElement('pre');
  pre.className = 'preview-block';
  pre.textContent = text;
  previewPane.appendChild(pre);
}

function getSqlDialects(name = '', contentType = '') {
  const hints = `${name || ''} ${contentType || ''}`.toLowerCase();
  const dialects = [];
  const push = (dialect) => {
    if (dialect && !dialects.includes(dialect)) {
      dialects.push(dialect);
    }
  };

  if (/postgres|redshift|timescale|aurora-postgres/.test(hints)) push('postgresql');
  if (/mysql|maria|aurora-mysql/.test(hints)) push('mysql');
  if (/sqlserver|tsql|mssql/.test(hints)) push('tsql');
  if (/bigquery|bq/.test(hints)) push('bigquery');
  if (/snowflake/.test(hints)) push('snowflake');
  if (/spark|databricks/.test(hints)) push('spark');
  if (/sqlite/.test(hints)) push('sqlite');
  if (/oracle|plsql/.test(hints)) push('plsql');
  if (/db2/.test(hints)) push('db2');
  push('sql');

  return dialects;
}

function hasMeaningfulSqlFormatting(original, formatted) {
  if (typeof formatted !== 'string' || !formatted.trim()) {
    return false;
  }

  const originalTrimmed = (original || '').trim();
  const formattedTrimmed = formatted.trim();

  if (!originalTrimmed) {
    return !!formattedTrimmed;
  }

  if (originalTrimmed === formattedTrimmed && !/\n/.test(formattedTrimmed)) {
    return false;
  }

  const originalLines = originalTrimmed.split(/\r?\n/).length;
  const formattedLines = formattedTrimmed.split(/\r?\n/).length;
  if (formattedLines > originalLines) {
    return true;
  }

  return originalTrimmed !== formattedTrimmed;
}

function basicSqlFallback(text = '') {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let working = text.replace(/\s+/g, ' ').trim();
  if (!working) {
    return text;
  }

  working = working.replace(/^SELECT\s+/i, 'SELECT\n  ');

  const majorBreaks = [
    'SELECT',
    'FROM',
    'WHERE',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
    'FULL JOIN',
    'OUTER JOIN',
    'JOIN',
    'ON',
    'UNION',
    'UNION ALL',
    'EXCEPT',
    'INTERSECT',
    'LIMIT',
    'OFFSET',
    'VALUES',
    'SET',
    'INSERT INTO',
    'UPDATE',
    'DELETE FROM',
  ];

  for (const keyword of majorBreaks) {
    const pattern = new RegExp(`\\s+${keyword.replace(/\s+/g, '\\s+')}(?=\\b)`, 'gi');
    working = working.replace(pattern, (match) => `\n${match.trim()}`);
  }

  working = working.replace(/,\s*/g, ',\n  ');
  working = working.replace(/\(\s*/g, ' (\n  ');
  working = working.replace(/\s*\)/g, '\n)');
  working = working.replace(/\n{2,}/g, '\n');

  return working.trim();
}

function formatSqlContent(text, { name = '', contentType = '' } = {}) {
  let formatted;

  if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
    const candidates = getSqlDialects(name, contentType);
    for (const language of candidates) {
      const attempts = [
        { language, keywordCase: 'upper', tabWidth: 2 },
        { language },
      ];

      for (const config of attempts) {
        try {
          const result = window.sqlFormatter.format(text, config);
          if (hasMeaningfulSqlFormatting(text, result)) {
            return result;
          }
        } catch (error) {
          // try next config
        }
      }
    }
  }

  formatted = basicSqlFallback(text);
  if (hasMeaningfulSqlFormatting(text, formatted)) {
    return formatted;
  }

  return text;
}

function setCopyButtonLabel(text) {
  if (!copyPreviewBtn) return;
  const labelEl = copyPreviewBtn.querySelector('.btn-copy-label');
  if (labelEl) {
    labelEl.textContent = text;
  } else {
    copyPreviewBtn.textContent = text;
  }
  copyPreviewBtn.setAttribute('aria-label', text);
  copyPreviewBtn.setAttribute('title', text);
}

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
  let raw = (value ?? '').toString().trim();
  if (!raw) {
    return '';
  }
  raw = raw.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '');
  if (!raw) {
    return '';
  }

  const segments = raw.split('/').filter(Boolean);
  const sanitised = [];

  for (const segment of segments) {
    if (segment === '.' || !segment) {
      continue;
    }
    if (segment === '..') {
      sanitised.pop();
      continue;
    }
    sanitised.push(segment);
  }

  if (!sanitised.length) {
    return '';
  }

  return `${sanitised.join('/')}/`;
}

function formatSize(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clampToOutputRoot(prefix) {
  const base = normalisePrefix(outputRoot);
  const candidate = prefix ? normalisePrefix(prefix) : base;
  if (!candidate.startsWith(base)) {
    return base;
  }
  return candidate || base;
}

function getParentPrefix(prefix) {
  const normalised = clampToOutputRoot(prefix);
  const base = normalisePrefix(outputRoot);
  if (normalised === base) {
    return base;
  }
  const trimmed = normalised.replace(/\/$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash === -1) {
    return base;
  }
  const candidate = `${trimmed.slice(0, lastSlash)}/`;
  return candidate.startsWith(base) ? candidate : base;
}

function canGoUp() {
  return clampToOutputRoot(currentPrefix) !== normalisePrefix(outputRoot);
}

function updateUrl() {
  const url = new URL(window.location.href);
  const base = clampToOutputRoot(outputRoot);
  const defaultBase = normalisePrefix(defaultOutputRoot);
  const current = clampToOutputRoot(currentPrefix);
  if (current && (current !== base || base !== defaultBase)) {
    url.searchParams.set('prefix', current);
  } else {
    url.searchParams.delete('prefix');
  }
  const search = url.searchParams.toString();
  const next = search ? `${url.pathname}?${search}` : url.pathname;
  window.history.replaceState(null, '', next);
}

function formatSegmentLabel(segment) {
  if (!segment) return '';
  try {
    return decodeURIComponent(segment).replace(/\+/g, ' ');
  } catch (error) {
    return segment;
  }
}

const FOLDER_ICON_MARKUP = '<span class="item-icon folder" aria-hidden="true"><svg viewBox="0 0 32 24" role="presentation" focusable="false"><path d="M3.5 6.25A2.25 2.25 0 0 1 5.75 4h6.06c.6 0 1.18.24 1.6.66l1.64 1.71h11.2A2.25 2.25 0 0 1 28.5 8.62l-.92 10.13A2.25 2.25 0 0 1 25.35 21H6.15A2.65 2.65 0 0 1 3.5 18.35V6.25Z" fill="#f8bd54"></path><path d="M28.8 9.75H4.2V18.4c0 1.03.84 1.85 1.85 1.85h17.9c.93 0 1.71-.67 1.83-1.58l1.02-8.92Z" fill="#fcd481"></path></svg></span>';

const EXTENSION_ICON_MAP = {
  csv: 'csv',
  tsv: 'csv',
  txt: 'txt',
  log: 'txt',
  json: 'json',
  ndjson: 'json',
  xls: 'excel',
  xlsx: 'excel',
  xlsm: 'excel',
  xlsb: 'excel',
  sql: 'sql',
  xml: 'xml',
  pdf: 'pdf',
};

const ICON_CLASS_BY_VARIANT = {
  csv: 'bi bi-filetype-csv',
  txt: 'bi bi-filetype-txt',
  json: 'bi bi-filetype-json',
  excel: 'bi bi-file-earmark-excel',
  sql: 'bi bi-filetype-sql',
  xml: 'bi bi-filetype-xml',
  pdf: 'bi bi-file-earmark-pdf',
  default: 'bi bi-file-earmark',
};

function getFileIconInfo(name = '') {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match ? match[1] : '';
  const variant = EXTENSION_ICON_MAP[extension] || 'default';
  const iconClass = ICON_CLASS_BY_VARIANT[variant] || ICON_CLASS_BY_VARIANT.default;
  const wrapperClass = variant;
  return { iconClass, wrapperClass };
}

function renderBreadcrumb() {
  if (!breadcrumb) return;
  breadcrumb.innerHTML = '';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'breadcrumb');
  const ol = document.createElement('ol');
  ol.className = 'breadcrumb mb-0';

  const normalised = clampToOutputRoot(currentPrefix).replace(/\/$/, '');
  const segments = normalised ? normalised.split('/').filter(Boolean) : [];
  if (!segments.length) {
    segments.push('output');
  }

  let cumulative = '';
  const isScopedProject = currentProject && currentProject !== DEFAULT_PROJECT;
  segments.forEach((segment, index) => {
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    const li = document.createElement('li');
    const isLast = index === segments.length - 1;
    const shouldLink = !isLast && (!isScopedProject || index > 0);
    if (isLast) {
      li.className = 'breadcrumb-item active';
      li.textContent = formatSegmentLabel(segment);
    } else {
      li.className = 'breadcrumb-item';
      if (shouldLink) {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = formatSegmentLabel(segment);
        link.dataset.prefix = `${cumulative}/`;
        li.appendChild(link);
      } else {
        li.textContent = formatSegmentLabel(segment);
      }
    }
    ol.appendChild(li);
  });

  nav.appendChild(ol);
  breadcrumb.appendChild(nav);
}

function resetPreview(message = 'Select a file to preview') {
  previewPane.textContent = message;
  previewPane.classList.remove('preview-pane-html');
  activePreview = { name: '', contentType: '' };
  lastPreviewText = '';
  if (copyPreviewBtn) {
    copyPreviewBtn.disabled = true;
    setCopyButtonLabel(copyButtonDefaultLabel);
  }
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
          <span class="item-icon up" aria-hidden="true"><i class="bi bi-arrow-left-short"></i></span>
          <span class="text-body-secondary">Back</span>
        </div>
      </td>
      <td></td>
      <td class="text-end"></td>
      <td></td>
      <td class="text-end"></td>
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
      const targetPath = normalisePrefix(item.name);
      row.dataset.path = targetPath;
      row.classList.add('folder-row');
      row.innerHTML = `
        <td>
          <div class="d-flex align-items-center gap-2">
            ${FOLDER_ICON_MARKUP}
            <span class="item-name">${item.displayName}</span>
          </div>
        </td>
        <td class="text-muted">Folder</td>
        <td class="text-end"></td>
        <td></td>
        <td class="text-end"></td>
      `;
    } else {
      const timestamp = item.lastModified ? new Date(item.lastModified).toLocaleString() : '';
      row.dataset.path = item.name;
      const iconInfo = getFileIconInfo(item.name);
      const iconClasses = ['item-icon', 'file'];
      if (iconInfo.wrapperClass) {
        iconClasses.push(iconInfo.wrapperClass);
      } else {
        iconClasses.push('default');
      }
      const iconMarkup = `<span class="${iconClasses.join(' ')}" aria-hidden="true"><i class="${iconInfo.iconClass}"></i></span>`;
      row.innerHTML = `
        <td>
          <div class="d-flex align-items-center gap-2">
            ${iconMarkup}
            <span class="item-name">${item.displayName}</span>
          </div>
        </td>
        <td>File</td>
        <td class="text-end">${formatSize(item.size ?? 0)}</td>
        <td>${timestamp}</td>
        <td class="text-end">
          <div class="d-inline-flex flex-wrap gap-2 justify-content-end">
            <button class="btn btn-soft btn-sm preview-btn" data-name="${item.name}" type="button">
              View
            </button>
            <a class="btn btn-soft btn-sm" data-download="true" href="${API_BASE}/output/download?blob=${encodeURIComponent(item.name)}" download>
              Download
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
  previewPane.classList.remove('preview-pane-html');
  const lowerContentType = (contentType || '').toLowerCase();

  const isHtmlPreview =
    lowerContentType.includes('text/html') || /\.(html?)$/i.test(activePreview.name || '');

  if (isHtmlPreview) {
    previewPane.classList.add('preview-pane-html');
    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.setAttribute('sandbox', '');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = content;
    previewPane.appendChild(iframe);
    return content;
  }

  if (lowerContentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      appendPreviewBlock(formatted);
      return formatted;
    } catch {
      // fall through
    }
  }

  if (lowerContentType.includes('text/csv')) {
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
    return content;
  }

  if (
    lowerContentType.includes('sql') ||
    activePreview.name.toLowerCase().endsWith('.sql') ||
    /\.(psql|tsql|ddl)$/i.test(activePreview.name)
  ) {
    const formatted = formatSqlContent(content, {
      name: activePreview.name,
      contentType,
    });
    appendPreviewBlock(formatted);
    return formatted;
  }

  appendPreviewBlock(content);
  return content;
}

async function loadList() {
  const requestPrefix = currentPrefix;
  const token = ++listRequestToken;
  try {
    const items = await apiFetch(`/output/list?prefix=${encodeURIComponent(requestPrefix)}`);
    if (token !== listRequestToken || requestPrefix !== currentPrefix) {
      return;
    }
    const nextItems = Array.isArray(items) ? items : [];
    allItems = nextItems;
    if (!sortOverrideActive) {
      applyDefaultSort(allItems);
    }
    applyFilters({ resetPage: true });
    updateSortIndicators();
  } catch (error) {
    if (token !== listRequestToken || requestPrefix !== currentPrefix) {
      return;
    }
    showAlert(error.message || 'Failed to list output files');
  }
}

async function previewBlob(name) {
  activePreview = { name, contentType: '' };
  previewPane.textContent = 'Loading preview...';
  previewPane.classList.remove('preview-pane-html');
  lastPreviewText = '';
  if (copyPreviewBtn) {
    copyPreviewBtn.disabled = true;
    setCopyButtonLabel(copyButtonDefaultLabel);
  }
  try {
    const response = await fetch(`${API_BASE}/output/preview?blob=${encodeURIComponent(name)}`);
    if (response.status === 413) {
      previewPane.textContent = 'File is too large or not previewable. Please download instead.';
      previewPane.classList.remove('preview-pane-html');
      lastPreviewText = '';
      return;
    }
    if (!response.ok) {
      throw new Error('Unable to preview file');
    }
    const contentType = response.headers.get('content-type') || 'text/plain';
    activePreview.contentType = contentType;
    const text = await response.text();
    const copyValue = renderPreview(text, contentType);
    lastPreviewText = typeof copyValue === 'string' ? copyValue : text;
    if (copyPreviewBtn) {
      copyPreviewBtn.disabled = !lastPreviewText;
      setCopyButtonLabel(copyButtonDefaultLabel);
    }
  } catch (error) {
    previewPane.textContent = 'Preview failed.';
    previewPane.classList.remove('preview-pane-html');
    lastPreviewText = '';
    if (copyPreviewBtn) {
      copyPreviewBtn.disabled = true;
      setCopyButtonLabel(copyButtonDefaultLabel);
    }
    showAlert(error.message || 'Preview failed');
  }
}

function setCurrentPrefix(prefix) {
  currentPrefix = clampToOutputRoot(prefix);
  updateOutputGlobals();
  sortOverrideActive = false;
  renderBreadcrumb();
  updateUrl();
}

function applyDefaultSort(items) {
  if (!Array.isArray(items) || items.length === 0) {
    sortKey = 'lastModified';
    sortDirection = 'desc';
    return;
  }
  const hasFolders = items.some((item) => item.kind === 'folder');
  if (hasFolders) {
    sortKey = 'displayName';
    sortDirection = 'asc';
  } else {
    sortKey = 'lastModified';
    sortDirection = 'desc';
  }
}

resetPreview();

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
    sortOverrideActive = true;
    updateSortIndicators();
    applyFilters();
  });
});

breadcrumb.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-prefix]');
  if (!link) return;
  event.preventDefault();
  setCurrentPrefix(link.dataset.prefix ?? outputRoot);
  loadList();
  resetPreview();
});

fileList.addEventListener('click', (event) => {
  const upItem = event.target.closest('tr[data-kind="up"]');
  if (upItem) {
    setCurrentPrefix(getParentPrefix(currentPrefix));
    loadList();
    resetPreview();
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
      resetPreview();
    }
  }
});

if (copyPreviewBtn) {
  copyPreviewBtn.addEventListener('click', async () => {
    if (!lastPreviewText) {
      return;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      showAlert('Clipboard copying is not supported in this browser.', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastPreviewText);
      setCopyButtonLabel('Copied!');
      setTimeout(() => {
        setCopyButtonLabel(copyButtonDefaultLabel);
      }, 1500);
    } catch (error) {
      showAlert('Failed to copy preview to the clipboard.', 'danger');
    }
  });
}

(async () => {
  try {
    await ensureHealth();
await initProjectControls();
await ensureHealth();
const handleProjectChange = async (project) => {
  currentProject = project;
  outputRoot = resolveOutputRoot(project);
  const base = clampToOutputRoot(outputRoot);
  let nextPrefix = base;
  if (pendingInitialPrefix) {
    const candidate = normalisePrefix(pendingInitialPrefix);
    if (candidate && candidate.startsWith(base)) {
      nextPrefix = candidate;
    }
    pendingInitialPrefix = null;
  }
  setCurrentPrefix(nextPrefix);
  if (searchInput) {
    searchInput.value = '';
  }
  currentPage = 1;
  sortOverrideActive = false;
  allItems = [];
  filteredItems = [];
  resetPreview();
  applyFilters({ resetPage: true });
  await loadList();
};

onProjectChange((project) => {
  handleProjectChange(project).catch((error) => {
    showAlert(error.message || 'Failed to load output files');
  });
}, { immediate: true });
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();
