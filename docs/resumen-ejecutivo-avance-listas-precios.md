# Resumen Ejecutivo — Avance de Gestión y Cálculo de Listas de Precio

**Proyecto:** MV26020 — Gestión y Cálculo de Listas de Precio
**Fecha de análisis:** 2026-09-14 (actualizado tras habilitar la guardia de aplicación de solo consulta sobre Softland)
**Estado:** Construcción
**Alcance del análisis:** Portal Next.js (`app-web/src/app/actions.ts`, `app-web/src/server/portal-repository.ts`, `app-web/src/server/pricing-repository.ts`, `app-web/src/server/companies.ts`), scripts SQL de referencia y documentación técnica disponible.

## 1. Resumen ejecutivo

El aplicativo opera hoy bajo una separación estricta entre dos bases de datos:

- **Portal (`[PORTAL_PRECIOS]`):** totalmente operativo. Resuelve identidad/login, registra solicitudes, su detalle, cambios de estado y auditoría mediante `SELECT`, `INSERT` y `UPDATE` reales.
- **Softland (compañía activa, ej. `FEBECA`):** restringido por diseño a **solo consulta**. El código mantiene las funciones de escritura (`upsertUdf`, `ejecutarSpMargen`, `ejecutarSpGestionListas`), pero una guardia de aplicación (`esEjecucionSoftlandBloqueada()` en `companies.ts`) las bloquea de forma **incondicional**, y el flujo de aprobación (`actions.ts::aprobarSolicitud`) ya no las invoca.

En consecuencia, el ciclo maker-checker (crear, simular, enviar, revisar, aprobar/rechazar, auditar) es real y persistente en el Portal, pero la ejecución final sobre Softland —`MERGE` de excepciones de margen, `EXECUTE` de los procedimientos de margen y de gestión de listas— está deshabilitada a nivel de aplicativo. Tras aprobar, un worker simulado calcula el resultado únicamente con datos ya leídos por `SELECT` y actualiza el estado en el Portal, sin tocar tablas ni ejecutar SP en Softland.

## 2. Arquitectura backend existente

La aplicación **sí cuenta con backend implementado**. Es una solución **full-stack Next.js 14 (App Router)**: la interfaz React y el backend se despliegan dentro del mismo proyecto `app-web/`; no depende de un servicio FastAPI, Node/Express o API externa independiente para ejecutar su lógica de negocio actual.

| Componente backend | Ubicación | Responsabilidad actual |
|---|---|---|
| Server Actions | `src/app/actions.ts` | Orquesta login, lectura de catálogos, parseo de Excel, simulación, envío de solicitudes, revisión, aprobación/rechazo y actualización del resultado. |
| Capa de conexión SQL Server | `src/server/db.ts` | Crea y reutiliza un pool SQL Server compartido. Los repositorios diferencian Portal y Softland mediante nombres de esquema calificados, no mediante conexiones separadas. |
| Repositorio del Portal | `src/server/portal-repository.ts` | Ejecuta las operaciones reales del Portal: consultas de solicitudes/auditoría, inserción de solicitudes y detalle, actualización de estados y registro de eventos. |
| Repositorio de precios Softland | `src/server/pricing-repository.ts` | Consulta listas, versiones, artículos, precios, costos y factor de reducción por compañía. Contiene métodos de escritura/SP que permanecen deshabilitados por la política actual. |
| Configuración y seguridad | `src/server/companies.ts` | Resuelve compañía/esquema/objetos SQL, distingue modos de operación y aplica la guardia que bloquea mutaciones y procedimientos en Softland. |
| Motor de dominio | `src/lib/engine.ts`, `src/lib/rounding.ts`, `src/lib/catalog.ts` | Calcula factores, margen mínimo, precios simulados y redondeo comercial antes de persistir el workflow en el Portal. |
| Endpoints de lectura | `src/app/api/` | Expone Route Handlers para consultas del Portal, catálogos, compañías, plantilla y auditoría cuando la UI requiere rutas HTTP. |

### Límites actuales del backend

