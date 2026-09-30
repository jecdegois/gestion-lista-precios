# Informe de Impacto — Aplicación — "Precio original y redondeo de listas"

> **Proyecto:** MV26020 — Automatización / Cálculo de Listas de Precio
> **Capa:** Aplicación (portal Next.js `app-web/`, en construcción).
> **Documento origen del cambio:** `docs/Requerimiento_ precio original y redondeo de listas 2026-09-10.md`
> **Implementación de referencia SQL:** `docs/implementacion_redondeo_articulo_precio_v2/` (contrato con el que la app debe alinearse).
> **Fecha del informe:** 2026-09-10
> **Método:** Ingeniería inversa del código ya construido en `app-web/` + contraste con el requerimiento y el paquete SQL v2.
> **Documento complementario:** `impacto-bd-precio-original-y-redondeo.md` (capa de base de datos).

---

## 1. Resumen

El portal `app-web/` es una app **Next.js (App Router) + TypeScript** de control de cambios (maker-checker) sobre backend Softland **SQL Server** multi-compañía (SILLACA, BEVAL, FEBECA, COFERSA), en modo **DEMO** (memoria) o **REAL** (SQL) según `DEMO_MODE`. El nuevo requerimiento no rompe el flujo maker-checker, pero **cambia el motor de cálculo** y obliga a la app a alinearse con el contrato del SP v2.

De los cinco pilares del requerimiento, del lado app:
- El **redondeo por terminales/bloques ya existe** y es reutilizable (`lib/rounding.ts`).
- Son **nuevos**: precio técnico/publicado en el modelo, descuento porcentual encadenado a 8 decimales, y el cambio de contrato hacia el SP v2 + orquestación por orden de dependencia.

---

## 2. Ingeniería inversa del estado actual de la app

### 2.1 Motor de cálculo actual

Dos stacks en `src/lib/`:
- **Stack "engine"** (`engine.ts` + `catalog.ts` + `rounding.ts` + `format.ts` + `domain-types.ts`): valida filas y calcula precios.
- **Stack "margin"** (`margin.ts` + `margin-rows.ts` + `types.ts`): regla de margen mínimo ("Regla de Mayoreo").

**Fórmula de precio hoy = FACTOR MULTIPLICADOR, no descuento encadenado.** En `engine.ts::validarFila` (ruta `modo === "factor"`): `precioPropuesto = round2(precioActual × factor)`, con `factor` en `(0, 2]`. `convertirPorcentajeAFactor` calcula `factor = 1 + porcentaje/100`. No existe pipeline `precioBase × (1 − dcto/100)` ni encadenamiento entre listas.

**La forma `(1 − x/100)` sí existe, pero solo para MARGEN**, no para precio (`margin.ts::calcularMargenMinimo` → `margenMinimo = margenPromedio × (1 − factor)`). Es validación de margen mínimo, no recálculo de precio.

**Precisión actual:** precios a **2 decimales** (`round2 = Math.round(x*100)/100`), márgenes a **6 decimales** (`toFixed(6)`). Los **8 decimales solo aparecen como tipo de columna** de almacenamiento `Decimal(28,8)` en `portal-repository.ts::insertarDetalle`; **no hay aritmética a 8 decimales** en la capa de cálculo.

**Precio base único, sin cadena de listas.** Cada artículo tiene un único `precioActual` (`catalog.ts::CATALOGO_ARTICULOS`) / `precioLista` (`types.ts::Articulo`). Las listas (`NOMBRES_LISTA`: MAYOREOD, MAYOREOB, LPARAGUA, GRUPOPICO, LARAB, LPV1..18) son **solo agrupaciones de membresía** (`ARTICULOS_POR_LISTA`). **No hay ordenamiento ni derivación lista-a-lista.**

### 2.2 Redondeo comercial actual (ya cubre gran parte del requerimiento)

`rounding.ts::redondearPrecioComercial` implementa **12 bandas contiguas** en `[0.01, 100000.00]`:
- Bandas 1–4: "exceso" (CEILING a paso 0.01 / 0.05 / 0.10 / 0.25).
- Banda 5: "único" fijo 4.99.
- Bandas 6–12: "terminal" — terminal más cercano por periodo y offsets, **incluyendo `,49/,99`** (banda 7 = `10.16–50.24`, offsets `[0.49, 0.99]`) y **bloques de 10 y 100**. **Desempate → terminal superior.**

