"""
Slide Converter Core Engine
Converts slide decks (PDF) into N-up printable A4 sheets (e.g. 6 slides/page, 8 slides/page)
with 100% vector fidelity, clean borders, and page numbers.
"""

import sys
import os
import argparse
from typing import Optional, Union, Tuple
import pymupdf as fitz


def convert_pdf_to_nup(
    input_source: Union[str, bytes],
    output_path: Optional[str] = None,
    cols: int = 2,
    rows: int = 3,
    orientation: str = "portrait",
    draw_border: bool = True,
    show_page_numbers: bool = True,
    margin_x: float = 24.0,
    margin_y: float = 28.0,
    gap_x: float = 14.0,
    gap_y: float = 20.0,
    border_color: Tuple[float, float, float] = (0.8, 0.8, 0.8),
    border_width: float = 0.5,
) -> bytes:
    """
    Convert a slide presentation PDF to an N-up layout on A4 paper.
    Maintains 100% vector sharpness using PyMuPDF.
    
    Returns output PDF as bytes. If output_path is provided, also saves to file.
    """
    if isinstance(input_source, bytes):
        src_doc = fitz.open(stream=input_source, filetype="pdf")
    else:
        src_doc = fitz.open(input_source)

    total_slides = len(src_doc)
    if total_slides == 0:
        raise ValueError("Source PDF has 0 pages.")

    slides_per_page = cols * rows
    total_pages = (total_slides + slides_per_page - 1) // slides_per_page

    # A4 standard dimensions: 595.276 x 841.890 points
    a4_w, a4_h = fitz.paper_size("a4")
    if orientation.lower() == "landscape":
        page_w, page_h = max(a4_w, a4_h), min(a4_w, a4_h)
    else:
        page_w, page_h = min(a4_w, a4_h), max(a4_w, a4_h)

    # Footer reserve
    footer_reserve = 32.0 if show_page_numbers else 10.0

    # Usable area for grid
    usable_w = page_w - (2 * margin_x) - ((cols - 1) * gap_x)
    usable_h = page_h - margin_y - footer_reserve - ((rows - 1) * gap_y)

    if usable_w <= 0 or usable_h <= 0:
        raise ValueError("Margins/gaps are too large for the chosen paper size.")

    cell_w = usable_w / cols
    cell_h = usable_h / rows

    # Get aspect ratio of first slide
    sample_rect = src_doc[0].rect
    slide_ratio = (sample_rect.width / sample_rect.height) if sample_rect.height > 0 else (4.0 / 3.0)

    # Fit slide into cell while preserving aspect ratio
    if (cell_w / cell_h) > slide_ratio:
        # Cell is wider than slide -> height constrained
        target_h = cell_h
        target_w = cell_h * slide_ratio
    else:
        # Cell is taller than slide -> width constrained
        target_w = cell_w
        target_h = cell_w / slide_ratio

    offset_x = (cell_w - target_w) / 2.0
    offset_y = (cell_h - target_h) / 2.0

    out_doc = fitz.open()

    for p_idx in range(total_pages):
        page = out_doc.new_page(width=page_w, height=page_h)
        start_slide = p_idx * slides_per_page

        for i in range(slides_per_page):
            slide_idx = start_slide + i
            if slide_idx >= total_slides:
                break

            c = i % cols
            r = i // cols

            x0 = margin_x + c * (cell_w + gap_x) + offset_x
            y0 = margin_y + r * (cell_h + gap_y) + offset_y
            x1 = x0 + target_w
            y1 = y0 + target_h

            rect = fitz.Rect(x0, y0, x1, y1)
            page.show_pdf_page(rect, src_doc, slide_idx, keep_proportion=True)

            if draw_border:
                page.draw_rect(rect, color=border_color, width=border_width)

        if show_page_numbers:
            footer_text = f"Page {p_idx + 1} / {total_pages}"
            text_point = fitz.Point(page_w / 2.0 - 24.0, page_h - 14.0)
            page.insert_text(text_point, footer_text, fontsize=8.5, color=(0.45, 0.45, 0.45))

    pdf_bytes = out_doc.tobytes(deflate=True, garbage=3)
    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(pdf_bytes)

    out_doc.close()
    src_doc.close()
    return pdf_bytes


def render_preview_image(pdf_bytes_or_path: Union[str, bytes], page_num: int = 0, dpi: int = 140) -> bytes:
    """Render a page of a PDF as PNG bytes for instant UI preview."""
    if isinstance(pdf_bytes_or_path, bytes):
        doc = fitz.open(stream=pdf_bytes_or_path, filetype="pdf")
    else:
        doc = fitz.open(pdf_bytes_or_path)

    if len(doc) <= page_num:
        page_num = 0

    page = doc[page_num]
    pix = page.get_pixmap(dpi=dpi)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


def get_pdf_metadata(pdf_bytes_or_path: Union[str, bytes]) -> dict:
    """Extract page count and initial dimensions from PDF."""
    if isinstance(pdf_bytes_or_path, bytes):
        doc = fitz.open(stream=pdf_bytes_or_path, filetype="pdf")
    else:
        doc = fitz.open(pdf_bytes_or_path)

    count = len(doc)
    ratio = 1.3333
    if count > 0:
        r = doc[0].rect
        ratio = round(r.width / r.height, 3) if r.height > 0 else 1.3333

    doc.close()
    return {
        "page_count": count,
        "aspect_ratio": ratio,
        "ratio_label": "16:9" if ratio > 1.6 else ("4:3" if ratio > 1.25 else "Other")
    }


def main():
    parser = argparse.ArgumentParser(description="Slide Converter: Convert PDF slides into N-up A4 documents.")
    parser.add_argument("input", help="Path to input PDF file")
    parser.add_argument("-o", "--output", help="Path to output PDF file (default: same folder with suffix)")
    parser.add_argument("--layout", choices=["6up", "8up", "4up", "9up", "2up"], default="6up", help="Grid preset")
    parser.add_argument("--cols", type=int, help="Custom column count (overrides layout)")
    parser.add_argument("--rows", type=int, help="Custom row count (overrides layout)")
    parser.add_argument("--orientation", choices=["portrait", "landscape"], default="portrait", help="Page orientation")
    parser.add_argument("--no-border", action="store_true", help="Disable slide border")
    parser.add_argument("--no-numbers", action="store_true", help="Disable page numbers")

    args = parser.parse_args()

    layout_map = {
        "6up": (2, 3),
        "8up": (2, 4),
        "4up": (2, 2),
        "9up": (3, 3),
        "2up": (1, 2)
    }

    cols, rows = layout_map.get(args.layout, (2, 3))
    if args.cols:
        cols = args.cols
    if args.rows:
        rows = args.rows

    if not args.output:
        base, ext = os.path.splitext(args.input)
        args.output = f"{base}_{cols*rows}_slides_per_page{ext}"

    print(f"Converting '{args.input}' -> '{args.output}' ({cols}x{rows} on A4 {args.orientation})...")
    convert_pdf_to_nup(
        input_source=args.input,
        output_path=args.output,
        cols=cols,
        rows=rows,
        orientation=args.orientation,
        draw_border=not args.no_border,
        show_page_numbers=not args.no_numbers
    )
    print(f"Successfully generated: {args.output}")


if __name__ == "__main__":
    main()
