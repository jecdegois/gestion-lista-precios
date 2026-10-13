# Cómo se calculan las listas de precio (explicación sencilla)

> Documento de estudio: describe el comportamiento real del código en la rama `fix/deuda-validaciones`
> (commit `7a90c66`). Cada afirmación cita el archivo y la línea donde se puede comprobar.
> Todas las rutas son relativas a la raíz del repositorio.
> Los ejemplos numéricos **no se calcularon a mano**: salen de ejecutar el motor real
> (`engine.ts` y `rounding.ts`) con jiti.
>
> **Revisión:** Codex lo revisó el 2026-10-13, contrastando cada sección con el código y repitiendo
> 35 ejemplos con el motor. Las correcciones que propuso se verificaron y ya están aplicadas.
> En la segunda pasada confirmó el anexo completo; sus últimos matices también están aplicados.

---

## 1. La idea en una página

El cálculo ocurre en **dos etapas**:

```
 ETAPA 1 — EL PORTAL (esta app)                          ETAPA 2 — SOFTLAND (fuera del flujo de aprobación)
 ┌─────────────────────────────────────────────┐         ┌──────────────────────────────────────────────┐
 │ 1. El operador captura (pantalla o Excel)   │         │ Un SP recalcula los precios de las listas    │
 │ 2. El portal SIMULA y VALIDA cada fila      │         │ derivadas a partir de la lista base y de los │
 │ 3. Al ENVIAR, el servidor recalcula las     │         │ factores. Se lanza desde "Ejecución →        │
 │    filas (no confía en el navegador) y las  │         │ Precios" (SP_GESTION_LISTAS_PRECIOS_FULL).   │
 │    guarda en SOLICITUD_DETALLE              │ ──────► │                                              │
 │ 4. El APROBADOR aprueba                     │         │                                              │
 │ 5. El portal escribe UNA tabla de Softland  │         │                                              │
 │    según el proceso                         │         │                                              │
 └─────────────────────────────────────────────┘         └──────────────────────────────────────────────┘
```

- **Paso 3, al enviar.** El servidor recalcula cada fila con el mismo motor que usó la previsualización
  (`app-web/src/features/solicitudes/services/solicitudes-service.ts:127-222`).
  - **Excepción: Gestión Global.** No recalcula artículo por artículo. Hace tres cosas:
    1. deriva el multiplicador;
    2. si corresponde, consulta los hallazgos con SQL;
    3. guarda **una sola fila resumen** (`solicitudes-service.ts:178-191`).
- **Paso 5, al aprobar.** Lo que se escribe depende del proceso
  (`app-web/src/features/solicitudes/services/solicitudes-service.ts:441-508`):

| Proceso (pestaña) | Clave interna | ¿Qué escribe en Softland al aprobar? |
|---|---|---|
| Gestión Global | `FACTOR_PRECIO` | El **factor de toda la lista** en `dbo.GESTION_LISTAS_PRECIOS` |
| Precio Base | `MAYOREOD_MASIVO` | El **precio** de cada artículo en `ARTICULO_PRECIO` (lista MAYOREOD) |
| Descuento Artículo-Lista | `DESCUENTO_LISTA_PRECIO` | Un **factor por artículo y lista** en `U_FACTOR_ARTICULO` |
| Margen de Utilidad | `MARGEN_UTILIDAD_MASIVO` | El **% de reducción** por artículo en la UDF `U_FACTOR_REDUCCION` |

**Nombres de tablas y SP.**
- La mayoría de los nombres salen del mapa de objetos SQL por compañía (`app-web/src/server/companies.ts:69-87`).
- Excepción: `[dbo].[GESTION_LISTAS_PRECIOS]` está fijo en el código (`pricing-repository.ts:95`, `:121`).
- El SP de la etapa 2 **no** sale de ese mapa: su nombre `SP_GESTION_LISTAS_PRECIOS_FULL` está fijo en
  `app-web/src/features/ejecucion/repository/ejecucion-repository.ts:131`.

**Importante:**
- El portal **no** recalcula los precios de todas las listas. Gestión Global y Descuento solo guardan
  **factores**; quien los convierte en precios es el SP de la etapa 2.
- **No sabemos qué versión de ese SP está desplegada.** El repo solo contiene propuestas, que se comparan en la sección 7:
  - una definición propuesta de `FULL` en `docs/Especificacion_Automatizacion_Listas_de_Precio.md:357`;
  - la variante `backend/sql/SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO.sql`;
  - la V2 de Costa Rica en `docs/implementacion_redondeo_articulo_precio_v2/03_sp_original_corregido.sql`.
- Esas propuestas no coinciden entre sí.

---

## 2. Piezas comunes (se usan en todos los procesos)

### 2.1 De dónde salen los datos de cada artículo

Para cada artículo, el portal lee de Softland la **versión activa** de la lista
(`app-web/src/features/solicitudes/repository/pricing-repository.ts:524-569`):

| Dato en el motor | Columna de Softland |
|---|---|
| `precioActual` | `ARTICULO_PRECIO.PRECIO` |
| `costoReposicion` (costo) | `ARTICULO.COSTO_PROM_DOL` |
| `margenUtilidadMin` | `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN` |

