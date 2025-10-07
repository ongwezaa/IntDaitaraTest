const API_BASE = "http://localhost:4000/api";

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const fileSelect = document.getElementById("fileSelect");
const refreshBtn = document.getElementById("refreshBtn");
const targetType = document.getElementById("targetType");
const targetEnv = document.getElementById("targetEnv");
const extraParams = document.getElementById("extraParams");
const triggerBtn = document.getElementById("triggerBtn");
const triggerResult = document.getElementById("triggerResult");
const alertContainer = document.getElementById("alertContainer");

function showAlert(message, type = "danger") {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  alertContainer.appendChild(wrapper);
}

async function fetchInputFiles() {
  try {
    fileSelect.innerHTML = `<option>Loading...</option>`;
    const res = await fetch(`${API_BASE}/files/list?prefix=input/`);
    if (!res.ok) throw new Error("Failed to load files");
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) {
      fileSelect.innerHTML = `<option value="">No files available</option>`;
      return;
    }
    fileSelect.innerHTML = "";
    for (const file of files) {
      const option = document.createElement("option");
      option.value = file.name;
      option.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      fileSelect.appendChild(option);
    }
  } catch (error) {
    showAlert(error.message);
  }
}

uploadBtn?.addEventListener("click", async () => {
  if (!fileInput.files?.length) {
    showAlert("Select a file to upload", "warning");
    return;
  }
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  uploadBtn.disabled = true;
  uploadBtn.innerText = "Uploading...";

  try {
    const res = await fetch(`${API_BASE}/files/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Upload failed" }));
      throw new Error(err.message || "Upload failed");
    }
    const data = await res.json();
    showAlert(`Uploaded ${data.fileName}`, "success");
    fileInput.value = "";
    await fetchInputFiles();
  } catch (error) {
    showAlert(error.message || "Upload failed");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerText = "Upload";
  }
});

refreshBtn?.addEventListener("click", fetchInputFiles);

triggerBtn?.addEventListener("click", async () => {
  const fileName = fileSelect.value;
  if (!fileName) {
    showAlert("Choose a file before triggering", "warning");
    return;
  }

  let params = {
    target_type: targetType.value,
    target_env: targetEnv.value,
  };

  const extra = extraParams.value.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra);
      params = { ...params, ...parsed };
    } catch (error) {
      showAlert("Extra parameters must be valid JSON", "warning");
      return;
    }
  }

  triggerBtn.disabled = true;
  triggerBtn.innerText = "Triggering...";
  triggerResult.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/logicapp/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, parameters: params }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Trigger failed" }));
      throw new Error(err.message || "Trigger failed");
    }
    const data = await res.json();
    const run = data.run;
    triggerResult.innerHTML = `
      <div class="alert alert-info">
        Run <strong>${run.id}</strong> created with status <span class="badge bg-primary">${run.status}</span>.
        <a class="ms-2" href="status.html">View Status</a>
      </div>
    `;
  } catch (error) {
    showAlert(error.message || "Trigger failed");
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.innerText = "Trigger Logic App";
  }
});

fetchInputFiles();