Coincide sustancialmente con la "regla corregida de terminales" del requerimiento. Falta la **política explícita > 100.000** (`@P_EXTENDER_MAYOR_100000`): hoy existe el estado `FUERA_DE_RANGO` (corta en 100.000) pero **no** la extensión `50/90`.

### 2.3 Flujo de control de cambios (se conserva)

Orquestado por `src/app/actions.ts` (`"use server"`). Los endpoints en `src/app/api/` son solo lectura (`solicitudes`, `auditoria`, `companias`, `plantilla`; `catalogo/` vacío).

Ciclo: **Simulación** (`parsearExcel`, `simularManual`, sin tocar BD) → **Envío** (`enviarSolicitud`, estado `PENDIENTE`) → **Revisión/Rechazo** → **Aprobación** (`aprobarSolicitud`, única puerta de ejecución — "Regla de Oro", valida segregación de funciones). En aprobación:
- **Real:** `ejecutarProcesamientoReal` → SP vía `server/pricing-repository.ts`: precio → `ejecutarSpGestionListas` (`SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO`); margen → `upsertUdf` + `ejecutarSpMargen`.
- **Demo:** `simularProcesamientoDemo` (retardo 6s, sin BD).

**Ejecución = llamadas a SP** (no UPDATE directo). **No existe scheduler ni job diario**; la ejecución es síncrona por solicitud al aprobar.

### 2.4 Persistencia

Doble modo (`DEMO_MODE`, default `true`): Demo en memoria (`requests-store.ts`, `demo-catalog.ts`); Real vía `mssql` con pools por compañía (`db.ts`) y portal en esquema `[PORTAL_PRECIOS]`. **No existe** columna de precio original/técnico en ninguna capa; el `precioOriginal` de `preview.ts`/`NuevaSolicitud.tsx` es solo el precio pre-redondeo para mostrar, no persistido.

---

## 3. Impacto en la Aplicación, componente por componente

| Componente / archivo | Cambio requerido | Esfuerzo | Riesgo |
|---|---|---|---|
| **Tipos de dominio** (`lib/types.ts`, `lib/domain-types.ts`) | Añadir precio técnico/publicado al modelo de artículo y a filas/resultados. | Medio | Medio |
| **Motor de cálculo** (`lib/engine.ts`) | Introducir pipeline de precio por **descuento porcentual encadenado** (`1 − U_DCTO_LPVn/100 × factor_artículo × factor_global`) a 8 decimales; separar "técnico" de "publicado". Coexistencia/decisión frente al factor `(0,2]` actual. Debe **replicar** la fórmula del SP v2 para paridad de simulación. | Alto | Alto (cambia la fórmula núcleo ya construida) |
| **Redondeo** (`lib/rounding.ts`) | Reutilizar; añadir política `> 100.000` (`FUERA_RANGO` vs extensión `50/90`). **Verificar paridad de fronteras** con `FN_REDONDEAR_PRECIO` (ver §4). | Bajo–Medio | Bajo |
| **Regla de margen** (`lib/margin.ts`, `margin-rows.ts`) | Recalcular márgenes sobre precio técnico/publicado nuevo; alinear con `MARGEN_UTILIDAD_CALC`/`MARGEN_INSUFICIENTE` del SP (criterio 12). | Medio | Medio |
| **Capa de ejecución** (`server/pricing-repository.ts`) | Cambio de contrato: pasar de `SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO` a `SP_..._FULL_QA_V2` con nuevos parámetros (`@P_NIVEL_PRECIO_BASE`, `@COLUMNA_DCTO`, `@P_FACTOR_GLOBAL`, `@P_EXTENDER_MAYOR_100000`, `@P_SOLO_SIMULAR`, fechas). | Alto | Alto (contrato con SP nuevo) |
| **Orquestación** (`app/actions.ts`) | Procesar listas **en orden de dependencia**; el SP es por-lista, así que la secuencia se orquesta fuera. Aprovechar la idempotencia nativa del SP. | Alto | Alto |
| **Simulación/preview** (`lib/preview.ts`, `NuevaSolicitud.tsx`, `RevisionModal.tsx`, `Tablas.tsx`) | Mostrar técnico vs publicado; usar `@P_SOLO_SIMULAR=1` para conciliación con lo que publicará el SP. | Medio | Bajo |
| **Auditoría** | Registrar migración inicial, recomputaciones y estado `FUERA_RANGO`; conservar evidencia de "cero actualizaciones" en 2ª ejecución (el SP ya no toca fechas si no hay cambios). | Bajo | Bajo |