- La "versión activa" es la `VERSION_NIVEL` con `ESTADO = 'A'` y la versión más alta.
- **Margen:** `MARGEN_UTILIDAD_MIN` se lee como **porcentaje** y el portal lo divide entre 100, de modo que 20 se
  convierte en 0,20 (`app-web/src/features/solicitudes/services/catalog-context.ts:10-13`, `:30-32`).
- **Costo:** si `COSTO_PROM_DOL` viene nulo, al mapearlo se convierte en **0**
  (`pricing-repository.ts:616-621`).

### 2.2 Margen mínimo y precio mínimo

- **Margen mínimo efectivo:**
  - Si el artículo tiene un valor válido en [0, 1), se usa ese.
  - Si no, se usa el **20 % global** (`MARGEN_MINIMO_GLOBAL = 0.2`).
  - Código: `app-web/src/features/solicitudes/utils/catalog.ts:31`, `:148-158`.
- **Precio mínimo** (el precio más bajo que respeta el margen):

  ```
  precio mínimo = costo / (1 − margen mínimo)
  ```

  - Código: `app-web/src/features/solicitudes/utils/catalog.ts:160-165`.
  - Si el margen es 0, el precio mínimo es simplemente el costo.

Ejemplo (motor real) con costo 70 y margen 20 %:
- Precio mínimo = 70 / 0,8 = **87,5**.
- Con costo 85, el precio mínimo es **106,25**.

### 2.3 De porcentaje a multiplicador

El usuario escribe una **magnitud sin signo** y elige **Aumento** o **Disminución**
(`app-web/src/features/solicitudes/utils/engine.ts:90-115`, `:58-75`):

```
multiplicador = 1 + (signo × magnitud / 100)      signo = +1 Aumento, −1 Disminución
válido solo si 0 < multiplicador ≤ 2               (variación en el intervalo (−100 %, +100 %])
```

| Entrada | Multiplicador | ¿Válido? |
|---|---|---|
| Aumento 10 | 1,10 | sí |
| Disminución 15 | 0,85 | sí |
| Disminución 100 | 0 | **no** (daría precio 0) |
| Aumento 150 | 2,5 | **no** (> 2) |

**Detalle de precisión:** para calcular el precio, el multiplicador se **redondea a 4 decimales**
(`textoFactorCalculado` usa `toFixed(4)`; `engine.ts:46-48`, `:237-244`, `:432`).

```
factor usado     = (1 ± %/100) con 4 decimales
precio propuesto = round2(precio × factor usado)
```

- Ejemplo (motor real): precio 10.000 con un aumento de 7,12345 %.
  - El factor matemático es 1,0712345, pero el cálculo usa 1,0712.
  - El propuesto es **10.712**, no 10.712,35.
- Qué precisión se guarda depende del proceso:
  - En Gestión Global y en el Descuento manual, el multiplicador guardado conserva la precisión completa.
  - Gestión Global lo envía a SQL con 8 decimales (`pricing-repository.ts:112`).
  - En el **Descuento por Excel**, el multiplicador ya redondeado a 4 decimales es el que se guarda (`engine.ts:229`, `:432`; `requests-repository.ts:696`).

### 2.4 Redondeo comercial (12 bandas)

Todo precio propuesto se redondea con `redondearPrecioComercial`
(`app-web/src/shared/utils/rounding.ts:34-93`). Hay tres formas de redondear:

- **Por exceso** (bandas 1 a 4): se lleva al **múltiplo del paso igual o superior** (`Math.ceil`).
  Un múltiplo exacto se queda igual.
- **Precio único** (banda 5): siempre devuelve 4,99.
- **Terminal más cercano** (bandas 6 a 12):
  - Se calculan los dos terminales vecinos de la banda, el inferior y el superior.
  - Se elige el más cercano.
  - **Si empatan, gana el superior.**

| Banda | Hasta (límite superior, incluido) | Tipo | Regla |
|---|---|---|---|
| 1 | 0,50 | exceso | múltiplo de 0,01 |
| 2 | 1,00 | exceso | múltiplo de 0,05 |
| 3 | 2,50 | exceso | múltiplo de 0,10 |
| 4 | 4,75 | exceso | múltiplo de 0,25 |
| 5 | 5,15 | único | 4,99 |
| 6 | 10,15 | terminal | ,29 / ,49 / ,69 / ,99 |
| 7 | 50,24 | terminal | ,49 / ,99 |
| 8 | 99,99 | terminal | ,99 |
| 9 | 500 | terminal | decenas terminadas en 3 / 5 / 7 / 9 |
| 10 | 1.000 | terminal | decenas terminadas en 0 / 5 |
| 11 | 5.000 | terminal | centenas terminadas en 30 / 50 / 70 / 90 |
| 12 | 100.000 | terminal | centenas terminadas en 50 / 90 |
| — | < 0,01 o > 100.000 | — | **FUERA_DE_RANGO** (sin precio) |

