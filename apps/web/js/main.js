import { apiBase, apiFetch, showAlert } from "./config.js";

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const fileSelect = document.getElementById("fileSelect");
const triggerBtn = document.getElementById("triggerBtn");
const targetType = document.getElementById("targetType");
const targetEnv = document.getElementById("targetEnv");
const extraParams = document.getElementById("extraParams");
const alertContainer = document.getElementById("alertContainer");
const uploadSpinner = document.getElementById("uploadSpinner");
const triggerSpinner = document.getElementById("triggerSpinner");
const triggerResult = document.getElementById("triggerResult");

const setUploading = (value) => {
  uploadBtn.disabled = value;
  if (uploadSpinner) {
    uploadSpinner.classList.toggle("d-none", !value);
  }
};

const setTriggering = (value) => {
  triggerBtn.disabled = value;
  if (triggerSpinner) {
    triggerSpinner.classList.toggle("d-none", !value);
  }
};

const refreshFileList = async () => {
  try {
    const files = await apiFetch(`/files/list?prefix=${encodeURIComponent("input/")}`);
    if (!Array.isArray(files)) {
      throw new Error("Unexpected files response");
    }
    fileSelect.innerHTML = "";
    const filtered = files.filter((item) => item.name.startsWith("input/"));
    if (!filtered.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No files uploaded yet";
      fileSelect.appendChild(option);
    } else {
      filtered.forEach((file) => {
        const option = document.createElement("option");
        option.value = file.name;
        option.textContent = `${file.name}`;
        fileSelect.appendChild(option);
      });
    }
  } catch (error) {
    showAlert(alertContainer, `Failed to load input files: ${error.message}`);
  }
};

uploadBtn?.addEventListener("click", async () => {
  if (!fileInput.files?.length) {
    showAlert(alertContainer, "Please choose a file to upload.", "warning");
    return;
  }
  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  setUploading(true);
  try {
    const response = await fetch(`${apiBase}/files/upload`, {
      method: "POST",
      body: formData,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Upload failed");
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(text || "Unexpected upload response");
    }
    showAlert(alertContainer, `Uploaded ${payload.fileName}`, "success");
    await refreshFileList();
  } catch (error) {
    showAlert(alertContainer, `Upload failed: ${error.message}`);
  } finally {
    setUploading(false);
  }
});

triggerBtn?.addEventListener("click", async () => {
  if (!fileSelect.value) {
    showAlert(alertContainer, "Select an input file first.", "warning");
    return;
  }
  let parsedExtras = {};
  if (extraParams.value.trim().length) {
    try {
      parsedExtras = JSON.parse(extraParams.value);
    } catch (error) {
      showAlert(alertContainer, "Extra parameters must be valid JSON.");
      return;
    }
  }
  const body = {
    fileName: fileSelect.value,
    parameters: {
      target_type: targetType.value,
      target_env: targetEnv.value,
      ...parsedExtras,
    },
  };
  setTriggering(true);
  triggerResult.innerHTML = "";
  try {
    const run = await apiFetch("/logicapp/trigger", {
      method: "POST",
      body: JSON.stringify(body),
    });
    triggerResult.innerHTML = `
      <div class="alert alert-success" role="alert">
        Run <strong>${run.id}</strong> created. <a href="/status" class="alert-link">View status</a>.
      </div>
    `;
    await refreshFileList();
  } catch (error) {
    showAlert(alertContainer, `Trigger failed: ${error.message}`);
  } finally {
    setTriggering(false);
  }
});

refreshFileList();
