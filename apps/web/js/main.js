import { API_BASE, apiFetch, ensureHealth } from './config.js';

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageSummary = document.getElementById('pageSummary');
const sortableHeaders = document.querySelectorAll('#fileTable th.sortable');
const breadcrumb = document.getElementById('breadcrumb');
const currentPathLabel = document.getElementById('currentPathLabel');
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

const copyButtonDefaultLabel = copyPreviewBtn ? copyPreviewBtn.querySelector('.btn-copy-label')?.textContent?.trim() ?? 'Copy' : 'Copy';

let bootstrapModal;
let folderModal;
let currentPrefix = 'input/';
let allItems = [];
let filteredItems = [];
let currentPage = 1;
let sortKey = 'displayName';
let sortDirection = 'asc';
let searchDebounce;
let lastPreviewText = '';
let allFilesFlat = [];
let hasInitialisedParams = false;
const DEFAULT_FILE_NAMES = {
  file: 'FOR TEST CIMB_Metadata_Application 1.xlsx',
  config: 'cimb_config.json',
  sourceMappingPrompt: 'custom_source_cimb.txt',
  selectMappingPrompt: 'custom_select_cimb.txt',
};

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value = '') {
  return escapeHtml(value).replace(/"/g, '&quot;');
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

function getParentPrefix(prefix) {
  const trimmed = prefix.replace(/\/$/, '');
  if (!trimmed) return '';
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash === -1) return '';
  const parent = trimmed.slice(0, lastSlash + 1);
  return parent || '';
}

function canGoUp() {
  return Boolean(currentPrefix && currentPrefix !== '' && currentPrefix !== normalisePrefix('')) && currentPrefix !== 'input/';
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

function updateCurrentPathLabel() {
  if (!currentPathLabel) return;
  const display = currentPrefix ? `root/${currentPrefix.replace(/\/$/, '')}` : 'root';
  currentPathLabel.textContent = display || 'root';
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

  const segments = currentPrefix.replace(/\/$/, '').split('/').filter(Boolean);

  const rootLi = document.createElement('li');
  if (!segments.length || currentPrefix === 'input/') {
    rootLi.className = 'breadcrumb-item active';
    rootLi.textContent = 'root';
  } else {
    rootLi.className = 'breadcrumb-item';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'root';
    link.dataset.prefix = 'input/';
    rootLi.appendChild(link);
  }
  ol.appendChild(rootLi);

  let cumulative = 'input';
  segments.forEach((segment, index) => {
    if (segment === 'input') return;
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    const li = document.createElement('li');
    if (index === segments.length - 1) {
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
      <td class="text-end"></td>
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
        <td class="text-end"></td>
        <td></td>
        <td></td>
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
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      const pre = document.createElement('pre');
      pre.textContent = formatted;
      previewPane.appendChild(pre);
      return formatted;
    } catch {
      // ignore parse errors
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
    return content;
  }

  if (contentType.includes('sql') || previewModalTitle?.textContent?.toLowerCase().includes('.sql')) {
    try {
      if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
        const formatted = window.sqlFormatter.format(content, { language: 'sql' });
        const pre = document.createElement('pre');
        pre.textContent = formatted;
        previewPane.appendChild(pre);
        return formatted;
      }
    } catch {
      // ignore formatter errors
    }
  }

  const pre = document.createElement('pre');
  pre.textContent = content;
  previewPane.appendChild(pre);
  return content;
}

async function loadList() {
  try {
    const items = await apiFetch(`/files/list?prefix=${encodeURIComponent(currentPrefix)}&hierarchical=true`);
    allItems = Array.isArray(items) ? items.map((item) => ({
      ...item,
      displayName: item.kind === 'folder'
        ? item.displayName
        : item.name.replace(/^input\//, ''),
    })) : [];
    applyFilters({ resetPage: true });
    updateSortIndicators();
    updateCurrentPathLabel();
  } catch (error) {
    showAlert(error.message || 'Failed to list files');
  }
}

async function previewBlob(name) {
  if (!previewPane) return;
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
    previewModalTitle.textContent = `Preview • ${name.replace(/^input\//, '')}`;
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
  currentPrefix = normalisePrefix(prefix || 'input/');
  renderBreadcrumb();
  updateCurrentPathLabel();
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
    option.value = file.name;
    option.textContent = file.name;
    selectEl.appendChild(option);
  });

  if (previousValue && files.some((f) => f.name === previousValue)) {
    selectEl.value = previousValue;
  }
}

function tryApplyDefaults() {
  const fallback = allFilesFlat[0]?.name ?? '';
  const fileDefault = allFilesFlat.find((item) => item.name.endsWith(DEFAULT_FILE_NAMES.file))?.name || fallback;
  const configDefault = allFilesFlat.find((item) => item.name.endsWith(DEFAULT_FILE_NAMES.config))?.name || fallback;
  const sourceDefault = allFilesFlat.find((item) => item.name.endsWith(DEFAULT_FILE_NAMES.sourceMappingPrompt))?.name || fallback;
  const selectDefault = allFilesFlat.find((item) => item.name.endsWith(DEFAULT_FILE_NAMES.selectMappingPrompt))?.name || fallback;

  if (fileSelect && fileDefault) fileSelect.value = fileDefault;
  if (configSelect && configDefault) configSelect.value = configDefault;
  if (sourcePromptSelect && sourceDefault) sourcePromptSelect.value = sourceDefault;
  if (selectPromptSelect && selectDefault) selectPromptSelect.value = selectDefault;

  targetTypeSelect.value = 'Postgres';
  targetEnvSelect.value = 'DEV';
  mockRowCountInput.value = '200';
  autoTeardownSelect.value = 'false';
  generateDdlSelect.value = 'true';
}

async function loadFlatFiles() {
  try {
    const files = await apiFetch('/files/list?prefix=input/');
    allFilesFlat = Array.isArray(files) ? files : [];
    populateSelect(fileSelect, allFilesFlat, 'Select source file');
    populateSelect(configSelect, allFilesFlat, 'Select config file');
    populateSelect(sourcePromptSelect, allFilesFlat, 'Select source prompt');
    populateSelect(selectPromptSelect, allFilesFlat, 'Select select prompt');
    if (!hasInitialisedParams) {
      tryApplyDefaults();
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
    mock_row_count: Number(mockRowCountInput?.value) || 200,
    auto_teardown: getBoolean(autoTeardownSelect),
    target_env: targetEnvSelect?.value || 'DEV',
    generate_ddl: getBoolean(generateDdlSelect),
  };
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
    showAlert('Please provide a folder name', 'warning');
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
      showAlert(`Folder created: ${result.folder}`, 'success');
    }
  } catch (error) {
    showAlert(error.message || 'Failed to create folder');
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
    showAlert(`Uploaded ${data.fileName}`, 'success');
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
      body: JSON.stringify({ parameters: params }),
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
  tryApplyDefaults();
  updateParametersPreview();
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
      updateSortIndicators();
      applyFilters();
    });
  });

  if (breadcrumb) {
    breadcrumb.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-prefix]');
      if (!link) return;
      event.preventDefault();
      setCurrentPrefix(link.dataset.prefix ?? 'input/');
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

(async () => {
  try {
    await ensureHealth();
    if (window.bootstrap) {
      bootstrapModal = new window.bootstrap.Modal(previewModalEl);
      folderModal = new window.bootstrap.Modal(createFolderModalEl);
    }
    setCurrentPrefix('input/');
    renderBreadcrumb();
    updateCurrentPathLabel();
    await Promise.all([loadList(), loadFlatFiles()]);
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();

attachEventListeners();