**Cómo se elige la banda:** solo se comparan los **límites superiores** (`rounding.ts:56-65`). Un precio que pasa
el "hasta" de una banda cae en la siguiente. Por eso:
- 0,505 cae en la banda 2;
- 500,5 cae en la banda 10.

Ejemplos reales del motor:

| Precio | Redondeado | Banda |
|---|---|---|
| 0,333 | 0,34 | 1 |
| 0,73 | 0,75 | 2 |
| 1,234 | 1,30 | 3 |
| 3,10 | 3,25 | 4 |
| 4,90 | 4,99 | 5 |
| 7,60 | 7,69 | 6 |
| 10,15 | 10,29 | 6 |
| 10,16 | 9,99 | 7 |
| 13,195 | 12,99 | 7 |
| 75,40 | 74,99 | 8 |
| 104 | 105 (empate 103/105, gana el superior) | 9 |
| 110 | 109 | 9 |
| 754 | 755 | 10 |
| 1.234 | 1.230 | 11 |
| 12.681,20 | 12.690 | 12 |
| 100.001 | — | fuera de rango |

En T-SQL existe una réplica de esta función (`backend/sql/fn_RedondeoComercial.sql`), pensada
para que la use el SP.

### 2.5 Cómo se clasifica cada fila

El motor clasifica cada fila (`app-web/src/features/solicitudes/utils/engine.ts:128-217`,
`app-web/src/shared/types/domain-types.ts:309-322`):

| Clase | Cuándo | ¿Se envía? |
|---|---|---|
| **Válida** | Todo correcto | Sí |
| **Hallazgo de margen** (`ALERTA_MARGEN`) | El precio **redondeado** queda por debajo del precio mínimo | Sí, salvo bloqueo (ver abajo) |
| **Error duro** | Artículo inexistente, formato inválido, precio 0 o negativo, lista inválida, multiplicador fuera de rango | **No**: se descarta (`solicitudes-service.ts:206-208`) |

**Dos salvedades importantes:**
1. **Los hallazgos se envían, pero al aprobar no se aplican.** Se guardan con `ESTADO_FILA = 'ERROR'` y la
   aplicación por lotes los omite (anexo A.2).
2. **Fuera de rango no es un error en los procesos de precio.**
   - Si el precio supera 100.000, el redondeo devuelve nulo y se valida con el precio sin redondear.
   - La fila puede quedar **válida** con estado `FUERA_DE_RANGO` (`engine.ts:183-216`).
   - Ejemplo (motor real): 100.001 con costo 70 da una fila válida.
   - Solo el proceso de Margen lo rechaza expresamente (`engine.ts:351-357`).

**Bloqueo por lista:** si la lista que se consulta tiene `GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_MARGEN_MIN = 1`,
una solicitud con hallazgos **no se puede enviar**
(`app-web/src/features/solicitudes/services/solicitudes-service.ts:55-106`).
- Para Gestión Global, los hallazgos se cuentan con una consulta SQL.
- Para el resto de procesos, se cuentan las filas.
- La lista que se consulta depende del proceso (`solicitudes-service.ts:99-101`):
  - en Descuento, la lista de cada fila;
  - en Precio Base y en **Margen**, siempre **MAYOREOD**, aunque en Margen se haya simulado con otra lista.
- Al aprobar, la revalidación es parcial (anexo A.3).

### 2.6 Reglas del flujo de aprobación

- Nadie aprueba su propia solicitud (`solicitudes-service.ts:346`).
- Solo aprueba quien tiene el rol APROBADOR (`solicitudes-service.ts:350`).
- La aplicación corre en segundo plano (`solicitudes-service.ts:405`).
- El estado final se calcula con los conteos **de las filas que el lote consideró**, no de todas las enviadas
  (`solicitudes-service.ts:500-523`):

  | Situación | Estado final |
  |---|---|
  | Ninguna fila fallida (también con `total = 0`) | `PROCESADO` |
  | Algunas filas fallidas | `PROCESADO_CON_ERRORES` |
  | Todas las filas fallidas, o hubo una excepción | `ERROR_EJECUCION` |

---

## 3. Gestión Global (`FACTOR_PRECIO`)

**Qué hace:** configura un **factor para toda una lista**, que se aplica sobre los precios de su **lista base o padre**.
No se aplica sobre el precio actual de la propia lista, salvo que ella misma sea su base.

**Qué captura el usuario:** la lista, el tipo (Aumento o Disminución) y la magnitud en %.

**Cómo simula:**
1. Busca en `GESTION_LISTAS_PRECIOS` la **lista padre** (`NIVEL_PRECIO_BASE`).
   Si no tiene, la lista es su propia base
   (`app-web/app/api/simulacion/gestion-global/route.ts:33-40`).
2. Lee **de la lista padre** el precio y también el `MARGEN_UTILIDAD_MIN`
   (`app-web/src/features/solicitudes/repository/pricing-repository.ts:659-661`, `:695`, `:711-715`).
   Por eso la validación usa el margen mínimo de la lista padre, no el de la lista destino.
3. Para cada artículo calcula (`app-web/src/features/solicitudes/utils/engine.ts:468-484`):

   ```
   precio propuesto = round2(precio padre × multiplicador con 4 decimales)
   ```

   Luego redondea y valida contra el precio mínimo.

