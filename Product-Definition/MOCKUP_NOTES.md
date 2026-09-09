# Registro de Estado de Mockups — MV26020

## Línea Base Activa
**v1_aprobado** — `Product-Definition/mockups/.versions/v1_aprobado.html`.

**Actualmente en desarrollo: Versión 30 — Carga de margen porcentual con normalización en la frontera de aplicación**

### Estado Actual (Versión 30)
- ✅ La plantilla de margen exige `Codigo Articulo | Porcentaje Reduccion`; el usuario carga `10`, `20` o `10.5`, no fracciones como `0.10`.
- ✅ La interfaz valida el rango `[0, 100)`, convierte una única vez `10 → 0.10` y aplica el multiplicador de margen `0.90`.
- ✅ La previsualización y exportación muestran porcentaje ingresado, factor normalizado, multiplicador, redondeo, márgenes y rechazos.
- ✅ Las plantillas legadas con encabezado `Factor Reduccion` se rechazan explícitamente para impedir que `0.10` se interprete como `0.10%`.
- ✅ La representación SQL se mantiene compatible: UDT/SP consumen `0.1000`; el SP persiste el resultado en `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN` sin una segunda división entre 100.
- ✅ Los multiplicadores de precio `0.95` y `1.10` mantienen su contrato independiente.

### Ajuste Versión 30.1 — UDF real de Softland y arquitectura multiempresa
- ✅ Se reemplazó la UDT teórica `UDT_FACTOR_REDUCCION_ARTICULO` por la UDF real `COFER.U_FACTOR_REDUCCION_MARGEN` (`U_CODIGO` = artículo, `U_DESCRIP` = descripción, `U_FACTOR_REDUCCION DECIMAL(18,2)`, `U_ACTIVO`, más auditoría estándar Softland). Nuevo script `backend/sql/U_FACTOR_REDUCCION_MARGEN.sql`.
- ✅ La UDF guarda el **porcentaje explícito** (`10.00`, `10.50`); el SP y Python dividen entre `100.0` solo al calcular. Se eliminó el manejo de fechas de vigencia: la excepción aplica con `U_ACTIVO = 'S'`.
- ✅ `SP_CALCULAR_MARGEN_MINIMO_ARTICULO` consulta la UDF por `U_CODIGO = @p_articulo` y `U_ACTIVO = 'S'`, con fallback `0.10`; se removió `@p_fecha_calculo`.
- ✅ Nuevo módulo `backend/api/db_routing.py` (`EnrutadorCompania`) para conexión dinámica multiempresa: el SP, la UDF y las actualizaciones se ejecutan sobre el catálogo Softland de la compañía activa. `SolicitudProcesoMasivoRequest` incorpora el campo `compania`.
- ✅ `excel_processor.py` añade `factor_desde_udf(porcentaje)` que aplica `/100.0` y fallback `0.10`.

### Estado previo aprobado (Versión 29)
- ✅ **Cargador en 2 pestañas de nivel superior:** "Carga Masiva" (Gestión Global + Actualización Masiva) y "Por Artículo" (Descuento por Artículo), con sub-pestañas cuando el grupo agrupa más de un proceso
- ✅ **Plantilla Excel SIN "Tipo de Variación"** en ambas pestañas; el usuario ingresa el **Factor Multiplicador directo** (0.95 / 1.10)
- ✅ **Tabla `UDT_FACTOR_REDUCCION_ARTICULO`** (excepciones de factor de reducción)
- ✅ **SP `SP_CALCULAR_MARGEN_MINIMO_ARTICULO`** (Regla de Mayoreo): calcula y persiste `MARGEN_UTILIDAD_MIN`
- ✅ **Backend por pestaña** (`PestanaCargador`) + `calcular_margen_minimo` con factor de reducción (fallback 0.10)
- ✅ Motor de redondeo de 12 bandas y validación de margen contra precio redondeado (v27/v28)

## Corrección — Versión 29 (Cargador en 2 pestañas + Regla de Mayoreo de margen mínimo)

Solicitud del rol Arquitecto/Lead Full-Stack: reorganizar el cargador en dos pestañas, eliminar definitivamente "Tipo de Variación" de la plantilla Excel y la carga por artículo, y añadir la lógica de márgenes mínimos (tabla UDT + SP) de la Gerencia de Mayoreo.

### Entregables

**1. UI / plantilla Excel en 2 pestañas (mockup `gestion-masiva-precios.html`)**
- Nuevo `PESTANAS_CARGADOR`: `MASIVA` = [`FACTOR_PRECIO`, `MAYOREOD_MASIVO`], `POR_ARTICULO` = [`DESCUENTO_LISTA_PRECIO`]. Helper `pestanaDeProceso()`.
- Barra de pestañas de nivel superior (Carga Masiva | Por Artículo) + sub-pestañas dentro del grupo "Carga Masiva". No se eliminó ningún proceso ni clave técnica (respeta anti-regresión).
- `descargarPlantillaExcel`: **sin** columna "Tipo de Variacion". Encabezados: Masiva `[Codigo Articulo, Factor Multiplicador]`; Por Artículo `[Lista de Precio, Codigo Articulo, Factor Multiplicador]`. Ejemplos `1.10` / `0.95`.
- `parsearArchivoExcel`: lee el **factor multiplicador directo** (última columna), fija `tipoVariacion="AUMENTO"` (neutro; el signo va en el factor) y procesa con `construirFilaCompleta` / `construirFilaDescuentoMasivo(row, true)`.
- `construirFilaDescuentoMasivo` acepta ahora `factorDirecto` para usar `construirFilaCompleta`. Texto de ayuda del uploader actualizado.

**2. `backend/sql/UDT_FACTOR_REDUCCION_ARTICULO.sql`** — Tabla personalizada (excepciones)
- Campos: `ARTICULO`, `FACTOR_REDUCCION DECIMAL(5,4)` (0.1000 = 10%), `ACTIVO` ('S'/'N'), `FECHA_INICIO`, `FECHA_FIN`, `FECHA_ULT_MODIF`, `USUARIO_ULT_MODIF` (+ auditoría de creación). PK, CHECKs (`FACTOR_REDUCCION` en [0,1), `ACTIVO` S/N, fechas), índice de búsqueda vigente y único filtrado por `ACTIVO='S'`.

**3. `backend/sql/SP_CALCULAR_MARGEN_MINIMO_ARTICULO.sql`** — SP independiente (Regla de Mayoreo)
- `Margen Promedio = (Precio Lista − Costo Promedio) / Precio Lista`.
- Factor de reducción vía `OUTER APPLY TOP 1` sobre la UDT (vigente y activo); si no existe, **10% por defecto** (`@p_factor_reduccion_default = 0.10`).
- `Margen Mínimo = Margen Promedio × (1 − Factor Reducción)`, acotado a ≥ 0.
- Persiste en la columna nativa `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN`. Ejecutable por artículo (`@p_articulo`) o toda la lista/versión (NULL). Idempotente. Devuelve resumen + detalle con origen del factor (`EXCEPCION_UDT` / `DEFAULT_10PCT`).

**4. Backend actualizado por pestaña (`backend/api/`)**
- `dtos.py`: enum `PestanaCargador` (`MASIVA` / `POR_ARTICULO`), campo `pestana` y `es_por_articulo()` en `SolicitudProcesoMasivoRequest`. `FilaCargaExcel` sigue sin "Tipo de Variación".
- `excel_processor.py`: `calcular_margen_minimo(precio, costo, factor_reduccion=None)` replica el SP (fallback 0.10, acota ≥ 0); constante `FACTOR_REDUCCION_DEFAULT = 0.10`.

### Validación en el motor de precios (ambas pestañas)
Tras calcular el precio redondeado de 12 bandas, se valida `margen ≥ MARGEN_UTILIDAD_MIN`. Si no cumple → `ARTICULO_PRECIO_AJUSTE_RECHAZO` con motivo `MARGEN_MINIMO_NO_CUMPLE` (ya implementado en `SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO`, v28). El nuevo SP alimenta ese `MARGEN_UTILIDAD_MIN` con la Regla de Mayoreo.

### Verificación
- **Mockup:** transpila con `@babel/standalone` sin errores (148.041 → 178.909 chars).
- **Python:** `ast.parse` OK; test aislado del margen mínimo (0.27 default, 0.255 con factor 0.15, None precio inválido, 0.0 acotado) + parseo de plantilla sin Tipo de Variación + pestaña — todos OK, test removido.
- **SQL:** paréntesis del código balanceados (UDT 29/29; el SP muestra 43/44 solo por un `)` dentro del literal de texto `'... rango [0, 1).'`, que es válido — el balance por línea confirma el código correcto).

### Nota de alcance
La UI se reorganizó **agrupando** los 3 procesos existentes bajo 2 pestañas, sin eliminarlos, para no romper componentes aprobados. `pestana` en el request es un discriminador de orquestación del API (no un parámetro del SP), por lo que no se añade a `to_sp_params()`.

## Corrección — Versión 28 (Margen mínimo dinámico por artículo + entregables backend)

**Historial previo (Versión 28):**

Aprobada por el usuario como la línea base vigente. Incluye filtros por atributos de artículo, compañías y listas de precio condicionadas, exclusión de MAYOREOD fuera de Actualización Masiva de Precios, reglas de roles y el detalle Artículo + Lista de Precio compartido entre solicitante y aprobador.

### Estado Actual (Versión 28)
- ✅ **Margen mínimo dinámico por artículo** en el mockup (`margenUtilidadMin` por artículo con fallback global 0.20), coherente con el backend
- ✅ **Entregables backend generados** (`backend/sql/`, `backend/api/`) — ver sección Versión 28 más abajo
- ✅ **Motor de redondeo comercial de 12 bandas** en mockup, SP y procesador Python (validado 27/27 casos)
- ✅ **Validación de margen contra precio REDONDEADO** (versión 27)
- ✅ **Tabla de previsualización con Precio Base · Precio Redondeado · Estado Redondeo** (versión 27)
- ✅ **8 identidades con Maker-Checker en SILLACA, COFERSA y FEBECA** (versión 26)
- ✅ **Tipo de Variación solo en Excel** (versiones 19/23/25)
- ✅ **Login blanco y selector visual** (versiones 23/24)

## Corrección — Versión 28 (Margen mínimo dinámico por artículo + entregables backend)

