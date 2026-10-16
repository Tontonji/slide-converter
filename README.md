# Slide Converter 📄✨

A dedicated, high-performance tool for converting presentation slides (PDF) into printable **N-up A4 documents** (specifically optimized for **6 slides per page** and **8 slides per page**).

Maintains **100% Vector Sharpness** with PyMuPDF — text, equations, and diagrams remain razor-sharp with zero pixelation at any zoom level or print scale.

---

## 🌟 Key Features

- **6 Slides / Page (2×3 Portrait)**: The recommended layout for study notes and lectures.
- **8 Slides / Page (2×4 Portrait)**: High density layout to save up to 87% paper.
- **4 Slides / Page & 9 Slides / Page**: Flexible grid options.
- **100% Vector Preservation**: Uses native PDF vector embeds (`fitz.show_pdf_page`), not raster images.
- **Slide Borders**: Subtle 0.5pt light-grey outline for slides with white backgrounds.
- **Page Numbers**: Automatic `Page X / Y` footer.
- **Interactive Web App**: Drag-and-drop, instant live A4 preview, paper savings calculator, one-click save directly to `Downloads` folder.
- **CLI Mode**: Convert any PDF directly from terminal or automation scripts.

---

## 🚀 Quick Start (Web App)

### 1. Launch with Web Server
Double-click `run.bat` or run:
```bash
python server.py
```
Open **[http://localhost:5050](http://localhost:5050)** in your browser.

---

## 💻 CLI Usage (Command Line)

You can convert any slide PDF directly from terminal:

### Convert to 6 Slides per Page (Default)
```bash
python converter.py "C:\Users\Jirayu\Downloads\MyLecture.pdf"
```
Output will be saved as `MyLecture_6_slides_per_page.pdf`.

### Convert to 8 Slides per Page
```bash
python converter.py "C:\Users\Jirayu\Downloads\MyLecture.pdf" --layout 8up
```

### Options
```text
options:
  -h, --help            Show help message
  -o OUTPUT             Custom output file path
  --layout {6up,8up,4up,9up,2up}
                        Grid preset (default: 6up)
  --cols COLS           Custom columns
  --rows ROWS           Custom rows
  --orientation {portrait,landscape}
                        Page orientation (default: portrait)
  --no-border           Disable slide borders
  --no-numbers          Disable page footer numbers
```

---

## 📂 Project Structure

```text
slide-converter/
├── converter.py          # Core PyMuPDF conversion engine & CLI
├── server.py             # Starlette / Uvicorn backend server
├── run.bat               # Windows double-click launcher
├── static/
│   ├── index.html        # Modern Dark-themed Web UI
│   ├── style.css         # Glassmorphism & layout styles
│   └── app.js           # Client-side reactivity & preview logic
└── README.md             # Documentation
```