**Ejemplo (motor real):** artículo con precio 100, costo 70 y margen 20 % (precio mínimo 87,5).

| Variación | Multiplicador | Propuesto | Redondeado | Resultado |
|---|---|---|---|---|
| Aumento 10 % | 1,10 | 110 | 109 | válido |
| Disminución 15 % | 0,85 | 85 | 84,99 | **hallazgo**: 84,99 < 87,5 |

**Hallazgos con el filtro "solo hallazgos" (y para el bloqueo al enviar):** se calculan con SQL directo, sin el motor
(`app-web/src/features/solicitudes/repository/pricing-repository.ts:1004-1136`).
- Se hacen dos consultas: el conteo y la página.
- La condición es `PRECIO × factor < COSTO_PROM_DOL / (1 − margen)`.
- Usa el precio **sin redondear**. El código lo marca como una aproximación (`:1041-1043`).
- Puede discrepar del motor en ambos sentidos (anexo A.8).

**Qué se guarda al enviar:** una sola **fila resumen**, no el detalle por artículo
(`app-web/src/features/solicitudes/services/solicitudes-service.ts:178-191`, `:924-964`).

**Qué se escribe al aprobar:** un `UPDATE` en `dbo.GESTION_LISTAS_PRECIOS`
(`app-web/src/features/solicitudes/repository/pricing-repository.ts:48-156`).
- Escribe tres columnas:

  | Columna | Valor guardado | Ejemplo |
  |---|---|---|
  | `FACTOR_MULTIPLICADOR` | El multiplicador, hasta 8 decimales | 0,85 |
  | `VARIACION_PORC` | La magnitud **sin signo** | 15 |
  | `TIPO_VARIACION` | El sentido de la variación | `DISMINUCION` |

- La versión actualizada es la **más alta que también existe en `VERSION_NIVEL`**, **sin exigir `ESTADO = 'A'`**
  (`:94-101`, `:117-124`). Así lo definió el contrato funcional.
- **No toca ningún precio.** El precio cambia cuando se corre el SP de la etapa 2 (sección 7), que lee este factor.

---

## 4. Precio Base (`MAYOREOD_MASIVO`)

**Qué hace:** fija un **precio absoluto** por artículo en la lista raíz **MAYOREOD**. La lista está fija en el código:
- `app-web/src/features/solicitudes/services/solicitudes-service.ts:49`, `:150`;
- `app-web/src/features/solicitudes/repository/pricing-repository.ts:1291`.

**Qué captura el usuario:** un Excel con las columnas `Articulo | Precio`
(`app-web/src/features/solicitudes/services/simulation-service.ts:121-126`).

**Cómo valida:** el precio capturado se toma **tal cual**, en modo `"precio"`
(`app-web/src/features/solicitudes/utils/engine.ts:406-412`, `:171-175`). Luego:
1. Se redondea **solo para validar**: el precio redondeado se compara contra el precio mínimo (`engine.ts:183-202`).
2. El precio 0 o negativo es un error duro (`engine.ts:176-181`).

**Ejemplo (motor real):** artículo con costo 70 y margen 20 % (precio mínimo 87,5).

| Captura | Redondeado (solo para validar) | Resultado |
|---|---|---|
| 123,456 | 123 | válido |
| 80 | 79,99 | **hallazgo**: 79,99 < 87,5 |
| 0 | — | error: "No se permite precio igual a cero" |
| artículo inexistente | — | error: código no existe |

**Qué se guarda en el detalle:** en `PRECIO_SIMULADO` va el precio capturado **sin redondeo comercial**
(`app-web/src/features/solicitudes/repository/requests-repository.ts:689`).

**Qué se escribe al aprobar:** `ARTICULO_PRECIO.PRECIO = PRECIO_SIMULADO`, en la lista MAYOREOD y su versión activa
(`app-web/src/features/solicitudes/repository/pricing-repository.ts:1282-1365`).
- En el ejemplo, se escribe **123,456**, no 123.
- El valor viaja con 4 decimales por la tabla temporal `#DET` (`pricing-repository.ts:1193`).
- Como se valida un número y se guarda otro, puede publicarse un precio **por debajo del mínimo** (anexo A.4).
- El precio de las listas hijas (MAYOREOB, LPV…) cambia recién cuando corre el SP de la etapa 2.

---

## 5. Descuento Artículo-Lista (`DESCUENTO_LISTA_PRECIO`)

**Qué hace:** define un **factor por artículo y por lista** (por ejemplo, el artículo X lleva un 10 % menos en LPV3).

**Qué captura el usuario:**
- **Excel** con las columnas `Lista | Código | %`.
  - El % **siempre es una disminución**: 10 se convierte en 0,9000
    (`app-web/src/features/solicitudes/services/simulation-service.ts:141-143`,
    `app-web/src/features/solicitudes/utils/engine.ts:420-437`).
- **Manual:** por cada fila se eligen la lista, el tipo (Aumento o Disminución) y la magnitud
  (`app-web/src/features/solicitudes/utils/engine.ts:413-419`).