- **Portal:** backend habilitado para lectura y escritura de las entidades de gobernanza (`USUARIO`, `SOLICITUD`, `SOLICITUD_DETALLE`, `AUDITORIA_EVENTOS`, `SEQ_SOLICITUD`).
- **Softland:** backend habilitado únicamente para consultas `SELECT` de catálogos y factores. La guardia `esEjecucionSoftlandBloqueada()` evita que el backend ejecute `MERGE`, `INSERT`, `UPDATE`, `DELETE`, `ALTER` o procedimientos almacenados sobre los esquemas operativos.
- **Aprobación:** el backend persiste la decisión y el estado en el Portal, pero resuelve el resultado mediante simulación mientras la ejecución de Softland permanezca bloqueada.

## 3. Estado actual por módulo

| Módulo | Estado | Evidencia en código |
|---|---|---|
| Autenticación / login | Operativo contra el Portal | `actions.ts::resolverIdentidad` — `SELECT` sobre `[PORTAL_PRECIOS].[USUARIO]` filtrando `ROL_GLOBAL IN ('OPERADOR','APROBADOR')`. |
| Registro de solicitudes | Operativo contra el Portal | `portal-repository.ts::agregarSolicitud` — `INSERT` en `SOLICITUD` y `SOLICITUD_DETALLE`, más `NEXT VALUE FOR SEQ_SOLICITUD`. |
| Cambios de estado (Pendiente/En proceso/Rechazado/Procesado) | Operativo contra el Portal | `portal-repository.ts::actualizarSolicitud` — `UPDATE` dinámico sobre `SOLICITUD`. |
| Auditoría | Operativo contra el Portal | `portal-repository.ts::registrarEvento` — `INSERT` en `AUDITORIA_EVENTOS`. |
| Consulta de catálogo/listas Softland | Operativo, solo lectura | `pricing-repository.ts::listarNivelesPrecio`, `listarCatalogo`, `buscarArticulo`, `leerPorcentajeUdf` — todas usan `SELECT` sobre `NIVEL_PRECIO`, `VERSION_NIVEL`, `ARTICULO_PRECIO`, `ARTICULO` y la UDF `U_FACTOR_REDUCCION_MARGEN`. |
| Simulación de precio, margen y redondeo | Implementado en memoria | `lib/engine.ts`, `lib/rounding.ts` — cálculo completo sin tocar BD antes de enviar. |
| Maker-checker (segregación de funciones) | Implementado | `actions.ts::aprobarSolicitud` bloquea autoaprobación y exige rol `APROBADOR` y ámbito válido. |
| UPSERT de factor de reducción (`upsertUdf`) | Presente en código, **bloqueado** | `pricing-repository.ts::upsertUdf` contiene el `MERGE` sobre `U_FACTOR_REDUCCION_MARGEN`, pero `assertEscrituraSoftlandHabilitada()` lanza excepción antes de ejecutarlo; ya no se invoca desde `aprobarSolicitud`. |
| Cálculo/persistencia de margen mínimo (`SP_CALCULAR_MARGEN_MINIMO_ARTICULO`) | Presente en código, **bloqueado** | `pricing-repository.ts::ejecutarSpMargen` — mismo bloqueo; sin invocación activa. |
| Gestión de listas con redondeo (`SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO`) | Presente en código, **bloqueado** | `pricing-repository.ts::ejecutarSpGestionListas` — mismo bloqueo; sin invocación activa. |
| Ejecución tras aprobación | Simulada, sin acceso a Softland | `actions.ts::simularProcesamientoDemo` — usa solo las filas ya validadas en memoria y actualiza el resultado en el Portal. |
| Gestión Global de Listas / tabla `GESTION_LISTA` | No implementado como UPSERT real | No existe en el código actual una tabla `GESTION_LISTA` ni un `MERGE` por clave `Artículo + Lista`; el diagrama la representa como objetivo bloqueado. |

## 3. Flujo funcional actualmente implementado (end-to-end real)

