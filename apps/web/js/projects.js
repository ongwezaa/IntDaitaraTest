import { apiFetch } from './config.js';

const PROJECTS_STORAGE_KEY = 'daitara_projects';
const SELECTED_PROJECT_KEY = 'daitara_selected_project';
export const DEFAULT_PROJECT = 'All';
const INPUT_ROOT = 'input/';
const OUTPUT_ROOT = 'output/';

let projectSelectEl = null;
let projectAddBtn = null;
let projectModalEl = null;
let projectModal = null;
let projectNameInput = null;
let projectSaveBtn = null;
let projectSaveSpinner = null;
let projectNameFeedback = null;

let currentProject = loadStoredSelectedProject();
let cachedProjects = [];
const listeners = new Set();
let initPromise = null;
let pendingRefresh = null;

function loadStoredProjects() {
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  } catch (error) {
    console.warn('Unable to read stored projects', error);
    return [];
  }
}

function saveStoredProjects(projects) {
  try {
    const unique = mergeProjectNames(projects);
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(unique));
  } catch (error) {
    console.warn('Unable to persist projects', error);
  }
}

function loadStoredSelectedProject() {
  try {
    const stored = window.localStorage.getItem(SELECTED_PROJECT_KEY);
    if (typeof stored === 'string' && stored.trim()) {
      return stored.trim();
    }
  } catch (error) {
    console.warn('Unable to read stored project selection', error);
  }
  return DEFAULT_PROJECT;
}

function storeSelectedProject(value) {
  try {
    window.localStorage.setItem(SELECTED_PROJECT_KEY, value);
  } catch (error) {
    console.warn('Unable to persist project selection', error);
  }
}

function mergeProjectNames(existing = [], additions = []) {
  const map = new Map();
  const add = (value) => {
    if (!value) return;
    const key = value.toLowerCase();
    if (!map.has(key)) {
      map.set(key, value);
    }
  };
  existing.forEach(add);
  additions.forEach(add);
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function normaliseProjectName(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
}

function normaliseSegmentFromPath(path, base) {
  if (!path) return '';
  const trimmed = path.replace(/\/$/, '');
  const baseNoSlash = base.replace(/\/$/, '');
  const effective = trimmed.startsWith(baseNoSlash)
    ? trimmed.slice(baseNoSlash.length).replace(/^\//, '')
    : trimmed;
  if (!effective) {
    return '';
  }
  const [segment] = effective.split('/');
  return segment ? normaliseProjectName(segment) : '';
}

function notifyProjectChange() {
  const project = getSelectedProject();
  listeners.forEach((listener) => {
    try {
      listener(project);
    } catch (error) {
      console.error('Project listener failed', error);
    }
  });
}

function populateSelect() {
  if (!projectSelectEl) {
    return;
  }
  const projects = [DEFAULT_PROJECT, ...cachedProjects];
  projectSelectEl.innerHTML = '';
  projects.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    projectSelectEl.appendChild(option);
  });
  if (!projects.includes(currentProject)) {
    currentProject = DEFAULT_PROJECT;
    storeSelectedProject(currentProject);
  }
  projectSelectEl.value = currentProject;
}

function setProject(value) {
  const next = value && value !== DEFAULT_PROJECT ? value : DEFAULT_PROJECT;
  if (next === currentProject) {
    return;
  }
  currentProject = next;
  storeSelectedProject(currentProject);
  if (projectSelectEl && projectSelectEl.value !== currentProject) {
    projectSelectEl.value = currentProject;
  }
  notifyProjectChange();
}

function clearProjectForm() {
  if (projectNameInput) {
    projectNameInput.value = '';
    projectNameInput.classList.remove('is-invalid');
  }
  if (projectNameFeedback) {
    projectNameFeedback.textContent = '';
  }
  if (projectSaveBtn) {
    projectSaveBtn.removeAttribute('disabled');
  }
  if (projectSaveSpinner) {
    projectSaveSpinner.classList.add('d-none');
  }
}

function showProjectError(message) {
  if (!projectNameInput) return;
  projectNameInput.classList.add('is-invalid');
  if (projectNameFeedback) {
    projectNameFeedback.textContent = message;
  }
}

function hideProjectError() {
  if (!projectNameInput) return;
  projectNameInput.classList.remove('is-invalid');
  if (projectNameFeedback) {
    projectNameFeedback.textContent = '';
  }
}

function setModalLoading(isLoading) {
  if (isLoading) {
    projectSaveBtn?.setAttribute('disabled', 'true');
    projectNameInput?.setAttribute('disabled', 'true');
    projectSaveSpinner?.classList.remove('d-none');
  } else {
    projectSaveBtn?.removeAttribute('disabled');
    projectNameInput?.removeAttribute('disabled');
    projectSaveSpinner?.classList.add('d-none');
  }
}

function projectExists(name) {
  const lower = name.toLowerCase();
  return lower === DEFAULT_PROJECT.toLowerCase() || cachedProjects.some((item) => item.toLowerCase() === lower);
}

