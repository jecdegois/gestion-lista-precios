---
name: requirements-matrix-excel
description: Genera un Excel (.xlsx) con la Matriz de Identificacion de Requerimientos con formato corporativo INTELIX. Usar cuando el usuario pida generar, crear o exportar una matriz de requerimientos en Excel.
---

# Skill: Generador de Matriz de Requerimientos en Excel

Genera un archivo Excel (.xlsx) con formato profesional de la Matriz de Identificación de Requerimientos, replicando el layout del template corporativo INTELIX (logo, encabezado, resumen de cantidades, tabla agrupada por entregable y listas de validación).

El paquete es **autocontenido**: el script, el logo (`assets/`) y un ejemplo de entrada viven en esta misma carpeta. No depende de otras rutas del proyecto.

## Datos obligatorios (preguntar SIEMPRE al usuario)

Antes de ejecutar este skill, el agente DEBE solicitar al usuario los siguientes datos:

1. **Ramo del cliente** (ej: EPA, Financiero, Retail)
2. **Líder del proyecto** (nombre completo)
3. **Código del proyecto** (formato libre, ej: XX-YYY-NN)
4. **Nombre del proyecto**

No proceder con la generación hasta tener estos 4 datos confirmados por el usuario.

## Uso

1. Crear un archivo JSON con los datos de la matriz. Usar `example_input.json` de esta carpeta como plantilla.
2. Instalar la dependencia y ejecutar el script:

```bash
cd .cursor/skills/requirements-matrix-excel
pip install -r requirements.txt
python generate_requirements_excel.py <input.json> <output.xlsx>
```

En PowerShell (Windows) la invocación es equivalente usando `\` en las rutas.

Si el proyecto ya mantiene sus requerimientos en Markdown u otra fuente, lo recomendable es escribir un pequeño script `build_*_input.py` propio del proyecto que produzca el JSON, y dejar este skill como paso final de formato.

## Formato del JSON de entrada

```json
{
  "header": {
    "ramo_cliente": "Nombre del ramo",
    "lider_proyecto": "Nombre del lider",
    "codigo": "XX-YYY-NN",
    "proyecto": "Nombre del proyecto",
    "fecha_actualizacion": "2026-01-15",
    "estado_proyecto": "En Definición",
    "categoria": "Aplicaciones"
  },
  "requirements": [
    {
      "entregable": "Nombre del entregable",
      "codigo": "R1",
      "requerimiento": "Descripción del requerimiento",
      "criterios_aceptacion": "Criterios separados por \\n",
      "fuente": "Alcance Inicial",
      "estado": "Sin Iniciar"
    }
  ]
}
```

### Encabezado

| Campo | Descripción | Valores admitidos |
|-------|-------------|-------------------|
| ramo_cliente | Ramo del cliente | Automotriz, Beconsult, EPA, Financiero, Logística, Retail, Seguros, Tecnología, Telecomunicaciones |
| lider_proyecto | Nombre del líder de proyecto | texto libre |
| codigo | Código del proyecto | texto libre |
| proyecto | Nombre del proyecto | texto libre |
| fecha_actualizacion | Fecha de última actualización | `YYYY-MM-DD` |
| estado_proyecto | Estado general del proyecto | En Definición, En Pausa, En Progreso, Finalizado, Sin Iniciar, Suspendido |
| categoria | Categoría del proyecto | Aplicaciones, Tecnologia |

### Requerimientos (arreglo)

| Campo | Descripción | Valores admitidos |
|-------|-------------|-------------------|
| entregable | Nombre del entregable; filas contiguas con el mismo valor se combinan | texto libre |
| codigo | Código del requerimiento | R1, R2, ... |
| requerimiento | Descripción del requerimiento | texto libre |
| criterios_aceptacion | Criterios de aceptación (opcional) | texto libre, `\n` para separar |
| fuente | Origen del requerimiento | Alcance Inicial, Gestión de Cambio 1 a 5 |
| estado | Estado del requerimiento | Sin Iniciar, En Progreso, Finalizado, Suspendido |

Los valores admitidos se aplican como listas desplegables en el Excel; el orden de las filas define el orden de la tabla, por lo que conviene ordenar por entregable antes de generar.

## Estructura del Excel generado

- Hoja "Matriz de Requerimientos", cuadrícula oculta, fuente Arial.
- Logo en B2 y título centrado "Matriz de Identificación de Requerimientos" (D2:K3).
- Fila 4: Estado del proyecto y Categoría (con validación de lista).
- Fila 5: Ramo Cliente, Líder de Proyecto, Código, Proyecto y Fecha de Actualización.
- Fila 6: resumen calculado — cantidad de gestiones de cambio, requerimientos de alcance inicial, requerimientos por gestiones de cambio y total.
- Fila 8: headers de tabla con relleno gris (`EFEFEF`).
- Desde fila 9: datos con celdas combinadas por entregable, alto de fila ajustado al contenido y validaciones en Fuente y Estado.

## Personalizar el logo

Por defecto se usa `assets/logointelix-sin-fondo.png`. Para otro logo, reemplazar ese archivo o definir la variable de entorno `MATRIZ_LOGO_PATH` con la ruta deseada. Si el archivo no existe, el Excel se genera sin logo y el script emite una advertencia.
