# Informe de Impacto — "Precio original y redondeo de listas" sobre el modelo en construcción

> **Proyecto:** MV26020 — Automatización / Cálculo de Listas de Precio
> **Documento origen del cambio:** `docs/Requerimiento_ precio original y redondeo de listas 2026-09-10.md`
> **Implementación de referencia SQL:** `docs/implementacion_redondeo_articulo_precio_v2/` (DDL + función + SP + análisis, en QA).
> **Fecha del informe:** 2026-09-10
> **Método:** Ingeniería inversa del código ya construido en `app-web/` + de la implementación SQL v2 + contraste con requisitos y plan IA-DLC aprobados.
> **Etapa actual del proyecto:** CONSTRUCCIÓN ya iniciada (portal maker-checker con simulación, aprobación y ejecución vía SP).

---

## 1. Resumen ejecutivo

El nuevo requerimiento **no es un ajuste menor**: cambia el **modelo de datos de precios** y el **motor de cálculo** que hoy ya está en construcción. La solicitud introduce el concepto de **precio original/técnico persistido** (`U_PRECIO_ORIGINAL` / `U_PRECIO_TECNICO`), una **cadena de listas dependientes** (MAYOREO → MAYOREOD → MAYOREOB, y LPV derivadas), un **modelo de descuento porcentual encadenado** con precisión de 8 decimales, y un **job diario idempotente** que recalcula precios publicados a partir del precio técnico.

De estos cinco pilares:

- **1 ya existe** y es reutilizable con ajustes menores: el **redondeo comercial por terminales/bloques** (`,49/,99`, bloques de 10/100). Está implementado y validado en `app-web/src/lib/rounding.ts`.
- **4 son nuevos** respecto al código actual: precio original/técnico persistido, cadena de listas dependientes, pipeline de descuento porcentual encadenado a 8 decimales, y recomputación diaria idempotente.

**Conclusión:** es un cambio de alcance de impacto **Alto** sobre la capa de datos y el motor de cálculo, con impacto **Medio** sobre el flujo de control de cambios (maker-checker) porque ese flujo se conserva. Requiere reactivar la Ingeniería Inversa sobre los objetos Softland reales (`COFER.ARTICULO_PRECIO`, Job diario, SP maestro) que este documento por fin aporta.

**Hallazgo relevante — ya existe una implementación de referencia SQL.** La carpeta `docs/implementacion_redondeo_articulo_precio_v2/` contiene una implementación T-SQL **completa y con pruebas de aceptación** que materializa la mayor parte del requerimiento del lado de la base de datos: el DDL de la columna `U_PRECIO_TECNICO` + migración inicial, la función `COFER.FN_REDONDEAR_PRECIO` (con 11 casos de prueba embebidos que fallan el despliegue si no cuadran), y el SP `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2` con modo simulación, idempotencia (UPDATE solo si cambia el valor vía `EXCEPT`), validación de margen/costo y transacción. Es decir, **el "cómo" del motor de datos ya está resuelto a nivel QA**; lo que falta es (a) reconciliar el motor TypeScript de la app con ese contrato, (b) el orquestador/job diario, y (c) cerrar las 7 decisiones funcionales. Ver §2bis.

| Pilar del requerimiento | ¿Existe hoy? | Impacto | Dónde vive / dónde iría |
|---|---|---|---|
| Redondeo por terminales/bloques (`,49/,99`, 10/100) | **Sí** (validado) | Bajo (refinar) | `lib/rounding.ts` (`redondearPrecioComercial`, tabla `BANDAS`) |
| `U_PRECIO_ORIGINAL` / `U_PRECIO_TECNICO` persistido | No | **Alto** | `ARTICULO_PRECIO` (BD), `types.ts`, `domain-types.ts`, capa de persistencia |
| Cadena de listas dependientes (MAYOREO→MAYOREOD→MAYOREOB / LPV) | No (listas son solo membresía) | **Alto** | `catalog.ts`, motor de cálculo, SP `SP_GESTION_LISTAS_PRECIOS...` |
| Descuento porcentual encadenado `1 − dcto/100` a 8 decimales | Parcial (existe `1−x/100` pero solo para MARGEN, no para precio; sin encadenar) | **Alto** | `lib/engine.ts`, `lib/margin.ts` |
| Job diario idempotente (leer técnico, no republicar) | No | **Alto** | Nuevo componente / SP + orquestación en `actions.ts` |
| Política precios > 100.000 (`FUERA_RANGO` / extensión 50/90) | Parcial (hay estado `FUERA_DE_RANGO`; no hay extensión) | Medio | `lib/rounding.ts` + parámetro `@P_EXTENDER_MAYOR_100000` |

