// Slide Converter - 100% Client-Side Vector PDF Engine
// Powered by PDF-Lib & PDF.js

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
}

// App State
let inputPdfBytes = null;
let currentFileName = "slides";
let convertedPdfDoc = null;
let convertedPdfBytes = null;
let previewPdfInstance = null;
let currentPreviewPage = 1;
let totalPreviewPages = 1;
let isProcessing = false;

// DOM Elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const dropContentIdle = document.getElementById("drop-content-idle");
const fileInfoBar = document.getElementById("file-info-bar");
const selectedFileName = document.getElementById("selected-file-name");
const selectedFileStats = document.getElementById("selected-file-stats");
const btnChangeFile = document.getElementById("btn-change-file");

const layoutOptions = document.querySelectorAll(".layout-option");
const toggleBorder = document.getElementById("toggle-border");
const toggleNumbers = document.getElementById("toggle-numbers");
const selectOrientation = document.getElementById("select-orientation");

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

async function triggerConvert() {
  if (!inputPdfBytes || isProcessing) return;

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
    const totalSlides = srcDoc.getPageCount();
    if (totalSlides === 0) throw new Error("Document has 0 pages");

    const slidesPerPage = cols * rows;
    const totalPages = Math.ceil(totalSlides / slidesPerPage);

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
      const startSlide = pIdx * slidesPerPage;
      const endSlide = Math.min(startSlide + slidesPerPage, totalSlides);

      const pageIndices = [];
      for (let i = startSlide; i < endSlide; i++) pageIndices.push(i);

      // Embed pages as 100% Vector XObjects
      const embeddedPages = await outDoc.embedPdf(srcDoc, pageIndices);

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
    previewStatsLine.textContent = `${totalSlides} slides → ${totalPages} A4 pages (${slidesPerPage} slides/page • 100% Vector)`;
    const savedPct = Math.round((1 - (totalPages / totalSlides)) * 100);
    savingsPercent.textContent = `${savedPct}%`;
    savingsBadge.style.display = "flex";

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
