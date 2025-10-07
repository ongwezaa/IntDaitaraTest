import { apiBase, apiFetch, apiFetchRaw, showAlert } from "./config.js";

const prefixInput = document.getElementById("prefixInput");
const listBtn = document.getElementById("listBtn");
const fileList = document.getElementById("fileList");
const previewPane = document.getElementById("previewPane");
const alertContainer = document.getElementById("alertContainer");

const getQueryPrefix = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("prefix") ?? "output/";
};

const renderPreview = (_blob, text, contentType) => {
  previewPane.innerHTML = "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(text);
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(parsed, null, 2);
      previewPane.appendChild(pre);
      return;
    } catch (error) {
      // fall through
    }
  }
  if (contentType.includes("text/csv")) {
    const rows = text.split(/\r?\n/).slice(0, 2000);
    const table = document.createElement("table");
    table.className = "table table-bordered table-sm";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.split(",").forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    previewPane.appendChild(table);
    return;
  }
  const pre = document.createElement("pre");
  pre.textContent = text;
  previewPane.appendChild(pre);
};

const loadFiles = async () => {
  const prefix = prefixInput.value.trim() || "output/";
  try {
    const blobs = await apiFetch(`/output/list?prefix=${encodeURIComponent(prefix)}`);
    if (!Array.isArray(blobs)) {
      throw new Error("Unexpected output list response");
    }
    fileList.innerHTML = "";
    if (!blobs.length) {
      const empty = document.createElement("li");
      empty.className = "list-group-item text-muted";
      empty.textContent = "No files found.";
      fileList.appendChild(empty);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("prefix", prefix);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    blobs.forEach((blob) => {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center gap-2";
      li.innerHTML = `
        <div>
          <div class="fw-semibold">${blob.name}</div>
          <small class="text-muted">${(blob.size / 1024).toFixed(1)} KB · ${new Date(
        blob.lastModified
      ).toLocaleString()}</small>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm btn-outline-primary preview-btn" data-blob="${blob.name}">Preview</button>
          <a class="btn btn-sm btn-outline-secondary" href="#" data-download="${blob.name}">Download</a>
        </div>
      `;
      fileList.appendChild(li);
    });
  } catch (error) {
    showAlert(alertContainer, `Failed to list files: ${error.message}`);
  }
};

const handleListClick = async (event) => {
  const previewBtn = event.target.closest(".preview-btn");
  if (previewBtn) {
    const blob = previewBtn.dataset.blob;
    try {
      const response = await apiFetchRaw(`/output/preview?blob=${encodeURIComponent(blob)}`);
      const contentType = response.headers.get("Content-Type") || "text/plain";
      const text = await response.text();
      renderPreview(blob, text, contentType);
    } catch (error) {
      showAlert(alertContainer, `Preview failed: ${error.message}`);
    }
    return;
  }
  const downloadLink = event.target.closest("[data-download]");
  if (downloadLink) {
    const blob = downloadLink.dataset.download;
    downloadLink.href = `${apiBase}/output/download?blob=${encodeURIComponent(blob)}`;
    downloadLink.setAttribute("target", "_blank");
  }
};

fileList?.addEventListener("click", handleListClick);

listBtn?.addEventListener("click", loadFiles);

const initialPrefix = getQueryPrefix();
prefixInput.value = initialPrefix;
loadFiles();
