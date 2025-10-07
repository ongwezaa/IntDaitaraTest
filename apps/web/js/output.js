const API_BASE = "http://localhost:4000/api";
const prefixInput = document.getElementById("prefixInput");
const listBtn = document.getElementById("listBtn");
const fileList = document.getElementById("fileList");
const previewPane = document.getElementById("previewPane");
const outputAlert = document.getElementById("outputAlert");

async function parseJsonResponse(res, defaultMessage) {
  const text = await res.text();
  if (!res.ok) {
    let message = defaultMessage ?? `Request failed with status ${res.status}`;
    if (text) {
      try {
        const data = JSON.parse(text);
        if (typeof data.message === "string") {
          message = data.message;
        } else if (typeof data.error === "string") {
          message = data.error;
        }
      } catch {
        const trimmed = text.trim();
        if (trimmed && !trimmed.startsWith("<")) {
          message = trimmed;
        }
      }
    }
    throw new Error(message);
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    if (trimmed.startsWith("<")) {
      throw new Error(
        "Server returned HTML instead of JSON. Ensure the API base URL is correct and the backend is running."
      );
    }
    throw new Error(defaultMessage ?? "Received malformed JSON from server.");
  }
}

function showOutputAlert(message, type = "danger") {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  outputAlert.appendChild(wrapper);
}

function getInitialPrefix() {
  const params = new URLSearchParams(window.location.search);
  return params.get("prefix") || "output/";
}

async function listOutputs() {
  const prefix = prefixInput.value || "output/";
  fileList.innerHTML = `<div class="list-group-item">Loading...</div>`;
  try {
    const res = await fetch(`${API_BASE}/output/list?prefix=${encodeURIComponent(prefix)}`);
    const blobs = (await parseJsonResponse(res, "Failed to load output files")) ?? [];
    renderFileList(blobs);
  } catch (error) {
    showOutputAlert(error.message);
    fileList.innerHTML = "";
  }
}

function renderFileList(blobs) {
  fileList.innerHTML = "";
  if (!Array.isArray(blobs) || blobs.length === 0) {
    fileList.innerHTML = `<div class="list-group-item text-muted">No files found</div>`;
    return;
  }

  for (const blob of blobs) {
    const item = document.createElement("div");
    item.className = "list-group-item d-flex justify-content-between align-items-center flex-wrap";
    item.innerHTML = `
      <div class="me-2">
        <div>${blob.name}</div>
        <small class="text-muted">${(blob.size / 1024).toFixed(1)} KB · ${blob.lastModified ? new Date(blob.lastModified).toLocaleString() : ""}</small>
      </div>
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-outline-primary" data-action="preview" data-blob="${encodeURIComponent(blob.name)}">Preview</button>
        <a class="btn btn-outline-secondary" href="${API_BASE}/output/download?blob=${encodeURIComponent(blob.name)}">Download</a>
      </div>
    `;
    fileList.appendChild(item);
  }
}

fileList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action='preview']");
  if (!btn) return;
  const blob = decodeURIComponent(btn.dataset.blob);
  await previewBlob(blob);
});

async function previewBlob(blob) {
  previewPane.textContent = "Loading preview...";
  try {
    const res = await fetch(`${API_BASE}/output/preview?blob=${encodeURIComponent(blob)}`);
    if (res.status === 413) {
      const err = await res.json().catch(() => ({ message: "Too large to preview" }));
      previewPane.innerHTML = `
        <div class="alert alert-warning">${err.message || "Too large to preview"}</div>
        <a class="btn btn-sm btn-outline-secondary" href="${API_BASE}/output/download?blob=${encodeURIComponent(blob)}">Download instead</a>
      `;
      return;
    }
    if (!res.ok) throw new Error("Failed to preview file");
    const contentType = res.headers.get("Content-Type") || "";
    const text = await res.text();
    renderPreview(text, contentType);
  } catch (error) {
    previewPane.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

function renderPreview(text, contentType) {
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(text);
      previewPane.textContent = JSON.stringify(parsed, null, 2);
      return;
    } catch (error) {
      // fall back to raw text
    }
  }

  if (contentType.includes("text/csv")) {
    previewPane.innerHTML = csvToTable(text);
    return;
  }

  previewPane.textContent = text;
}

function csvToTable(csvText) {
  const rows = csvText.split(/\r?\n/).slice(0, 2000).filter((row) => row.length > 0);
  if (rows.length === 0) {
    return `<div class="text-muted">Empty file</div>`;
  }
  const table = document.createElement("table");
  table.className = "table table-striped table-bordered table-sm";
  const thead = document.createElement("thead");
  const headerCells = parseCsvLine(rows[0]);
  const headerRow = document.createElement("tr");
  for (const cell of headerCells) {
    const th = document.createElement("th");
    th.textContent = cell;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows.slice(1)) {
    const tr = document.createElement("tr");
    const cells = parseCsvLine(row);
    for (const cell of cells) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const wrapper = document.createElement("div");
  wrapper.appendChild(table);
  return wrapper.innerHTML;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const initialPrefix = getInitialPrefix();
prefixInput.value = initialPrefix;
listBtn.addEventListener("click", listOutputs);
listOutputs();

