import { API_BASE, apiFetch, ensureHealth } from './config.js';

const fileSelect = document.getElementById('fileSelect');
const uploadBtn = document.getElementById('uploadBtn');
const triggerBtn = document.getElementById('triggerBtn');
const uploadSpinner = document.getElementById('uploadSpinner');
const triggerSpinner = document.getElementById('triggerSpinner');
const alertContainer = document.getElementById('alertContainer');

function showAlert(message, type = 'danger') {
  const wrapper = document.createElement('div');
  wrapper.className = `alert alert-${type} alert-dismissible fade show`;
  wrapper.role = 'alert';
  wrapper.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  alertContainer.appendChild(wrapper);
}

function toggleLoading(button, spinner, isLoading) {
  if (isLoading) {
    button.setAttribute('disabled', 'true');
    spinner.classList.remove('d-none');
  } else {
    button.removeAttribute('disabled');
    spinner.classList.add('d-none');
  }
}

async function loadFiles() {
  fileSelect.innerHTML = '';
  const option = document.createElement('option');
  option.textContent = 'Loading...';
  fileSelect.appendChild(option);
  try {
    const files = await apiFetch('/files/list');
    fileSelect.innerHTML = '';
    if (!files.length) {
      const empty = document.createElement('option');
      empty.textContent = 'No files found';
      fileSelect.appendChild(empty);
      return;
    }
    files.forEach((file) => {
      const opt = document.createElement('option');
      opt.value = file.name;
      opt.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
      fileSelect.appendChild(opt);
    });
  } catch (error) {
    fileSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = 'Unable to load files';
    fileSelect.appendChild(opt);
    showAlert(error.message || 'Failed to load files');
  }
}

async function handleUpload() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files?.[0];
  if (!file) {
    showAlert('Please choose a file to upload', 'warning');
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  toggleLoading(uploadBtn, uploadSpinner, true);
  try {
    const response = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      body: formData,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('Upload failed: unexpected response');
    }
    if (!response.ok) {
      throw new Error(data?.message || 'Upload failed');
    }
    showAlert(`Uploaded ${data.fileName}`, 'success');
    fileInput.value = '';
    await loadFiles();
    fileSelect.value = data.fileName;
  } catch (error) {
    showAlert(error.message || 'Upload failed');
  } finally {
    toggleLoading(uploadBtn, uploadSpinner, false);
  }
}

function parseExtraParams(value) {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Parameters must be a JSON object');
    }
    return parsed;
  } catch (error) {
    throw new Error('Invalid JSON in additional parameters');
  }
}

async function handleTrigger() {
  const fileName = fileSelect.value;
  if (!fileName || fileName.startsWith('No files')) {
    showAlert('Please select a valid file', 'warning');
    return;
  }
  const params = {
    target_type: document.getElementById('targetType').value,
    target_env: document.getElementById('targetEnv').value,
  };
  try {
    const extra = parseExtraParams(document.getElementById('extraParams').value);
    Object.assign(params, extra);
  } catch (error) {
    showAlert(error.message, 'warning');
    return;
  }
  toggleLoading(triggerBtn, triggerSpinner, true);
  try {
    const run = await apiFetch('/logicapp/trigger', {
      method: 'POST',
      body: JSON.stringify({ fileName, parameters: params }),
    });
    showAlert(`Run created: ${run.id}`, 'success');
  } catch (error) {
    showAlert(error.message || 'Failed to trigger Logic App');
  } finally {
    toggleLoading(triggerBtn, triggerSpinner, false);
  }
}

(async () => {
  try {
    await ensureHealth();
    await loadFiles();
  } catch (error) {
    showAlert('Backend unavailable. Please confirm the API is running.');
  }
})();

uploadBtn.addEventListener('click', handleUpload);
triggerBtn.addEventListener('click', handleTrigger);