1. El usuario inicia sesión: se resuelve su identidad con `SELECT` contra `USUARIO` en el Portal.
2. Selecciona compañía y proceso (Gestión global por lista, Carga masiva Excel de margen/factor, o Descuento por artículo).
3. El backend consulta el catálogo de Softland (`NIVEL_PRECIO`, `VERSION_NIVEL`, `ARTICULO_PRECIO`, `ARTICULO`, UDF de margen) únicamente con `SELECT`.
4. El motor de reglas en memoria calcula factor, margen mínimo y redondeo comercial, y valida ámbito, formato y existencia de artículo/lista.
5. El usuario revisa la previsualización y envía la solicitud: se generan el código (`SEQ_SOLICITUD`) y se insertan `SOLICITUD` y `SOLICITUD_DETALLE` en el Portal, con evento `SOLICITUD_ENVIADA` en auditoría.
6. El Aprobador consulta la bandeja (`SELECT` sobre `SOLICITUD`) y revisa el detalle.
7. Si rechaza: se exige motivo, se actualiza `SOLICITUD` a `RECHAZADO` y se registra `SOLICITUD_RECHAZADA`.
8. Si aprueba: se valida rol, ámbito y no autoaprobación; se actualiza `SOLICITUD` a `EN_PROCESO` y se registra `EJECUCION_ENCOLADA`.
9. **Punto de bloqueo:** el flujo NO invoca `upsertUdf`, `ejecutarSpMargen` ni `ejecutarSpGestionListas`. En su lugar, se dispara un worker simulado que opera solo con los datos ya calculados en memoria.
10. El worker finaliza, calcula el resultado (`PROCESADO`, `PROCESADO_CON_ERRORES` o `ERROR_EJECUCION`), actualiza `SOLICITUD` en el Portal y registra `EJECUCION_FINALIZADA`.
11. El usuario consulta el estado final y la auditoría completa desde el Portal.

## 4. Lógica de factor de reducción y margen mínimo (vigente en el motor de simulación)

### Contrato de entrada

- El usuario carga el **porcentaje visible** (`10`, `20`, `10.5`).
- Rango permitido: `[0, 100)`.
- Se normaliza una única vez: `10 → 0.10`.
- La UDF `U_FACTOR_REDUCCION_MARGEN` almacena el porcentaje explícito (`10.00`), no la fracción; hoy solo se **lee**, no se escribe.

### Fórmulas aplicadas en el motor de simulación

```text
Margen Promedio = (Precio Lista - Costo Promedio) / Precio Lista
Factor Reducción Normalizado = Porcentaje Reducción / 100
Multiplicador de Margen = 1 - Factor Reducción Normalizado
Margen Mínimo = Margen Promedio × Multiplicador de Margen
```

Si no existe excepción activa para el artículo en la UDF, se aplica el valor por defecto `0.10` (10 %). Este cálculo ocurre en memoria (TypeScript) y su resultado se muestra en la simulación; **no se persiste en Softland** mientras la guardia esté activa.

## 5. Validación de persistencia y UPSERT

### Estado del UPSERT de factor de reducción por artículo

El código de `upsertUdf` implementa correctamente la semántica de UPSERT sobre `U_FACTOR_REDUCCION_MARGEN` (clave `U_CODIGO + U_DESCRIP`: `UPDATE` si existe, `INSERT` si no existe), y `ejecutarSpMargen` invocaría después `SP_CALCULAR_MARGEN_MINIMO_ARTICULO` para persistir `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN`. **Ambas operaciones están bloqueadas por la guardia de aplicación** y no se ejecutan en el flujo actual.

### Estado del UPSERT de factores por artículo y lista

Para `DESCUENTO_LISTA_PRECIO` ya existe el upsert transaccional de
`FACTOR_ARTICULO_LISTA` en `pricing-repository.ts`, ejecutado después de la
aprobación y protegido por la guardia de escritura Softland. La especificación
funcional y el DDL se encuentran en `docs/especificacion-factor-articulo-lista.md`
y `backend/sql/FACTOR_ARTICULO_LISTA.sql`.

El upsert de `DESCUENTO_LISTA_PRECIO` está implementado para `FACTOR_ARTICULO_LISTA`. El procedimiento `SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO` continúa como referencia para otros procesos y su invocación permanece protegida por la guardia de escritura.

| Condición (diseño objetivo, aún no habilitado) | Acción prevista |
|---|---|
| Existe la combinación Artículo + Lista | `UPDATE` de descuento, factor, precio calculado o margen. |
| No existe la combinación Artículo + Lista | `INSERT` de la nueva relación artículo-lista. |
| Fila inválida | Registrar inconsistencia sin publicar, devolver detalle al usuario. |
| Error técnico de persistencia | Rollback transaccional y registro seguro del error. |