Solicitud del rol Arquitecto/Lead: ampliar el procesamiento masivo (margen dinámico por artículo + agrupación por atributos) y confirmar la remoción de "Tipo de Variación" en el cargador. Como el repositorio solo contenía el **mockup** y un **SP de referencia embebido en la especificación**, se generaron artefactos backend nuevos versionados en `backend/` y se ajustó el mockup.

### Entregables generados

**1. `backend/sql/fn_RedondeoComercial.sql`** — Función escalar T-SQL
- Réplica exacta del motor de redondeo de 12 bandas (mismo algoritmo del mockup/informe).
- `DECIMAL(28,8)` de entrada → `DECIMAL(28,2)` de salida; devuelve `NULL` fuera del rango [0,01; 100.000,00].
- Paréntesis del código balanceados (54/54).

**2. `backend/sql/SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO.sql`** — Stored Procedure evolucionado
- **CAMBIO 1 (Redondeo):** cada precio calculado pasa por `fn_RedondeoComercial`; el `PRECIO_REDONDEADO` es el que se persiste en `ARTICULO_PRECIO`. Si queda fuera de rango (NULL), se rechaza con motivo `PRECIO_FUERA_DE_RANGO`.
- **CAMBIO 2 (Margen dinámico por artículo):** `MARGEN_MINIMO_EFECTIVO = ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN` cuando está definido y > 0; en caso contrario el parámetro global `@p_margen_minimo` (fallback). La fórmula `Margen = 1 - (COSTO_PROM_DOL / PRECIO_REDONDEADO)` se evalúa sobre el precio **redondeado**; si es inferior al mínimo, se rechaza con `MARGEN_MINIMO_NO_CUMPLE`.
- **CAMBIO 3 (Agrupación por atributos):** nuevos parámetros `@p_categoria`, `@p_linea`, `@p_proveedor`, `@p_esquema_trabajo` que restringen el universo de artículos base (asume columnas `A.CATEGORIA / A.LINEA / A.PROVEEDOR` en `ARTICULO`; ajustables al modelo real).
- Nuevo parámetro `@p_aplicar_redondeo BIT = 1`. Sin parámetro/columna de "Tipo de Variación" (el signo va en el factor).
- El detalle de rechazos incluye atributos (categoría/línea/proveedor) para reporte/agrupación en el estado de la solicitud.
- Paréntesis del código balanceados (139/139).

**3. `backend/api/dtos.py`** — DTOs / entidades (Python dataclasses + Decimal)
- `SolicitudProcesoMasivoRequest.to_sp_params()` mapea 1:1 con los parámetros del SP.
- `FiltroAtributos` (categoría/línea/proveedor/esquema). `FilaCargaExcel` **sin** campo Tipo de Variación (solo `codigo_articulo`, `factor`, `lista_precio` opcional).
- `EstadoSolicitudResponse` con `rechazos_por_margen` y `resumen_por_motivo()` para reflejar los rechazos en la UI.
- Enums `ModoValidacion`, `EstadoRedondeo`, `MotivoRechazo`.

**4. `backend/api/excel_processor.py`** — Procesador de la plantilla simplificada
- Lee la plantilla **sin** columna Tipo de Variación; usa el factor directo.
- Motor de redondeo replicado en Python + validación de margen dinámico por artículo con fallback global, evaluada sobre el precio redondeado.
- Marca cada fila con `EstadoRedondeo` (CALCULADO / FUERA_DE_RANGO / ALERTA_MARGEN) y `MotivoRechazo`.

### Ajuste en el mockup

- **Catálogo con `margenUtilidadMin` por artículo:** ART-231 (0.30), ART-455 (0.25), ART-089 (0.20), ART-120 (0.20), ART-344 (0.35), y ART-104 **sin** valor (demuestra el fallback al global 0.20).
- Renombrado `MARGEN_MINIMO_ARTICULO` → `MARGEN_MINIMO_GLOBAL` (fallback).
- Nueva función `margenMinimoEfectivo(articulo)`; `calcularCostoMinimoArticulo` usa el margen del artículo con fallback. La validación de piso en `validarFila` refleja automáticamente el margen dinámico.

### Verificación

- **Python:** sintaxis OK (`ast.parse`); test aislado con 27/27 casos de redondeo + 3 casos de margen (propio cumple, propio no cumple → `MARGEN_MINIMO_NO_CUMPLE`, fallback global 0.20) — todos OK, test removido.
- **SQL:** paréntesis del código balanceados (fn 54/54, SP 139/139) descontando comentarios.
- **Mockup:** transpila con `@babel/standalone` sin errores (145.109 → 176.227 chars).

### Nota de alcance

Los DTOs y el procesador de Excel se implementaron en **Python** por consistencia con el único código previo del repo (`generate_plan_excel.py`); no existía un backend previo. Los scripts SQL usan el esquema `FEBECA` (como el SP de referencia); para otras compañías (COFER/SILLACA/BEVAL/MUNDIAL) se replica cambiando el esquema, según indica la especificación.

## Componentes clave en el borrador actual (`gestion-masiva-precios.html`)

**Versión 2 — SPA dinámica en React 18 + Babel standalone (CDN), estado real en memoria vía hooks, sin backend.**

- Nomenclatura de procesos actualizada: `FACTOR_PRECIO`, `MAYOREOD_MASIVO` (alerta destructiva obligatoria), `DESCUENTO_LISTA_PRECIO` (antes `UDF_FACTOR_ARTICULO`).
- Widget de switcher de identidad en el Header que simula SSO/OIDC (AWS Cognito / Active Directory) con 3 cuentas: Juan Pérez (OPERADOR), María Rodríguez (APROBADOR), Carlos Gómez (SIN_PERMISO → vista 403 completa, oculta todo el dashboard).
- Experiencia Operador: formulario con Tabs por proceso, cálculo de campos completos antes de habilitar "Simular impacto", envío que agrega la solicitud a "Mis Solicitudes Enviadas" con estado `PENDIENTE` real (useState), toast de éxito, y solicitudes/aprobaciones inhabilitadas para este rol (segregación de funciones).
- Experiencia Aprobador: la navegación cambia automáticamente a la Bandeja; el formulario de nueva solicitud queda en modo solo lectura (`disabled` real en todos los inputs/comboboxes); bloqueo de autoaprobación cuando `solicitud.solicitanteEmail === currentUser.email`.
- Modal de Revisión con 3 fases controladas por estado de componente: `diff` (tabla comparativa Precio Actual vs. Precio Simulado con Badge "ALERTA COSTO" en rojo para margen negativo), `monitoreo` (Progress Bar animada 0→100% con `setInterval`, genera `ID_PROCESO_SP` dinámico tipo `#SP-YYYYMMDD-NNNN`), `resultado` (Badge final `APROBADO_CON_ERRORES`, métricas de exitosos/fallidos y acordeón `<details>` con causa de error simulada por SKU y proceso).
- Rechazo: `Textarea` que habilita el botón "Rechazar" únicamente cuando tiene contenido (`motivo.trim().length > 0`); cambia el estado real de la solicitud a `RECHAZADO`.
- Auditoría: tabla derivada de un log de eventos en memoria (`SOLICITUD_ENVIADA`, `EJECUCION_INICIADA`, `EJECUCION_FINALIZADA`, `SOLICITUD_RECHAZADA`) generado dinámicamente por las acciones del usuario en la sesión.
- Iconografía estilo Lucide implementada en línea como componente `Icon` (SVG con paths) para no depender de un CDN adicional de iconos dentro del entorno Babel-standalone.
- Selects personalizados (componente `Combobox` reutilizable) con posicionamiento `fixed` calculado en JS (`getBoundingClientRect`), overflow visible en contenedores padre (`.combo-parent`), registro global de cierre (`comboRegistry`) que respeta clics dentro de `.combo-w`, y `stopPropagation()` en cada opción — arquitectura anti-regresión de combobox preservada íntegramente en la migración a React.
- Verificación técnica: se comprobó el balance de llaves/paréntesis/corchetes del bloque `<script type="text/babel">` (432/432, 452/452, 76/76) y se sirvió el archivo por HTTP local para confirmar carga sin errores 4xx/5xx antes de entregarlo.

## Componentes clave — Versión 3 (carga Excel + lenguaje de negocio + errores fila por fila)

- **Nomenclatura de negocio, sin modismos técnicos de BD:** "Factor por Nivel" (antes `FACTOR_PRECIO`), "Actualización Lista Base" (antes `MAYOREOD_MASIVO`, conserva el alert destructivo "⚠️ Atención: Impacto directo en producción."), "Descuento por Artículo" (antes `DESCUENTO_LISTA_PRECIO`). Los identificadores internos (`FACTOR_PRECIO`, etc.) se conservan solo como claves de objeto en `PROCESOS`, nunca visibles en pantalla.
- **Carga por Plantilla Excel/CSV:** componente `ExcelUploader` con dropzone (drag & drop + selector de archivo), parseo real vía SheetJS (`xlsx` CDN) leyendo columnas `Fila | Código Artículo | Valor Propuesto`, y simulación de subida a `s3://erp-precios-uploads/` (nombre de objeto generado dinámicamente, mostrado en la UI). Disponible en los 3 procesos, alternando con una modalidad "Captura Manual" mediante sub-tabs.
- **Motor de validación real (`validarFila`):** no son textos fijos — cada fila se evalúa contra un catálogo de artículos en memoria (`CATALOGO_ARTICULOS`) aplicando 4 reglas de negocio reales: (1) código inexistente en catálogo activo, (2) formato de celda inválido / valor no numérico, (3) factor fuera de rango (0–2), (4) precio propuesto por debajo del costo de reposición. El dataset de ejemplo reproduce deliberadamente los 3 escenarios exactos pedidos por el usuario (costo, catálogo, formato).
- **Tabla de previsualización compartida (`TablaPrevisualizacion`):** mismas columnas para Operador y Aprobador — Fila Excel | Código Artículo | Descripción | Precio Actual | Precio Propuesto | Margen Est. | Validación — visible tanto al precalcular manualmente como al cargar un Excel, y reutilizada dentro del modal de revisión del Aprobador.
- **Reporte de error 100% explícito post-ejecución:** cuando el resultado es `APROBADO_CON_ERRORES` o `ERROR_EJECUCION` (derivado del conteo real de filas fallidas, ya no un valor fijo), se despliega una "Auditoría de errores fila por fila" con columnas Fila/Artículo, Valor Intentado y Causa del Error, generando el mismo texto solicitado (`"Fila 12 [ART-089]: ..."`). Se eliminó el caso de métricas vacías: si 0 filas fallan, se muestra un mensaje de éxito explícito en vez de una tabla vacía.
- **Descargas simuladas desde S3:** botones "📥 Descargar Reporte Completo de Errores (CSV)" y "🔄 Descargar Excel Solo con Filas Fallidas para Corregir", que generan un CSV real en el navegador (`Blob` + `URL.createObjectURL`) a partir de los datos de la ejecución, y muestran la ruta simulada `s3://erp-precios-logs/...`.
- **SSO/roles:** sin cambios de comportamiento respecto a la Versión 2 (Juan Pérez/Operador, María Rodríguez/Aprobador, Carlos Gómez/Sin permiso → 403), verificado que sigue funcionando tras la reescritura.
- **Verificación técnica:** balance de llaves/paréntesis/corchetes del bloque `<script type="text/babel">` confirmado (545/545, 652/652, 113/113); archivo servido por HTTP local devolviendo `200` con la longitud completa de bytes antes de entregarlo.

