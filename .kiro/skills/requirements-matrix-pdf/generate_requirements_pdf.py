#!/usr/bin/env python3
"""Genera un PDF con la Matriz de Identificación de Requerimientos.

Formato corporativo INTELIX alineado al layout visual del skill Excel
(requirements-matrix-excel): tipografía Arial, headers grises, bordes #999999,
encabezado en 3 filas y tabla con entregables agrupados (merge visual).
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOGO_PATH = os.path.join(SCRIPT_DIR, "assets", "logointelix-sin-fondo.png")
LOGO_PATH = os.environ.get("MATRIZ_LOGO_PATH", DEFAULT_LOGO_PATH)

PAGE_W, PAGE_H = landscape(letter)
MARGIN = 1.0 * cm
USABLE_W = PAGE_W - 2 * MARGIN

# Colores alineados al Excel
BORDER_COLOR = colors.HexColor("#999999")
HEADER_FILL = colors.HexColor("#EFEFEF")
BLACK = colors.HexColor("#000000")

# Proporciones de columnas de la tabla principal (equivalentes a B-L del Excel)
# Entregable | Código | Requerimiento | Criterios | Fuente | Estado
COL_WIDTHS = [
    USABLE_W * 0.14,
    USABLE_W * 0.07,
    USABLE_W * 0.28,
    USABLE_W * 0.28,
    USABLE_W * 0.13,
    USABLE_W * 0.10,
]

FONT_REG = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def _register_fonts() -> None:
    """Intenta registrar Arial (como el Excel); si no, queda Helvetica."""
    global FONT_REG, FONT_BOLD
    candidates = [
        (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
        ("/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
         "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf"),
        ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ]
    for regular, bold in candidates:
        if os.path.exists(regular) and os.path.exists(bold):
            try:
                pdfmetrics.registerFont(TTFont("MatrizArial", regular))
                pdfmetrics.registerFont(TTFont("MatrizArial-Bold", bold))
                FONT_REG = "MatrizArial"
                FONT_BOLD = "MatrizArial-Bold"
                return
            except Exception:
                continue


def load_input(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_summary(requirements: list[dict]) -> tuple[int, int, int, int]:
    """Misma lógica que el generador Excel.

    Returns:
        (cantidad_gestiones_unicas, alcance_count, cambio_count, total)
    """
    alcance_count = sum(
        1 for r in requirements if r.get("fuente", "").startswith("Alcance")
    )
    cambio_count = sum(
        1 for r in requirements if r.get("fuente", "").startswith("Gestión")
    )
    total_count = len(requirements)
    cambio_numbers = {
        r.get("fuente", "")
        for r in requirements
        if r.get("fuente", "").startswith("Gestión")
    }
    return len(cambio_numbers), alcance_count, cambio_count, total_count


def _format_fecha(fecha_str: str) -> str:
    if not fecha_str:
        return ""
    try:
        return datetime.strptime(fecha_str, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return fecha_str


def _to_para_text(value: str | None) -> str:
    """Escapa XML y convierte saltos/markdown ligero a markup de Paragraph."""
    text = escape(value or "")
    text = text.replace("\n", "<br/>")
    # **negrita** → <b>negrita</b> (frecuente en requirements.md)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return text


def _styles() -> dict[str, ParagraphStyle]:
    return {
        "title": ParagraphStyle(
            "MatrizTitle",
            fontName=FONT_BOLD,
            fontSize=16,
            leading=20,
            alignment=TA_CENTER,
            textColor=BLACK,
        ),
        "label": ParagraphStyle(
            "MatrizLabel",
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=BLACK,
        ),
        "value": ParagraphStyle(
            "MatrizValue",
            fontName=FONT_REG,
            fontSize=9,
            leading=11,
            textColor=BLACK,
        ),
        "value_center": ParagraphStyle(
            "MatrizValueCenter",
            fontName=FONT_REG,
            fontSize=9,
            leading=11,
            alignment=TA_CENTER,
            textColor=BLACK,
        ),
        "th": ParagraphStyle(
            "MatrizTableHeader",
            fontName=FONT_BOLD,
            fontSize=10,
            leading=12,
            alignment=TA_CENTER,
            textColor=BLACK,
        ),
        "td": ParagraphStyle(
            "MatrizTableData",
            fontName=FONT_REG,
            fontSize=9,
            leading=11,
            alignment=TA_LEFT,
            textColor=BLACK,
        ),
        "td_center": ParagraphStyle(
            "MatrizTableDataCenter",
            fontName=FONT_REG,
            fontSize=9,
            leading=11,
            alignment=TA_CENTER,
            textColor=BLACK,
        ),
    }


def _border_style(extra: list | None = None) -> TableStyle:
    cmds = [
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if extra:
        cmds.extend(extra)
    return TableStyle(cmds)


def build_logo_title(styles: dict[str, ParagraphStyle]) -> Table:
    title = Paragraph("Matriz de Identificación de Requerimientos", styles["title"])
    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=3.2 * cm, height=1.05 * cm)
        table = Table([[logo, title]], colWidths=[4.0 * cm, USABLE_W - 4.0 * cm])
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "CENTER"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        return table

    print(
        f"Advertencia: logo no encontrado en {LOGO_PATH}; se genera sin logo.",
        file=sys.stderr,
    )
    table = Table([[title]], colWidths=[USABLE_W])
    table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def build_header_block(header: dict, requirements: list[dict], styles: dict) -> list:
    """Replica filas 4-6 del Excel."""
    elements: list = []
    p = styles

    estado = header.get("estado_proyecto", "En Definición")
    categoria = header.get("categoria", "Aplicaciones")
    ramo = header.get("ramo_cliente", "")
    lider = header.get("lider_proyecto", "")
    codigo = header.get("codigo", "")
    proyecto = header.get("proyecto", "")
    fecha = _format_fecha(header.get("fecha_actualizacion", ""))
    gestiones, alcance, cambio, total = compute_summary(requirements)

    # --- Fila 4: Estado / Categoría (alineada a la derecha, como Excel I-L) ---
    left_spacer = USABLE_W * 0.55
    right_w = USABLE_W * 0.45
    row4 = Table(
        [[
            Paragraph("Estado", p["label"]),
            Paragraph(estado, p["value"]),
            Paragraph("Categoría", p["label"]),
            Paragraph(categoria, p["value"]),
        ]],
        colWidths=[right_w * 0.20, right_w * 0.30, right_w * 0.25, right_w * 0.25],
    )
    row4.setStyle(_border_style())

    # Empujar a la derecha con una tabla contenedora
    row4_wrap = Table(
        [[Spacer(left_spacer, 1), row4]],
        colWidths=[left_spacer, right_w],
    )
    row4_wrap.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(row4_wrap)

    # --- Fila 5: datos del proyecto ---
    # Ramo | val | Líder | val | Código | val | Proyecto | val (span 2) | Fecha | val
    cw5 = [
        USABLE_W * 0.09,  # Ramo label
        USABLE_W * 0.08,  # Ramo value
        USABLE_W * 0.10,  # Líder label
        USABLE_W * 0.14,  # Líder value
        USABLE_W * 0.06,  # Código label
        USABLE_W * 0.08,  # Código value
        USABLE_W * 0.07,  # Proyecto label
        USABLE_W * 0.16,  # Proyecto value (will span visually as one cell)
        USABLE_W * 0.12,  # Fecha label
        USABLE_W * 0.10,  # Fecha value
    ]
    # Ajuste: proyecto ocupa una sola celda ancha (cols 7 alone with width 0.16)
    # Excel merges I5:J5 for proyecto value — aquí una celda ancha basta.
    row5 = Table(
        [[
            Paragraph("Ramo Cliente", p["label"]),
            Paragraph(ramo, p["value_center"]),
            Paragraph("Líder de Proyecto", p["label"]),
            Paragraph(lider, p["value"]),
            Paragraph("Código", p["label"]),
            Paragraph(codigo, p["value_center"]),
            Paragraph("Proyecto", p["label"]),
            Paragraph(proyecto, p["value"]),
            Paragraph("Fecha de Actualización", p["label"]),
            Paragraph(fecha, p["value_center"]),
        ]],
        colWidths=cw5,
    )
    row5.setStyle(_border_style())
    elements.append(row5)

    # --- Fila 6: resumen de cantidades (misma lógica Excel) ---
    cw6 = [
        USABLE_W * 0.18,  # Cantidad Gestión de Cambio
        USABLE_W * 0.05,  # count gestiones
        USABLE_W * 0.16,  # Cantidad de Requerimientos
        USABLE_W * 0.12,  # Alcance Inicial
        USABLE_W * 0.05,  # alcance count
        USABLE_W * 0.16,  # Por Gestiones de Cambio
        USABLE_W * 0.05,  # cambio count
        USABLE_W * 0.06,  # Total
        USABLE_W * 0.05,  # total
        USABLE_W * 0.12,  # filler para completar ancho
    ]
    # Normalizar para que sumen USABLE_W
    scale = USABLE_W / sum(cw6)
    cw6 = [w * scale for w in cw6]

    row6 = Table(
        [[
            Paragraph("Cantidad Gestión de Cambio", p["label"]),
            Paragraph(str(gestiones), p["value_center"]),
            Paragraph("Cantidad de Requerimientos", p["label"]),
            Paragraph("Alcance Inicial", p["value"]),
            Paragraph(str(alcance), p["value_center"]),
            Paragraph("Por Gestiones de Cambio", p["value"]),
            Paragraph(str(cambio), p["value_center"]),
            Paragraph("Total", p["value"]),
            Paragraph(str(total), p["value_center"]),
            Paragraph("", p["value"]),
        ]],
        colWidths=cw6,
    )
    row6.setStyle(_border_style([
        ("SPAN", (9, 0), (9, 0)),
    ]))
    elements.append(row6)
    return elements


def _group_entregables(requirements: list[dict]) -> list[tuple[str, list[dict]]]:
    """Agrupa filas contiguas por entregable (como el merge del Excel)."""
    groups: list[tuple[str, list[dict]]] = []
    current: str | None = None
    bucket: list[dict] = []
    for req in requirements:
        entregable = req.get("entregable", "")
        if current is None:
            current = entregable
            bucket = [req]
        elif entregable == current:
            bucket.append(req)
        else:
            groups.append((current, bucket))
            current = entregable
            bucket = [req]
    if current is not None:
        groups.append((current, bucket))
    return groups


def build_requirements_table(requirements: list[dict], styles: dict) -> Table:
    """Tabla principal.

    Nota: no usamos SPAN de ReportLab sobre muchas filas altas (falla con
    rowHeights None). El agrupado se logra mostrando el entregable solo en
    la primera fila del grupo, igual que el efecto visual del Excel.
    """
    p = styles
    header = [
        Paragraph("Entregable", p["th"]),
        Paragraph("Código", p["th"]),
        Paragraph("Requerimiento", p["th"]),
        Paragraph("Criterio(s) de Aceptación", p["th"]),
        Paragraph("Fuente", p["th"]),
        Paragraph("Estado", p["th"]),
    ]
    data = [header]

    for entregable, rows in _group_entregables(requirements):
        for i, req in enumerate(rows):
            data.append([
                Paragraph(_to_para_text(entregable if i == 0 else ""), p["td"]),
                Paragraph(_to_para_text(req.get("codigo", "")), p["td_center"]),
                Paragraph(_to_para_text(req.get("requerimiento", "")), p["td"]),
                Paragraph(_to_para_text(req.get("criterios_aceptacion", "")), p["td"]),
                Paragraph(_to_para_text(req.get("fuente", "")), p["td_center"]),
                Paragraph(_to_para_text(req.get("estado", "")), p["td_center"]),
            ])

    table = Table(data, colWidths=COL_WIDTHS, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("TEXTCOLOR", (0, 0), (-1, 0), BLACK),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, BORDER_COLOR),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def build_pdf(data: dict, output_path: str) -> None:
    _register_fonts()
    styles = _styles()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(letter),
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="Matriz de Identificación de Requerimientos",
        author="INTELIX",
    )

    header = data["header"]
    requirements = data["requirements"]

    elements: list = [
        build_logo_title(styles),
        Spacer(1, 4 * mm),
    ]
    elements.extend(build_header_block(header, requirements, styles))
    elements.append(Spacer(1, 5 * mm))
    elements.append(build_requirements_table(requirements, styles))

    doc.build(elements)
    print(f"PDF generado: {output_path}")


def main() -> None:
    if len(sys.argv) < 3:
        print("Uso: python generate_requirements_pdf.py <input.json> <output.pdf>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: no existe el JSON de entrada: {input_path}", file=sys.stderr)
        sys.exit(1)

    data = load_input(input_path)
    build_pdf(data, output_path)


if __name__ == "__main__":
    main()
