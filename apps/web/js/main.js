import { API_BASE, apiFetch, ensureHealth } from './config.js';
import {
  initProjectControls,
  onProjectChange,
  getSelectedProject,
  resolveInputRoot,
  DEFAULT_PROJECT,
  refreshProjectsList,
} from './projects.js';

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageSummary = document.getElementById('pageSummary');
const sortableHeaders = document.querySelectorAll('#fileTable th.sortable');
const breadcrumb = document.getElementById('breadcrumb');
const uploadInput = document.getElementById('uploadInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadSpinner = document.getElementById('uploadSpinner');
const createFolderBtn = document.getElementById('createFolderBtn');
const createFolderModalEl = document.getElementById('createFolderModal');
const folderNameInput = document.getElementById('folderNameInput');
const createFolderConfirmBtn = document.getElementById('createFolderConfirmBtn');
const previewModalEl = document.getElementById('previewModal');
const previewPane = document.getElementById('previewPane');
const previewModalTitle = document.getElementById('previewModalTitle');
const copyPreviewBtn = document.getElementById('copyPreviewBtn');
const alertContainer = document.getElementById('alertContainer');
const renameModalEl = document.getElementById('renameModal');
const renameNameInput = document.getElementById('renameNameInput');
const renameConfirmBtn = document.getElementById('renameConfirmBtn');
const deleteModalEl = document.getElementById('deleteModal');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
const deleteTargetName = document.getElementById('deleteTargetName');

const fileSelect = document.getElementById('fileSelect');
const configSelect = document.getElementById('configSelect');
const sourcePromptSelect = document.getElementById('sourcePromptSelect');
const selectPromptSelect = document.getElementById('selectPromptSelect');
const targetTypeSelect = document.getElementById('targetType');
const targetEnvSelect = document.getElementById('targetEnv');
const mockRowCountInput = document.getElementById('mockRowCount');
const autoTeardownSelect = document.getElementById('autoTeardown');
const generateDdlSelect = document.getElementById('generateDdl');
const parametersPreview = document.getElementById('parametersPreview');
const triggerBtn = document.getElementById('triggerBtn');
const triggerSpinner = document.getElementById('triggerSpinner');
const resetParamsBtn = document.getElementById('resetParamsBtn');

const copyButtonDefaultLabel = copyPreviewBtn
  ? copyPreviewBtn.querySelector('.btn-copy-label')?.textContent?.trim() ?? 'Copy'
  : 'Copy';

let bootstrapModal;
let folderModal;
let renameModal;
let deleteModal;
let currentProject = getSelectedProject();
let inputRoot = resolveInputRoot(currentProject);
let currentPrefix = inputRoot;
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let sortKey = 'lastModified';
let sortDirection = 'desc';
let sortOverrideActive = false;
let searchDebounce;
let lastPreviewText = '';
let allFilesFlat = [];
let hasInitialisedParams = false;
let renameContext = null;
let deleteContext = null;
let currentPreviewName = '';

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

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value = '') {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function getInputSegments(prefix = '') {
  const base = inputRoot.replace(/\/$/, '');
  const trimmed = prefix.replace(/\/$/, '');
  if (!trimmed || trimmed === base) {
    return [];
  }
  if (base && trimmed.startsWith(`${base}/`)) {
    const relative = trimmed.slice(base.length + 1);
    return relative ? relative.split('/').filter(Boolean) : [];
  }
  const segments = trimmed ? trimmed.split('/').filter(Boolean) : [];
  const baseSegments = base ? base.split('/').filter(Boolean) : [];
  while (segments.length && baseSegments.length && segments[0] === baseSegments[0]) {
    segments.shift();
    baseSegments.shift();
  }
  if (!base && segments[0] === 'input') {
    segments.shift();
  }
  return segments;
}

function formatRelativePath(path = '') {
  if (!path) return '';
  const trimmed = path.replace(/\/$/, '');
  const base = inputRoot.replace(/\/$/, '');
  if (!trimmed || trimmed === base) {
    return '';
  }
  if (base && trimmed.startsWith(`${base}/`)) {
    return trimmed.slice(base.length + 1);
  }
  if (trimmed.startsWith('input/')) {
    return trimmed.slice('input/'.length);
  }
  return trimmed;
}

function formatFriendlyPath(path = '') {
  const trimmed = path.replace(/\/$/, '');
  const base = inputRoot.replace(/\/$/, '');
  const baseLabel = base ? `root/${base}` : 'root/input';
  const relative = formatRelativePath(trimmed);
  return relative ? `${baseLabel}/${relative}` : baseLabel;
}

function showAlert(message, type = 'danger') {
  const wrapper = document.createElement('div');
  wrapper.className = `alert alert-${type} alert-dismissible fade show`;
  wrapper.role = 'alert';
  wrapper.innerHTML = `
    ${escapeHtml(String(message))}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  alertContainer?.appendChild(wrapper);
}

function normalisePrefix(value) {
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}

function clampToInputRoot(prefix) {
  const base = normalisePrefix(inputRoot);
  const candidate = prefix ? normalisePrefix(prefix) : base;
  if (!candidate.startsWith(base)) {
    return base;
  }
  return candidate || base;
}

function getParentPrefix(prefix) {
  const trimmed = prefix.replace(/\/$/, '');
  if (!trimmed) return '';
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash === -1) return '';
  const parent = trimmed.slice(0, lastSlash + 1);
  return parent || '';
}

function canGoUp() {
  return normalisePrefix(currentPrefix) !== normalisePrefix(inputRoot);
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

function formatSize(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

  const segments = getInputSegments(currentPrefix);
  const basePrefix = normalisePrefix(inputRoot);

  if (segments.length) {
    const rootLi = document.createElement('li');
    rootLi.className = 'breadcrumb-item';
    const rootLink = document.createElement('a');
    rootLink.href = '#';
    rootLink.textContent = 'root';
    rootLink.dataset.prefix = basePrefix;
    rootLi.appendChild(rootLink);
    ol.appendChild(rootLi);
  } else {
    const rootOnly = document.createElement('li');
    rootOnly.className = 'breadcrumb-item active';
    rootOnly.textContent = 'root';
    ol.appendChild(rootOnly);
  }

  let cumulative = basePrefix.replace(/\/$/, '');
  segments.forEach((segment, index) => {
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    const li = document.createElement('li');
    const isLast = index === segments.length - 1;
    if (isLast) {
      li.className = 'breadcrumb-item active';
      li.textContent = formatSegmentLabel(segment);
    } else {
      li.className = 'breadcrumb-item';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = formatSegmentLabel(segment);
      link.dataset.prefix = `${cumulative}/`;
      li.appendChild(link);
    }
    ol.appendChild(li);
  });

  nav.appendChild(ol);
  breadcrumb.appendChild(nav);
}

function resetPreview(message = 'Select a file to preview') {
  if (previewPane) {
    previewPane.textContent = message;
  }
  lastPreviewText = '';
  if (copyPreviewBtn) {
    copyPreviewBtn.disabled = true;
    setCopyButtonLabel(copyButtonDefaultLabel);
  }
}

function renderList(items) {
  if (!fileList) return;
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
      <td></td>
      <td></td>
      <td></td>
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
    row.dataset.path = item.name;
    if (item.kind === 'folder') {
      row.classList.add('folder-row');
      row.innerHTML = `
        <td>
          <div class="d-flex align-items-center gap-2">
            ${FOLDER_ICON_MARKUP}
            <span class="item-name">${escapeHtml(item.displayName)}</span>
          </div>
        </td>
        <td class="text-muted">Folder</td>
        <td></td>
        <td></td>
        <td class="text-end">
          <div class="d-inline-flex gap-2 justify-content-end">
            <div class="btn-group" role="group">
              <button
                class="btn btn-soft btn-sm dropdown-toggle manage-btn"
                data-bs-toggle="dropdown"
                data-bs-display="static"
                type="button"
                aria-label="Manage"
                title="Manage"
              >
                <span aria-hidden="true" class="manage-ellipsis">⋯</span>
                <span class="visually-hidden">Manage</span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button class="dropdown-item rename-action" data-name="${escapeAttr(item.name)}" data-kind="folder" data-display="${escapeAttr(item.displayName)}" type="button">Rename</button></li>
                <li><hr class="dropdown-divider" /></li>
                <li><button class="dropdown-item text-danger delete-action" data-name="${escapeAttr(item.name)}" data-kind="folder" data-display="${escapeAttr(item.displayName)}" type="button">Delete</button></li>
              </ul>
            </div>
          </div>
        </td>
      `;
    } else {
      const iconInfo = getFileIconInfo(item.name);
      const iconClasses = ['item-icon', 'file'];
      if (iconInfo.wrapperClass) {
        iconClasses.push(iconInfo.wrapperClass);
      }
      const iconMarkup = `<span class="${iconClasses.join(' ')}" aria-hidden="true"><i class="${iconInfo.iconClass}"></i></span>`;
      row.innerHTML = `
        <td>
          <div class="d-flex align-items-center gap-2">
            ${iconMarkup}
            <span class="item-name">${escapeHtml(item.displayName)}</span>
          </div>
        </td>
        <td>File</td>
        <td class="text-end">${formatSize(item.size ?? 0)}</td>
        <td>${escapeHtml(formatDate(item.lastModified))}</td>
        <td class="text-end">
          <div class="d-inline-flex flex-wrap gap-2 justify-content-end">
            <button class="btn btn-soft btn-sm preview-btn" data-name="${escapeAttr(item.name)}" type="button">View</button>
            <a class="btn btn-soft btn-sm" data-download="true" href="${API_BASE}/output/download?blob=${encodeURIComponent(item.name)}" download>
              Download
            </a>
            <div class="btn-group" role="group">
              <button
                class="btn btn-soft btn-sm dropdown-toggle manage-btn"
                data-bs-toggle="dropdown"
                data-bs-display="static"
                type="button"
                aria-label="Manage"
                title="Manage"
              >
                <span aria-hidden="true" class="manage-ellipsis">⋯</span>
                <span class="visually-hidden">Manage</span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button class="dropdown-item rename-action" data-name="${escapeAttr(item.name)}" data-kind="file" data-display="${escapeAttr(item.displayName)}" type="button">Rename</button></li>
                <li><hr class="dropdown-divider" /></li>
                <li><button class="dropdown-item text-danger delete-action" data-name="${escapeAttr(item.name)}" data-kind="file" data-display="${escapeAttr(item.displayName)}" type="button">Delete</button></li>
              </ul>
            </div>
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
      : 'No items to display';
  }
  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages || totalItems === 0;
}

