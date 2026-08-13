# Matriz de Requerimientos en Excel — skill compartible

Skill de Cursor que genera la **Matriz de Identificación de Requerimientos** en Excel con el formato corporativo INTELIX.

Paquete autocontenido: no requiere archivos de otros proyectos.

## Contenido

| Archivo | Descripción |
|---------|-------------|
| `SKILL.md` | Definición del skill (lo que lee el agente) |
| `generate_requirements_excel.py` | Generador del `.xlsx` |
| `requirements.txt` | Dependencia: `openpyxl` |
| `example_input.json` | Ejemplo completo de JSON de entrada |
| `assets/logointelix-sin-fondo.png` | Logo corporativo insertado en la celda B2 |

## Instalación en otro proyecto

1. Copiar la carpeta completa a `.cursor/skills/requirements-matrix-excel/` en la raíz del repositorio destino.
2. Reiniciar o recargar Cursor para que descubra el skill.
3. Pedirle al agente algo como *"genera la matriz de requerimientos en Excel"*; el agente solicitará ramo del cliente, líder, código y nombre del proyecto antes de generar.

Requisitos: Python 3.10 o superior y `pip install -r requirements.txt` (solo `openpyxl`).

## Uso manual (sin agente)

```bash
cd .cursor/skills/requirements-matrix-excel
pip install -r requirements.txt
python generate_requirements_excel.py example_input.json matriz.xlsx
```

PowerShell:

```powershell
cd .cursor\skills\requirements-matrix-excel
pip install -r requirements.txt
python generate_requirements_excel.py example_input.json matriz.xlsx
```

## Cómo generar la matriz de un proyecto real

El skill solo se encarga del **formato**. La fuente de datos es un JSON con la estructura de `example_input.json`, que puede escribirse a mano o generarse con un script propio del proyecto que lea los requerimientos desde su documentación (Markdown, Jira, planilla, etc.) y emita `header` + `requirements`.

Ver la tabla de campos y valores admitidos en `SKILL.md`.

## Personalizar el logo

Reemplazar `assets/logointelix-sin-fondo.png` o definir la variable de entorno `MATRIZ_LOGO_PATH` apuntando a otra imagen. Sin logo disponible el Excel se genera igual, con una advertencia en consola.