---

## 2. Ingeniería inversa del estado actual (lo que ya está construido)

La aplicación en `app-web/` es un portal **Next.js (App Router) + TypeScript** de control de cambios (maker-checker) sobre un backend Softland **SQL Server** multi-compañía (SILLACA, BEVAL, FEBECA, COFERSA). Opera en modo **DEMO** (en memoria) o **REAL** (SQL) según `DEMO_MODE`.

### 2.1 Motor de cálculo actual

Existen dos stacks de cálculo en `src/lib/`:

- **Stack "engine"** (`engine.ts` + `catalog.ts` + `rounding.ts` + `format.ts` + `domain-types.ts`): valida filas y calcula precios.
- **Stack "margin"** (`margin.ts` + `margin-rows.ts` + `types.ts`): regla de margen mínimo ("Regla de Mayoreo").

**Fórmula de precio hoy = FACTOR MULTIPLICADOR, no descuento encadenado.**
En `engine.ts::validarFila` (ruta `modo === "factor"`): `precioPropuesto = round2(precioActual × factor)`, con `factor` acotado a `(0, 2]`. `convertirPorcentajeAFactor` calcula `factor = 1 + porcentaje/100`. No existe ningún pipeline `precioBase × (1 − dcto/100)` ni encadenamiento entre listas.

**La forma `(1 − x/100)` sí existe, pero solo para MARGEN**, no para precio: `margin.ts::calcularMargenMinimo` → `margenMinimo = margenPromedio × (1 − factor)`, y `engine.ts::construirFilaMargenMasivo`. Es una validación de margen mínimo, no un recálculo de precio por descuento.

**Precisión actual:** precios a **2 decimales** (`round2 = Math.round(x*100)/100`), márgenes a **6 decimales** (`toFixed(6)`). Los **8 decimales solo aparecen como tipo de columna** de almacenamiento `Decimal(28,8)` en `portal-repository.ts::insertarDetalle`; **no hay aritmética a 8 decimales** en la capa de cálculo.

**Precio base único, sin cadena de listas.** Cada artículo tiene un único `precioActual` (`catalog.ts::CATALOGO_ARTICULOS`) / `precioLista` (`types.ts::Articulo`). Las listas (`NOMBRES_LISTA`: MAYOREOD, MAYOREOB, LPARAGUA, GRUPOPICO, LARAB, LPV1..18) son **solo agrupaciones de membresía** (`ARTICULOS_POR_LISTA`) para seleccionar qué artículos abarca una operación. **No hay ordenamiento ni derivación lista-a-lista.**

### 2.2 Redondeo comercial actual (ya cubre gran parte del requerimiento)

`rounding.ts::redondearPrecioComercial` implementa una tabla validada de **12 bandas contiguas** en `[0.01, 100000.00]`:

- Bandas 1–4: "exceso" (CEILING a paso 0.01 / 0.05 / 0.10 / 0.25).
- Banda 5: "único" fijo 4.99.
- Bandas 6–12: "terminal" — terminal más cercano por periodo y offsets, **incluyendo `,49/,99`** (banda 7 = `10.16–50.24`, offsets `[0.49, 0.99]`) y **bloques de 10 y 100** (periodo 10/100 con sus offsets). **Desempate → terminal superior.**

Esto coincide sustancialmente con la "regla corregida de terminales" del nuevo requerimiento (conservar el bloque entero/decena/centena y sustituir solo la terminación). Es el punto de mayor reutilización.

Diferencia relevante: el requerimiento pide una **política explícita para > 100.000** (parámetro `@P_EXTENDER_MAYOR_100000`: `0` → `FUERA_RANGO`; `1` → extender patrón `50/90`). Hoy existe el estado `FUERA_DE_RANGO` (corta en 100.000) pero **no** la extensión.

### 2.3 Flujo de control de cambios (se conserva)

Orquestado por `src/app/actions.ts` (`"use server"`). Los endpoints en `src/app/api/` son solo lectura (`solicitudes`, `auditoria`, `companias`, `plantilla`; `catalogo/` está vacío).

