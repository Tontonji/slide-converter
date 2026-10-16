// Slide Converter - 100% Client-Side Vector PDF Engine
// Powered by PDF-Lib & PDF.js

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
}

// App State
let inputPdfBytes = null;
let currentFileName = "slides";
let convertedPdfBytes = null;
let previewPdfInstance = null;
let sourcePdfInstance = null; // for thumbnail picker
let currentPreviewPage = 1;
let totalPreviewPages = 1;
let isProcessing = false;

// Slide selection state
let totalSlideCount = 0;
let selectedSlideIndices = []; // 0-based list of indices

// DOM Elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const dropContentIdle = document.getElementById("drop-content-idle");
const fileInfoBar = document.getElementById("file-info-bar");
const selectedFileName = document.getElementById("selected-file-name");
const selectedFileStats = document.getElementById("selected-file-stats");
const btnChangeFile = document.getElementById("btn-change-file");

// Selection card
const selectionCard = document.getElementById("selection-card");
const selectionSummaryBadge = document.getElementById("selection-summary-badge");
const slideRangeInput = document.getElementById("slide-range-input");
const btnApplyRange = document.getElementById("btn-apply-range");
const chipAll = document.getElementById("chip-all");
const chipSkipFirst = document.getElementById("chip-skip-first");
const chipEven = document.getElementById("chip-even");
const chipOdd = document.getElementById("chip-odd");
const btnOpenPicker = document.getElementById("btn-open-picker");