---

## 4. Paridad de fronteras entre `rounding.ts` (app) y `FN_REDONDEAR_PRECIO` (SQL v2)

Ambas tienen 12 bandas equivalentes, pero las fronteras se expresan distinto y podrían divergir en los bordes. Punto de prueba obligatorio (PBT ya habilitado):

| Banda | `rounding.ts` (desde–hasta) | SQL v2 (`DESDE_EXCLUSIVO`–`HASTA`) |
|---|---|---|
| 5 (único 4,99) | `4.76 – 5.15` | `>4.75 – 5.15` |
| 6 (terminal) | `5.16 – 10.15` | `>5.15 – 10.15` |
| 9 (bloque 10) | `100.0 – 500.0` | `>99.99 – 500` |
| 12 (bloque 100) | `5001.0 – 100000.0` | `>5000 – 100000` (+ extensión) |

El SQL usa límite inferior **exclusivo** (`@PRECIO > DESDE_EXCLUSIVO`); la app usa umbrales `hasta` con conteo de banda. Deben producir el mismo resultado, pero requiere verificación caso por caso (incluidos los 11 casos embebidos del SP).

---

## 5. Contradicciones y decisiones a reconciliar (capa app)

1. **Modelo de factor incompatible.** La app usa **multiplicador `(0, 2]`** (`factor = 1 + p/100`); el requerimiento usa **descuento porcentual `1 − U_DCTO_LPVn/100`** encadenado. Decidir si coexisten (interfaz manual vs job de listas) o si el descuento reemplaza al factor en la ruta de listas. Afecta `engine.ts` y las validaciones de rango.
2. **Precisión.** Hoy 2 decimales con `round2` intermedio; el requerimiento **prohíbe `ROUND(...,2)` sobre el factor** y exige **≥ 8 decimales** en el cálculo técnico.
3. **Separación técnico/publicado.** El modelo de la app debe representar ambos valores y mostrarlos en preview y revisión.
4. **Nomenclatura.** Unificar `U_PRECIO_ORIGINAL` (documento) vs `U_PRECIO_TECNICO` (v2) en tipos y capa de datos de la app.

---

## 6. Criterios de aceptación que la app debe reflejar

Trazables a pruebas (incluidas PBT ya habilitadas):

1. `10,15 → 10,29`; `10,16 → 10,49`; `13,195 → 13,49`; empate → terminal superior.
2. Precio > 100.000 se rechaza con extensión desactivada.
3. MAYOREO 12.940 con descuento 2 % → LPV técnica 12.681,20 antes de redondear (visible en simulación).
4. Dos ejecuciones iguales producen iguales precios y la 2ª no actualiza filas ni fechas.
5. Cambiar descuento recalcula desde MAYOREO técnica (no desde LPV publicada).
6. Cambiar MAYOREOD técnica recalcula MAYOREOB aplicando 1,30 una sola vez.
7. `FUERA_RANGO` no publica el lote parcialmente; bajo costo/margen mínimo rechaza el lote.

---

## 7. Recomendación (capa app)

1. **Reconciliar el modelo de factor** (multiplicador `(0,2]` vs descuento porcentual encadenado) antes de tocar `engine.ts`.
2. Hacer que el motor TypeScript **replique** la fórmula del SP v2 para que la simulación coincida con la publicación.
3. **Verificar paridad** entre `lib/rounding.ts` y `FN_REDONDEAR_PRECIO` (fronteras, §4) mediante PBT + los 11 casos del SP.
4. **Cambiar el contrato** de `server/pricing-repository.ts` hacia `SP_..._FULL_QA_V2`; usar `@P_SOLO_SIMULAR=1` para la simulación previa a aprobación.
5. **Orquestar** el recorrido de listas en orden de dependencia desde `actions.ts`, apoyándose en la idempotencia nativa del SP.
6. Ajustar tipos, preview, revisión y auditoría para reflejar precio técnico vs publicado y el estado `FUERA_RANGO`.
