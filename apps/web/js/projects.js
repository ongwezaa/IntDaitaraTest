import { apiFetch } from './config.js';

const SELECTED_PROJECT_KEY = 'daitara_selected_project';
export const DEFAULT_PROJECT = 'All';
const INPUT_ROOT = 'input/';
const OUTPUT_ROOT = 'output/';
const EXCLUDED_PROJECTS = new Set(['shared']);

let projectSelectEl = null;
let currentProject = loadStoredSelectedProject();
let cachedProjects = [];
let hasFetchedProjects = false;
const listeners = new Set();
let initPromise = null;
let pendingRefresh = null;

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

function extractProjectSegment(path, base) {
  if (typeof path !== 'string' || !path) {
    return '';
  }
  const trimmedPath = path.replace(/\/$/, '');
  const baseNoSlash = (base || '').replace(/\/$/, '');
  const relative = trimmedPath.startsWith(baseNoSlash)
    ? trimmedPath.slice(baseNoSlash.length).replace(/^\//, '')
    : trimmedPath;
  const [segment = ''] = relative.split('/');
  return segment.trim();
}

function shouldIncludeProject(name) {
  if (!name) {
    return false;
  }
  return !EXCLUDED_PROJECTS.has(name.toLowerCase());
}

function populateSelect() {
  if (!projectSelectEl) {
    return;
  }
  const uniqueOptions = new Set();
  const options = [];

  const addOption = (value) => {
    if (!value || uniqueOptions.has(value)) {
      return;
    }
    uniqueOptions.add(value);
    options.push(value);
  };

  addOption(DEFAULT_PROJECT);
  cachedProjects.forEach((name) => addOption(name));
  if (!hasFetchedProjects && currentProject !== DEFAULT_PROJECT) {
    addOption(currentProject);
  }

  projectSelectEl.innerHTML = '';
  options.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    projectSelectEl.appendChild(option);
  });

  const desired = uniqueOptions.has(currentProject) ? currentProject : DEFAULT_PROJECT;
  const changed = desired !== currentProject;
  currentProject = desired;
  storeSelectedProject(currentProject);
  projectSelectEl.value = currentProject;
  if (changed) {
    notifyProjectChange();
  }
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

function attachEventHandlers() {
  if (!projectSelectEl) {
    return;
  }
  projectSelectEl.addEventListener('change', (event) => {
    setProject(event.target.value);
  });
}

async function fetchInputProjects() {
  try {
    const items = await apiFetch(`/files/list?prefix=${encodeURIComponent(INPUT_ROOT)}&hierarchical=true`);
    if (!Array.isArray(items)) {
      return [];
    }
    const names = new Set();
    items.forEach((item) => {
      if (!item || item.kind !== 'folder' || typeof item.name !== 'string') {
        return;
      }
      const segment = extractProjectSegment(item.name, INPUT_ROOT);
      if (shouldIncludeProject(segment)) {
        names.add(segment);
      }
    });
    const ordered = Array.from(names.values());
    ordered.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return ordered;
  } catch (error) {
    console.warn('Unable to load input projects', error);
    return [];
  }
}

async function discoverProjects() {
  const projects = await fetchInputProjects();
  cachedProjects = projects;
  hasFetchedProjects = true;
  populateSelect();
}

async function refreshProjects() {
  if (!pendingRefresh) {
    pendingRefresh = discoverProjects().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

export function refreshProjectsList() {
  return refreshProjects();
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

function normalisePathSegment(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/^\/+|\/+$/g, '');
}

export function resolveInputRoot(project = getSelectedProject()) {
  const segment = normalisePathSegment(project);
  if (segment && segment !== DEFAULT_PROJECT) {
    return `${INPUT_ROOT}${segment}/`;
  }
  return INPUT_ROOT;
}

export function resolveOutputRoot(project = getSelectedProject()) {
  const segment = normalisePathSegment(project);
  if (segment && segment !== DEFAULT_PROJECT) {
    return `${OUTPUT_ROOT}${segment}/`;
  }
  return OUTPUT_ROOT;
}

export async function initProjectControls() {
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    projectSelectEl = document.getElementById('projectSelect');
    populateSelect();
    attachEventHandlers();
    await refreshProjects();
  })();
  return initPromise;
}

function scheduleAutoInit() {
  const initialise = () => {
    initProjectControls().catch((error) => {
      console.warn('Failed to initialise project controls', error);
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
}

scheduleAutoInit();
