// Slide Converter App Logic
let currentFile = null;
let currentLocalPath = null;
let currentToken = null;
let currentFilename = "slides_converted.pdf";
let isProcessing = false;

// DOM Elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const dropContentIdle = document.getElementById("drop-content-idle");
const fileInfoBar = document.getElementById("file-info-bar");
const selectedFileName = document.getElementById("selected-file-name");
const selectedFileStats = document.getElementById("selected-file-stats");
const btnChangeFile = document.getElementById("btn-change-file");

const recentChipsContainer = document.getElementById("recent-chips");
const btnRefreshRecent = document.getElementById("btn-refresh-recent");

const layoutOptions = document.querySelectorAll(".layout-option");
const toggleBorder = document.getElementById("toggle-border");
const toggleNumbers = document.getElementById("toggle-numbers");
const selectOrientation = document.getElementById("select-orientation");

const previewPlaceholder = document.getElementById("preview-placeholder");
const previewLoading = document.getElementById("preview-loading");
const previewResultContainer = document.getElementById("preview-result-container");
const previewImage = document.getElementById("preview-image");
const previewStatsLine = document.getElementById("preview-stats-line");
const savingsBadge = document.getElementById("savings-badge");
const savingsPercent = document.getElementById("savings-percent");

const actionBar = document.getElementById("action-bar");
const btnDownload = document.getElementById("btn-download");
const btnSaveDownloads = document.getElementById("btn-save-downloads");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadRecentDownloads();
});

function setupEventListeners() {
  // Drag & drop
  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.toLowerCase().endsWith(".pdf")) {
      handleSelectedFile(files[0]);
    } else {
      showToast("Please select a valid PDF file", "error");
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  btnChangeFile.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Layout radio buttons
  layoutOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      layoutOptions.forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      triggerConvert();
    });
  });

  // Toggles
  toggleBorder.addEventListener("change", triggerConvert);
  toggleNumbers.addEventListener("change", triggerConvert);
  selectOrientation.addEventListener("change", triggerConvert);

  // Actions
  btnDownload.addEventListener("click", () => {
    if (!currentToken) return;
    window.location.href = `/api/download?token=${currentToken}`;
    showToast("Downloading converted PDF...", "success");
  });

  btnSaveDownloads.addEventListener("click", async () => {
    if (!currentToken) return;
    btnSaveDownloads.disabled = true;
    try {
      const resp = await fetch("/api/save-to-downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken, filename: currentFilename })
      });
      const data = await resp.json();
      if (data.status === "ok") {
        showToast(data.message, "success");
      } else {
        showToast(data.message || "Failed to save to Downloads", "error");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnSaveDownloads.disabled = false;
    }
  });

  btnRefreshRecent.addEventListener("click", loadRecentDownloads);
}

function handleSelectedFile(file) {
  currentFile = file;
  currentLocalPath = null;
  displayFileInfo(file.name, (file.size / (1024 * 1024)).toFixed(2) + " MB");
  triggerConvert();
}

function displayFileInfo(name, sizeStr) {
  selectedFileName.textContent = name;
  selectedFileStats.textContent = sizeStr;
  dropContentIdle.style.display = "none";
  fileInfoBar.style.display = "flex";
}

async function loadRecentDownloads() {
  try {
    const res = await fetch("/api/recent-downloads");
    const data = await res.json();
    if (data.status === "ok" && data.recent_files.length > 0) {
      recentChipsContainer.innerHTML = "";
      data.recent_files.forEach(file => {
        const chip = document.createElement("div");
        chip.className = "recent-chip";
        chip.innerHTML = `
          <span class="recent-chip-name" title="${file.path}">${file.name}</span>
          <span class="recent-chip-size">${file.size_mb} MB</span>
        `;
        chip.addEventListener("click", () => {
          currentFile = null;
          currentLocalPath = file.path;
          displayFileInfo(file.name, `${file.size_mb} MB (from Downloads)`);
          triggerConvert();
        });
        recentChipsContainer.appendChild(chip);
      });
    } else {
      recentChipsContainer.innerHTML = `<span class="chip-loading">No recent PDF files found in Downloads.</span>`;
    }
  } catch (e) {
    recentChipsContainer.innerHTML = `<span class="chip-loading">Failed to load recent files.</span>`;
  }
}

function getSelectedLayout() {
  const activeOpt = document.querySelector(".layout-option.active");
  return activeOpt ? activeOpt.dataset.layout : "6up";
}

async function triggerConvert() {
  if (!currentFile && !currentLocalPath) return;
  if (isProcessing) return;

  isProcessing = true;
  showLoading(true);

  const formData = new FormData();
  if (currentFile) {
    formData.append("file", currentFile);
  } else if (currentLocalPath) {
    formData.append("local_path", currentLocalPath);
  }

  const layout = getSelectedLayout();
  formData.append("layout", layout);
  formData.append("draw_border", toggleBorder.checked ? "true" : "false");
  formData.append("show_page_numbers", toggleNumbers.checked ? "true" : "false");
  formData.append("orientation", selectOrientation.value);

  try {
    const response = await fetch("/api/preview-and-convert", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (data.status === "ok") {
      currentToken = data.token;
      currentFilename = data.filename;

      // Update UI with preview image
      previewImage.src = data.preview_image;
      previewPlaceholder.style.display = "none";
      previewResultContainer.style.display = "flex";

      // Stats line
      previewStatsLine.textContent = `${data.original_slides} original slides → ${data.output_pages} A4 pages (${data.slides_per_page} slides/page • ${data.ratio_label})`;

      // Savings calculation
      if (data.original_slides > 0) {
        const savedPct = Math.round((1 - (data.output_pages / data.original_slides)) * 100);
        savingsPercent.textContent = `${savedPct}%`;
        savingsBadge.style.display = "flex";
      }

      actionBar.style.display = "flex";
    } else {
      showToast(data.message || "Error processing slides", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    isProcessing = false;
    showLoading(false);
  }
}

function showLoading(loading) {
  if (loading) {
    previewLoading.style.display = "flex";
    if (previewPlaceholder.style.display !== "none") {
      previewPlaceholder.style.opacity = "0.3";
    }
    if (previewResultContainer.style.display !== "none") {
      previewResultContainer.style.opacity = "0.3";
    }
  } else {
    previewLoading.style.display = "none";
    previewPlaceholder.style.opacity = "1";
    previewResultContainer.style.opacity = "1";
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