Ciclo: **Simulación** (`parsearExcel`, `simularManual`, sin tocar BD) → **Envío** (`enviarSolicitud`, estado `PENDIENTE`) → **Revisión/Rechazo** → **Aprobación** (`aprobarSolicitud`, única puerta de ejecución — "Regla de Oro"). En aprobación se valida segregación de funciones (no autoaprobación, rol APROBADOR, ámbito), pasa a `EN_PROCESO` y ejecuta:

- **Real:** `ejecutarProcesamientoReal` → SP vía `server/pricing-repository.ts`:
  - Margen: `upsertUdf` (MERGE en `U_FACTOR_REDUCCION_MARGEN`) + `ejecutarSpMargen` (`SP_CALCULAR_MARGEN_MINIMO_ARTICULO`).
  - Precio: `ejecutarSpGestionListas` (`SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO`).
- **Demo:** `simularProcesamientoDemo` (retardo 6s, sin BD).

**Ejecución = llamadas a SP** (no UPDATE directo). **No existe scheduler ni job diario**; la ejecución es síncrona por solicitud al aprobar.

### 2.4 Persistencia

Doble modo (`DEMO_MODE`, default `true`):
- **Demo:** en memoria (`server/requests-store.ts`, `server/demo-catalog.ts`).
- **Real:** `mssql`; pools por compañía (`server/db.ts`), portal en esquema `[PORTAL_PRECIOS]` (`SOLICITUD_PRECIO`, `SOLICITUD_PRECIO_DETALLE`, `AUDITORIA_EVENTOS`). Nombres de objetos/columnas configurables por compañía (`server/companies.ts`).

**No existe** columna de precio original/técnico en ninguna capa (`types.ts`, `domain-types.ts`, catálogo, persistencia). El `precioOriginal` que se ve en `preview.ts`/`NuevaSolicitud.tsx` es solo el precio **pre-redondeo para mostrar**, no una columna persistida.

---

## 2bis. Ingeniería inversa de la implementación SQL v2 (`docs/implementacion_redondeo_articulo_precio_v2/`)

Esta carpeta es un **paquete de implementación de base de datos en estado QA** que resuelve el lado servidor del requerimiento. Contiene 5 artefactos:

| Archivo | Tipo | Qué aporta |
|---|---|---|
| `01_columna_precio_tecnico.sql` | DDL + migración | `ALTER TABLE COFER.ARTICULO_PRECIO ADD U_PRECIO_TECNICO DECIMAL(28,8) NULL` (idempotente por `COL_LENGTH`) + carga inicial única desde `PRECIO` para listas raíz `MAYOREO`/`MAYOREOD` con versión activa. Documenta que el mantenedor de la lista raíz debe escribir en `U_PRECIO_TECNICO`. |
| `02_funcion_redondeo_corregida.sql` | Función + pruebas | `COFER.FN_REDONDEAR_PRECIO(@PRECIO, @EXTENDER_MAYOR_100000)` como TVF `SCHEMABINDING`. 12 bandas, terminales por bloque, empate al superior, política > 100.000. Incluye 11 casos de aceptación que lanzan `THROW 51200` si no cuadran. |
| `03_sp_original_corregido.sql` | SP maestro | `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2` — cálculo por descuento porcentual encadenado, simulación, idempotencia, validación de margen/costo y transacción con `UPDLOCK/HOLDLOCK`. |
| `04_analisis_ejemplos_reales.md` | Análisis | Conciliación con `Listas de precios(1).xlsx` (32 precios, artículos `5500005` y `6104571`) que confirma `U_DCTO_LPVn` = porcentaje de descuento; casos de terminal por bloque; EPA no uniforme (4,4 % vs ~13,45 %). |
| `05_requerimiento_para_TI.md` | Requerimiento | Versión "para TI" del documento origen (usa `U_PRECIO_TECNICO` en lugar de `U_PRECIO_ORIGINAL`). |

### 2bis.1 Qué ya está resuelto en SQL