## Componentes clave — Versión 4 (carga individual real, previsualización inline, ciclo PROCESADO)

- **Formulario "Descuento por Artículo" alineado a `dbo.DESCUENTO_LISTA_PRECIO`:** la captura manual dejó de usar "Grupo de Artículos" y ahora usa los campos reales de esa tabla — selector de artículo puntual (código + descripción autocompletada del catálogo), Lista de Precio, Versión, Factor de Descuento (0–2), Vigente Desde/Hasta. Muestra en vivo precio actual, costo de reposición y precio con descuento antes de simular. Al simular, la fila generada es exactamente el artículo parametrizado (no una muestra genérica).
- **Panel de previsualización único, en la misma ventana:** se eliminaron los paneles duplicados de "previsualización" que aparecían dentro de cada modalidad; ahora existe un solo bloque debajo del formulario, título "🔍 Previsualización de Impacto (Muestra Representativa / Diff)" con la leyenda exacta "✅ Simulación completada sobre una muestra representativa / filas del archivo...", visible tanto para captura manual como para carga Excel, sin modales ni cambio de pestaña. El botón "Enviar a Aprobación" permanece deshabilitado hasta que este panel exista (`filasExcel` con datos).
- **Ciclo de vida renombrado:** `APROBADO` → `PROCESADO`, `APROBADO_CON_ERRORES` → `PROCESADO_CON_ERRORES` (badges, filtros de bandeja, seed de datos y lógica de `App` actualizados de forma consistente).
- **Monitor de Auditoría en Tiempo Real:** el título del modal en fase `EN_PROCESO` cambia a "Monitor de Auditoría en Tiempo Real" y muestra explícitamente la cuenta del Aprobador que autorizó (`currentUser.nombre` + email), además del `ID_PROCESO_SP` dinámico.
- **Auditoría fila por fila completa (no solo errores):** la tabla post-ejecución ahora lista TODAS las filas (éxito y error) con las 5 columnas pedidas — Fila/Código, Descripción, Precio Anterior vs. Precio Nuevo Procesado, Estado (🟢/🔴) y Causa Exacta del Error. Antes solo se mostraban las filas fallidas en un `<details>`; ahora es la tabla principal del resultado.
- **Exportación real a Excel:** se agregó `descargarExcelFilas` usando SheetJS (`XLSX.utils.aoa_to_sheet` + `XLSX.writeFile`) para el botón "🔄 Exportar Solo Filas con Error (Excel)", que genera un `.xlsx` real (no CSV). El botón "📥 Descargar Log de Auditoría desde S3 (CSV)" conserva el CSV completo de todas las filas.
- **Verificación técnica:** balance de llaves/paréntesis/corchetes del bloque Babel confirmado (581/581, 685/685, 130/130); archivo servido por HTTP local devolviendo `200` con la longitud completa de bytes.

## Componentes clave — Versión 5 (carga individual multi-artículo + plantilla Excel descargable)

- **Captura manual multi-artículo en "Descuento por Artículo":** se reemplazó el formulario de un solo artículo por un patrón de "agregar artículo con +": un mini-formulario (Código de Artículo, Factor, Vigente Desde/Hasta) con botón "➕ Agregar artículo" que va acumulando filas en una tabla debajo (`itemsManual`), mostrando # / Código / Descripción / Factor / Vigencia / Quitar (ícono de basura por fila). Valida que no se agregue el mismo código dos veces. El botón "Simular impacto" queda deshabilitado hasta que exista al menos un artículo agregado; al simular, cada artículo agregado se convierte en una fila real evaluada por `validarFila` (mismos campos que persistirá `dbo.DESCUENTO_LISTA_PRECIO`).
- **Plantilla Excel oficial descargable:** se agregó `descargarPlantillaExcel(procesoKey)`, que genera un `.xlsx` real (SheetJS) con los encabezados exactos que espera el parser (`Fila | Codigo Articulo | Factor/Precio Propuesto`) y 2 filas de ejemplo prellenadas. El botón "Descargar plantilla" aparece en la sub-pestaña "Carga por Plantilla Excel" de los 3 procesos, antes del dropzone, con copy "¿Aún no tiene el archivo? Descargue la plantilla oficial de este proceso."
- **Verificación técnica:** balance de llaves/paréntesis/corchetes del bloque Babel confirmado (616/616, 733/733, 145/145); archivo servido por HTTP local devolviendo `200` con la longitud completa de bytes.

## Corrección — Versión 6 (fechas de vigencia removidas, aclaración de que solo hay 2 modos)

- **Fechas de vigencia eliminadas.** El usuario nunca las solicitó; se agregaron por iniciativa propia en la Versión 4 al modelar el formulario de "Descuento por Artículo" y no correspondían a ningún requisito dado. Se removieron los campos `Vigente Desde`/`Vigente Hasta` (inputs, estado `vigenciaDesde`/`vigenciaHasta`, columna "Vigencia" en la tabla de artículos agregados, y su limpieza en `resetFormulario`).
- **Aclaración: solo existen 2 modos de captura, nunca 3.** El único selector de modalidad es "Captura Manual" vs. "Carga por Plantilla Excel" (sub-tabs en la línea de `modalidad`). La confusión de "tres modos" venía de que, dentro de "Captura Manual" para Descuento por Artículo, el bloque "Agregar artículo" tenía un borde punteado separado que lo hacía ver como una tercera opción independiente; se quitó ese contenedor con borde propio y el bloque ahora es visualmente parte continua del mismo formulario manual.

## Métodos Descartados
- **Mockup HTML estático con JS vainilla imperativo (innerHTML manual por vista).** Se descartó como base para esta iteración porque el usuario solicitó explícitamente un prototipo dinámico con estado en tiempo real, tipo SPA, con lógica de roles y flujo asíncrono simulado; se reemplazó por una arquitectura de componentes React con estado real (`useState`/`useEffect`) cargado vía Babel-standalone en el navegador, sin build step.
- **Causas de error como texto fijo por SKU (Versión 2).** Se descartó porque el usuario exigió que el desglose fuera "100% explícito" y derivado de una regla real, no de un mapeo estático; se reemplazó por el motor `validarFila` que evalúa cada fila contra el catálogo y genera la causa dinámicamente según el dato recibido.
- **Carga individual por "Grupo de Artículos" en Descuento por Artículo (Versión 3).** Se descartó porque el usuario indicó explícitamente que ese formulario debe reflejar los campos reales de `dbo.DESCUENTO_LISTA_PRECIO` (artículo puntual, no grupo); se reemplazó por un selector de artículo específico con vigencia y precálculo visual del precio con descuento.
- **Tabla de resultado mostrando solo filas fallidas dentro de un `<details>` colapsable (Versión 3).** Se descartó porque el usuario pidió la auditoría fila por fila / artículo por artículo como tabla principal, incluyendo también las filas exitosas; se reemplazó por una tabla siempre visible con las 5 columnas pedidas.
- **Captura manual de un único artículo por solicitud en "Descuento por Artículo" (Versión 4).** Se descartó porque el usuario pidió poder ingresar uno o más artículos manualmente, acumulándolos en pantalla con un botón "+"; se reemplazó por el patrón de agregar/quitar artículos (`itemsManual`) con tabla acumulada.

## Historial de Versiones
- **v1_aprobado** — `Product-Definition/mockups/.versions/v1_aprobado.html` (línea base activa aprobada).

## Corrección — Versión 7 (Actualización Lista Base = captura manual multi-lista, ámbito por compañía/lista)

