# Registro de Estado de Mockups — MV26020

## Línea Base Activa
_Aún no existe una línea base aprobada._ El contenido actual en `Product-Definition/mockups/` es **borrador en progreso**, pendiente de validación del usuario.

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
_Sin checkpoints creados aún._ Se creará una copia en `Product-Definition/mockups/.versions/` cuando el usuario confirme o apruebe el estado actual.

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