async function handleProjectCreate() {
  hideProjectError();
  if (!projectNameInput) return;
  const normalised = normaliseProjectName(projectNameInput.value);
  if (!normalised) {
    showProjectError('Please provide a valid project name (letters, numbers, hyphen or underscore).');
    return;
  }
  if (projectExists(normalised)) {
    showProjectError('Project already exists.');
    return;
  }
  setModalLoading(true);
  try {
    await apiFetch('/files/folder', {
      method: 'POST',
      body: JSON.stringify({ parent: INPUT_ROOT, name: normalised }),
    });
    cachedProjects = mergeProjectNames(cachedProjects, [normalised]);
    saveStoredProjects(cachedProjects);
    populateSelect();
    setProject(normalised);
    if (projectModal) {
      projectModal.hide();
    } else if (projectModalEl) {
      projectModalEl.classList.remove('show');
      projectModalEl.setAttribute('aria-hidden', 'true');
      projectModalEl.style.display = 'none';
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('padding-right');
    }
  } catch (error) {
    console.error('Failed to create project', error);
    showProjectError(error?.message || 'Unable to create project. Please try again.');
  } finally {
    setModalLoading(false);
  }
}

async function discoverProjects() {
  const discovered = new Set(mergeProjectNames(loadStoredProjects(), cachedProjects));
  try {
    const inputItems = await apiFetch(`/files/list?prefix=${encodeURIComponent(INPUT_ROOT)}&hierarchical=true`);
    if (Array.isArray(inputItems)) {
      inputItems
        .filter((item) => item && item.kind === 'folder' && typeof item.name === 'string')
        .forEach((item) => {
          const segment = normaliseSegmentFromPath(item.name, INPUT_ROOT);
          if (segment) {
            discovered.add(segment);
          }
        });
    }
  } catch (error) {
    console.warn('Unable to load input projects', error);
  }
  try {
    const runs = await apiFetch('/runs');
    if (Array.isArray(runs)) {
      runs.forEach((run) => {
        const project = typeof run?.parameters?.project === 'string' ? run.parameters.project.trim() : '';
        const segment = normaliseProjectName(project);
        if (segment) {
          discovered.add(segment);
        }
      });
    }
  } catch (error) {
    console.warn('Unable to load run projects', error);
  }
  const names = Array.from(discovered.values()).filter((name) => name && name !== DEFAULT_PROJECT);
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  cachedProjects = names;
  saveStoredProjects(cachedProjects);
  populateSelect();
}

function attachEventHandlers() {
  if (projectSelectEl) {
    projectSelectEl.addEventListener('change', (event) => {
      const value = event.target.value;
      setProject(value);
    });
  }

  if (projectAddBtn && projectModalEl) {
    projectAddBtn.addEventListener('click', () => {
      hideProjectError();
      if (projectNameInput) {
        projectNameInput.removeAttribute('disabled');
        projectNameInput.value = '';
      }
      if (projectSaveBtn) {
        projectSaveBtn.removeAttribute('disabled');
      }
      if (projectSaveSpinner) {
        projectSaveSpinner.classList.add('d-none');
      }
    });
  }

  if (projectModalEl) {
    projectModalEl.addEventListener('shown.bs.modal', () => {
      hideProjectError();
      projectNameInput?.removeAttribute('disabled');
      projectNameInput?.focus();
    });
    projectModalEl.addEventListener('hidden.bs.modal', () => {
      clearProjectForm();
      setModalLoading(false);
    });
  }

  if (projectSaveBtn) {
    projectSaveBtn.addEventListener('click', handleProjectCreate);
  }

  if (projectNameInput) {
    projectNameInput.addEventListener('input', () => {
      hideProjectError();
    });
    projectNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleProjectCreate();
      }
    });
  }
}

async function refreshProjects() {
  if (!pendingRefresh) {
    pendingRefresh = discoverProjects().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

export function getSelectedProject() {
  return currentProject;
}

export function onProjectChange(callback, options = {}) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  listeners.add(callback);
  if (options?.immediate) {
    callback(getSelectedProject());
  }
  return () => {
    listeners.delete(callback);
  };
}

export function resolveInputRoot(project = getSelectedProject()) {
  if (project && project !== DEFAULT_PROJECT) {
    return `${INPUT_ROOT}${project.replace(/\/$/, '')}/`;
  }
  return INPUT_ROOT;
}

export function resolveOutputRoot(project = getSelectedProject()) {
  if (project && project !== DEFAULT_PROJECT) {
    return `${OUTPUT_ROOT}${project.replace(/\/$/, '')}/`;
  }
  return OUTPUT_ROOT;
}

export async function initProjectControls() {
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    projectSelectEl = document.getElementById('projectSelect');
    projectAddBtn = document.getElementById('projectAddBtn');
    projectModalEl = document.getElementById('projectModal');
    projectNameInput = document.getElementById('projectNameInput');
    projectSaveBtn = document.getElementById('projectSaveBtn');
    projectSaveSpinner = document.getElementById('projectSaveSpinner');
    projectNameFeedback = document.getElementById('projectNameFeedback');

    if (projectModalEl && window.bootstrap?.Modal) {
      projectModal = window.bootstrap.Modal.getOrCreateInstance(projectModalEl);
    }

    cachedProjects = mergeProjectNames(cachedProjects, loadStoredProjects());
    populateSelect();
    attachEventHandlers();
    await refreshProjects();
  })();
  return initPromise;
}

export async function addProject(name) {
  const normalised = normaliseProjectName(name);
  if (!normalised) {
    throw new Error('Invalid project name');
  }
  if (!projectExists(normalised)) {
    cachedProjects = mergeProjectNames(cachedProjects, [normalised]);
    saveStoredProjects(cachedProjects);
    populateSelect();
  }
  setProject(normalised);
}
