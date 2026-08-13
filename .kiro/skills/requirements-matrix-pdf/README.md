# Matriz de Requerimientos en PDF — skill compartible

Skill de Cursor que genera la **Matriz de Identificación de Requerimientos** en PDF con el formato corporativo INTELIX, **alineado visualmente al skill Excel** (`requirements-matrix-excel`).

Paquete autocontenido: no requiere archivos de otros proyectos. Comparte el **mismo JSON de entrada** que el Excel.

## Contenido

| Archivo | Descripción |
|---------|-------------|
| `SKILL.md` | Definición del skill (lo que lee el agente) |
| `generate_requirements_pdf.py` | Generador del `.pdf` |
| `requirements.txt` | Dependencia: `reportlab` |
| `example_input.json` | Ejemplo completo de JSON de entrada (idéntico al Excel) |
| `assets/logointelix-sin-fondo.png` | Logo corporativo |

## Paridad visual con Excel

Este skill reemplaza la versión antigua (headers azules, layout distinto, conteos que excluían Suspendido). Ahora replica:

- Tipografía Arial (si el SO la tiene; si no, Helvetica)
- Headers de tabla grises `#EFEFEF` con texto negro
- Bordes `#999999`
- Encabezado en 3 filas (Estado/Categoría → datos del proyecto → resumen)
- Misma lógica de conteos que el Excel
- Entregables agrupados con celdas combinadas verticalmente
- Sin filas alternadas (zebra)

## Instalación en otro proyecto

1. Copiar la carpeta completa a `.cursor/skills/requirements-matrix-pdf/` en la raíz del repositorio destino.
2. Reiniciar o recargar Cursor.
3. Pedirle al agente *"genera la matriz de requerimientos en PDF"*; solicitará ramo, líder, código y nombre del proyecto.

Requisitos: Python 3.10+ y `pip install -r requirements.txt`.

## Uso manual (sin agente)

```bash
cd .cursor/skills/requirements-matrix-pdf
pip install -r requirements.txt
python generate_requirements_pdf.py example_input.json matriz.pdf
```

Si ya generaste el JSON para Excel, reutilízalo:

```bash
python generate_requirements_pdf.py ../ruta/matriz-input.json matriz.pdf
```

## Personalizar el logo

Reemplazar `assets/logointelix-sin-fondo.png` o definir `MATRIZ_LOGO_PATH`. Sin logo, el PDF se genera igual con una advertencia en consola.
