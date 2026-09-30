# Informe de Impacto — Base de Datos — "Precio original y redondeo de listas"

> **Proyecto:** MV26020 — Automatización / Cálculo de Listas de Precio
> **Capa:** Base de datos (Softland / SQL Server).
> **Documento origen del cambio:** `docs/Requerimiento_ precio original y redondeo de listas 2026-09-10.md`
> **Implementación de referencia SQL:** `docs/implementacion_redondeo_articulo_precio_v2/` (DDL + función + SP + análisis, en QA).
> **Fecha del informe:** 2026-09-10
> **Método:** Ingeniería inversa de la implementación SQL v2 + contraste con el requerimiento.
> **Documento complementario:** `impacto-app-precio-original-y-redondeo.md` (capa de aplicación).

---

## 1. Resumen

El requerimiento introduce en la base de datos: **precio técnico persistido** (`U_PRECIO_TECNICO`), **descuento porcentual encadenado** a 8 decimales, **redondeo comercial por terminales/bloques**, **procesamiento de listas en orden de dependencia** (MAYOREO→MAYOREOD→MAYOREOB, LPV) y un **job diario idempotente**.

**Hallazgo clave:** la carpeta `docs/implementacion_redondeo_articulo_precio_v2/` ya contiene una implementación T-SQL **completa y con pruebas de aceptación** que materializa la mayor parte de esto a nivel QA. El "cómo" del motor de datos está resuelto; lo net-new pendiente es el **job diario/orquestador** y compilar contra los tipos/llave reales.

---

## 2. Ingeniería inversa de la implementación SQL v2

La carpeta contiene 5 artefactos:

| Archivo | Tipo | Qué aporta |
|---|---|---|
| `01_columna_precio_tecnico.sql` | DDL + migración | `ALTER TABLE COFER.ARTICULO_PRECIO ADD U_PRECIO_TECNICO DECIMAL(28,8) NULL` (idempotente por `COL_LENGTH`) + carga inicial única desde `PRECIO` para listas raíz `MAYOREO`/`MAYOREOD` con versión activa. Documenta que el mantenedor de la lista raíz debe escribir en `U_PRECIO_TECNICO`. |
| `02_funcion_redondeo_corregida.sql` | Función + pruebas | `COFER.FN_REDONDEAR_PRECIO(@PRECIO, @EXTENDER_MAYOR_100000)` como TVF `SCHEMABINDING`. 12 bandas, terminales por bloque, empate al superior, política > 100.000. Incluye 11 casos de aceptación que lanzan `THROW 51200` si no cuadran. |
| `03_sp_original_corregido.sql` | SP maestro | `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2` — cálculo por descuento porcentual encadenado, simulación, idempotencia, validación de margen/costo y transacción con `UPDLOCK/HOLDLOCK`. |
| `04_analisis_ejemplos_reales.md` | Análisis | Conciliación con `Listas de precios(1).xlsx` (32 precios, artículos `5500005` y `6104571`) que confirma `U_DCTO_LPVn` = porcentaje de descuento; casos de terminal por bloque; EPA no uniforme (4,4 % vs ~13,45 %). |
| `05_requerimiento_para_TI.md` | Requerimiento | Versión "para TI" del documento origen (usa `U_PRECIO_TECNICO` en lugar de `U_PRECIO_ORIGINAL`). |

### 2.1 Qué ya está resuelto en SQL

- **Columna técnica + migración inicial.** DDL listo; `DECIMAL(28,8)`, con nota de ajustar el tipo si TI confirma incompatibilidad con el ERP. La carga inicial cubre `MAYOREO` (Costa Rica) y `MAYOREOD` (Venezuela).
- **Redondeo a 8 decimales por bloque.** `FN_REDONDEAR_PRECIO` construye candidatos como `FLOOR(@PRECIO/PERIODO)*PERIODO + TERMINAL` (conserva el bloque), ordena por `ABS(VALOR-@PRECIO), VALOR DESC` (más cercano; empate → superior). Política > 100.000 por `@EXTENDER_MAYOR_100000` (0 → `FUERA_RANGO`; 1 → extiende banda 12 con `50/90`). **Autoverificada** con 11 casos.
- **Descuento porcentual encadenado a 8 decimales.** El SP calcula `FACTOR_DESCUENTO = 1 − U_DCTO_LPVn/100` y `PRECIO_TECNICO_DESTINO = U_PRECIO_TECNICO_BASE × FACTOR_DESCUENTO × FACTOR_GLOBAL × FACTOR_ARTICULO` en `DECIMAL(18,8)`/`DECIMAL(28,8)`, **sin `ROUND(...,2)` intermedio** (cumple la prohibición). MAYOREOB = base MAYOREOD con `@P_FACTOR_GLOBAL=1.30` y `@COLUMNA_DCTO=NULL`.
- **Idempotencia real.** El `UPDATE` solo toca filas cuyo conjunto `(U_PRECIO_TECNICO, PRECIO, MARGEN_UTILIDAD, MARGEN_MULR, FECHA_INICIO, FECHA_FIN)` difiere del calculado (patrón `EXCEPT`). Una 2ª corrida sin cambios **no actualiza filas ni fechas** (criterios 7 y 8).
- **Simulación.** `@P_SOLO_SIMULAR=1` devuelve el cálculo y hace `RETURN` sin publicar; conciliable contra el Excel.
- **Validaciones de guarda.** Rango de fechas, `@P_FACTOR_GLOBAL` en `(0,2]`, versión destino activa/única, columna de descuento autorizada (`LIKE 'U_DCTO_LPV%'`), precios técnicos base no nulos, factor final en `(0,2]`, y por fila: `COSTO_NO_DISPONIBLE`, `PRECIO_BAJO_COSTO`, `MARGEN_INSUFICIENTE`. Si algo falla, `THROW 51007` cancela la publicación completa (no parcial → criterio 11).

