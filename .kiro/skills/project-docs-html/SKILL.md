---
name: project-docs-html
description: Genera documentación HTML del proyecto con Swagger UI embebido para las APIs del backend. Usar cuando el usuario pida generar, crear o exportar documentación del proyecto en HTML.
---

# Skill: Generador de Documentación HTML del Proyecto

Genera un archivo HTML autocontenido con la documentación completa del proyecto. Es **agnóstico al proyecto**: descubre automáticamente los archivos markdown disponibles en `aidlc-docs/` y, opcionalmente, genera un Swagger UI embebido desde un archivo OpenAPI o `template.yaml` (AWS SAM).

## Datos obligatorios (preguntar al usuario si no se proporcionan)

1. **Nombre del proyecto** (título que aparecerá en el HTML)
2. **Descripción breve** (1–2 líneas)
3. **OpenAPI spec path** (opcional, ruta a openapi.json/yaml o template.yaml SAM)

## Uso

```bash
cd .kiro/skills/project-docs-html
pip install -r requirements.txt
python generate_docs_html.py <config.json> [output.html]
```

Si se omite `output.html`, genera `project-docs.html` en la raíz del proyecto.

## Formato del JSON de configuración

```json
{
  "project_name": "Mi Proyecto",
  "project_description": "Descripción breve del proyecto.",
  "openapi_path": "backend/openapi.json",
  "sections": [
    {"title": "Requerimientos", "path": "inception/requirements/requirements.md"},
    {"title": "Diseño", "path": "inception/application-design/application-design.md"}
  ]
}
```

### Campos

| Campo | Requerido | Descripción |
|-------|:---------:|-------------|
| project_name | ✅ | Nombre del proyecto (aparece en título y navegación) |
| project_description | ✅ | Descripción breve (aparece bajo el título) |
| openapi_path | ❌ | Ruta relativa al proyecto de un archivo OpenAPI 3.x JSON/YAML. Si se omite, no se genera Swagger UI |
| sections | ❌ | Array de secciones {title, path}. Si se omite, descubre automáticamente los .md en aidlc-docs/ |

### Descubrimiento automático de secciones

Si `sections` se omite o está vacío, el script busca recursivamente archivos `.md` en `aidlc-docs/` y los organiza por carpeta (inception, construction, operations).

## Salida

Un archivo HTML autocontenido que puede abrirse en cualquier navegador. Si se proporcionó OpenAPI, incluye Swagger UI cargado desde CDN.