- **Columna técnica + migración inicial.** DDL listo; `DECIMAL(28,8)`, con nota de ajustar el tipo si TI confirma incompatibilidad con el ERP. La carga inicial cubre `MAYOREO` (Costa Rica) y `MAYOREOD` (Venezuela).
- **Redondeo a 8 decimales por bloque.** `FN_REDONDEAR_PRECIO` construye candidatos como `FLOOR(@PRECIO/PERIODO)*PERIODO + TERMINAL` (conserva el bloque), ordena por `ABS(VALOR-@PRECIO), VALOR DESC` (más cercano; empate → superior). Política > 100.000 por `@EXTENDER_MAYOR_100000` (0 → `FUERA_RANGO`; 1 → extiende banda 12 con `50/90`). **Autoverificada** con 11 casos.
- **Descuento porcentual encadenado a 8 decimales.** El SP calcula `FACTOR_DESCUENTO = 1 − U_DCTO_LPVn/100` y `PRECIO_TECNICO_DESTINO = U_PRECIO_TECNICO_BASE × FACTOR_DESCUENTO × FACTOR_GLOBAL × FACTOR_ARTICULO` en `DECIMAL(18,8)`/`DECIMAL(28,8)`, **sin `ROUND(...,2)` intermedio** (cumple la prohibición). MAYOREOB = base MAYOREOD con `@P_FACTOR_GLOBAL=1.30` y `@COLUMNA_DCTO=NULL`.
- **Idempotencia real.** El `UPDATE` solo toca filas cuyo conjunto `(U_PRECIO_TECNICO, PRECIO, MARGEN_UTILIDAD, MARGEN_MULR, FECHA_INICIO, FECHA_FIN)` difiere del calculado (patrón `EXCEPT`). Una 2ª corrida sin cambios **no actualiza filas ni fechas** (criterios 7 y 8).
- **Simulación.** `@P_SOLO_SIMULAR=1` devuelve el cálculo y hace `RETURN` sin publicar; conciliable contra el Excel.
- **Validaciones de guarda.** Rango de fechas, `@P_FACTOR_GLOBAL` en `(0,2]`, versión destino activa/única, columna de descuento autorizada (`LIKE 'U_DCTO_LPV%'`), precios técnicos base no nulos, factor final en `(0,2]`, y por fila: `COSTO_NO_DISPONIBLE`, `PRECIO_BAJO_COSTO`, `MARGEN_INSUFICIENTE`. Si algo falla, `THROW 51007` cancela la publicación completa (no parcial → criterio 11).

### 2bis.2 Qué NO resuelve esta carpeta (sigue pendiente)

- **Orquestación / job diario.** El SP procesa **una lista destino por invocación**. El orden de dependencia (MAYOREO→MAYOREOD→MAYOREOB, LPV) y la exclusión mutua con el job actual (reglas 6 y 7) **no** están automatizados aquí; requieren un orquestador o job SQL Agent externo.
- **Alineación con la app en construcción.** `pricing-repository.ts` invoca hoy `SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO` con parámetros `(nivelPrecio, version, usuario)`. El SP nuevo es `..._FULL_QA_V2` con otra firma (`@P_NIVEL_PRECIO_BASE`, `@COLUMNA_DCTO`, `@P_FACTOR_GLOBAL`, `@P_EXTENDER_MAYOR_100000`, `@P_SOLO_SIMULAR`, fechas). Es un **cambio de contrato** para la capa TypeScript.
- **Paridad del motor TypeScript.** `lib/rounding.ts` (bandas casi idénticas pero con fronteras `desde/hasta` expresadas distinto y `round2` a 2 decimales) debe verificarse caso por caso contra `FN_REDONDEAR_PRECIO`, y `lib/engine.ts` debe incorporar el pipeline de descuento encadenado para que la **simulación en pantalla** coincida con lo que publica el SP.
- **Decisiones funcionales.** Persisten las 7 (bloque en terminales, política > 100.000 sin tope, mismos intervalos por moneda/compañía, EPA, moneda de `COSTO_PROM_DOL`, llave real de `ARTICULO_PRECIO` y tipo de `ESQUEMA_TRABAJO`). El propio SP deja abiertos `MARGEN_MULR` ("hasta que Finanzas defina") y el tipo de la columna.
- **Diferencia de nomenclatura.** El documento origen usa `U_PRECIO_ORIGINAL`; la implementación v2 usa `U_PRECIO_TECNICO`. Debe unificarse el nombre canónico antes de tocar app y BD.

### 2bis.3 Diferencias de fronteras entre `rounding.ts` (app) y `FN_REDONDEAR_PRECIO` (SQL v2)

