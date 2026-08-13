#!/usr/bin/env python3
"""Genera un Excel (.xlsx) con la Matriz de Identificación de Requerimientos.

Formato corporativo INTELIX, replicando el layout del template oficial.
"""
import json
import os
import sys
from datetime import datetime

from openpyxl import Workbook
from openpyxl.drawing.image import Image
from openpyxl.styles import (
    Alignment, Border, Font, PatternFill, Side
)
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


# Resolve logo path relative to this script; MATRIZ_LOGO_PATH overrides it
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOGO_PATH = os.path.join(SCRIPT_DIR, "assets", "logointelix-sin-fondo.png")
LOGO_PATH = os.environ.get("MATRIZ_LOGO_PATH", DEFAULT_LOGO_PATH)


def load_input(path: str) -> dict:
    """Carga el JSON de entrada."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# --- Listas de valores para dropdowns ---
RAMOS_CLIENTE = [
    "Automotriz", "Beconsult", "EPA", "Financiero", "Logística",
    "Retail", "Seguros", "Tecnología", "Telecomunicaciones"
]

CATEGORIAS = ["Aplicaciones", "Tecnologia"]

ESTADOS_PROYECTO = [
    "En Definición", "En Pausa", "En Progreso", "Finalizado",
    "Sin Iniciar", "Suspendido"
]

FUENTES = [
    "Alcance Inicial", "Gestión de Cambio 1", "Gestión de Cambio 2",
    "Gestión de Cambio 3", "Gestión de Cambio 4", "Gestión de Cambio 5"
]

ESTADOS_REQ = [
    "Sin Iniciar", "En Progreso", "Finalizado", "Suspendido"
]


def build_workbook(data: dict) -> Workbook:
    """Construye el workbook con la matriz de requerimientos."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Matriz de Requerimientos"

    # --- Estilos (replicando exactamente el ejemplo) ---
    # Title: Arial 16, bold, black
    font_title = Font(name="Arial", size=16, bold=True, color="000000")
    # Labels row 4-5-6: Arial 9, bold, black
    font_label = Font(name="Arial", size=9, bold=True, color="000000")
    # Values row 4-5-6: Arial 9, normal, black
    font_value = Font(name="Arial", size=9, bold=False, color="000000")
    # Table headers row 8: Arial 10, bold, black, fill gray EFEFEF
    font_table_header = Font(name="Arial", size=10, bold=True, color="000000")
    fill_table_header = PatternFill(start_color="EFEFEF", end_color="EFEFEF", fill_type="solid")
    # Data: Arial 9, normal, black
    font_data = Font(name="Arial", size=9, bold=False, color="000000")

    # "Gris oscuro 1" ~ #999999 (RGB 153, 153, 153)
    border_color = "999999"
    thin_border = Border(
        left=Side(style="thin", color=border_color),
        right=Side(style="thin", color=border_color),
        top=Side(style="thin", color=border_color),
        bottom=Side(style="thin", color=border_color),
    )

    align_left_center = Alignment(horizontal="left", vertical="center", wrap_text=True)
    align_center_center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # --- Column widths (matching template) ---
    col_widths = {
        "A": 1.71, "B": 15.29, "C": 17.0, "D": 15.71,
        "E": 24.43, "F": 11.71, "G": 12.43, "H": 10.14,
        "I": 20.86, "J": 15.14, "K": 24.57, "L": 16.29, "M": 2.0
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    # --- Logo ---
    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH)
        img.width = 120
        img.height = 40
        ws.add_image(img, "B2")
    else:
        print(f"Advertencia: logo no encontrado en {LOGO_PATH}; se genera sin logo.",
              file=sys.stderr)

    # --- Header data ---
    header = data["header"]
    requirements = data["requirements"]

    # Row 2-3: Title (merged D2:K3)
    ws.merge_cells("D2:K3")
    cell_title = ws.cell(row=2, column=4)
    cell_title.value = "Matriz de Identificación de Requerimientos"
    cell_title.font = font_title
    cell_title.alignment = Alignment(horizontal="center", vertical="center")

    # Row 4: Estado and Categoría
    ws.cell(row=4, column=9, value="Estado").font = font_label
    estado_val = header.get("estado_proyecto", "En Definición")
    ws.cell(row=4, column=10, value=estado_val).font = font_value

    ws.cell(row=4, column=11, value="Categoría ").font = font_label
    categoria_val = header.get("categoria", "Aplicaciones")
    ws.cell(row=4, column=12, value=categoria_val).font = font_value

    # Data validation for Categoría (L4)
    dv_categoria = DataValidation(type="list", formula1='"' + ','.join(CATEGORIAS) + '"', allow_blank=True)
    dv_categoria.error = "Seleccione una categoría válida"
    ws.add_data_validation(dv_categoria)
    dv_categoria.add(ws.cell(row=4, column=12))

    # Data validation for Estado proyecto (J4)
    dv_estado_proy = DataValidation(type="list", formula1='"' + ','.join(ESTADOS_PROYECTO) + '"', allow_blank=True)
    ws.add_data_validation(dv_estado_proy)
    dv_estado_proy.add(ws.cell(row=4, column=10))

    # Row 5: Project info
    ws.cell(row=5, column=2, value="Ramo Cliente").font = font_label
    ws.cell(row=5, column=2).alignment = align_left_center
    ws.cell(row=5, column=3, value=header.get("ramo_cliente", "")).font = font_value
    ws.cell(row=5, column=3).alignment = align_center_center

    ws.cell(row=5, column=4, value="Lider de Proyecto").font = font_label
    ws.cell(row=5, column=4).alignment = align_left_center
    ws.cell(row=5, column=5, value=header.get("lider_proyecto", "")).font = font_value
    ws.cell(row=5, column=5).alignment = align_left_center

    ws.cell(row=5, column=6, value="Código").font = font_label
    ws.cell(row=5, column=6).alignment = align_left_center
    ws.cell(row=5, column=7, value=header.get("codigo", "")).font = font_value
    ws.cell(row=5, column=7).alignment = align_center_center

    ws.cell(row=5, column=8, value="Proyecto").font = font_label
    ws.cell(row=5, column=8).alignment = align_left_center
    ws.merge_cells("I5:J5")
    ws.cell(row=5, column=9, value=header.get("proyecto", "")).font = font_value

    ws.cell(row=5, column=11, value="Fecha de Actualización").font = font_label
    ws.cell(row=5, column=11).alignment = align_left_center
    fecha_str = header.get("fecha_actualizacion", "")
    if fecha_str:
        try:
            fecha_dt = datetime.strptime(fecha_str, "%Y-%m-%d")
            ws.cell(row=5, column=12, value=fecha_dt).font = font_value
            ws.cell(row=5, column=12).number_format = "DD/MM/YYYY"
        except ValueError:
            ws.cell(row=5, column=12, value=fecha_str).font = font_value
    ws.cell(row=5, column=12).alignment = align_center_center

    # Data validation for Ramo Cliente (C5)
    dv_ramo = DataValidation(type="list", formula1='"' + ','.join(RAMOS_CLIENTE) + '"', allow_blank=True)
    ws.add_data_validation(dv_ramo)
    dv_ramo.add(ws.cell(row=5, column=3))

    # --- Borders for header info section (rows 4-6, columns B-L) ---
    # Row 4 (I to L) - all sides on each cell
    for col in range(9, 13):
        cell = ws.cell(row=4, column=col)
        cell.border = Border(
            top=Side(style="thin", color=border_color),
            bottom=Side(style="thin", color=border_color),
            left=Side(style="thin", color=border_color),
            right=Side(style="thin", color=border_color),
        )
        cell.alignment = Alignment(horizontal=cell.alignment.horizontal or "left", vertical="center")

    # Row 5 (B to L) - all sides on each cell
    for col in range(2, 13):
        cell = ws.cell(row=5, column=col)
        cell.border = Border(
            top=Side(style="thin", color=border_color),
            bottom=Side(style="thin", color=border_color),
            left=Side(style="thin", color=border_color),
            right=Side(style="thin", color=border_color),
        )
        cell.alignment = Alignment(horizontal=cell.alignment.horizontal or "left", vertical="center", wrap_text=cell.alignment.wrap_text)

    # Row 6 (B to L) - all sides on each cell
    for col in range(2, 13):
        cell = ws.cell(row=6, column=col)
        cell.border = Border(
            top=Side(style="thin", color=border_color),
            bottom=Side(style="thin", color=border_color),
            left=Side(style="thin", color=border_color),
            right=Side(style="thin", color=border_color),
        )
        cell.alignment = Alignment(horizontal=cell.alignment.horizontal or "left", vertical="center", wrap_text=cell.alignment.wrap_text)

    # Row 6: Summary counts
    alcance_count = sum(1 for r in requirements if r.get("fuente", "").startswith("Alcance"))
    cambio_count = sum(1 for r in requirements if r.get("fuente", "").startswith("Gestión"))
    total_count = len(requirements)

    cambio_numbers = set()
    for r in requirements:
        fuente = r.get("fuente", "")
        if fuente.startswith("Gestión"):
            cambio_numbers.add(fuente)

    ws.merge_cells("B6:C6")
    ws.cell(row=6, column=2, value="Cantidad Gestión de Cambio").font = font_label
    ws.cell(row=6, column=2).alignment = align_left_center
    ws.cell(row=6, column=4, value=len(cambio_numbers) if cambio_numbers else 0).font = font_value
    ws.cell(row=6, column=4).alignment = align_center_center

    ws.merge_cells("E6:F6")
    ws.cell(row=6, column=5, value="Cantidad de Requerimientos").font = font_label
    ws.cell(row=6, column=5).alignment = align_left_center

    ws.cell(row=6, column=7, value="Alcance Inicial").font = font_value
    ws.cell(row=6, column=7).alignment = align_left_center
    ws.cell(row=6, column=8, value=alcance_count).font = font_value
    ws.cell(row=6, column=8).alignment = align_center_center

    ws.cell(row=6, column=9, value="Por Gestiones de Cambio").font = font_value
    ws.cell(row=6, column=9).alignment = align_left_center
    ws.cell(row=6, column=10, value=cambio_count).font = font_value
    ws.cell(row=6, column=10).alignment = align_center_center

    ws.cell(row=6, column=11, value="Total").font = font_value
    ws.cell(row=6, column=11).alignment = align_left_center
    ws.cell(row=6, column=12, value=total_count).font = font_value
    ws.cell(row=6, column=12).alignment = align_center_center

    # Row 8: Table headers (gray fill EFEFEF, Arial 10 bold black)
    table_headers = [
        (2, 3, "Entregable"),
        (4, 4, "Código "),
        (5, 7, "Requerimiento "),
        (8, 10, "Criterio(s) de Aceptación "),
        (11, 11, "Fuente "),
        (12, 12, "Estado"),
    ]

    for start_col, end_col, text in table_headers:
        if start_col != end_col:
            ws.merge_cells(start_row=8, start_column=start_col, end_row=8, end_column=end_col)
        cell = ws.cell(row=8, column=start_col)
        cell.value = text
        cell.font = font_table_header
        cell.fill = fill_table_header
        cell.alignment = align_center_center
        cell.border = thin_border
        for c in range(start_col, end_col + 1):
            ws.cell(row=8, column=c).fill = fill_table_header
            ws.cell(row=8, column=c).border = thin_border
            ws.cell(row=8, column=c).font = font_table_header
            ws.cell(row=8, column=c).alignment = align_center_center

    # --- Data rows (from row 9) ---
    current_row = 9
    current_entregable = None
    entregable_start_row = None

    for i, req in enumerate(requirements):
        entregable = req.get("entregable", "")
        codigo = req.get("codigo", "")
        requerimiento = req.get("requerimiento", "")
        criterios = req.get("criterios_aceptacion", "")
        fuente = req.get("fuente", "")
        estado = req.get("estado", "")

        # Track entregable grouping
        if entregable != current_entregable:
            # Close previous entregable merge
            if current_entregable is not None and entregable_start_row is not None:
                if current_row - 1 > entregable_start_row:
                    ws.merge_cells(
                        start_row=entregable_start_row, start_column=2,
                        end_row=current_row - 1, end_column=3
                    )
            current_entregable = entregable
            entregable_start_row = current_row

        # Write entregable in B (only first row of group)
        is_first_in_group = (i == 0 or requirements[i - 1].get("entregable") != entregable)
        if is_first_in_group:
            cell_ent = ws.cell(row=current_row, column=2)
            cell_ent.value = entregable
            cell_ent.font = font_data
            cell_ent.alignment = Alignment(vertical="center", wrap_text=True)

        # Merge E:G for requerimiento, H:J for criterios
        ws.merge_cells(start_row=current_row, start_column=5, end_row=current_row, end_column=7)
        ws.merge_cells(start_row=current_row, start_column=8, end_row=current_row, end_column=10)

        # Write data
        ws.cell(row=current_row, column=4, value=codigo).font = font_data
        ws.cell(row=current_row, column=4).alignment = align_center_center
        ws.cell(row=current_row, column=5, value=requerimiento).font = font_data
        ws.cell(row=current_row, column=5).alignment = align_left_center
        ws.cell(row=current_row, column=8, value=criterios).font = font_data
        ws.cell(row=current_row, column=8).alignment = align_left_center
        ws.cell(row=current_row, column=11, value=fuente).font = font_data
        ws.cell(row=current_row, column=11).alignment = align_center_center
        ws.cell(row=current_row, column=12, value=estado).font = font_data
        ws.cell(row=current_row, column=12).alignment = align_center_center

        # Apply borders to data cells
        for col in range(2, 13):
            ws.cell(row=current_row, column=col).border = thin_border

        current_row += 1

    # Close last entregable merge
    if current_entregable is not None and entregable_start_row is not None:
        if current_row - 1 > entregable_start_row:
            ws.merge_cells(
                start_row=entregable_start_row, start_column=2,
                end_row=current_row - 1, end_column=3
            )

    # --- Auto-fit row heights based on content ---
    # Approximate: ~13 chars per line for Requerimiento (cols E:G width ~48),
    # ~12 chars per line for Criterios (cols H:J width ~46)
    req_col_width_chars = 55  # approx chars that fit in merged E:G
    crit_col_width_chars = 50  # approx chars that fit in merged H:J
    base_row_height = 15  # single line height in points

    for row_num in range(9, current_row):
        req_val = ws.cell(row=row_num, column=5).value or ""
        crit_val = ws.cell(row=row_num, column=8).value or ""

        # Count lines needed for each
        req_lines = max(1, len(req_val) // req_col_width_chars + req_val.count("\n") + 1)
        crit_lines = max(1, len(crit_val) // crit_col_width_chars + crit_val.count("\n") + 1)

        needed_lines = max(req_lines, crit_lines)
        ws.row_dimensions[row_num].height = max(base_row_height * needed_lines, 30)

    # --- Data validations for Fuente (K column) and Estado (L column) ---
    last_data_row = current_row - 1

    dv_fuente = DataValidation(
        type="list",
        formula1='"' + ','.join(FUENTES) + '"',
        allow_blank=True
    )
    dv_fuente.error = "Seleccione una fuente válida"
    ws.add_data_validation(dv_fuente)
    dv_fuente.add(f"K9:K{last_data_row}")

    dv_estado = DataValidation(
        type="list",
        formula1='"' + ','.join(ESTADOS_REQ) + '"',
        allow_blank=True
    )
    dv_estado.error = "Seleccione un estado válido"
    ws.add_data_validation(dv_estado)
    dv_estado.add(f"L9:L{last_data_row}")

    # --- Hide gridlines ---
    ws.sheet_view.showGridLines = False

    return wb


def main():
    if len(sys.argv) < 3:
        print("Uso: python generate_requirements_excel.py <input.json> <output.xlsx>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: no existe el JSON de entrada: {input_path}", file=sys.stderr)
        sys.exit(1)

    data = load_input(input_path)
    wb = build_workbook(data)
    wb.save(output_path)
    print(f"Excel generado: {output_path}")


if __name__ == "__main__":
    main()
