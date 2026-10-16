"""
Slide Converter Web Server
Fast Starlette backend serving an interactive web app and PDF conversion API.
"""

import os
import io
import uuid
import base64
import glob
from pathlib import Path
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response, FileResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import uvicorn

import converter

# In-memory or temp storage for processed PDFs
TEMP_STORAGE = {}

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DOWNLOADS_DIR = Path(os.path.expanduser("~")) / "Downloads"


async def index(request):
    return FileResponse(STATIC_DIR / "index.html")


async def get_recent_downloads(request):
    """List recent PDF files in Downloads folder for quick one-click selection."""
    try:
        files = []
        if DOWNLOADS_DIR.exists():
            for p in sorted(DOWNLOADS_DIR.glob("*.pdf"), key=os.path.getmtime, reverse=True)[:10]:
                files.append({
                    "name": p.name,
                    "path": str(p),
                    "size_mb": round(p.stat().st_size / (1024 * 1024), 2)
                })
        return JSONResponse({"status": "ok", "recent_files": files})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


async def preview_and_convert(request):
    """
    Accepts an uploaded PDF (or local path) and parameters.
    Compiles into N-up PDF, generates a high-res preview of page 1,
    and caches the PDF for immediate download or saving.
    """
    try:
        form = await request.form()
        uploaded_file = form.get("file")
        local_path = form.get("local_path")
        
        layout = form.get("layout", "6up")
        cols = int(form.get("cols", 2))
        rows = int(form.get("rows", 3))
        orientation = form.get("orientation", "portrait")
        draw_border = form.get("draw_border", "true").lower() in ("true", "1", "yes")
        show_page_numbers = form.get("show_page_numbers", "true").lower() in ("true", "1", "yes")

        layout_map = {
            "6up": (2, 3),
            "8up": (2, 4),
            "4up": (2, 2),
            "9up": (3, 3),
            "2up": (1, 2)
        }
        if layout in layout_map:
            cols, rows = layout_map[layout]

        filename = "slides.pdf"
        if uploaded_file and hasattr(uploaded_file, "read"):
            input_bytes = await uploaded_file.read()
            filename = getattr(uploaded_file, "filename", "slides.pdf")
        elif local_path and os.path.exists(local_path):
            with open(local_path, "rb") as f:
                input_bytes = f.read()
            filename = Path(local_path).name
        else:
            return JSONResponse({"status": "error", "message": "No valid file or path provided"}, status_code=400)

        # Extract metadata
        meta = converter.get_pdf_metadata(input_bytes)
        total_slides = meta["page_count"]
        slides_per_page = cols * rows
        total_pages = (total_slides + slides_per_page - 1) // slides_per_page

        # Convert to N-up
        output_pdf_bytes = converter.convert_pdf_to_nup(
            input_source=input_bytes,
            cols=cols,
            rows=rows,
            orientation=orientation,
            draw_border=draw_border,
            show_page_numbers=show_page_numbers
        )

        # Generate preview image
        preview_png_bytes = converter.render_preview_image(output_pdf_bytes, page_num=0, dpi=140)
        preview_base64 = base64.b64encode(preview_png_bytes).decode("ascii")

        # Cache in memory
        token = str(uuid.uuid4())
        base_name = os.path.splitext(filename)[0]
        out_filename = f"{base_name}_{slides_per_page}_slides_per_page.pdf"
        
        TEMP_STORAGE[token] = {
            "bytes": output_pdf_bytes,
            "filename": out_filename
        }

        # Keep storage under control
        if len(TEMP_STORAGE) > 20:
            oldest_key = next(iter(TEMP_STORAGE))
            TEMP_STORAGE.pop(oldest_key, None)

        return JSONResponse({
            "status": "ok",
            "token": token,
            "filename": out_filename,
            "original_slides": total_slides,
            "output_pages": total_pages,
            "aspect_ratio": meta["aspect_ratio"],
            "ratio_label": meta["ratio_label"],
            "slides_per_page": slides_per_page,
            "preview_image": f"data:image/png;base64,{preview_base64}"
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


async def download_pdf(request):
    """Download the converted PDF file."""
    token = request.query_params.get("token")
    if not token or token not in TEMP_STORAGE:
        return Response("PDF not found or expired", status_code=404)

    item = TEMP_STORAGE[token]
    return Response(
        item["bytes"],
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{item["filename"]}"'}
    )


async def save_to_downloads(request):
    """Save directly to the user's Downloads directory."""
    try:
        data = await request.json()
        token = data.get("token")
        custom_name = data.get("filename")

        if not token or token not in TEMP_STORAGE:
            return JSONResponse({"status": "error", "message": "File token expired or missing"}, status_code=404)

        item = TEMP_STORAGE[token]
        save_name = custom_name if custom_name else item["filename"]
        target_path = DOWNLOADS_DIR / save_name

        with open(target_path, "wb") as f:
            f.write(item["bytes"])

        return JSONResponse({
            "status": "ok",
            "saved_path": str(target_path),
            "message": f"Successfully saved to {target_path.name}"
        })
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


routes = [
    Route("/", endpoint=index, methods=["GET"]),
    Route("/api/recent-downloads", endpoint=get_recent_downloads, methods=["GET"]),
    Route("/api/preview-and-convert", endpoint=preview_and_convert, methods=["POST"]),
    Route("/api/download", endpoint=download_pdf, methods=["GET"]),
    Route("/api/save-to-downloads", endpoint=save_to_downloads, methods=["POST"]),
    Mount("/static", app=StaticFiles(directory=STATIC_DIR), name="static"),
]

middleware = [
    Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
]

app = Starlette(debug=True, routes=routes, middleware=middleware)

if __name__ == "__main__":
    import sys
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    port = int(os.environ.get("PORT", 5050))
    print("\n" + "=" * 50)
    print("Slide Converter Web App is running!")
    print(f"Open in browser: http://localhost:{port}")
    print("=" * 50 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
