#!/usr/bin/env python3
"""Genera la Matriz de Requerimientos en HTML desde el mismo JSON del skill PDF.

Diseño visual:
- Logo INTELIX a la izquierda, título centrado en negro bold, fondo blanco
- Tabla de metadatos con bordes continuos delgados, fondo blanco, labels bold
- Tabla de requerimientos con headers azul corporativo
"""
import json
import os
import sys
from datetime import date
from base64 import b64encode


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(SCRIPT_DIR, "..", "requirements-matrix", "logointelix-sin-fondo.png")


def get_logo_base64():
    """Devuelve el logo como data URI base64, o cadena vacía si no existe."""
    if not os.path.exists(LOGO_PATH):
        return ""
    with open(LOGO_PATH, "rb") as f:
        data = b64encode(f.read()).decode("ascii")
    return f"data:image/png;base64,{data}"


def main():
    if len(sys.argv) < 2:
        print("Uso: python generate_requirements_matrix_html.py <input.json> [output.html]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "Matriz-Requerimientos.html"

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    h = data["header"]
    reqs = data["requirements"]
    today = h.get("fecha_actualizacion", date.today().strftime("%Y-%m-%d"))

    total = len(reqs)
    alcance = sum(1 for r in reqs if r["fuente"] == "Alcance Inicial")
    cambio = total - alcance
    en_progreso = sum(1 for r in reqs if r["estado"] == "En Progreso")
    sin_iniciar = sum(1 for r in reqs if r["estado"] == "Sin Iniciar")
    finalizado = sum(1 for r in reqs if r["estado"] == "Finalizado")

    # Logo
    logo_uri = get_logo_base64()
    logo_img = f'<img src="{logo_uri}" alt="INTELIX" class="logo">' if logo_uri else ""

    # Rows de la tabla de requerimientos
    rows = ""
    prev_ent = ""
    for r in reqs:
        ent = r["entregable"]
        show_ent = ent if ent != prev_ent else ""
        prev_ent = ent
        cls_ent = ' class="ent-first"' if show_ent else ""
        criterios = r.get("criterios_aceptacion", "").replace("\n", "<br>")
        estado_cls = r["estado"].lower().replace(" ", "-")
        rows += (
            f"<tr{cls_ent}>"
            f'<td class="ent">{show_ent}</td>'
            f'<td class="code">{r["codigo"]}</td>'
            f"<td>{r['requerimiento']}</td>"
            f'<td class="crit">{criterios}</td>'
            f'<td class="center">{r["fuente"]}</td>'
            f'<td class="center st-{estado_cls}">{r["estado"]}</td>'
            f"</tr>\n"
        )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Matriz de Requerimientos - {h['proyecto']}</title>
<style>
* {{margin:0; padding:0; box-sizing:border-box;}}
body {{font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding:1.5rem; background:#fff; color:#333; font-size:0.85rem;}}

/* === ENCABEZADO: logo izquierda + título centrado === */
.doc-header {{
    display: flex;
    align-items: center;
    padding: 1rem 0;
    margin-bottom: 1.2rem;
    border-bottom: 2px solid #ccc;
}}
.doc-header .logo {{
    height: 40px;
    width: auto;
    flex-shrink: 0;
}}
.doc-header h1 {{
    flex: 1;
    text-align: center;
    font-size: 1.3rem;
    font-weight: bold;
    color: #000;
    margin: 0;
}}

/* === TABLA DE METADATOS: bordes continuos, fondo blanco === */
.meta-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.2rem;
    font-size: 0.8rem;
}}
.meta-table td {{
    border: 1px solid #ccc;
    padding: 0.5rem 0.7rem;
    background: #ffffff;
    vertical-align: middle;
}}
.meta-table .lbl {{
    font-weight: bold;
    color: #000;
    white-space: nowrap;
    width: 14%;
}}
.meta-table .val {{
    font-weight: normal;
    color: #000;
    white-space: normal;
    word-break: break-word;
    width: 19%;
}}

/* === RESUMEN DE CANTIDADES === */
.summary-table {{
    width: auto;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
    font-size: 0.8rem;
}}
.summary-table td {{
    border: 1px solid #ccc;
    padding: 0.4rem 0.8rem;
    background: #ffffff;
    text-align: center;
}}
.summary-table .s-lbl {{
    font-weight: bold;
    color: #000;
    text-align: left;
}}
.summary-table .s-num {{
    font-weight: bold;
    color: #2F5496;
    font-size: 1rem;
}}

/* === TABLA DE REQUERIMIENTOS === */
.tbl-wrap {{
    overflow-x: auto;
}}
table.req-table {{
    border-collapse: collapse;
    width: 100%;
    font-size: 0.78rem;
}}
table.req-table th {{
    background: #2F5496;
    color: #fff;
    padding: 0.6rem 0.5rem;
    text-align: left;
    position: sticky;
    top: 0;
    white-space: nowrap;
    font-weight: bold;
}}
table.req-table td {{
    padding: 0.5rem 0.5rem;
    border: 1px solid #ddd;
    vertical-align: top;
    white-space: normal;
    word-break: break-word;
}}
table.req-table tr:hover {{background: #f0f4ff;}}
table.req-table tr.ent-first td {{border-top: 2px solid #2F5496;}}
.ent {{font-weight: 600; color: #2F5496; min-width: 150px;}}
.code {{font-family: monospace; white-space: nowrap; color: #555; text-align:center;}}
.crit {{font-size: 0.72rem; color: #555; min-width: 180px;}}
.center {{text-align: center;}}
.st-sin-iniciar {{color: #d32f2f;}}
.st-en-progreso {{color: #f57c00;}}
.st-finalizado {{color: #388e3c;}}
.st-suspendido {{color: #9e9e9e; text-decoration: line-through;}}

/* === FOOTER === */
.footer {{margin-top: 1.5rem; text-align: center; font-size: 0.7rem; color: #999;}}

@media print {{
    body {{padding: 0.5rem;}}
    .doc-header {{padding: 0.5rem 0;}}
    table.req-table th {{font-size: 0.7rem;}}
    table.req-table td {{font-size: 0.68rem; padding: 0.3rem;}}
}}
</style>
</head>
<body>

<!-- ENCABEZADO -->
<div class="doc-header">
    {logo_img}
    <h1>Matriz de Identificaci&oacute;n de Requerimientos</h1>
</div>

<!-- TABLA DE METADATOS -->
<table class="meta-table">
<tr>
    <td class="lbl">Ramo Cliente</td>
    <td class="val">{h['ramo_cliente']}</td>
    <td class="lbl">L&iacute;der de Proyecto</td>
    <td class="val">{h['lider_proyecto']}</td>
    <td class="lbl">C&oacute;digo</td>
    <td class="val">{h['codigo']}</td>
</tr>
<tr>
    <td class="lbl">Proyecto</td>
    <td class="val" colspan="3">{h['proyecto']}</td>
    <td class="lbl">Estado</td>
    <td class="val">{h.get('estado_proyecto', '')}</td>
</tr>
<tr>
    <td class="lbl">Categor&iacute;a</td>
    <td class="val">{h.get('categoria', '')}</td>
    <td class="lbl">Fecha Actualizaci&oacute;n</td>
    <td class="val">{today}</td>
    <td class="lbl">Cantidad G.C.</td>
    <td class="val">{cambio}</td>
</tr>
</table>

<!-- RESUMEN DE CANTIDADES -->
<table class="summary-table">
<tr>
    <td class="s-lbl">Cantidad de Requerimientos</td>
    <td class="s-lbl">Alcance Inicial</td>
    <td class="s-num">{alcance}</td>
    <td class="s-lbl">Por Gestiones de Cambio</td>
    <td class="s-num">{cambio}</td>
    <td class="s-lbl">Total</td>
    <td class="s-num">{total}</td>
</tr>
</table>

<!-- TABLA DE REQUERIMIENTOS -->
<div class="tbl-wrap">
<table class="req-table">
<thead><tr>
<th>Entregable</th><th>C&oacute;d.</th><th>Requerimiento</th><th>Criterio(s) de Aceptaci&oacute;n</th><th>Fuente</th><th>Estado</th>
</tr></thead>
<tbody>
{rows}
</tbody>
</table>
</div>

<div class="footer">Generado por AI-DLC Workflow &mdash; INTELIX | {today}</div>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML generado: {output_path} ({len(html)//1024} KB, {total} requerimientos)")


if __name__ == "__main__":
    main()