function applyFilters({ resetPage = false } = {}) {
  const term = searchInput?.value.trim().toLowerCase() ?? '';
  filteredItems = allItems.filter((item) => {
    if (!term) return true;
    const haystack = `${item.displayName} ${item.name.replace(/^input\//, '')}`.toLowerCase();
    return haystack.includes(term);
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
  if (!previewPane) return;
  previewPane.innerHTML = '';
  const lowerContentType = (contentType || '').toLowerCase();

  if (lowerContentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      appendPreviewBlock(formatted);
      return formatted;
    } catch {
      // ignore parse errors
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
    currentPreviewName.toLowerCase().endsWith('.sql') ||
    /\.(psql|tsql|ddl)$/i.test(currentPreviewName)
  ) {
    const formatted = formatSqlContent(content, {
      name: currentPreviewName,
      contentType,
    });
    appendPreviewBlock(formatted);
    return formatted;
  }

  appendPreviewBlock(content);
  return content;
}

async function loadList() {
  try {
    const items = await apiFetch(`/files/list?prefix=${encodeURIComponent(currentPrefix)}&hierarchical=true`);
    allItems = Array.isArray(items)
      ? items.map((item) => {
          const fallback = formatRelativePath(item.name) || item.name;
          const friendlyName = typeof item.displayName === 'string' && item.displayName.trim()
            ? item.displayName
            : fallback;
          return {
            ...item,
            displayName: friendlyName,
          };
        })
      : [];
    if (!sortOverrideActive) {
      applyDefaultSort(allItems);
    }
    applyFilters({ resetPage: true });
    updateSortIndicators();
  } catch (error) {
    showAlert(error.message || 'Failed to list files');
  }
}

async function previewBlob(name) {
  if (!previewPane) return;
  currentPreviewName = name || '';
  previewPane.textContent = 'Loading preview...';
  lastPreviewText = '';
  if (copyPreviewBtn) {
    copyPreviewBtn.disabled = true;
    setCopyButtonLabel(copyButtonDefaultLabel);
  }
  try {
    const response = await fetch(`${API_BASE}/output/preview?blob=${encodeURIComponent(name)}`);
    if (response.status === 413) {
      previewPane.textContent = 'File is too large or not previewable. Please download instead.';
      lastPreviewText = '';
      return;
    }
    if (!response.ok) {
      throw new Error('Unable to preview file');
    }
    const contentType = response.headers.get('content-type') || 'text/plain';
    const relativeName = formatRelativePath(name) || name;
    previewModalTitle.textContent = `Preview • ${relativeName}`;
    const text = await response.text();
    const copyValue = renderPreview(text, contentType);
    lastPreviewText = typeof copyValue === 'string' ? copyValue : text;
    if (copyPreviewBtn) {
      copyPreviewBtn.disabled = !lastPreviewText;
      setCopyButtonLabel(copyButtonDefaultLabel);
    }
  } catch (error) {
    previewPane.textContent = 'Preview failed.';
    lastPreviewText = '';
    if (copyPreviewBtn) {
      copyPreviewBtn.disabled = true;
      setCopyButtonLabel(copyButtonDefaultLabel);
    }
    showAlert(error.message || 'Preview failed');
  }
}

function setCurrentPrefix(prefix) {
  currentPrefix = clampToInputRoot(prefix);
  sortOverrideActive = false;
  renderBreadcrumb();
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

function populateSelect(selectEl, files, placeholder) {
  if (!selectEl) return;
  const previousValue = selectEl.value;
  selectEl.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  selectEl.appendChild(placeholderOption);

  files.forEach((file) => {
    const option = document.createElement('option');
    const relativeName = formatRelativePath(file.name) || file.name;
    option.value = relativeName;
    option.textContent = relativeName;
    selectEl.appendChild(option);
  });

  if (
    previousValue &&
    files.some((f) => (formatRelativePath(f.name) || f.name) === previousValue)
  ) {
    selectEl.value = previousValue;
  }
}

function applyParameterDefaults() {
  if (targetTypeSelect && targetTypeSelect.querySelector('option[value="Postgres"]')) {
    targetTypeSelect.value = 'Postgres';
  }
  if (targetEnvSelect && targetEnvSelect.querySelector('option[value="DEV"]')) {
    targetEnvSelect.value = 'DEV';
  }
  if (mockRowCountInput && !mockRowCountInput.value) {
    mockRowCountInput.value = '200';
  }
  if (autoTeardownSelect && autoTeardownSelect.querySelector('option[value="false"]')) {
    autoTeardownSelect.value = 'false';
  }
  if (generateDdlSelect && generateDdlSelect.querySelector('option[value="true"]')) {
    generateDdlSelect.value = 'true';
  }
}

async function loadFlatFiles() {
  try {
    const files = await apiFetch(`/files/list?prefix=${encodeURIComponent(inputRoot)}`);
    allFilesFlat = Array.isArray(files) ? files : [];
    populateSelect(fileSelect, allFilesFlat, 'Select source file');
    populateSelect(configSelect, allFilesFlat, 'Select config file');
    populateSelect(sourcePromptSelect, allFilesFlat, 'Select source prompt');
    populateSelect(selectPromptSelect, allFilesFlat, 'Select select prompt');
    if (!hasInitialisedParams) {
      applyParameterDefaults();
      hasInitialisedParams = true;
    }
    updateParametersPreview();
  } catch (error) {
    showAlert(error.message || 'Failed to load files for selection');
  }
}

function getBoolean(selectEl) {
  return selectEl?.value === 'true';
}

function updateParametersPreview() {
  if (!parametersPreview) return;
  const payload = {
    file: fileSelect?.value || '',
    config: configSelect?.value || '',
    sourceMappingPrompt: sourcePromptSelect?.value || '',
    selectMappingPrompt: selectPromptSelect?.value || '',
    target_type: targetTypeSelect?.value || 'Postgres',
    target_env: targetEnvSelect?.value || 'DEV',
    generate_ddl: getBoolean(generateDdlSelect),
    mock_row_count: Number(mockRowCountInput?.value) || 200,
    auto_teardown: getBoolean(autoTeardownSelect),
  };
  if (currentProject && currentProject !== DEFAULT_PROJECT) {
    payload.project = currentProject;
  }
  parametersPreview.value = JSON.stringify(payload, null, 2);
}

function toggleUploadLoading(isLoading) {
  if (!uploadBtn || !uploadSpinner) return;
  if (isLoading) {
    uploadBtn.setAttribute('disabled', 'true');
    uploadSpinner.classList.remove('d-none');
  } else {
    uploadBtn.removeAttribute('disabled');
    uploadSpinner.classList.add('d-none');
  }
}

function toggleTriggerLoading(isLoading) {
  if (!triggerBtn || !triggerSpinner) return;
  if (isLoading) {
    triggerBtn.setAttribute('disabled', 'true');
    triggerSpinner.classList.remove('d-none');
  } else {
    triggerBtn.removeAttribute('disabled');
    triggerSpinner.classList.add('d-none');
  }
}

async function createFolder() {
  const name = folderNameInput?.value.trim();
  if (!name) {
    showAlert('Please provide a project name', 'warning');
    return;
  }
  try {
    const result = await apiFetch('/files/folder', {
      method: 'POST',
      body: JSON.stringify({ parent: currentPrefix, name }),
    });
    folderModal?.hide();
    folderNameInput.value = '';
    await loadList();
    if (result?.folder) {
      showAlert(`Project created: ${formatFriendlyPath(result.folder)}`, 'success');
      await refreshProjectsList();
    }
  } catch (error) {
    showAlert(error.message || 'Failed to create project');
  }
}

async function uploadFile() {
  const file = uploadInput?.files?.[0];
  if (!file) {
    showAlert('Please choose a file to upload', 'warning');
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', currentPrefix);
  toggleUploadLoading(true);
  try {
    const response = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      body: formData,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error('Upload failed: unexpected response');
    }
    if (!response.ok) {
      throw new Error(data?.message || 'Upload failed');
    }
    showAlert(`Uploaded ${formatFriendlyPath(data.fileName)}`, 'success');
    if (uploadInput) uploadInput.value = '';
    await loadList();
    await loadFlatFiles();
  } catch (error) {
    showAlert(error.message || 'Upload failed');
  } finally {
    toggleUploadLoading(false);
  }
}

function parseParameters() {
  try {
    const parsed = JSON.parse(parametersPreview.value);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Parameters must be a JSON object');
    }
    return parsed;
  } catch (error) {
    throw new Error('Invalid JSON in Trigger parameters');
  }
}

async function triggerLogicApp() {
  try {
    const params = parseParameters();
    if (!params.file) {
      showAlert('Please select a source file before triggering', 'warning');
      return;
    }
    toggleTriggerLoading(true);
    const run = await apiFetch('/logicapp/trigger', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    showAlert(`Run created: ${run.id}`, 'success');
  } catch (error) {
    showAlert(error.message || 'Failed to trigger Logic App');
  } finally {
    toggleTriggerLoading(false);
  }
}

function resetParameters() {
  hasInitialisedParams = true;
  [fileSelect, configSelect, sourcePromptSelect, selectPromptSelect].forEach((selectEl) => {
    if (selectEl) {
      selectEl.value = '';
    }
  });
  applyParameterDefaults();
  updateParametersPreview();
}

function clearFileSelections() {
  [fileSelect, configSelect, sourcePromptSelect, selectPromptSelect].forEach((selectEl) => {
    if (selectEl) {
      selectEl.value = '';
    }
  });
}

function attachEventListeners() {
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
      const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
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
        sortDirection = key === 'size' || key === 'lastModified' ? 'desc' : 'asc';
      }
      sortOverrideActive = true;
      updateSortIndicators();
      applyFilters();
    });
  });

  if (breadcrumb) {
    breadcrumb.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-prefix]');
      if (!link) return;
      event.preventDefault();
      setCurrentPrefix(link.dataset.prefix ?? inputRoot);
      loadList();
      resetPreview();
    });
  }

  if (fileList) {
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
          previewBlob(name).then(() => {
            bootstrapModal?.show();
          });
        }
        return;
      }

      const renameButton = event.target.closest('.rename-action');
      if (renameButton) {
        const path = renameButton.getAttribute('data-name');
        const kind = renameButton.getAttribute('data-kind');
        const display = renameButton.getAttribute('data-display') || '';
        if (path && kind) {
          renameContext = { path, kind };
          if (renameNameInput) {
            renameNameInput.value = display;
          }
          renameModal?.show();
        }
        return;
      }

      const deleteButton = event.target.closest('.delete-action');
      if (deleteButton) {
        const path = deleteButton.getAttribute('data-name');
        const kind = deleteButton.getAttribute('data-kind');
        const display = deleteButton.getAttribute('data-display') || '';
        if (path && kind) {
          deleteContext = { path, kind };
          if (deleteTargetName) {
            deleteTargetName.textContent = display || path.split('/').pop() || path;
          }
          deleteModal?.show();
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
  }

  if (copyPreviewBtn) {
    copyPreviewBtn.addEventListener('click', async () => {
      if (!lastPreviewText) return;
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

  if (createFolderBtn) {
    createFolderBtn.addEventListener('click', () => {
      folderNameInput.value = '';
      folderModal?.show();
    });
  }

  if (createFolderConfirmBtn) {
    createFolderConfirmBtn.addEventListener('click', () => {
      createFolder();
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', uploadFile);
  }

  if (renameConfirmBtn) {
    renameConfirmBtn.addEventListener('click', renameItem);
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', deleteItem);
  }

  [fileSelect, configSelect, sourcePromptSelect, selectPromptSelect, targetTypeSelect, targetEnvSelect, mockRowCountInput, autoTeardownSelect, generateDdlSelect]
    .forEach((el) => {
      if (!el) return;
      el.addEventListener('change', updateParametersPreview);
      if (el === mockRowCountInput) {
        el.addEventListener('input', updateParametersPreview);
      }
    });

  if (parametersPreview) {
    parametersPreview.addEventListener('input', () => {
      // allow manual edits without immediate regeneration unless a control changes
    });
  }

  if (triggerBtn) {
    triggerBtn.addEventListener('click', triggerLogicApp);
  }

  if (resetParamsBtn) {
    resetParamsBtn.addEventListener('click', resetParameters);
  }
}

async function renameItem() {
  if (!renameContext) {
    showAlert('Nothing to rename', 'warning');
    return;
  }
  const newName = renameNameInput?.value.trim();
  if (!newName) {
    showAlert('Please provide a new name', 'warning');
    return;
  }
  try {
    const response = await apiFetch('/files/rename', {
      method: 'POST',
      body: JSON.stringify({ path: renameContext.path, newName }),
    });
    renameModal?.hide();
    const newPath = response?.path;
    if (renameContext.kind === 'folder' && typeof newPath === 'string') {
      const oldPrefix = normalisePrefix(renameContext.path);
      const nextPrefix = normalisePrefix(newPath);
      if (currentPrefix.startsWith(oldPrefix)) {
        const suffix = currentPrefix.slice(oldPrefix.length);
        setCurrentPrefix(`${nextPrefix}${suffix}`);
      }
    } else if (renameContext.kind === 'file' && typeof newPath === 'string') {
      [fileSelect, configSelect, sourcePromptSelect, selectPromptSelect].forEach((selectEl) => {
        if (selectEl && selectEl.value === renameContext.path) {
          selectEl.value = newPath;
        }
      });
      updateParametersPreview();
    }
    showAlert('Item renamed successfully', 'success');
    await loadList();
    await loadFlatFiles();
    resetPreview();
  } catch (error) {
    showAlert(error.message || 'Failed to rename item');
  } finally {
    renameContext = null;
  }
}

async function deleteItem() {
  if (!deleteContext) {
    showAlert('Nothing to delete', 'warning');
    return;
  }
  try {
    await apiFetch('/files/delete', {
      method: 'POST',
      body: JSON.stringify({ path: deleteContext.path }),
    });
    deleteModal?.hide();
    if (deleteContext.kind === 'folder') {
      const targetPrefix = normalisePrefix(deleteContext.path);
      if (currentPrefix.startsWith(targetPrefix)) {
        setCurrentPrefix(getParentPrefix(targetPrefix));
      }
    } else if (deleteContext.kind === 'file') {
      [fileSelect, configSelect, sourcePromptSelect, selectPromptSelect].forEach((selectEl) => {
        if (selectEl && selectEl.value === deleteContext.path) {
          selectEl.value = '';
        }
      });
      updateParametersPreview();
    }
    resetPreview();
    showAlert('Item deleted successfully', 'success');
    await loadList();
    await loadFlatFiles();
  } catch (error) {
    showAlert(error.message || 'Failed to delete item');
  } finally {
    deleteContext = null;
  }
}

(async () => {
  try {
    await initProjectControls();
    await ensureHealth();
    if (window.bootstrap) {
      bootstrapModal = new window.bootstrap.Modal(previewModalEl);
      folderModal = new window.bootstrap.Modal(createFolderModalEl);
      renameModal = new window.bootstrap.Modal(renameModalEl);
      deleteModal = new window.bootstrap.Modal(deleteModalEl);
      renameModalEl?.addEventListener('hidden.bs.modal', () => {
        renameContext = null;
        if (renameNameInput) {
          renameNameInput.value = '';
        }
      });
      deleteModalEl?.addEventListener('hidden.bs.modal', () => {
        deleteContext = null;
        if (deleteTargetName) {
          deleteTargetName.textContent = '';
        }
      });
    }

    const handleProjectChange = async (project) => {
      currentProject = project;
      inputRoot = resolveInputRoot(project);
      setCurrentPrefix(inputRoot);
      if (searchInput) {
        searchInput.value = '';
      }
      currentPage = 1;
      sortOverrideActive = false;
      allItems = [];
      filteredItems = [];
      allFilesFlat = [];
      hasInitialisedParams = false;
      clearFileSelections();
      resetPreview();
      updateParametersPreview();
      await Promise.all([loadList(), loadFlatFiles()]);
    };

    onProjectChange((project) => {
      handleProjectChange(project).catch((error) => {
        showAlert(error.message || 'Failed to load project assets');
      });
    }, { immediate: true });
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();

attachEventListeners();