// Modal Elements
const pickerModal = document.getElementById("picker-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelModal = document.getElementById("btn-cancel-modal");
const btnApplyModal = document.getElementById("btn-apply-modal");
const modalCounter = document.getElementById("modal-counter");
const thumbnailGrid = document.getElementById("thumbnail-grid");
const modalSelectAll = document.getElementById("modal-select-all");
const modalDeselectAll = document.getElementById("modal-deselect-all");
const modalExcludeFirst = document.getElementById("modal-exclude-first");
const modalInvert = document.getElementById("modal-invert");

// Layout & fine tuning
const layoutOptions = document.querySelectorAll(".layout-option");
const toggleBorder = document.getElementById("toggle-border");
const toggleNumbers = document.getElementById("toggle-numbers");
const selectOrientation = document.getElementById("select-orientation");

// Preview Elements
const previewPlaceholder = document.getElementById("preview-placeholder");
const previewLoading = document.getElementById("preview-loading");
const previewResultContainer = document.getElementById("preview-result-container");
const previewCanvas = document.getElementById("preview-canvas");
const previewStatsLine = document.getElementById("preview-stats-line");
const savingsBadge = document.getElementById("savings-badge");
const savingsPercent = document.getElementById("savings-percent");

const previewNavBar = document.getElementById("preview-nav-bar");
const btnPrevPage = document.getElementById("btn-prev-page");
const btnNextPage = document.getElementById("btn-next-page");
const navPageIndicator = document.getElementById("nav-page-indicator");

const actionBar = document.getElementById("action-bar");
const btnDownload = document.getElementById("btn-download");

// Temp selection inside modal
let modalTempSelection = new Set();

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
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
      showToast("Please drop a valid PDF file", "error");
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

  // Range input & presets
  btnApplyRange.addEventListener("click", applyRangeFromInput);
  slideRangeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyRangeFromInput();
    }
  });

  chipAll.addEventListener("click", () => {
    setSelectedPreset("all");
    selectedSlideIndices = Array.from({ length: totalSlideCount }, (_, i) => i);
    updateRangeInputDisplay();
    triggerConvert();
  });

  chipSkipFirst.addEventListener("click", () => {
    if (totalSlideCount <= 1) return;
    setSelectedPreset("skip-first");
    selectedSlideIndices = Array.from({ length: totalSlideCount - 1 }, (_, i) => i + 1);
    updateRangeInputDisplay();
    triggerConvert();
  });

  chipEven.addEventListener("click", () => {
    setSelectedPreset("even");
    selectedSlideIndices = Array.from({ length: totalSlideCount }, (_, i) => i).filter(i => (i + 1) % 2 === 0);
    updateRangeInputDisplay();
    triggerConvert();
  });

  chipOdd.addEventListener("click", () => {
    setSelectedPreset("odd");
    selectedSlideIndices = Array.from({ length: totalSlideCount }, (_, i) => i).filter(i => (i + 1) % 2 !== 0);
    updateRangeInputDisplay();
    triggerConvert();
  });

  // Visual Picker Modal
  btnOpenPicker.addEventListener("click", openVisualPicker);
  btnCloseModal.addEventListener("click", closeVisualPicker);
  btnCancelModal.addEventListener("click", closeVisualPicker);
  btnApplyModal.addEventListener("click", applyVisualPickerSelection);

  modalSelectAll.addEventListener("click", () => {
    modalTempSelection = new Set(Array.from({ length: totalSlideCount }, (_, i) => i));
    refreshModalCards();
  });

  modalDeselectAll.addEventListener("click", () => {
    modalTempSelection.clear();
    refreshModalCards();
  });

  modalExcludeFirst.addEventListener("click", () => {
    modalTempSelection.delete(0);
    refreshModalCards();
  });

  modalInvert.addEventListener("click", () => {
    const inverted = new Set();
    for (let i = 0; i < totalSlideCount; i++) {
      if (!modalTempSelection.has(i)) inverted.add(i);
    }
    modalTempSelection = inverted;
    refreshModalCards();
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

  // Options
  toggleBorder.addEventListener("change", triggerConvert);
  toggleNumbers.addEventListener("change", triggerConvert);
  selectOrientation.addEventListener("change", triggerConvert);

  // Preview Pagination
  btnPrevPage.addEventListener("click", () => {
    if (currentPreviewPage > 1) {
      currentPreviewPage--;
      renderPreviewPage(currentPreviewPage);
    }
  });

  btnNextPage.addEventListener("click", () => {
    if (currentPreviewPage < totalPreviewPages) {
      currentPreviewPage++;
      renderPreviewPage(currentPreviewPage);
    }
  });

  // Download Action
  btnDownload.addEventListener("click", () => {
    if (!convertedPdfBytes) return;
    const blob = new Blob([convertedPdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const activeLayout = getSelectedLayout();
    const slidesPerPage = activeLayout === '8up' ? 8 : (activeLayout === '4up' ? 4 : (activeLayout === '9up' ? 9 : 6));
    a.href = url;
    a.download = `${currentFileName}_${slidesPerPage}_slides_per_page.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("PDF downloaded successfully!", "success");
  });
}

async function handleSelectedFile(file) {
  currentFileName = file.name.replace(/\.[^/.]+$/, "");
  displayFileInfo(file.name, (file.size / (1024 * 1024)).toFixed(2) + " MB");
  
  try {
    inputPdfBytes = await file.arrayBuffer();
    
    // Load source PDF with PDF.js to get slide count & prepare thumbnails
    const loadingTask = pdfjsLib.getDocument({ data: inputPdfBytes });
    sourcePdfInstance = await loadingTask.promise;
    totalSlideCount = sourcePdfInstance.numPages;

    // Default select all slides
    selectedSlideIndices = Array.from({ length: totalSlideCount }, (_, i) => i);
    selectionCard.style.display = "block";
    updateRangeInputDisplay();
    setSelectedPreset("all");

    triggerConvert();
  } catch (err) {
    showToast("Error reading PDF: " + err.message, "error");
  }
}

function displayFileInfo(name, sizeStr) {
  selectedFileName.textContent = name;
  selectedFileStats.textContent = sizeStr;
  dropContentIdle.style.display = "none";
  fileInfoBar.style.display = "flex";
}

function getSelectedLayout() {
  const activeOpt = document.querySelector(".layout-option.active");
  return activeOpt ? activeOpt.dataset.layout : "6up";
}

// Range parsing and formatting
function parseRangeString(str, total) {
  if (!str || str.trim().toLowerCase() === "all" || str.trim() === "*") {
    return Array.from({ length: total }, (_, i) => i);
  }

  const selected = new Set();
  const parts = str.replace(/\s+/g, "").split(",");
  for (const part of parts) {
    if (!part) continue;
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.max(1, start);
        const to = Math.min(total, end);
        for (let p = from; p <= to; p++) selected.add(p - 1);
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && p <= total) {
        selected.add(p - 1);
      }
    }
  }

  const res = Array.from(selected).sort((a, b) => a - b);
  return res.length > 0 ? res : Array.from({ length: total }, (_, i) => i);
}

function formatIndicesToRange(indices, total) {
  if (indices.length === total) return "all";
  if (indices.length === 0) return "";

  const pages = indices.map(i => i + 1).sort((a, b) => a - b);
  const ranges = [];
  let start = pages[0];
  let prev = pages[0];

  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === prev + 1) {
      prev = pages[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = pages[i];
      prev = pages[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(", ");
}

function updateRangeInputDisplay() {
  slideRangeInput.value = formatIndicesToRange(selectedSlideIndices, totalSlideCount);
  selectionSummaryBadge.textContent = `${selectedSlideIndices.length} / ${totalSlideCount} slides selected`;
}

function applyRangeFromInput() {
  if (totalSlideCount === 0) return;
  const parsed = parseRangeString(slideRangeInput.value, totalSlideCount);
  selectedSlideIndices = parsed;
  updateRangeInputDisplay();
  clearPresetChips();
  triggerConvert();
  showToast(`Applied selection: ${selectedSlideIndices.length} slides`, "info");
}

function setSelectedPreset(preset) {
  clearPresetChips();
  if (preset === "all") chipAll.classList.add("active");
  if (preset === "skip-first") chipSkipFirst.classList.add("active");
  if (preset === "even") chipEven.classList.add("active");
  if (preset === "odd") chipOdd.classList.add("active");
}

function clearPresetChips() {
  [chipAll, chipSkipFirst, chipEven, chipOdd].forEach(chip => chip.classList.remove("active"));
}

// Visual Picker Modal Logic
async function openVisualPicker() {
  if (!sourcePdfInstance || totalSlideCount === 0) {
    showToast("Please upload a PDF first", "error");
    return;
  }

  modalTempSelection = new Set(selectedSlideIndices);
  pickerModal.style.display = "flex";
  updateModalCounter();
  buildThumbnailGrid();
}

function closeVisualPicker() {
  pickerModal.style.display = "none";
}

function applyVisualPickerSelection() {
  if (modalTempSelection.size === 0) {
    showToast("Please select at least 1 slide", "error");
    return;
  }

  selectedSlideIndices = Array.from(modalTempSelection).sort((a, b) => a - b);
  updateRangeInputDisplay();
  clearPresetChips();
  closeVisualPicker();
  triggerConvert();
  showToast(`Updated to ${selectedSlideIndices.length} slides`, "success");
}

function updateModalCounter() {
  modalCounter.textContent = `Selected ${modalTempSelection.size} of ${totalSlideCount} slides`;
}

function buildThumbnailGrid() {
  thumbnailGrid.innerHTML = "";

  for (let i = 0; i < totalSlideCount; i++) {
    const isSelected = modalTempSelection.has(i);
    const card = document.createElement("div");
    card.className = `thumb-card ${isSelected ? "selected" : "excluded"}`;
    card.dataset.index = i;

    const canvas = document.createElement("canvas");
    canvas.className = "thumb-card-canvas";
    canvas.id = `thumb-canvas-${i}`;

    const meta = document.createElement("div");
    meta.className = "thumb-meta";
    meta.innerHTML = `
      <span class="thumb-num">#${i + 1}</span>
      <div class="thumb-check">${isSelected ? "✓" : ""}</div>
    `;

    card.appendChild(canvas);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      toggleCardSelection(card, i);
    });

    thumbnailGrid.appendChild(card);
  }

  // Lazy render thumbnails
  lazyRenderThumbnails();
}

function toggleCardSelection(card, idx) {
  if (modalTempSelection.has(idx)) {
    modalTempSelection.delete(idx);
    card.classList.remove("selected");
    card.classList.add("excluded");
    card.querySelector(".thumb-check").textContent = "";
  } else {
    modalTempSelection.add(idx);
    card.classList.add("selected");
    card.classList.remove("excluded");
    card.querySelector(".thumb-check").textContent = "✓";
  }
  updateModalCounter();
}

function refreshModalCards() {
  const cards = thumbnailGrid.querySelectorAll(".thumb-card");
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const isSelected = modalTempSelection.has(idx);
    if (isSelected) {
      card.classList.add("selected");
      card.classList.remove("excluded");
      card.querySelector(".thumb-check").textContent = "✓";
    } else {
      card.classList.remove("selected");
      card.classList.add("excluded");
      card.querySelector(".thumb-check").textContent = "";
    }
  });
  updateModalCounter();
}

async function lazyRenderThumbnails() {
  // Render visible thumbnails
  for (let i = 0; i < totalSlideCount; i++) {
    const canvas = document.getElementById(`thumb-canvas-${i}`);
    if (!canvas || canvas.dataset.rendered === "true") continue;

    try {
      const page = await sourcePdfInstance.getPage(i + 1);
      const viewport = page.getViewport({ scale: 0.28 });
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      canvas.dataset.rendered = "true";
    } catch (e) {
      console.warn("Thumbnail render error:", e);
    }
  }
}

// Convert logic using selectedSlideIndices
async function triggerConvert() {
  if (!inputPdfBytes || isProcessing) return;

  if (selectedSlideIndices.length === 0) {
    showToast("No slides selected!", "error");
    return;
  }

  isProcessing = true;
  showLoading(true);

  try {
    const { PDFDocument, PageSizes, rgb, StandardFonts } = PDFLib;
    const layout = getSelectedLayout();
    
    let cols = 2, rows = 3;
    if (layout === "8up") { cols = 2; rows = 4; }
    else if (layout === "4up") { cols = 2; rows = 2; }
    else if (layout === "9up") { cols = 3; rows = 3; }

    const orientation = selectOrientation.value;
    const drawBorder = toggleBorder.checked;
    const showPageNumbers = toggleNumbers.checked;

    // Load source PDF
    const srcDoc = await PDFDocument.load(inputPdfBytes);
    const totalSelected = selectedSlideIndices.length;

    const slidesPerPage = cols * rows;
    const totalPages = Math.ceil(totalSelected / slidesPerPage);

    const outDoc = await PDFDocument.create();
    const font = await outDoc.embedFont(StandardFonts.Helvetica);

    // A4 dimensions in points
    const a4 = PageSizes.A4; // [595.28, 841.89]
    const pageW = orientation === "landscape" ? Math.max(...a4) : Math.min(...a4);
    const pageH = orientation === "landscape" ? Math.min(...a4) : Math.max(...a4);

    const marginX = 24;
    const marginY = 28;
    const gapX = 14;
    const gapY = 20;
    const footerReserve = showPageNumbers ? 32 : 10;

    const usableW = pageW - (2 * marginX) - ((cols - 1) * gapX);
    const usableH = pageH - marginY - footerReserve - ((rows - 1) * gapY);

    const cellW = usableW / cols;
    const cellH = usableH / rows;

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const page = outDoc.addPage([pageW, pageH]);
      const startIdx = pIdx * slidesPerPage;
      const endIdx = Math.min(startIdx + slidesPerPage, totalSelected);

      // Map to actual selected original slide indices
      const currentBatchSlideIndices = selectedSlideIndices.slice(startIdx, endIdx);

      // Embed pages as 100% Vector XObjects
      const embeddedPages = await outDoc.embedPdf(srcDoc, currentBatchSlideIndices);

      for (let i = 0; i < embeddedPages.length; i++) {
        const embedded = embeddedPages[i];
        const slideRatio = embedded.width / embedded.height;

        let targetW, targetH;
        if ((cellW / cellH) > slideRatio) {
          targetH = cellH;
          targetW = cellH * slideRatio;
        } else {
          targetW = cellW;
          targetH = cellW / slideRatio;
        }

        const c = i % cols;
        const r = Math.floor(i / cols);

        const offsetX = (cellW - targetW) / 2;
        const offsetY = (cellH - targetH) / 2;

        const x = marginX + c * (cellW + gapX) + offsetX;
        const yFromTop = marginY + r * (cellH + gapY) + offsetY;
        const y = pageH - yFromTop - targetH;

        page.drawPage(embedded, {
          x: x,
          y: y,
          width: targetW,
          height: targetH
        });

        if (drawBorder) {
          page.drawRectangle({
            x: x,
            y: y,
            width: targetW,
            height: targetH,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5
          });
        }
      }

      if (showPageNumbers) {
        const footerText = `Page ${pIdx + 1} / ${totalPages}`;
        const textWidth = font.widthOfTextAtSize(footerText, 8.5);
        page.drawText(footerText, {
          x: (pageW - textWidth) / 2,
          y: 14,
          size: 8.5,
          font: font,
          color: rgb(0.45, 0.45, 0.45)
        });
      }
    }

    convertedPdfBytes = await outDoc.save();
    totalPreviewPages = totalPages;
    currentPreviewPage = 1;

    // Load in PDF.js for instant Canvas rendering
    const loadingTask = pdfjsLib.getDocument({ data: convertedPdfBytes });
    previewPdfInstance = await loadingTask.promise;

    await renderPreviewPage(1);

    // Update stats and savings badge
    previewStatsLine.textContent = `${totalSelected} slides selected (of ${totalSlideCount}) → ${totalPages} A4 pages (${slidesPerPage} slides/page)`;
    if (totalSlideCount > 0) {
      const savedPct = Math.round((1 - (totalPages / totalSlideCount)) * 100);
      savingsPercent.textContent = `${savedPct}%`;
      savingsBadge.style.display = "flex";
    }

    previewPlaceholder.style.display = "none";
    previewResultContainer.style.display = "flex";
    actionBar.style.display = "flex";

    if (totalPages > 1) {
      previewNavBar.style.display = "flex";
      updateNavControls();
    } else {
      previewNavBar.style.display = "none";
    }

    showToast("Generated high-fidelity vector A4 layout!", "success");
  } catch (err) {
    console.error(err);
    showToast("Conversion failed: " + err.message, "error");
  } finally {
    isProcessing = false;
    showLoading(false);
  }
}

async function renderPreviewPage(pageNum) {
  if (!previewPdfInstance) return;
  const page = await previewPdfInstance.getPage(pageNum);

  const desiredWidth = 750;
  const viewport = page.getViewport({ scale: desiredWidth / page.getViewport({ scale: 1.0 }).width });

  const canvas = previewCanvas;
  const context = canvas.getContext("2d");
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };

  await page.render(renderContext).promise;
  updateNavControls();
}

function updateNavControls() {
  navPageIndicator.textContent = `Page ${currentPreviewPage} of ${totalPreviewPages}`;
  btnPrevPage.disabled = currentPreviewPage <= 1;
  btnNextPage.disabled = currentPreviewPage >= totalPreviewPages;
}

function showLoading(loading) {
  if (loading) {
    previewLoading.style.display = "flex";
    if (previewPlaceholder.style.display !== "none") previewPlaceholder.style.opacity = "0.3";
    if (previewResultContainer.style.display !== "none") previewResultContainer.style.opacity = "0.3";
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