## 6. Pendientes prioritarios

| Prioridad | Pendiente | Impacto |
|---|---|---|
| Alta | Decidir el momento de habilitar la escritura en Softland | Actualmente toda ejecución productiva está bloqueada por diseño; se requiere una decisión explícita y auditada para levantar la guardia `esEjecucionSoftlandBloqueada()`. |
| Alta | Confirmar tabla canónica de gestión de listas | Definir si la persistencia usará `GESTION_LISTA`, `FACTOR_LISTA_ARTICULO` u otra, y su llave completa (artículo, lista, versión, compañía). |
| Alta | Implementar el UPSERT real de Gestión Global de Listas | Hoy no existe ese `MERGE`; solo está bloqueada la invocación al SP de referencia. |
| Alta | Alinear el contrato del SP de listas | La firma configurada (`nivelPrecio`, `version`, `usuario`) es más simple que la del paquete SQL de precio técnico (`SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2`). |
| Media | Definir manejo de excepciones técnicas de Softland | Cuando se habilite la escritura, formalizar log de errores SQL (código, procedimiento, correlación con solicitud). |
| Media | Reintentos transitorios | Diseñar el mecanismo de reintento (máximo tres) para cuando la escritura esté habilitada; hoy no aplica porque no hay escritura. |
| Media | Paridad de cálculo simulación–SQL | Asegurar que el motor TypeScript reproduzca exactamente la fórmula que ejecutarían los SP de referencia el día que se habiliten. |

## 7. Riesgos y consideraciones de arquitectura

1. **Resultado simulado, no productivo:** mientras la guardia esté activa, ninguna aprobación modifica precios, márgenes ni listas reales en Softland; el estado `PROCESADO` refleja solo el cálculo en memoria.
2. **Código de escritura inactivo pero presente:** `upsertUdf`, `ejecutarSpMargen` y `ejecutarSpGestionListas` siguen en el repositorio. Si se elimina la guardia sin control adicional, se reactivarían inmediatamente; cualquier cambio a `esEjecucionSoftlandBloqueada()` debe tratarse como cambio de alto riesgo.
3. **Ausencia de UPSERT real para listas:** no existe todavía el mecanismo que materialice `GESTION_LISTA`/`FACTOR_LISTA_ARTICULO`; se debe diseñar antes de habilitar la escritura.
4. **Consistencia del Portal:** al ser el único punto de escritura real, sus tablas (`SOLICITUD`, `SOLICITUD_DETALLE`, `AUDITORIA_EVENTOS`, `SEQ_SOLICITUD`) concentran toda la trazabilidad; su disponibilidad es crítica para el flujo completo, incluido el login.

## 8. Recomendaciones de siguiente etapa

1. Mantener la guardia de aplicación activa hasta que se apruebe formalmente el paso a ejecución productiva sobre Softland.
2. Diseñar y documentar el UPSERT real de Gestión Global de Listas (tabla, clave, transacción) antes de reactivar cualquier escritura.
3. Cuando se decida habilitar Softland, hacerlo primero en un ambiente de prueba, con logging reforzado y revisión de las tres funciones ya implementadas (`upsertUdf`, `ejecutarSpMargen`, `ejecutarSpGestionListas`).
4. Alinear el contrato de `ejecutarSpGestionListas` con la firma real del procedimiento antes de reactivarlo.
5. Mantener el Portal como fuente única de verdad para solicitudes y auditoría, incluso después de habilitar la escritura en Softland.

## 9. Conclusión

El aplicativo tiene un flujo maker-checker completo y funcional apoyado en el Portal (login, solicitudes, aprobaciones, auditoría), con separación clara respecto a Softland, hoy restringido a **solo consulta** por una guardia de aplicación incondicional. El código de escritura hacia Softland (UPSERT de factor de margen, SP de margen mínimo, SP de gestión de listas) existe pero está deliberadamente inactivo. El siguiente paso de negocio es decidir cuándo y cómo habilitar esa ejecución productiva, y en paralelo diseñar el UPSERT real de Gestión Global de Listas que hoy no existe en el código.