### 2.2 Qué NO resuelve el paquete v2

- **Orquestación / job diario.** El SP procesa **una lista destino por invocación**. El orden de dependencia (MAYOREO→MAYOREOD→MAYOREOB, LPV) y la exclusión mutua con el job actual (reglas 6 y 7) **no** están automatizados; requieren un orquestador o job SQL Agent externo.
- **Compilación contra objetos reales.** Falta compilar contra la llave real de `ARTICULO_PRECIO` y el tipo de `ESQUEMA_TRABAJO`; el SP deja `MARGEN_MULR` abierto ("hasta que Finanzas defina") y el tipo de la columna sujeto a confirmación de TI.
- **Nomenclatura.** El documento origen usa `U_PRECIO_ORIGINAL`; v2 usa `U_PRECIO_TECNICO`. Debe unificarse el nombre canónico.

---

## 3. Impacto en Base de Datos, componente por componente

| Componente / objeto | Cambio requerido | Esfuerzo | Riesgo |
|---|---|---|---|
| **Esquema** (`COFER.ARTICULO_PRECIO`) | Agregar `U_PRECIO_TECNICO DECIMAL(28,8)` + migración inicial. **DDL ya escrito** en v2 (`01_columna_precio_tecnico.sql`); falta ejecutarlo en QA/PROD y confirmar tipo con TI. | Medio | Alto (cambio de esquema productivo, migración de datos) |
| **Función de redondeo** (`FN_REDONDEAR_PRECIO`) | **Ya implementada y con 11 pruebas embebidas** en v2. Falta compilar contra la llave/tipos reales y confirmar política `> 100.000`. | Bajo | Medio |
| **SP de cálculo** (`SP_..._FULL_QA_V2`) | **Ya implementado** (descuento encadenado, simulación, idempotencia, validación margen/costo, transacción). Falta compilar contra tipos reales, definir `MARGEN_MULR` (Finanzas) y confirmar `ESQUEMA_TRABAJO`. | Bajo | Medio |
| **Job diario** (SQL Agent / orquestador) | **No cubierto por v2.** Recorrer las listas en orden de dependencia (MAYOREO→MAYOREOD→MAYOREOB, LPV), invocar el SP por lista y garantizar exclusión mutua con el job actual (reglas 6 y 7). | Alto | Alto (nuevo, concurrencia) |
| **Datos maestros** (`U_DCTO_LPVn`, `U_FACTOR_ARTICULO`, `COSTO_PROM_DOL`) | Confirmar existencia/consistencia de columnas de descuento y factor por artículo; validar unicidad de factor (el SP lanza `THROW 51009` si hay duplicados). | Medio | Medio |

---

## 4. Decisiones funcionales pendientes que afectan a BD

1. Política de redondeo para precios > 100.000 (16 filas reales del artículo `5500005` fuera del máximo del anexo).
2. ¿La extensión del patrón `50/90` aplica sin límite superior?
3. ¿Los mismos intervalos aplican a cada **moneda y compañía**?
4. Tratamiento de **EPA** (porcentaje efectivo variable por artículo: ¿columna de descuento, factor independiente o captura manual?).
5. Moneda para validar `COSTO_PROM_DOL` y márgenes.
6. Llave real de `ARTICULO_PRECIO` y tipo de `ESQUEMA_TRABAJO` antes de compilar el SP en QA.
7. Definición de `MARGEN_MULR` (pendiente de Finanzas).

---

## 5. Secuencia de despliegue (del paquete v2)

1. Respaldar el procedimiento y los precios vigentes.
2. Agregar `U_PRECIO_TECNICO` en QA.
3. Recuperar y cargar los precios originales de MAYOREO y MAYOREOD.
4. Crear `COFER.FN_REDONDEAR_PRECIO`.
5. Crear `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2`.
6. Ejecutar con `@P_SOLO_SIMULAR=1` y conciliar los artículos del archivo de ejemplo.
7. Aprobar la política para valores mayores de 100.000.
8. Publicar en QA y repetir el job sin cambios de entrada (verificar cero actualizaciones).
9. Sustituir el job productivo durante una ventana controlada.

---

## 6. Recomendación (capa BD)

1. Tratar `docs/implementacion_redondeo_articulo_precio_v2/` como el **artefacto de referencia** del motor de datos.
2. **Unificar nomenclatura** `U_PRECIO_ORIGINAL` vs `U_PRECIO_TECNICO` → nombre canónico único.
3. Compilar función y SP contra la **llave y tipos reales** de `ARTICULO_PRECIO`; cerrar `MARGEN_MULR` con Finanzas.
4. **Diseñar el job diario** (orquestador por orden de dependencia + exclusión mutua con el job actual) — único trabajo net-new de esta capa.
5. Ejecutar la **migración inicial** una sola vez antes del primer redondeo.
6. Resolver las decisiones funcionales pendientes que afectan al cálculo/redondeo antes de publicar.