**Cómo simula:**

```
multiplicador    = 1 ± %/100            (4 decimales para el cálculo)
precio propuesto = round2(precio ACTUAL de esa misma lista × multiplicador)
```

- El precio actual viene de la propia lista destino, no de la lista base: el contexto se carga por la lista de cada fila
  (`app-web/src/features/solicitudes/services/simulation-service.ts:136-144`).
- El resto es igual que en las otras pestañas: redondeo y validación contra el precio mínimo.
- Si la lista de la fila no existe, la fila es un error duro (`engine.ts:269-277`).

**Ejemplo (motor real):** precio actual 100, costo 70, margen 20 % (precio mínimo 87,5).

| Entrada | Multiplicador | Propuesto | Redondeado | Resultado |
|---|---|---|---|---|
| Excel 10 | 0,90 | 90 | 89,99 | válido |
| Excel 25 | 0,75 | 75 | 74,99 | **hallazgo** |
| Manual Aumento 5 | 1,05 | 105 | 105 | válido |
| Lista inexistente | 0,90 | — | — | error duro |

**Qué se guarda en el detalle** (`app-web/src/features/solicitudes/repository/requests-repository.ts:688-699`):

| Columna | Valor |
|---|---|
| `FACTOR_SOLICITADO` | El multiplicador (0,9) |
| `FACTOR_APLICADO` | **1** (ver A.1) |
| `PRECIO_SIMULADO` | El precio redondeado o, si es nulo (fuera de rango), el propuesto |
| `LISTA_PRECIO` | La lista de la fila |

**Qué se escribe al aprobar:** un upsert por lotes en `U_FACTOR_ARTICULO`, con las columnas
`U_ARTICULO`, `U_NIVEL_PRECIO`, `U_FACTOR` y `U_VERSION`
(`app-web/src/features/solicitudes/repository/pricing-repository.ts:1372-1525`).
- `UPDATE` si la combinación de artículo y lista ya existe; `INSERT` si no existe.
- La versión sale de `GESTION_LISTAS_PRECIOS`.
- ⚠️ **El valor que llega a `U_FACTOR` es 1, no el multiplicador solicitado** (anexo A.1).
- **No toca precios.**
- No está demostrado que el SP desplegado lea esta tabla: de las propuestas, solo la V2 usa `U_FACTOR_ARTICULO`, y con condiciones (sección 7).

---

## 6. Margen de Utilidad (`MARGEN_UTILIDAD_MASIVO`)

**Qué hace:** registra un **porcentaje de reducción del margen mínimo** por artículo.
- La simulación muestra cómo quedaría el margen mínimo.
- La aprobación **solo escribe el porcentaje en la UDF**: no cambia `MARGEN_UTILIDAD_MIN` ni precios.

**Qué captura el usuario:** un Excel con las columnas `Codigo Articulo | Porcentaje Reduccion`.
- El porcentaje debe estar en [0, 100); por ejemplo, 10 significa 10 %.
- Los datos del artículo se leen de la lista elegida, que por defecto es MAYOREOD
  (`app-web/src/features/solicitudes/services/simulation-service.ts:97-117`).

**Cómo simula** (`app-web/src/features/solicitudes/utils/engine.ts:281-389`):

```
factor reducción       = % / 100
margen mínimo NUEVO    = max(0, margen mínimo ACTUAL × (1 − factor reducción))
precio mínimo NUEVO    = costo / (1 − margen mínimo NUEVO)
margen sobre el precio = 1 − costo / redondeo(precio de lista actual)
la fila NO cumple si   margen sobre el precio < margen mínimo NUEVO   → MARGEN_MINIMO_NO_CUMPLE
```

También calcula, solo como dato informativo, el margen promedio sobre el precio **sin redondear**:
`(precio − costo) / precio` (`engine.ts:343`).

**Ejemplo (motor real):** precio 100 (redondeado: 99), margen actual 20 %, reducción 10 %.

| Costo | Margen mínimo nuevo | Precio mínimo nuevo | Margen sobre 99 | Resultado |
|---|---|---|---|---|
| 70 | 0,20 × 0,9 = **0,18** | 85,37 | 1 − 70/99 = 0,2929 | válido |
| 85 | 0,18 | 103,66 | 1 − 85/99 = 0,1414 | **hallazgo** (`MARGEN_MINIMO_NO_CUMPLE`) |
| 70, con 100 % | — | — | — | error: `PORCENTAJE_REDUCCION_FUERA_RANGO` |

**Qué se guarda en el detalle:** en `PORCENTAJE_MARGEN` va el **porcentaje capturado**, por ejemplo 10
(`app-web/src/features/solicitudes/repository/requests-repository.ts:690`).

**Qué se escribe al aprobar:** un upsert por lotes en la UDF `U_FACTOR_REDUCCION`
(`app-web/src/features/solicitudes/repository/pricing-repository.ts:1532-1652`,
`app-web/src/features/solicitudes/services/solicitudes-service.ts:488-495`):
- `U_FACTOR_REDUCCION = PORCENTAJE_MARGEN`;
- `U_ACTIVO = 'S'`;
- la UDF se identifica **solo por artículo**, sin lista.