Ambas tienen 12 bandas equivalentes, pero conviene una verificación explícita porque las fronteras se expresan distinto y podrían divergir en los bordes:

| Banda | `rounding.ts` (desde–hasta) | SQL v2 (`DESDE_EXCLUSIVO`–`HASTA`) |
|---|---|---|
| 5 (único 4,99) | `4.76 – 5.15` | `>4.75 – 5.15` |
| 6 (terminal) | `5.16 – 10.15` | `>5.15 – 10.15` |
| 9 (bloque 10) | `100.0 – 500.0` | `>99.99 – 500` |
| 12 (bloque 100) | `5001.0 – 100000.0` | `>5000 – 100000` (+ extensión) |

El SQL usa límite inferior **exclusivo** (`@PRECIO > DESDE_EXCLUSIVO`); la app usa umbrales `hasta` con conteo de banda. Deben producir el mismo resultado, pero es un punto de prueba obligatorio (PBT ya habilitado).

---

## 3. Impacto del cambio, componente por componente

El impacto por componente se detalla en **dos documentos separados**, uno por capa:

- **Base de datos (Softland / SQL Server):** `impacto-bd-precio-original-y-redondeo.md` — esquema `ARTICULO_PRECIO`, función `FN_REDONDEAR_PRECIO`, SP `SP_..._FULL_QA_V2`, job diario y datos maestros. El grueso ya está cubierto por el paquete v2; lo net-new es el job diario/orquestador.
- **Aplicación (portal `app-web/`):** `impacto-app-precio-original-y-redondeo.md` — tipos de dominio, `engine.ts`, `rounding.ts`, regla de margen, `pricing-repository.ts`, orquestación, simulación/preview y auditoría. Aquí se concentra el trabajo Alto (replicar la fórmula del SP y el cambio de contrato).

Este documento conserva el resumen ejecutivo, la ingeniería inversa (estado actual y paquete v2) y las secciones transversales (contradicciones, decisiones pendientes, impacto IA-DLC, criterios de aceptación y recomendación).

---

## 4. Contradicciones y decisiones a reconciliar

1. **Modelo de factor incompatible.** El código actual usa **multiplicador `(0, 2]`** (`factor = 1 + p/100`). El requerimiento usa **descuento porcentual `1 − U_DCTO_LPVn/100`** encadenado con factor de artículo y global. Hay que decidir: ¿coexisten (interfaz manual vs job de listas) o el descuento porcentual reemplaza al factor en la ruta de listas? Esto afecta `engine.ts` y las validaciones de rango.
2. **Precisión.** Hoy se calcula a 2 decimales y se aplica `round2` intermedio. El requerimiento **prohíbe `ROUND(...,2)` sobre el factor** y exige **≥ 8 decimales** en el cálculo técnico. Cambio directo en el motor y en el SP.
3. **Idempotencia.** El requerimiento exige que la 2ª ejecución **no actualice filas ni fechas de auditoría**. El flujo actual ejecuta el SP al aprobar sin guarda de "sin cambios". Debe añadirse la regla "actualizar solo si cambió el valor persistido" (regla 8 del documento).
4. **Origen del recálculo.** Prohibición técnica nueva: ningún job/trigger/interfaz puede copiar `PRECIO → U_PRECIO_TECNICO` tras la migración; el job debe leer **siempre** el técnico. No hay hoy salvaguarda contra esto.
5. **Prohibición de SQL en los requisitos previos.** `requirements.md` (sección 9) declaraba "no se incluyen queries ni estructura SQL" y trataba los SP como "ya definidos". Este documento **abre esa caja negra** con DDL, fórmulas SQL y un SP nuevo → contradice el alcance declarado y obliga a actualizarlo.

---

## 5. Decisiones funcionales pendientes (del documento origen)

Estas 7 decisiones del requerimiento **no están resueltas** en los artefactos actuales y bloquean el diseño:

