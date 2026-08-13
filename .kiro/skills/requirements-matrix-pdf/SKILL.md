---
name: requirements-matrix-pdf
description: Genera un PDF con la Matriz de Identificacion de Requerimientos con formato corporativo INTELIX alineado al Excel. Usar cuando el usuario pida generar, crear o exportar una matriz de requerimientos en PDF.
---

# Skill: Generador de Matriz de Requerimientos en PDF

Genera un PDF con formato profesional de la Matriz de Identificación de Requerimientos, **alineado visualmente al skill Excel** (`requirements-matrix-excel`): tipografía Arial, headers grises (`#EFEFEF`), bordes `#999999`, encabezado en 3 filas y tabla con entregables agrupados.

El paquete es **autocontenido**: el script, el logo (`assets/`) y un ejemplo de entrada viven en esta misma carpeta. Comparte el **mismo JSON de entrada** que el skill Excel.

## Datos obligatorios (preguntar SIEMPRE al usuario)

Antes de ejecutar este skill, el agente DEBE solicitar al usuario los siguientes datos:

1. **Ramo del cliente** (ej: EPA, Financiero, Retail)
2. **Líder del proyecto** (nombre completo)
3. **Código del proyecto** (formato libre, ej: XX-YYY-NN)
4. **Nombre del proyecto**

No proceder con la generación hasta tener estos 4 datos confirmados por el usuario.

## Uso

1. Crear un archivo JSON con los datos de la matriz. Usar `example_input.json` de esta carpeta como plantilla (mismo formato que el skill Excel).
2. Instalar la dependencia y ejecutar el script:

```bash
cd .cursor/skills/requirements-matrix-pdf
pip install -r requirements.txt
python generate_requirements_pdf.py <input.json> <output.pdf>
```

Si el proyecto ya tiene un JSON generado para Excel, reutilizarlo sin cambios.

## Formato del JSON de entrada

Mismo contrato que `requirements-matrix-excel`. Ver `example_input.json`.

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
| fecha_actualizacion | Fecha de última actualización | `YYYY-MM-DD` (se muestra como `DD/MM/YYYY`) |
| estado_proyecto | Estado general del proyecto | En Definición, En Pausa, En Progreso, Finalizado, Sin Iniciar, Suspendido |
| categoria | Categoría del proyecto | Aplicaciones, Tecnologia |

### Requerimientos (arreglo)

| Campo | Descripción | Valores admitidos |
|-------|-------------|-------------------|
| entregable | Nombre del entregable; filas contiguas se agrupan (merge visual) | texto libre |
| codigo | Código del requerimiento | R1, R2, ... |
| requerimiento | Descripción del requerimiento | texto libre |
| criterios_aceptacion | Criterios de aceptación (opcional) | texto libre, `\n` para separar |
| fuente | Origen del requerimiento | Alcance Inicial, Gestión de Cambio 1 a 5 |
| estado | Estado del requerimiento | Sin Iniciar, En Progreso, Finalizado, Suspendido |

## Estructura del PDF generado (paridad con Excel)

- Página horizontal (landscape letter), tipografía Arial si está disponible en el SO (fallback Helvetica).
- Logo a la izquierda + título centrado "Matriz de Identificación de Requerimientos".
- Fila de Estado del proyecto y Categoría (derecha).
- Fila de Ramo Cliente, Líder, Código, Proyecto y Fecha de Actualización.
- Fila de resumen: cantidad de gestiones de cambio, alcance inicial, por gestiones de cambio y total (**misma lógica de conteo que el Excel**).
- Headers de tabla con relleno gris `#EFEFEF` y texto negro (no azul).
- Datos con bordes `#999999`, sin zebra stripes, entregables agrupados con celdas combinadas verticalmente.
- Header de tabla repetido en cada página.

## Personalizar el logo

Por defecto se usa `assets/logointelix-sin-fondo.png`. Para otro logo, reemplazar ese archivo o definir `MATRIZ_LOGO_PATH`. Si el archivo no existe, el PDF se genera sin logo y el script emite una advertencia.