**Lo que haría después un SP** (`SP_CALCULAR_MARGEN_MINIMO`, según `backend/sql/SP_CALCULAR_MARGEN_MINIMO_ARTICULO.sql:71-147`):

```
margen promedio = (precio − costo) / precio
margen mínimo   = max(0, margen promedio × (1 − factor de reducción de la UDF, o 10 % por defecto))
→ ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN   (si el resultado es nulo, no se actualiza)
```

El portal tiene la función para invocarlo (`pricing-repository.ts:935-952`), pero **no la llama en ningún flujo**.
La pestaña "Ejecución → Margen" está oculta (`app-web/src/features/ejecucion/components/EjecucionTabs.tsx:9`).

---

## 7. Etapa 2: "Ejecución → Precios" (el SP de Softland)

**Qué hace la pantalla:** no forma parte de las solicitudes. Llama directamente a
`[esquema].SP_GESTION_LISTAS_PRECIOS_FULL` (`app-web/src/features/ejecucion/services/ejecucion-service.ts:40-141`,
`app-web/src/features/ejecucion/repository/ejecucion-repository.ts:127-152`).
- El usuario solo elige la lista y la versión.
- El resto de los parámetros se **releen** de `GESTION_LISTAS_PRECIOS`:
  - fechas;
  - lista base;
  - `FACTOR_MULTIPLICADOR`;
  - las banderas de validación (bajo costo, factor exigido, excepciones y margen mínimo).
- El resultado queda registrado en `EJECUCION_LOG`.

**Qué calcula el SP:** no se sabe con certeza, porque no sabemos qué versión está desplegada. La idea común de las propuestas es:

```
precio destino = precio base × factor global (Gestión Global) × factor artículo-lista
```

Pero cada propuesta lo implementa distinto:

| Propuesta | De dónde toma el factor por artículo | Qué precio persiste | Notas |
|---|---|---|---|
| `FULL` propuesto (`docs/Especificacion_Automatizacion_Listas_de_Precio.md:357`, `:490-502`) | `DESCUENTO_LISTA_PRECIO` | El precio **calculado, sin redondeo comercial** | Su firma no coincide con todos los parámetros que envía el portal (`ejecucion-repository.ts:133-146`) |
| `CON_REDONDEO` (`backend/sql/SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO.sql:197-320`) | `DESCUENTO_LISTA_PRECIO` (`:223`) | El precio **calculado** (`:365`, `:411`): el redondeado solo se usa para validar | El redondeo se puede apagar (`:245-246`). Las validaciones de bajo costo y margen dependen de `@p_validar_precio_bajo_costo` (`:306-315`) |
| V2 Costa Rica (`docs/implementacion_redondeo_articulo_precio_v2/03_sp_original_corregido.sql:4-13`) | `U_FACTOR_ARTICULO`, **solo si la base es MAYOREO y el destino es otra lista**. Lo filtra solo por artículo (sin lista ni versión) y rechaza artículos duplicados (`:74-88`) | Persiste **`U_PRECIO_TECNICO`** (sin redondear) y **`PRECIO` redondeado** | Parte de `U_PRECIO_TECNICO` y aplica también el `% U_DCTO_LPVn` |

**Otros cálculos de las propuestas:**
- `MARGEN_UTILIDAD = 1 − costo / precio`.
- `MARGEN_MULR = 1 − costo / (precio base / factor final)`, una fórmula histórica distinta del margen sobre el precio de venta.
- Se rechaza el **factor combinado** fuera de (0, 2]: dos factores válidos por separado pueden dar un producto inválido
  (`SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO.sql:282-299`).

**Pieza de la fórmula que aporta cada pestaña:**

| Pestaña | Pieza de la fórmula |
|---|---|
| Precio Base | Precio base: el portal escribe `PRECIO`, pero la V2 lee `U_PRECIO_TECNICO`, así que con la V2 el cambio no llegaría solo (`pricing-repository.ts:1328`; `03_sp_original_corregido.sql:110-112`) |
| Gestión Global | Factor global |
| Descuento | Factor artículo-lista, si el SP desplegado lee `U_FACTOR_ARTICULO` |
| Margen | Margen mínimo con el que se valida, si alguien corre el SP de margen |

---

## 8. Resumen rápido

| Proceso | Entrada | Fórmula en el portal | Se valida con | Se escribe al aprobar |
|---|---|---|---|---|
| Gestión Global | Lista + Aumento/Disminución + % | `precio padre × (1 ± %/100)` (factor de 4 decimales) | Precio redondeado ≥ precio mínimo (de la lista padre; los hallazgos van por SQL sin redondear) | `GESTION_LISTAS_PRECIOS.FACTOR_MULTIPLICADOR` |
| Precio Base | Artículo + precio | Precio = captura | Precio **redondeado** ≥ precio mínimo | `ARTICULO_PRECIO.PRECIO` (MAYOREOD) con el precio **capturado** |
| Descuento | Lista + artículo + % | `precio actual de la lista × (1 ± %/100)` | Precio redondeado ≥ precio mínimo | `U_FACTOR_ARTICULO.U_FACTOR` (hoy llega 1, ver A.1) |
| Margen | Artículo + % de reducción | `margen actual × (1 − %/100)` | `1 − costo/redondeo(precio)` ≥ margen nuevo | `U_FACTOR_REDUCCION` = % |