1. Conservar el bloque del precio calculado al generar terminales (parcialmente ya implementado en `rounding.ts`; confirmar como regla oficial).
2. Política de redondeo para precios > 100.000 (16 filas reales del artículo `5500005` fuera del máximo del anexo).
3. ¿La extensión del patrón `50/90` aplica sin límite superior?
4. ¿Los mismos intervalos aplican a cada **moneda y compañía**? (hoy el catálogo es multi-compañía pero el redondeo es único).
5. Tratamiento de **EPA** (porcentaje efectivo variable por artículo).
6. Moneda para validar `COSTO_PROM_DOL` y márgenes.
7. Llave real de `ARTICULO_PRECIO` y tipo de `ESQUEMA_TRABAJO` antes de compilar el SP de QA.

---

## 6. Impacto sobre requisitos y plan IA-DLC ya aprobados

- **`requirements.md`:** requiere una nueva sección/unidad "Motor de cálculo y redondeo de listas" (precio original/técnico, redondeo por terminales, descuento encadenado, jerarquía de listas, idempotencia, política > 100.000) y retirar/matizar la restricción de "no SQL" de la sección 9. Los RF-04/05/14 (factor `(0,2]`) deben reconciliarse con el modelo de descuento.
- **`execution-plan.md`:** la **Ingeniería Inversa**, hoy *diferida* por falta de scripts Softland, **debe reactivarse** — este documento aporta `ARTICULO_PRECIO`, el Job diario y el SP maestro. Debe añadirse una unidad de trabajo de "motor de listas" y probablemente un componente de "job diario".
- **`aidlc-state.md`:** la etapa actual ("Normalización de carga porcentual de margen mínimo validada") se mantiene, pero debe registrarse el cambio de alcance y su decisión de aceptación.

---

## 7. Criterios de aceptación nuevos a incorporar

Del documento origen (deben trazarse a pruebas, incluidas PBT ya habilitadas en el proyecto):

1. `10,15 → 10,29`; `10,16 → 10,49`; `13,195 → 13,49`; empate → terminal superior.
2. Precio > 100.000 se rechaza con extensión desactivada.
3. MAYOREO 12.940 con descuento 2 % → LPV técnica 12.681,20 antes de redondear.
4. Dos ejecuciones iguales producen iguales precios y **la 2ª no actualiza filas ni fechas de auditoría**.
5. Cambiar descuento recalcula desde MAYOREO técnica (no desde LPV publicada).
6. Cambiar MAYOREOD técnica recalcula MAYOREOB aplicando 1,30 **una sola vez**.
7. `FUERA_RANGO` no publica el lote parcialmente; bajo costo/margen mínimo rechaza el lote.

---

## 8. Recomendación

El paquete SQL v2 cambia la naturaleza del trabajo: **el motor de datos ya está construido y probado a nivel QA**, por lo que el esfuerzo se desplaza de "escribir SQL" a "**alinear la app, orquestar y decidir**".

1. **Aceptar formalmente el cambio de alcance** y reactivar Ingeniería Inversa sobre los objetos Softland reales, tratando `docs/implementacion_redondeo_articulo_precio_v2/` como el artefacto de referencia del motor de datos.
2. **Unificar nomenclatura** `U_PRECIO_ORIGINAL` (documento origen) vs `U_PRECIO_TECNICO` (v2) → adoptar un único nombre canónico antes de tocar app y BD.
3. **Reconciliar el modelo de factor** (multiplicador `(0,2]` de la app vs descuento porcentual encadenado del SP) antes de tocar `engine.ts`; el motor TypeScript debe **replicar** la fórmula del SP para que la simulación coincida con la publicación.
4. **Verificar paridad** entre `lib/rounding.ts` y `FN_REDONDEAR_PRECIO` caso por caso (fronteras de banda, §2bis.3) mediante las PBT ya habilitadas, usando además los 11 casos embebidos del SP.
5. **Cambiar el contrato** de `server/pricing-repository.ts` hacia `SP_..._FULL_QA_V2` y su nueva firma; aprovechar `@P_SOLO_SIMULAR=1` para la simulación previa a aprobación.
6. **Diseñar el job diario** (orquestador por orden de dependencia + exclusión mutua) y ejecutar la migración inicial; es lo único net-new que v2 no cubre.
7. **Resolver las 7 decisiones funcionales pendientes** (incluidas `MARGEN_MULR`, tipo de columna y llave real de `ARTICULO_PRECIO` que el propio SP deja abiertas), sin inferirlas.
8. **Actualizar** `requirements.md`, `execution-plan.md` y `aidlc-state.md` para incorporar el motor de precio técnico como unidad nueva y referenciar el paquete v2.
