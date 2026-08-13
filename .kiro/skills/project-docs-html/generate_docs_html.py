#!/usr/bin/env python3
"""
Genera documentación HTML del proyecto — agnóstico al proyecto.

Lee un archivo de configuración JSON y descubre automáticamente la documentación
disponible en aidlc-docs/. Opcionalmente embebe Swagger UI con una spec OpenAPI.
"""
import json
import os
import sys
import re
from pathlib import Path

try:
    import markdown
except ImportError:
    markdown = None

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
AIDLC_DOCS = os.path.join(PROJECT_ROOT, "aidlc-docs")


def read_md(relative_path):
    """Lee un archivo markdown relativo a aidlc-docs."""
    path = os.path.join(AIDLC_DOCS, relative_path)
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def md_to_html(md_text):
    """Convierte markdown a HTML. Fallback a <pre> si markdown lib no disponible."""
    if markdown:
        return markdown.markdown(md_text, extensions=["tables", "fenced_code"])
    # Fallback básico
    escaped = md_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"<pre>{escaped}</pre>"


def slugify(text):
    """Genera un slug URL-safe a partir de texto."""
    text = text.lower().strip()
    text = re.sub(r"[áàäâ]", "a", text)
    text = re.sub(r"[éèëê]", "e", text)
    text = re.sub(r"[íìïî]", "i", text)
    text = re.sub(r"[óòöô]", "o", text)
    text = re.sub(r"[úùüû]", "u", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def discover_sections():
    """Descubre archivos .md en aidlc-docs/ y los organiza como secciones."""
    sections = []
    if not os.path.isdir(AIDLC_DOCS):
        return sections

    phase_order = ["inception", "construction", "operations"]
    found = {}

    for root, dirs, files in os.walk(AIDLC_DOCS):
        # Skip historico and hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "historico"]
        for f in sorted(files):
            if not f.endswith(".md") or f == "audit.md":
                continue
            rel_path = os.path.relpath(os.path.join(root, f), AIDLC_DOCS).replace("\\", "/")
            # Derive title from filename
            title = f.replace(".md", "").replace("-", " ").replace("_", " ").title()
            # Determine phase
            phase = "other"
            for p in phase_order:
                if rel_path.startswith(p + "/"):
                    phase = p
                    break
            if phase not in found:
                found[phase] = []
            found[phase].append({"title": title, "path": rel_path})

    # Add aidlc-state.md at the beginning
    state_path = "aidlc-state.md"
    if os.path.exists(os.path.join(AIDLC_DOCS, state_path)):
        sections.append({"title": "Estado del Proyecto", "path": state_path})

    for phase in phase_order:
        if phase in found:
            sections.extend(found[phase])
    if "other" in found:
        sections.extend(found["other"])

    return sections


def load_openapi(openapi_path):
    """Carga una spec OpenAPI desde JSON o YAML."""
    if not openapi_path:
        return None
    full_path = os.path.join(PROJECT_ROOT, openapi_path)
    if not os.path.exists(full_path):
        return None
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
    if full_path.endswith(".json"):
        return json.loads(content)
    # Try YAML
    try:
        import yaml
        return yaml.safe_load(content)
    except (ImportError, Exception):
        return None


def load_config(config_path):
    """Carga la configuración del proyecto."""
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_html(config, output_path):
    """Genera el HTML completo."""
    project_name = config.get("project_name", "Proyecto")
    project_desc = config.get("project_description", "")
    openapi_path = config.get("openapi_path", "")
    sections_config = config.get("sections", [])

    # Discover or use configured sections
    if not sections_config:
        sections_config = discover_sections()

    # Build nav and content
    nav_items = ""
    content_sections = ""
    for sec in sections_config:
        title = sec["title"]
        path = sec["path"]
        section_id = slugify(title)
        md_content = read_md(path)
        if not md_content:
            continue
        html_content = md_to_html(md_content)
        nav_items += f'<li><a href="#{section_id}">{title}</a></li>\n'
        content_sections += f'<section id="{section_id}"><h2>{title}</h2>{html_content}</section>\n'

    # OpenAPI / Swagger UI
    swagger_section = ""
    swagger_script = ""
    swagger_css = ""
    openapi_spec = load_openapi(openapi_path)
    if openapi_spec:
        nav_items += '<li><a href="#swagger-ui">API Reference (Swagger)</a></li>\n'
        swagger_css = '<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">'
        spec_json = json.dumps(openapi_spec)
        swagger_section = '<section id="swagger-ui"><h2>API Reference (Swagger)</h2><div id="swagger-container"></div></section>'
        swagger_script = f"""<script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
<script>
SwaggerUIBundle({{
    spec: {spec_json},
    dom_id: '#swagger-container',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout: "BaseLayout"
}});
</script>"""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Documentación — {project_name}</title>
{swagger_css}
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; min-height: 100vh; }}
nav {{ width: 260px; background: #1a1a2e; color: #eee; padding: 1rem; position: fixed; height: 100vh; overflow-y: auto; }}
nav h1 {{ font-size: 1rem; margin-bottom: 1rem; color: #fff; }}
nav ul {{ list-style: none; }}
nav li a {{ color: #ccc; text-decoration: none; display: block; padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.85rem; }}
nav li a:hover {{ background: #16213e; color: #fff; }}
main {{ margin-left: 260px; padding: 2rem; flex: 1; max-width: 1100px; }}
section {{ margin-bottom: 3rem; }}
h2 {{ color: #1a1a2e; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; margin-bottom: 1rem; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.85rem; }}
th, td {{ border: 1px solid #ddd; padding: 0.5rem; text-align: left; }}
th {{ background: #2F5496; color: white; }}
tr:nth-child(even) {{ background: #f9f9f9; }}
pre {{ background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; font-size: 0.8rem; }}
code {{ background: #f0f0f0; padding: 0.15rem 0.3rem; border-radius: 3px; font-size: 0.85em; }}
pre code {{ background: none; padding: 0; }}
#swagger-ui {{ margin-top: 2rem; }}
</style>
</head>
<body>
<nav>
<h1>{project_name}</h1>
<ul>
{nav_items}
</ul>
</nav>
<main>
<h1>Documentación del Proyecto — {project_name}</h1>
<p>{project_desc}</p>
{content_sections}
{swagger_section}
</main>
{swagger_script}
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML generado: {output_path}")
    print(f"  Secciones: {len(sections_config)}")
    if openapi_spec:
        print(f"  Swagger UI: embebido desde {openapi_path}")


def main():
    if len(sys.argv) < 2:
        # No config provided — use defaults with auto-discovery
        config = {
            "project_name": os.path.basename(PROJECT_ROOT),
            "project_description": "Documentación del proyecto generada automáticamente.",
            "openapi_path": "",
            "sections": []
        }
        output = os.path.join(PROJECT_ROOT, "project-docs.html")
    else:
        config = load_config(sys.argv[1])
        output = sys.argv[2] if len(sys.argv) > 2 else os.path.join(PROJECT_ROOT, "project-docs.html")

    build_html(config, output)


if __name__ == "__main__":
    main()