En los tres procesos que se aplican por lotes (Precio Base, Descuento y Margen), **las filas con hallazgo no se aplican al aprobar** (A.2).
Gestión Global no tiene detalle por artículo: si el flag permitió enviar, el factor global se actualiza aunque haya hallazgos (`solicitudes-service.ts:454-464`).

---

## Anexo A — Observaciones y cosas a verificar

Son diferencias encontradas al leer el código. Las confirmé yo y las confirmó Codex.
**No se corrigió nada.** Antes de actuar conviene validarlas con datos de QA.

**A.1 Descuento: `U_FACTOR` se graba como 1 en lugar del multiplicador.** *(Confirmado.)*
1. Las filas nuevas no traen `factorAplicado`, así que se guarda `FACTOR_APLICADO = 1`
   (`app-web/src/features/solicitudes/repository/requests-repository.ts:688`).
   El multiplicador real va en `FACTOR_SOLICITADO` (`:696`).
2. Al aprobar, el upsert escribe `U_FACTOR = D.FACTOR_APLICADO`
   (`app-web/src/features/solicitudes/repository/pricing-repository.ts:1405`, `:1445`, `:1483`).
3. Recién **después** se ejecuta `markDetailsApplied`, que copia `FACTOR_SOLICITADO` en `FACTOR_APLICADO`
   (`app-web/src/features/solicitudes/services/solicitudes-service.ts:471-472`, `requests-repository.ts:645-662`).
4. Resultado: el detalle del portal termina mostrando 0,9, mientras que Softland recibió 1.

**A.2 Los hallazgos de margen no se aplican al aprobar.** *(Confirmado.)*
1. El mapper del detalle solo genera dos valores, `OK` y `ERROR`. Un hallazgo es `valido = false`, así que se guarda como `ERROR`
   (`requests-repository.ts:691-692`).
2. La aplicación por lotes solo toma las filas con `ESTADO_FILA IN ('OK', 'HALLAZGO')`
   (`pricing-repository.ts:1174`).
3. Por lo tanto, las filas con hallazgo **nunca se escriben** en Softland. Esto contradice `esFilaProcesable`
   (`domain-types.ts:315-322`).
4. Los totales salen de `#DET`, que no incluye esas filas (`pricing-repository.ts:1341-1343`, `:1494-1502`, `:1623-1629`).
   Por eso la solicitud puede terminar como `PROCESADO` sin avisar que se omitieron, incluso con cero filas aplicadas.

**A.3 Al aprobar, `VALIDAR_PRECIO_BAJO_MARGEN_MIN` se revalida solo en parte.** *(Confirmado parcialmente.)*
- **Precio Base:** sí relee el flag vigente y bloquea si el detalle guardado tiene hallazgos. No recalcula con costos o precios nuevos
  (`solicitudes-service.ts:373-383`, `:420-429`).
- **Gestión Global:** cuenta la fila resumen, que siempre es válida, así que nunca bloquea al aprobar.
- **Descuento y Margen:** no hacen la comprobación (`solicitudes-service.ts:430-436`).

**A.4 Precio Base valida un precio y guarda otro.** *(Confirmado.)*
- Valida con el precio redondeado (`engine.ts:183-186`), pero persiste el capturado (`requests-repository.ts:689`, `pricing-repository.ts:1328`).
- `docs/contrato-funcional-procesamiento-real.md:20` dice que "se persiste el precio redondeado comercial".
- **Ejemplo (motor real):** costo 84 y margen 20 %, así que el mínimo es 105.
  - Se captura **104**, que redondea a **105** (empate entre 103 y 105, gana el superior).
  - La validación pasa y se publica **104**, con un margen del 19,23 %, menor al exigido.

**A.5 Margen: la fórmula del portal no es la del SP.** *(Confirmado frente al SQL de referencia.)*

| Fuente | Fórmula | Resultado para el artículo de ejemplo (precio 100, costo 70, margen actual 20 %, reducción 10 %) |
|---|---|---|
| Portal | `margen ACTUAL × (1 − %)` | 0,18 |
| SP (propuesta) | `margen PROMEDIO = (precio − costo)/precio` × `(1 − factor)` | 0,30 × 0,9 = **0,27** |

El 0,27 supone que el SP recibe el factor como 0,10. Con el 10 que escribe el portal aplica A.6.

**A.6 Margen: unidades y nombre de la UDF de reducción.** *(Confirmado.)*
- **Unidades:**
  - El portal escribe el **porcentaje crudo**, por ejemplo 10 (`pricing-repository.ts:1565`, `:1590`).
  - `SP_CALCULAR_MARGEN_MINIMO_ARTICULO.sql:85-94` lo usa **sin dividir entre 100**, como si fuera una fracción.
  - Con un margen promedio positivo, `1 − 10` es negativo y el margen mínimo terminaría en 0.