- **"Actualización Lista Base" ahora captura por lista, no por grupo de artículos, y solo de forma manual.** Se eliminó el selector único "Grupo de Artículos" y la sub-pestaña "Carga por Plantilla Excel" quedó deshabilitada exclusivamente para este proceso (impacto directo en producción); las otras dos pestañas (Factor por Nivel y Descuento por Artículo) conservan ambas modalidades sin cambios. Se reutilizó el mismo patrón "agregar con +" de Descuento por Artículo: mini-formulario (Lista de Precio + Factor 0–2) con botón "➕ Agregar" que acumula filas en una tabla (# / Lista / Artículos Impactados / Factor / Quitar), valida que no se agregue la misma lista dos veces, y solo permite enviar cuando existe al menos una lista agregada y el checkbox de impacto está marcado.
- **Ámbito por compañía y lista (RF-02/RF-03):** cada identidad simulada (`IDENTITIES`) ahora declara `companiasPermitidas` y `listasPermitidas`. Se agregó un selector obligatorio de **Compañía** en el formulario de Nueva Solicitud (los 3 procesos), cuyas opciones fuera de ámbito aparecen deshabilitadas con badge "Sin acceso" en el combobox (soporte nuevo de `opt.disabled` en el componente `Combobox`, sin tocar el sistema anti-regresión de posicionamiento/cierre). Las opciones de "Lista de Precio" también se filtran por `listasPermitidas` del usuario. El envío (`handleEnviar`) valida de forma defensiva `estaEnAmbito(...)` antes de construir la solicitud, simulando la revalidación que debe repetir el backend. La Bandeja de Aprobación filtra las solicitudes visibles por la compañía dentro del ámbito del Aprobador actual (`estaEnAmbito` aplicado sobre `s.compania`).
- **Trazabilidad de compañía visible:** se agregó la columna "Compañía" tanto en la Bandeja de Aprobación como en "Mis Solicitudes Enviadas"; la compañía de una solicitud nueva ya no se asigna al azar, sino que es la seleccionada explícitamente por el Solicitante en el formulario.
- **Verificación técnica:** balance de llaves/paréntesis/corchetes del bloque Babel confirmado (667/667, 815/815, 165/165); archivo servido por HTTP local devolviendo `200` con 85,634 bytes.

## Métodos Descartados (continuación)
- **Selector único "Grupo de Artículos" para Actualización Lista Base.** Se descartó porque el usuario pidió que este proceso capture por lista de precio (igual patrón que Descuento por Artículo, pero a nivel de lista), no por un grupo predefinido de artículos.
- **Carga por Excel para Actualización Lista Base.** Se descartó explícitamente por instrucción del usuario: al ser un proceso de impacto directo en producción, su captura debe ser exclusivamente manual.
- **Asignación aleatoria de compañía al crear una solicitud.** Se descartó porque contradice RF-02/RF-03 (ámbito real por usuario); ahora la compañía es un campo obligatorio del formulario, validado contra el ámbito del Solicitante.

## Corrección — Versión 8 (campo Versión removido de ambas pestañas)

- **"Descuento por Artículo":** se removió el selector "Versión" del formulario manual; el usuario indicó que no aplica a este proceso individual. Se conserva únicamente "Lista de Precio" (validada contra el ámbito del usuario).
- **"Factor por Nivel":** se removió el selector "Versión" también, porque según indicó el usuario no es un valor que el usuario deba seleccionar — la versión activa de la lista es una validación que corresponde a la base de datos/backend (equivalente a RF-08 "versiones inactivas" evaluado server-side), no un campo de captura en la interfaz. Se dejó una nota informativa en el formulario aclarando que la versión se valida automáticamente. El formulario de este proceso quedó en grid de 2 columnas (Lista de Precio + Factor).
- Se limpiaron el estado `version`/`versionOpts` y todas sus referencias en validaciones (`camposManualCompletos`) y en el payload de envío (`parametros`), ya que el campo no volvió a usarse en ningún proceso.
- **Verificación técnica:** balance de llaves/paréntesis/corchetes del bloque Babel confirmado (653/653, 808/808, 164/164); archivo servido por HTTP local devolviendo `200` con 96,495 bytes.

## Métodos Descartados (continuación)
- **Selector "Versión" en Factor por Nivel y Descuento por Artículo.** Se descartó en ambos procesos por instrucción del usuario: en Descuento por Artículo no aplica al proceso individual; en Factor por Nivel no es un dato que el usuario deba seleccionar, sino una validación de versión activa que corresponde a la base de datos/backend (RF-08 sigue cubierto, pero de forma no visible en el formulario).

## Corrección — Versión 9 (búsqueda dinámica de artículos)

- **Buscador dinámico en "Descuento por Artículo":** el selector "Código de Artículo" ahora permite escribir y filtra en tiempo real las opciones del catálogo por código o por nombre/descripción. La comparación ignora mayúsculas, minúsculas y acentos (por ejemplo, `art-231`, `refrigeradora` o `refrigeradora 14 pies` encuentran el mismo artículo).
- **Selección controlada:** escribir texto no crea artículos libres; el usuario debe seleccionar una opción filtrada del catálogo para conservar las validaciones existentes de código, precios y costos. Si no hay coincidencias, el desplegable muestra "No se encontraron artículos por código o nombre".
- **Sin regresiones de combobox:** la búsqueda se habilita únicamente cuando el `id` es `codigo-articulo`; todos los demás comboboxes mantienen su comportamiento de selección de solo lectura. Se preservaron `position: fixed`, `onFocus` y `onClick`, el cierre global que ignora eventos dentro de `.combo-w`, y `stopPropagation()` al seleccionar una opción.
- **Verificación estructural:** se revisó el bloque React/Babel actualizado: el filtro usa `normalizar(...)`, `opcionesVisibles` y mantiene el renderizado de opciones y el estado vacío dentro del dropdown.


## Corrección — Versión 10 (Gestión Global manual y carga masiva detallada de Lista Base)

- **"Factor por Nivel" pasa a llamarse "Gestión Global".** Se conserva la clave técnica `FACTOR_PRECIO` para no afectar la lógica existente, pero su etiqueta y descripción reflejan el ajuste global manual por lista de precio mediante un factor multiplicador.
- **Gestión Global es exclusivamente manual.** La modalidad de carga por plantilla Excel queda oculta para este proceso; el usuario debe capturar la lista y el factor directamente en el formulario.
- **Actualización Lista Base admite captura manual y plantilla Excel.** La carga Excel conserva el formato detallado por artículo y factor (`Fila | Código Artículo | Valor Propuesto`) para revisar el impacto del cálculo antes de enviarlo a aprobación. La simulación de una carga Excel ya no reemplaza las filas importadas con la captura manual.
- **Paginación automática para cargas superiores a 5,000 registros.** `TablaPrevisualizacion`, reutilizada tanto por el Solicitante como por el Aprobador, muestra 100 artículos por página, el rango visible, navegación Anterior/Siguiente y los hallazgos de la página activa.
- **Detalle de cálculo visible.** La previsualización incorpora la columna **Factor Aplicado**, además de precio actual, precio propuesto, margen estimado y validación por artículo.
- **Verificación técnica:** bloque Babel con delimitadores balanceados (686/686 llaves, 851/851 paréntesis y 168/168 corchetes). El mockup respondió `HTTP 200` al servirlo localmente.


## Corrección — Versión 11 (Lista Base manual con detalle de precios por artículo)

- **Actualización Lista Base ya no admite carga por plantilla Excel.** Queda exclusivamente en captura manual por lista de precio y factor; Descuento por Artículo conserva su modalidad Excel.
- **Simulación detallada por artículo:** cada lista agregada se expande contra una relación de catálogo de referencia (`ARTICULOS_POR_LISTA`). Para cada artículo se muestra su lista, código, precio actual, factor aplicado, precio propuesto, margen estimado y resultado de validación.
- **Precios visibles en Solicitante y Aprobador:** el mismo detalle generado se persiste en la solicitud y se reutiliza en el modal de revisión. La solicitud semilla de Lista Base también utiliza el cálculo por artículo.
- **Datos de referencia:** la relación lista–artículos es un fixture del mockup; en la integración productiva debe provenir del catálogo y listas de precios vigentes en Softland.
- **Verificación técnica:** bloque Babel balanceado (690/690 llaves, 843/843 paréntesis y 174/174 corchetes). Se confirmó la condición `permiteExcel = !esGestionGlobal && !esListaBase` y el generador `construirFilasListaBase`.


## Corrección — Versión 12 (factor aplicado en Gestión Global)

- **Se corrigió la simulación manual de Gestión Global.** Antes reutilizaba una muestra técnica de Excel que contenía una fila con `N/D` para probar errores de formato; por eso podía aparecer `N/D` como factor aplicado aunque el usuario hubiera capturado un factor válido.
- **Nuevo cálculo por lista y factor capturados:** `construirFilasGestionGlobal(listaCodigo, factor)` genera las filas de los artículos de la lista seleccionada y asigna exactamente el valor de factor ingresado a cada una. La previsualización muestra ahora el mismo factor aplicado, precio actual y precio propuesto resultante para todos los artículos evaluados.
- **Verificación técnica:** se confirmó que `handleSimular` usa `construirFilasGestionGlobal(nivel, factor)` y el bloque Babel conserva delimitadores balanceados (695/695 llaves, 850/850 paréntesis y 176/176 corchetes).


## Corrección — Versión 13 (captura porcentual y factor multiplicador automático)

- **Nueva regla única de captura:** en Gestión Global, Actualización Lista Base, Descuento por Artículo y la plantilla Excel el usuario ingresa una **variación porcentual**, no el multiplicador directo. Por ejemplo, `10` representa `+10 %` y el sistema calcula el factor `1.10`; `-10` representa `-10 %` y calcula `0.90`.
- **Validación y cálculo centralizados:** `convertirPorcentajeAFactor` acepta variaciones entre `-99 %` y `100 %`, equivalentes a un factor mayor que cero y menor o igual a dos. La simulación, validaciones de margen y payload de Gestión Global usan el multiplicador derivado.
- **Evidencia visible:** la previsualización, tablas de elementos agregados y reportes de exportación muestran tanto la variación capturada como el factor calculado, junto con los precios actual y propuesto.
- **Plantilla Excel actualizada:** su tercera columna ahora es `Variacion (%)`; al importar, aplica la misma conversión que la captura manual.
- **Verificación técnica:** bloque Babel balanceado (717/717 llaves, 880/880 paréntesis y 183/183 corchetes). Se verificó la presencia de la conversión central, la plantilla porcentual y el uso del multiplicador en Gestión Global.


## Corrección — Versión 14 (modalidades alineadas con la EA)

- **Actualización Lista Base es el proceso masivo.** Se habilita exclusivamente mediante la plantilla Excel: descarga, carga, validación por fila, previsualización de precios y envío a aprobación. La pestaña abre directamente en modalidad Excel y no ofrece captura manual.
- **Descuento por Artículo es únicamente individual.** Conserva el formulario manual para seleccionar lista, buscar un artículo y registrar su porcentaje/factor calculado; la opción de plantilla Excel queda eliminada de este proceso.
- **Gestión Global se conserva manual.** Mantiene la selección de una lista objetivo, la captura del ajuste porcentual y el factor multiplicador derivado.
- **Datos de ejemplo coherentes:** la solicitud pendiente `SOL-10448` ahora representa una carga Excel de Actualización Lista Base, con archivo asociado y filas generadas desde la variación porcentual.
- **Trazabilidad funcional:** esta distribución corresponde a RF-01 (tres procesos), RF-04 a RF-07 (gestión global por lista), RF-09 a RF-12 (proceso masivo por Excel) y RF-13 a RF-16 (gestión individual por artículo/lista/factor).


## Corrección — Versión 15 (término funcional Factor restaurado)

- **Se restaura el nombre funcional `Factor`** en los formularios de Gestión Global, Actualización Lista Base y Descuento por Artículo, así como en la plantilla Excel, previsualización, tablas de elementos agregados y reportes exportados.
- **Se preserva la conversión automática solicitada:** cuando el usuario ingresa `10` en Factor, el mockup calcula y muestra el multiplicador aplicado `1.10`. La tabla diferencia **Factor ingresado** de **Factor aplicado** para conservar la evidencia del valor digitado y del valor usado en el cálculo.
- **Implementación interna sin cambio funcional:** las propiedades internas de porcentaje se conservan únicamente para efectuar la conversión; no se exponen como nomenclatura de negocio en la interfaz.
- **Verificación técnica:** bloque Babel balanceado (712/712 llaves, 867/867 paréntesis y 182/182 corchetes), con etiquetas `Factor` y conversión `1 + (valor / 100)` confirmadas.

## Corrección — Versión 16 (renombre del proceso masivo)

- **Nombre visible actualizado:** el proceso antes mostrado como **Actualización Lista Base** se denomina ahora **Actualización Masiva de Precios**, reflejando que procesa múltiples artículos mediante una plantilla Excel y validación detallada por fila.
- **Compatibilidad técnica preservada:** se conserva la clave interna `MAYOREOD_MASIVO`, por lo que no cambia la lógica, modalidad exclusiva por Excel, datos asociados ni flujo de aprobación.
- **Ejemplo actualizado:** la solicitud semilla usa el archivo `actualizacion-masiva-precios.xlsx` y su clave de almacenamiento correspondiente.
- **Verificación:** se confirmó en el código la nueva etiqueta, la clave técnica y el archivo de ejemplo; no queda una definición visible `label: "Actualización Lista Base"`. El bloque Babel mantiene el balance previo de delimitadores (712/712 llaves, 867/867 paréntesis y 182/182 corchetes), ya que el cambio solo sustituye textos. El mockup fue servido por HTTP local y respondió `200`.

## Corrección — Versión 17 (EA de MAYOREOD e integración masiva de descuentos)

- **`MAYOREOD_MASIVO` conforme a la EA, sin crear una pestaña adicional:** la pestaña visible **Actualización Masiva de Precios** ahora solicita exclusivamente un **Grupo de Artículos**. Fija el contexto de ejecución a la Lista Base `MAYOREOD` / nivel `MayoreoD` y comunica que la versión `APROBADA` se resuelve y revalida en backend antes de ejecutar el Stored Procedure autorizado sobre `ARTICULO_PRECIO`.
- **Ámbito y trazabilidad del proceso de lista base:** el payload simulado persiste `listaBase`, `nivelPrecio`, `grupoArticulos` y la condición de versión aprobada; no permite seleccionar otra lista ni versión en este proceso. La solicitud semilla `SOL-10448` fue alineada con esa modalidad manual por grupo.
- **Carga masiva integrada en Descuento por Artículo:** sin añadir una pestaña, `DESCUENTO_LISTA_PRECIO` ofrece las modalidades **Captura Manual** y **Carga Masiva por Plantilla Excel**. La plantilla `.xlsx` contiene `Fila | Lista de Precio | Codigo Articulo | Factor`; cada fila se valida contra catálogo, lista reconocida, ámbito del usuario y las reglas de factor/precio.
- **Bloqueo de lote completo:** si una fila de la plantilla contiene un error funcional, de formato o de ámbito, se muestra el detalle y el lote completo no se puede simular ni enviar a aprobación. Esto implementa el rechazo previo requerido por RF-11.
- **Verificación:** se confirmó la presencia de `GRUPOS_ARTICULOS`, `MAYOREOD / MayoreoD`, versión aprobada, la carga XLSX para Descuento por Artículo y la condición de bloqueo de filas inválidas. El mockup fue servido localmente y respondió `HTTP 200` (104,167 bytes).

## Corrección — Versión 18 (alerta única y lista base parametrizable)

- **Alerta consolidada:** se eliminó el aviso duplicado de `MAYOREOD_MASIVO`; permanece un único bloque de alerta contextual junto al selector de Grupo de Artículos.
- **Contexto centralizado:** se creó `LISTA_BASE_OBJETIVO` con `codigo`, `nombre`, `nivelPrecio` y `versionEstado`. El aviso, las tarjetas de contexto, la simulación, el checkbox de confirmación, el payload y la solicitud semilla consumen esta configuración.
- **Evolución sin reescritura de interfaz:** si la lista base deja de denominarse MAYOREOD, basta con sustituir los valores de configuración —en producción, obtenidos desde backend— sin cambiar la pestaña ni la lógica visual. La clave técnica `MAYOREOD_MASIVO` se conserva para compatibilidad.
- **Verificación:** el código contiene la configuración centralizada y un único aviso dinámico; el mockup respondió `HTTP 200` al servirse localmente (104,276 bytes).

## Corrección — Versión 19 (factor en actualización masiva de lista base)

- **Factor requerido:** la pestaña **Actualización Masiva de Precios** ahora solicita Grupo de Artículos y Factor; no permite simular ni enviar hasta que ambos sean válidos y se confirme el impacto.
- **Base de cálculo:** para cada artículo del grupo, la simulación toma su precio vigente de la Lista Base configurada y calcula `Precio Propuesto = Precio Actual × Factor aplicado`. El grupo determina el universo de artículos; el factor es único para todo ese universo.
- **Trazabilidad:** el payload conserva el factor multiplicador, el valor ingresado y el grupo; la solicitud semilla representa `10` como factor aplicado `1.10`.
- **Verificación:** se confirmó el factor visible, la llamada de simulación con grupo/factor y el payload. El mockup respondió `HTTP 200` localmente (104,695 bytes).

## Corrección — Versión 20 (revisión del Aprobador conforme a la EA)

- **Solicitud demostrable para el Aprobador:** la solicitud pendiente `SOL-10448` de Actualización Masiva de Precios pertenece ahora a Juan Pérez (Operador) y continúa dentro de Colombia, ámbito permitido para María Rodríguez (Aprobador). Por ello puede abrirse y revisarse desde la Bandeja sin debilitar la segregación de funciones.
- **Segregación preservada en interfaz y flujo:** una solicitud pendiente creada por el propio Aprobador sigue identificándose como “Tu solicitud” y no puede abrirse para decidir. El modal también impide decisiones si la solicitud ya no está pendiente o pertenece al aprobador activo.
- **Evidencia para decidir:** el modal muestra los parámetros inmutables enviados por el Solicitante para la Actualización Masiva de Precios: Lista Base, nivel de precio, versión, grupo de artículos, factor aplicado y registros impactados, además del diff por artículo ya existente.
- **Trazabilidad de revisión:** abrir una solicitud pendiente registra el evento `SIMULACION_REVISADA` en la Auditoría. La decisión mantiene el flujo Pendiente → En proceso → resultado, o Rechazado con motivo obligatorio.
- **Mensajería funcional:** el monitor de estado ya no expone detalles de infraestructura; informa únicamente que la actualización autorizada está en proceso.
- **Validación:** se revisaron los bloques JSX modificados, se confirmó por búsqueda el control de rol + estado pendiente + no autoaprobación, los seis parámetros de revisión y la reasignación de `SOL-10448` a Juan Pérez. El mockup se sirvió localmente y respondió `HTTP 200` (107,669 bytes).

## Corrección — Versión 21 (compañías reales, listas por compañía, filtros de artículo, Aprobador puede crear solicitudes)

- **Compañías del listado maestro actualizadas.** `COMPANIAS` pasó de `["Costa Rica", "Colombia", "Venezuela"]` a `["SILLACA", "BEVAL", "FEBECA", "COFERSA"]`. Los dos usuarios con acceso (Operador y Aprobador) tienen las 4 compañías en `companiasPermitidas`, cumpliendo "el operador pueda ver con el usuario operador todas las compañías".
- **Listas de precio por compañía (`LISTAS_POR_COMPANIA`):** SILLACA, BEVAL y FEBECA habilitan `MAYOREOD, MAYOREOB, LPARAGUA, GRUPOPICO, LARAB`; COFERSA habilita `LPV1` a `LPV18`. El selector "Lista de Precio" del formulario de Nueva Solicitud ahora deriva sus opciones de la Compañía elegida (filtradas además por `listasPermitidas` del usuario, sin tocar la lógica de ámbito existente). Se corrigieron referencias obsoletas a los códigos `mayorista/detalle/corporativa` (plantilla Excel, solicitud semilla `SOL-10447`) para usar `mayoreod`/`lpv1` reales.
- **Filtros de artículos añadidos en "Descuento por Artículo" (captura manual):** nuevo bloque con 6 comboboxes — Categoría, Subcategoría, Grupo, Marca, Marca Grupo Compra y BDF — que filtran en tiempo real las opciones del selector "Código de Artículo". Se enriqueció `CATALOGO_ARTICULOS` con esos 6 atributos por artículo (usando los valores ya definidos en `FILTROS_ARTICULOS`) y se agregó el contador "N artículo(s) coinciden con los filtros aplicados".
- **El Aprobador ahora puede crear solicitudes.** Se eliminó el bloqueo `readOnly={!esOperador}` del formulario de Nueva Solicitud: ambos roles (Operador y Aprobador) pueden capturar, simular y enviar solicitudes. La segregación de funciones se mantiene intacta por otra vía: solo el rol `APROBADOR` puede abrir el modal de revisión (`abrirModal` sigue validando `user.rol !== "APROBADOR"`) y `puedeDecidir`/`puedeAprobar` siguen bloqueando la autoaprobación. El Operador nunca ve botones de aprobar/rechazar porque nunca accede al modal de revisión.
- **Verificación técnica:** bloque Babel con delimitadores balanceados (811/811 llaves, 981/981 paréntesis, 259/259 corchetes). El mockup se sirvió localmente y respondió `HTTP 200` (118,354 bytes).

## Corrección — Versión 22 (MAYOREOD exclusivo de Actualización Masiva de Precios)

- **Gestión Global ya no puede seleccionar MAYOREOD.** El selector "Lista de Precio" de esta pestaña (`FACTOR_PRECIO`) usa un nuevo listado `nivelOptsGestionGlobal` que excluye explícitamente `mayoreod`; el resto de listas (MAYOREOB, LPARAGUA, GRUPOPICO, LARAB, LPV1–LPV18, según ámbito/compañía) permanecen disponibles sin cambios. Descuento por Artículo no se vio afectado y conserva acceso a todas sus listas autorizadas, incluida MAYOREOD para descuentos puntuales por artículo.
- **Limpieza defensiva de estado:** si el usuario tenía `mayoreod` seleccionado en otra pestaña y cambia a Gestión Global, el campo Lista de Precio se resetea automáticamente para no dejar un valor inválido ya no visible en las opciones.
- **Nota aclaratoria en el formulario:** se añadió el texto "La lista base (MAYOREOD) se gestiona exclusivamente desde Actualización Masiva de Precios" junto al selector de Gestión Global.
- **Verificación técnica:** bloque Babel balanceado (812/812 llaves, 988/988 paréntesis, 259/259 corchetes). El mockup respondió `HTTP 200` al servirse localmente (119,010 bytes).

## Corrección — Versión 23 (MAYOREOD excluida también de Descuento por Artículo)

- **Descuento por Artículo ya no puede seleccionar MAYOREOD.** El selector "Lista de Precio" de esta pestaña (captura manual) ahora usa `nivelOptsSinListaBase` (renombrado desde `nivelOptsGestionGlobal`, que ya excluía MAYOREOD en Gestión Global); se agregó una nota aclaratoria idéntica a la de Gestión Global: "La lista base (MAYOREOD) se gestiona exclusivamente desde Actualización Masiva de Precios".
- **Carga masiva por Excel también bloqueada para MAYOREOD:** si una fila de la plantilla trae `MAYOREOD` como Lista de Precio, `handleArchivoParsed` la marca inválida con la causa "La Lista Base (MAYOREOD) no se gestiona desde Descuento por Artículo; use Actualización Masiva de Precios", bloqueando el lote completo como ya ocurre con otras filas inválidas.
- **Datos de ejemplo corregidos:** la plantilla descargable de Descuento por Artículo y la solicitud semilla `SOL-10447` usan `MAYOREOB` en vez de `MAYOREOD` como fila de ejemplo válida.
- **Limpieza defensiva de estado:** cambiar a la pestaña Descuento por Artículo (además de Gestión Global) resetea el campo Lista de Precio si tenía `mayoreod` seleccionado desde otra pestaña.
- **Verificación técnica:** bloque Babel balanceado (817/817 llaves, 994/994 paréntesis, 260/260 corchetes). El mockup respondió `HTTP 200` al servirse localmente (119,631 bytes).

## Corrección — Versión 24 (Descuento por Artículo: lista por compañía y por fila)

- **Lista de precio condicionada por compañía:** en Descuento por Artículo, el selector queda deshabilitado y no muestra opciones hasta seleccionar una Compañía. Una vez seleccionada, carga exclusivamente las listas de `LISTAS_POR_COMPANIA` para dicha compañía, menos la Lista Base `MAYOREOD`. El formulario presenta el mensaje "Seleccione una compañía para cargar sus listas de precio disponibles" mientras falte ese contexto.
- **Lista persistida por artículo agregado:** al pulsar `Agregar`, cada fila manual conserva `listaCodigo` y `lista` junto con el artículo, factor ingresado y factor aplicado. La tabla "Artículos agregados a esta solicitud" muestra ahora la columna **Lista de Precio** por cada artículo.
- **Mismo artículo en distintas listas:** la regla de duplicidad pasó de `Artículo` a `Artículo + Lista de Precio`; se puede agregar el mismo artículo en listas diferentes, pero se bloquea el duplicado exacto dentro de la misma lista. El botón Quitar identifica la misma combinación.
- **Simulación compartida:** `handleSimular` conserva esos campos en `filasExcel` mediante `construirFilaCompleta`. `TablaPrevisualizacion` —reutilizada en la simulación del Solicitante y el modal de Revisión del Aprobador— ya representa `f.lista` en su columna **Lista de Precio**, por lo cual ambos perfiles observan el mismo detalle Artículo + Lista.
- **Verificación técnica:** bloque Babel balanceado (820/820 llaves, 994/994 paréntesis, 264/264 corchetes). El mockup respondió `HTTP 200` al servirse localmente (120,652 bytes).
## Corrección — Versión 25 (procesamiento asíncrono no bloqueante de SP)

- **Liberación inmediata de la UI:** el botón del Aprobador se denomina ahora **Procesar Solicitud**. Al confirmarlo, la solicitud cambia de inmediato a `EN_PROCESO`, recibe un identificador de proceso y el modal se cierra automáticamente; no existe una pantalla de espera que obligue al usuario a permanecer en la vista.
- **Trabajo en segundo plano simulado:** la ejecución se representa desde `App` mediante un worker temporal independiente del modal. Esto ilustra el comportamiento objetivo del backend/cola: el navegador recibe aceptación rápida y solo consulta el estado; no invoca ni espera al Stored Procedure.
- **Seguimiento desde listados:** Bandeja de Aprobación y Mis Solicitudes muestran un aviso funcional de procesamiento no bloqueante, el badge `En proceso`, el identificador de proceso y la acción **Consultar avance**. El usuario puede navegar, cerrar el detalle o cambiar de módulo sin cancelar la ejecución.
- **Resultado consultable:** al terminar el worker, la solicitud actualiza de forma automática a `PROCESADO`, `PROCESADO_CON_ERRORES` o `ERROR_EJECUCION`. El detalle conserva el resultado, contadores y exportaciones de auditoría.
- **Ejercicio y arquitectura:** se agregó `docs/arquitectura-procesamiento-asincrono-sp.md`, que contiene los contratos `202 Accepted`, background jobs, polling, idempotencia, concurrencia, reintentos, observabilidad, seguridad y el ejercicio de los tres pasos solicitado.
- **Segregación preservada:** siguen vigentes el control de rol Aprobador, el bloqueo de autoaprobación y la consulta de solicitudes dentro del ámbito autorizado.


## Corrección — Versión 26 (auditoría con resultado amigable del SP y versión sin "APROBADA")

- **Auditoría muestra el resultado del control de estados del SP:** se agregó la columna "Resultado del control de estados" en la tabla de Auditoría. Al finalizar la ejecución del Stored Procedure sobre la Lista Base, el evento `EJECUCION_FINALIZADA` incluye un texto amigable con badge: **"OK · Ejecutado completo (N de N registros)"** en verde, **"Completado con errores (X exitosos, Y con error de N)"** en naranja, o **"Error de ejecución (0 de N registros aplicados)"** en rojo. El mismo texto se muestra como badge junto al título "Resultado final del procesamiento" en el modal de detalle de la solicitud.
- **Etiquetas de evento traducidas a lenguaje de negocio:** se agregó `EVENTOS_AUDITORIA`, que traduce las claves técnicas (`SOLICITUD_ENVIADA`, `EJECUCION_ENCOLADA`, `EJECUCION_FINALIZADA`, etc.) a texto legible en la columna "Evento" de la Auditoría, incluyendo "Stored Procedure autorizado sobre Lista Base" para el encolado de la ejecución.
- **Se eliminó "APROBADA" como estado expuesto de backend:** `LISTA_BASE_OBJETIVO.versionEstado` cambió de `"APROBADA"` a `"Vigente"`. El payload de la solicitud ya no envía el texto `"Se resuelve en backend: APROBADA"`; ahora indica `"Validada automáticamente por el sistema"`. Los textos de alerta, checkbox de confirmación y tarjetas de parámetros en el formulario y en el modal de revisión se reescribieron para comunicar que la versión se valida automáticamente, sin exponer el nombre del estado interno del backend.
- **Documentación técnica actualizada:** `docs/arquitectura-procesamiento-asincrono-sp.md` incorpora la regla de traducción amigable del resultado de auditoría y la indicación de no exponer el estado interno de versión de la Lista Base en la interfaz.
- **Verificación técnica:** bloque Babel balanceado (888/888 llaves, 1004/1004 paréntesis y 260/260 corchetes). El mockup se sirvió localmente y respondió `HTTP 200` con 120,330 bytes.


## Corrección — Versión 27 (se quitan "Versión" y "Stored Procedure autorizado sobre Lista Base" de pantalla)

- **Campo "Versión" eliminado del modal y del payload:** se removió la tarjeta "Versión" del bloque "Resumen para autorizar la ejecución sobre la Lista Base" y el campo `version` del payload de la solicitud (`handleEnviar`) y de la solicitud semilla `SOL-10448`. `LISTA_BASE_OBJETIVO.versionEstado` se conserva en la configuración interna únicamente para la tarjeta "Validación de versión" del formulario de captura (Grupo de Artículos), pero ya no se expone en el modal de revisión ni en el payload.
- **"Stored Procedure autorizado sobre Lista Base" eliminado de la interfaz:** se reemplazó por "Actualización automatizada autorizada" en `PROCESOS.MAYOREOD_MASIVO.ejecucion` (tarjeta "Ejecución" del modal) y por "Ejecución autorizada y encolada" en `EVENTOS_AUDITORIA.EJECUCION_ENCOLADA` (columna "Evento" de la Auditoría).
- **Verificación técnica:** bloque Babel balanceado (887/887 llaves, 1004/1004 paréntesis y 259/259 corchetes). El mockup se sirvió localmente y respondió `HTTP 200` con 119,984 bytes.


## Corrección — Versión 28 (Factor %, validación de no negativos, duración de "En proceso" y terminología de negocio)

- **Etiqueta "Factor %":** todos los campos de captura (Gestión Global, Descuento por Artículo manual, Actualización Masiva de Precios) y las columnas de tablas (previsualización, artículos agregados, plantilla Excel, CSV/Excel de auditoría exportado) que decían "Factor" o "Factor ingresado" ahora dicen "Factor %" o "Factor_Porcentaje", dejando explícito que el valor capturado es un porcentaje. La columna "Factor aplicado" (multiplicador) se conserva sin cambios junto a "Factor %".
- **Validación de porcentajes negativos:** `convertirPorcentajeAFactor` distingue ahora un valor negativo de un error de formato y lo rechaza explícitamente con el mensaje "El Factor % no admite valores negativos. Ingrese un porcentaje entre 0 y 100." Los 3 inputs de Factor % cambiaron su atributo `min` de `-99` a `0`. Se agregó un ícono de alerta junto al mensaje de error. Los datasets de ejemplo (`filasEjemploExcel`, plantilla de Descuento por Artículo) se corrigieron para no contener ningún Factor % negativo (`-1` → `0`, `-5` → `5`).
- **Duración perceptible de "En proceso":** el worker simulado pasó de 6.5 a 15 segundos antes de resolver a un estado terminal. Se agregó una barra de progreso indeterminada (`.progress-track` + `.progress-indeterminate`) dentro del banner de "En proceso" del modal, para reforzar visualmente que la tarea sigue activa.
- **Terminología de negocio sin "SP"/"Stored Procedure"/"procedimiento":** el banner de detalle pasó de "El procedimiento está ejecutándose en segundo plano" a "La solicitud se está procesando en segundo plano"; el identificador visible cambió de `#SP-YYYYMMDD-NNNN` a `#PROC-YYYYMMDD-NNNN` (función `nuevoIdProcesoSP`); la tarjeta "ID de Proceso (SP)" pasó a "ID de procesamiento"; el evento de auditoría "Ejecución del Stored Procedure finalizada" pasó a "Procesamiento en segundo plano finalizado"; los toasts de aprobación y finalización ya no mencionan "SP" ni "Ejecución #SP-...". Los términos técnicos solo permanecen en comentarios internos de código no visibles y en la documentación de arquitectura dirigida al equipo de desarrollo.
- **Nuevo documento:** `docs/especificacion-modal-detalle-solicitud.md`, con la especificación técnica completa y el mockup en ASCII del flujo de 4 pasos (revisión, liberación de UI, consulta de avance con duración perceptible, resultado final) y el detalle de auditoría con resultado amigable.
- **Verificación técnica:** bloque Babel balanceado (892/892 llaves, 1009/1009 paréntesis y 261/261 corchetes). El mockup se sirvió localmente y respondió `HTTP 200` con 121,570 bytes.


## Corrección — Versión 29 (columna "Resultado del control de estados" removida de Auditoría)

- **Columna eliminada:** se quitó la columna "Resultado del control de estados" de la tabla de Auditoría (era redundante con el badge de resultado ya visible en el modal de "Detalle de solicitud" bajo "Resultado final del procesamiento", y no aportaba información nueva en el log de eventos). La tabla de Auditoría vuelve a sus 6 columnas: Fecha/Hora, Usuario, Rol, Evento, ID Solicitud, ID de Proceso.
- **Limpieza de código asociado:** se removió el campo `resultado` de `registrarEvento`/`EVENTOS_AUDITORIA` y del cálculo `resumenParaAuditoria` en `handleAprobarInicio`. La función `textoResultadoAuditoria` se conserva porque sigue usándose en el badge del modal de detalle ("Resultado final del procesamiento").
- **Verificación técnica:** bloque Babel balanceado (889/889 llaves, 1005/1005 paréntesis y 261/261 corchetes). El mockup se sirvió localmente y respondió `HTTP 200` con 120,903 bytes.


## Corrección — Versión 30 (el Operador puede consultar el detalle de sus propias solicitudes)

- **Bug corregido:** `abrirModal` exigía `user.rol === "APROBADOR"` sin excepción, por lo que el botón "Ver detalle" / "Consultar avance" de "Mis solicitudes enviadas" no hacía nada cuando el usuario activo era Operador.
- **Nueva regla:** el propio solicitante (Operador o Aprobador) siempre puede abrir el detalle de su propia solicitud en modo consulta (solo lectura), sin importar el estado (`Pendiente`, `En proceso`, `Procesado`, etc.). Un Aprobador conserva además la capacidad de abrir solicitudes ajenas dentro de su ámbito de compañía para revisarlas o decidir.
- **Segregación de funciones preservada:** el modal sigue calculando `puedeDecidir` exigiendo rol `APROBADOR`, estado `PENDIENTE` y `solicitanteEmail !== currentUser.email`; cuando el Operador abre su propia solicitud, el modal se muestra siempre en modo lectura (sin botones de aprobar/rechazar). El evento de auditoría `SIMULACION_REVISADA` solo se registra cuando quien abre es un Aprobador revisando una solicitud ajena, no cuando el solicitante consulta la suya.
- **Verificación técnica:** bloque Babel balanceado (890/890 llaves, 1008/1008 paréntesis y 261/261 corchetes). El mockup se sirvió localmente y respondió `HTTP 200` con 121,288 bytes.


## Entregable — Guion de presentación del flujo conceptual

- **Nueva guía para reunión con usuario:** se creó `docs/guion-presentacion-flujo-conceptual.md`, orientada a una sesión de validación de 30 a 40 minutos del mockup de Gestión Masiva de Precios.
- **Contenido:** objetivo y alcance de la sesión; preparación de la demostración; guion detallado para presentar Gestión Global, Actualización Masiva de Precios y Descuento por Artículo; recorrido Operador/Aprobador; procesamiento no bloqueante, resultados y auditoría; preguntas de validación por etapa; tabla de decisiones para usar como minuta; mensaje de cierre y correo de seguimiento sugerido.
- **Precisión funcional:** la guía distingue el comportamiento conceptual del mockup de una futura integración productiva y plantea las decisiones de negocio que requieren confirmación del usuario.
- **Validación de contenido:** documento Markdown estructurado, sin Mermaid y sin caracteres Unicode de diagramas no permitidos.


## Actualización — Guía de presentación simplificada

- **Documento simplificado:** `docs/guion-presentacion-flujo-conceptual.md` se redujo de un guion detallado a una guía breve de reunión de 30 minutos.
- **Contenido vigente:** objetivo, material requerido, ocho pasos de demostración, qué decir/mostrar/validar en cada paso, cierre y una minuta rápida. Se eliminó el detalle técnico extenso, las explicaciones de implementación, las preguntas repetidas y el correo posterior.
- **Validación:** Markdown estructurado, sin Mermaid y sin caracteres Unicode de diagramas no permitidos.


## Corrección — Versión 19 (Tipo de Variación solo en Excel, no en Gestión Global UI)

- **Se removió `TipoVariacionSelect` de Gestión Global (FACTOR_PRECIO):** el control UI de botones de alternancia Aumento/Disminución ya no aparece en la sección manual de este proceso. El usuario selecciona únicamente Lista de Precio y Factor %, sin opción explícita de signo.
- **Se hardcodea tipoVariación="AUMENTO" para Gestión Global:** en `handleEnviar()` y `handleSimular()`, cuando `esGestionGlobal`, se envía explícitamente `tipoVariacion: "AUMENTO"`, independientemente del estado de componente. Esto indica que Gestión Global aplica siempre un aumento (signo positivo) sobre los precios de la lista seleccionada, nunca una disminución.
- **Tipo de Variación permanece en Actualización Masiva de Precios:** el selector sigue visible para `MAYOREOD_MASIVO` en la captura manual, permitiendo elegir Aumento o Disminución sobre el grupo de artículos seleccionado.
- **Tipo de Variación permanece en Descuento por Artículo:** el selector sigue visible para `DESCUENTO_LISTA_PRECIO` en la captura manual de artículos individuales, permitiendo elegir Aumento o Disminución sobre cada artículo.
- **Tipo de Variación en plantillas Excel (ambos procesos):** la tercera columna del Excel descargable de ambos procesos (Actualización Masiva y Descuento por Artículo) es **"Tipo de Variacion"** (Aumento / Disminución), que el parser traduce a signo al calcular el factor multiplicador. La plantilla de Gestión Global no existe —el proceso es exclusivamente manual— por lo que no hay Excel para este contexto.
- **Previsualización y tablas actualizadas:** los elementos agregados manualmente en Actualización Masiva y Descuento por Artículo muestran la columna "Tipo de Variación" con sus badges (verde para Aumento, rojo para Disminución). La previsualización de Gestión Global no muestra esta columna.
- **Verificación técnica:** bloque Babel balanceado (712/712 llaves, 867/867 paréntesis y 182/182 corchetes). Se confirmó la ausencia de `TipoVariacionSelect` en la sección `{modalidad === "manual" && tab === "FACTOR_PRECIO"...}` y la presencia de `tipoVariacion: "AUMENTO"` en `handleEnviar()` y `handleSimular()`. El mockup fue servido localmente en HTTP y respondió `200`.


## Corrección — Versión 27 (Motor de Redondeo Comercial + Validación de Margen Mínimo integrados en la plantilla)

- **Se integró la lógica de redondeo comercial y validación de margen mínimo especificada en `docs/Informe_Reglas_Redondeo_Precios.md`.** El motor replica exactamente el algoritmo del libro `Simulador_redondeo_precios.xlsm` y fue validado contra los **27/27 casos de prueba oficiales + caso fuera de rango**.

### Lógica implementada

**1. Motor de redondeo (12 bandas contiguas · 0,01 – 100.000,00):**

| # | Rango | Tipo | Parámetros |
| :---: | :--- | :--- | :--- |
| 1 | 0,01 – 0,50 | Por exceso | paso 0,01 |
| 2 | 0,51 – 1,00 | Por exceso | paso 0,05 |
| 3 | 1,01 – 2,50 | Por exceso | paso 0,10 |
| 4 | 2,51 – 4,75 | Por exceso | paso 0,25 |
| 5 | 4,76 – 5,15 | Precio único | 4,99 |
| 6 | 5,16 – 10,15 | Terminal más cercano | período 1, offsets [0,29; 0,49; 0,69; 0,99] |
| 7 | 10,16 – 50,24 | Terminal más cercano | período 1, offsets [0,49; 0,99] |
| 8 | 50,25 – 99,99 | Terminal más cercano | período 1, offsets [0,99] |
| 9 | 100 – 500 | Terminal más cercano | período 10, offsets [3; 5; 7; 9] |
| 10 | 501 – 1.000 | Terminal más cercano | período 10, offsets [0; 5] |
| 11 | 1.001 – 5.000 | Terminal más cercano | período 100, offsets [30; 50; 70; 90] |
| 12 | 5.001 – 100.000 | Terminal más cercano | período 100, offsets [50; 90] |

- **Regla de desempate:** distancias iguales → se elige el terminal **superior** (`<` estricto en la comparación).
- **Fuera de rango:** valores < 0,01 o > 100.000,00 → `precioRedondeado = null` y estado `FUERA_DE_RANGO`.

**2. Cálculo de margen mínimo:**

- Se conserva `MARGEN_MINIMO_ARTICULO = 0,20` y `Costo Mínimo = Costo Reposición / (1 - 0,20)`.
- La validación de piso ahora se ejecuta contra el **precio REDONDEADO** (más estricta) en lugar del precio calculado base. Si el redondeo empuja el precio por debajo del costo mínimo, la fila queda marcada como `ALERTA_MARGEN`.
- Si el precio está fuera del rango [0,01; 100.000,00], el sistema mantiene el precio calculado sin redondeo y usa el estado `FUERA_DE_RANGO`.

**3. Reflejo visual en la plantilla:**

- **`TablaPrevisualizacion` — nueva estructura de columnas:**
  Código · Lista · Descripción · Precio Actual · Tipo Variación · Factor % · Factor aplicado · **Precio Calculado (Base)** · **Precio Redondeado** (destacado en negrita) · Costo Mínimo · **Estado Redondeo** (badge) · Validación
- **Componente nuevo `EstadoRedondeoBadge`:** traduce el enum a un badge con color/tooltip:
  - `Calculado` — verde, tooltip con número/intervalo de banda
  - `Fuera de rango` — rojo, tooltip explicando el rango [0,01; 100.000,00]
  - `Alerta de Margen` — rojo, tooltip explicando que el redondeado quedó por debajo del costo mínimo
- **Preview en vivo en el formulario manual de Descuento por Artículo:** las tarjetas de resumen pasaron de 4 a **5 columnas** e incluyen: Descripción · Precio Actual · **Precio Calculado (Base)** · **Precio Redondeado** · Costo Mínimo, más una línea bajo el grid con el badge de estado y el número de banda aplicada.
- **Exportaciones CSV/Excel:** ambas funciones (`filasADataCsv` y `descargarExcelFilas`) incluyen ahora las columnas `Precio_Calculado_Base`, `Precio_Redondeado`, `Banda_Redondeo`, `Estado_Redondeo` y `Costo_Minimo_Articulo`.

### Estructura del objeto `validacion` extendida

```javascript
{
  valido: boolean,
  precioActual: number | null,
  precioPropuesto: number | null,       // Precio Calculado (Base)
  precioRedondeado: number | null,      // Nuevo — precio final tras las 12 bandas
  estadoRedondeo: "CALCULADO" | "FUERA_DE_RANGO" | "ALERTA_MARGEN" | null,
  bandaRedondeo: { numero, intervalo, tipo, terminales, paso, periodo } | null,
  costoMinimo: number | null,
  causa: string | null,
}
```

### Verificación técnica

- **Suite de pruebas del motor (aislada, Node.js):** 27/27 casos oficiales del libro Simulador correctos + caso fuera de rango correcto. Ejecutada durante la implementación y removida del repo.
- **Balanceo Babel:** 997 llaves abiertas = 997 cerradas, 1181 paréntesis abiertos = 1181 cerrados.
- **Compatibilidad:** todas las funciones (`construirFilaCompleta`, `construirFilaDesdeVariacion`, `construirFilasGestionGlobal`, `construirFilasMayoreodMasivo`) continúan operando; el nuevo objeto de validación es un superconjunto del anterior.

---

## Corrección — Versión 26 (Par Operador/Aprobador en COFERSA y FEBECA)

- **Se agregaron los usuarios faltantes** para completar el flujo Maker-Checker (Operador/Aprobador) también en COFERSA y FEBECA. Antes solo SILLACA tenía ambos roles disponibles; ahora los tres tenants principales pueden demostrar el flujo de aprobación dentro de una misma compañía.

**Usuarios agregados a `IDENTITIES`:**

| Compañía | Nuevo usuario | Rol | Email | Color |
| :--- | :--- | :--- | :--- | :--- |
| FEBECA | Ricardo Moreno | OPERADOR | rmoreno@febeca.com | `#f59e0b` |
| COFERSA | Ana Castro | APROBADOR | acastro@cofersa.com | `#9333ea` |

**Estado consolidado del selector de usuarios (8 identidades):**

| Compañía | Operador | Aprobador |
| :--- | :--- | :--- |
| SILLACA | Juan Pérez (jperez@sillaca.com) | María Rodríguez (mrodriguez@sillaca.com) |
| BEVAL | Pedro Alvarado (palvarado@beval.com) | — |
| FEBECA | **Ricardo Moreno (rmoreno@febeca.com)** ← nuevo | Lucía Jiménez (ljimenez@febeca.com) |
| COFERSA | Diego Vargas (dvargas@cofersa.com) | **Ana Castro (acastro@cofersa.com)** ← nuevo |
| — (sin dominio mapeado) | Carlos Gómez (SIN_PERMISO) | — |

- **Sin cambios en el mapeo S2/SS:** los dominios `febeca.com` y `cofersa.com` ya estaban registrados en `DOMINIO_A_COMPANIA_S2SS`, por lo que la resolución de compañía por dominio de correo continúa funcionando sin ajustes adicionales.
- **Comentario del bloque IDENTITIES actualizado:** ahora indica que SILLACA, COFERSA y FEBECA conservan el par Operador/Aprobador para demostrar el flujo Maker-Checker dentro de una misma compañía.

- **Verificación técnica:** bloque Babel balanceado (947 llaves, 1109 paréntesis). El selector de login mostrará ahora 7 tarjetas clicables (todos menos el usuario SIN_PERMISO), permitiendo probar los tres flujos Maker-Checker completos.

---

## Corrección — Versión 25 (Tipo de Variación removido de Descuento por Artículo — solo en Excel)

- **Se removió `TipoVariacionSelect` del formulario manual de Descuento por Artículo (`DESCUENTO_LISTA_PRECIO`).** El control UI de Aumento/Disminución ya no aparece en la captura individual de artículos. Con este cambio, **los tres procesos manuales (Gestión Global, Actualización Masiva y Descuento por Artículo) tienen la misma regla**: la captura manual siempre aplica AUMENTO, y la opción Aumento/Disminución solo está disponible en la carga masiva por plantilla Excel.

**Cambios aplicados:**

1. **Formulario manual (Descuento por Artículo):**
   - Grid antes: 6 columnas (Código[2], **Tipo de Variación[2]**, Factor[1], Botón[1])
   - Grid ahora: 6 columnas (Código[3], Factor[2], Botón[1])
   - Nota informativa añadida bajo el input Factor %: *"Se aplica como Aumento. La opción Aumento/Disminución está disponible solo en la carga masiva por plantilla Excel."*

2. **Tabla de artículos agregados:**
   - Columna "Tipo de Variación" removida (todos son AUMENTO)
   - Columnas resultantes: `#`, `Código`, `Lista de Precio`, `Descripción`, `Factor %`, `Factor aplicado`, `Quitar`

3. **Lógica `agregarItem()`:**
   - Hardcodeado a `calcularVariacion("AUMENTO", factor)` (antes: `calcularVariacion(tipoVariacion, factor)`)
   - El objeto agregado a `itemsManual` fija `tipoVariacion: "AUMENTO"` explícitamente
   - Comentario añadido: *"En captura manual de Descuento por Artículo, el tipo de variación es siempre AUMENTO. La opción Aumento/Disminución solo está disponible en la carga masiva por plantilla Excel."*

4. **Plantilla Excel (sin cambios):**
   - `descargarPlantillaExcel("DESCUENTO_LISTA_PRECIO")` mantiene la columna `Tipo de Variacion`
   - Encabezado: `[Lista de Precio | Codigo Articulo | Tipo de Variacion | Factor %]`
   - Ejemplo: `["MAYOREOB", "ART-231", "Aumento", "10"], ["LPV1", "ART-455", "Disminucion", "5"]`
   - El parser Excel sigue traduciendo Aumento → (+) y Disminución → (-)

**Consistencia entre procesos (post-cambio):**

| Proceso | Captura manual | Plantilla Excel |
| :--- | :---: | :---: |
| Gestión Global (FACTOR_PRECIO) | Sin UI (siempre AUMENTO) | N/A (proceso solo manual) |
| Actualización Masiva (MAYOREOD_MASIVO) | Sin UI (siempre AUMENTO) | Columna Tipo de Variacion ✓ |
| Descuento por Artículo (DESCUENTO_LISTA_PRECIO) | Sin UI (siempre AUMENTO) | Columna Tipo de Variacion ✓ |

- **Verificación técnica:** bloque Babel balanceado (945/945 llaves, 1109/1109 paréntesis). Se confirmó la ausencia total de `TipoVariacionSelect` fuera de su definición como componente. `descargarPlantillaExcel()` conserva la columna `Tipo de Variacion` con las opciones `Aumento` / `Disminucion` en las dos plantillas descargables.

---

## Corrección — Versión 24 (Selector de usuarios rediseñado como tarjetas visuales)

- **Se rediseñó completamente el selector de usuarios** en la pantalla de login: ahora es **un listado visual con tarjetas clicables** en lugar de un `<select>` HTML nativo.

**Diseño Nuevo del Selector:**

- ✅ **Etapa 1 — Selección Visual:**
  - Título: "Seleccione su cuenta" + descripción
  - **Grid de tarjetas por usuario:**
    - Cada usuario es una **tarjeta clicable** (botón estilizado)
    - Contenido: avatar coloreado + nombre + email + rol (badge)
    - Hover: borde más oscuro, fondo zinc-50, chevron derecha visible
    - Transición suave: `transition-all`
  - Info contextual: caja azul con contador de usuarios + indicador 🔒 SSO

**Ventajas del Nuevo Diseño:**
- ✅ Visualmente más atractivo: tarjetas con avatar, nombre, email y rol visibles
- ✅ Interactividad clara: hover effects, chevron que aparece al pasar mouse
- ✅ Mejor UX: no requiere abrir dropdown, todas las opciones visibles
- ✅ Accesibilidad: botones nativos en lugar de `<option>` (mejor para screenreaders)
- ✅ Escalable: si hay más usuarios, el listado crece naturalmente

**Estructura de cada Tarjeta:**
```
┌───────────────────────────────────────────┐
│ JM | Juan Martínez          [OPERADOR] →  │
│    juan.martinez@sillaca.com              │
└───────────────────────────────────────────┘
```

**Etapa 2 — Confirmación (sin cambios):**
- Tarjeta de usuario destacada con detalles
- Botones: "Cambiar" (vuelve a Etapa 1) + "Continuar" (procesa login)

- **Verificación técnica:**
  - Babel balanceado: 950 llaves abiertas = 950 cerradas ✓
  - Selector: renderizado como `grid de botones` en lugar de `<select>`
  - Cada tarjeta: `className="w-full text-left p-3.5 rounded-lg border-2 border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all cursor-pointer group"`
  - Avatar: 44px (w-11 h-11), iniciales centradas
  - Iconos: chevronRight aparece en hover con `opacity-0 group-hover:opacity-100`
  - El mockup fue servido localmente y respondió `HTTP 200`