- **Documentación:**
  - Los documentos (`docs/justificacion-gestion-cambio-margen-minimo.md:15`, `backend/sql/U_FACTOR_REDUCCION_MARGEN.sql:20-23`)
    dicen que se guarda el % y que el SP lo divide entre 100.
  - Además describen la tabla **`U_FACTOR_REDUCCION_MARGEN`**, mientras que el SP del repo y el portal usan
    **`U_FACTOR_REDUCCION`** (`SP_CALCULAR_MARGEN_MINIMO_ARTICULO.sql:105`, `companies.ts:71`).

**A.7 Unidades de `MARGEN_UTILIDAD_MIN`.** *(Confirmado frente a los SQL del repo.)*
- El portal lo trata como % y lo divide entre 100 (`catalog-context.ts:10-13`).
- `SP_CALCULAR_MARGEN_MINIMO` **escribe una fracción** (`SP_CALCULAR_MARGEN_MINIMO_ARTICULO.sql:118-139`).
- `SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO.sql:262-314` lo compara como fracción.
- Si en Softland hay 0,18, el portal lo interpreta como 0,0018.

**A.8 El SQL de hallazgos de Gestión Global y el motor no siempre coinciden.** *(Confirmado.)*
El SQL compara el precio **sin redondear** (`pricing-repository.ts:1088`) y trata distinto el margen 0 (`:1064-1077`).
Esto afecta el bloqueo al enviar (`solicitudes-service.ts:84-96`).

| Caso | Precio mínimo | SQL | Motor |
|---|---|---|---|
| Margen 0, precio 100, costo 70, Disminución 15 % | SQL usa el 20 % (87,5); el motor usa el costo (70) | **hallazgo** (85 < 87,5) | **válido** (84,99 ≥ 70) |
| Precio 105,10, costo 84,04, margen 20 % | 105,05 | no hay hallazgo | **hallazgo** (redondea a 105) |
| Precio 104,20, costo 83,60, margen 20 % | 104,50 | **hallazgo** | válido (redondea a 105) |

**A.9 Descuento: la simulación puede no coincidir con lo que publique el SP.** *(Confirmado en el portal.)*
- La simulación aplica el factor sobre el **precio actual de la lista destino** (`simulation-service.ts:136-144`), que puede incluir un factor anterior.
- Las propuestas de SP recalculan desde el **precio base**.
- No está acreditado que el SP desplegado lea el factor que escribe el portal: las tablas difieren, y además está A.1.

**A.10 Gestión Global: la simulación no incluye el factor por artículo.** *(Confirmado en el portal.)*
- La simulación usa `precio padre × factor global` (`engine.ts:468-484`).
- Las propuestas de SP sí multiplican un factor por artículo:
  - `CON_REDONDEO` lo toma de `DESCUENTO_LISTA_PRECIO`;
  - V2 lo toma de `U_FACTOR_ARTICULO`, bajo condiciones.

**A.11 El redondeo del portal no sigue la regla de "conservar el bloque".** *(Confirmado.)*
- El requerimiento del 2026-09-10 (`docs/Requerimiento_ precio original y redondeo de listas 2026-09-10.md:61-86`) espera:
  - `10,16 → 10,49`;
  - `13,195 → 13,49`.
- El portal (`rounding.ts:82-92`) busca el terminal más cercano **global** y devuelve:
  - `10,16 → 9,99`;
  - `13,195 → 12,99`.
- Matiz: el propio requerimiento todavía lista "conservar el bloque" como decisión pendiente de aprobar (`:73`).

**A.12 El `.sql` CON_REDONDEO se contradice.** *(Confirmado.)*
- La cabecera dice que "el PRECIO_REDONDEADO es el que se persiste" (`SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO.sql:16-17`).
- El código escribe `PRECIO_A_PERSISTIR = PRECIO_CALCULADO`, que es el precio sin redondear (`:355-365`, `:411`).

**A.13 Funciones del repositorio que nunca se invocan.** *(Confirmado por búsqueda.)*
`runMarginSp` y `runListManagementSp` existen en `pricing-repository.ts:935-975` pero no se llaman.
Tampoco las variantes no-batch: `upsertArticleListFactors`, `updateBasePrices` y `upsertUdfs`.

**A.14 Precios fuera de rango pasan como válidos.** *(Confirmado con el motor.)*
- Gestión Global, Precio Base y Descuento no rechazan un precio mayor que 100.000 (`engine.ts:183-216`).
- Ejemplo: 100.001 da una fila válida con estado `FUERA_DE_RANGO`.
- Margen sí lo rechaza (`engine.ts:351-357`).

**A.15 Costo nulo.** *(Confirmado.)*
- En el catálogo, un `COSTO_PROM_DOL` nulo se convierte en 0 (`pricing-repository.ts:616-621`).
  Con costo 0 el precio mínimo es 0, así que el motor nunca marca hallazgo.
- El SQL de hallazgos, en cambio, excluye esos artículos (`pricing-repository.ts:1086-1087`).
