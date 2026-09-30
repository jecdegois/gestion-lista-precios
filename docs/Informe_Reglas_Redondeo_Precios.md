# Informe Técnico de Especificación
## Reglas y Simulaciones de Redondeo de Precios (Moneda Nacional)

> **Fuente:** `Simulador_redondeo_precios.xlsm` · Hojas: Simulador, Reglas, Cálculos
> **Elaborado por:** Análisis Senior · **Fecha:** 03/09/2026 · **Estado:** Validado (27/27 casos de prueba OK)

---

> **Convención de lectura de este informe:**
>
> - 📊 **PARTE I** — Todo lo que está **extraído y verificado directamente del archivo Excel** (hechos, reglas, fórmulas, algoritmos, casos de prueba). Esta parte es la verdad de negocio tal cual existe hoy.
> - 💡 **PARTE II** — Todo lo que es **propuesta y recomendación del analista** para construir un sistema que cumpla con esas reglas. Incluye diseño de API, arquitectura, campos de salida y decisiones de implementación.

---

# PARTE I — ANÁLISIS DEL ARCHIVO EXCEL (Hechos extraídos)

*Todo el contenido de esta parte fue extraído directamente de las hojas «Simulador», «Reglas» y «Cálculos» del archivo `Simulador_redondeo_precios.xlsm`. Las fórmulas fueron leídas celda a celda, y el algoritmo fue replicado en Python con 27/27 casos de prueba correctos.*

---

## 1. Resumen del modelo de redondeo

El libro define un modelo que toma un **precio calculado (bruto) en moneda nacional** y lo transforma en un **precio comercial «presentable»**, aplicando distintas estrategias según el rango de valor:

- Múltiplos crecientes en montos bajos.
- Un precio único fijo en una banda de transición.
- Terminales psicológicas (…,99; …,49; etc.) en montos medios y altos.

**Alcance verificado:**

- **12 bandas** de precio contiguas que cubren desde **0,01 hasta 100.000,00**.
- **3 tipos** de redondeo: «Por exceso», «Precio único» y «Terminal más cercano».
- Regla de desempate explícita: ante igual diferencia absoluta se elige **SIEMPRE el terminal superior**.
- Valores fuera del rango [0,01; 100.000] → estado «Fuera de rango» (no se produce precio).

---

## 2. Flujo de cálculo (tal como lo implementa el libro)

El simulador ejecuta 4 pasos para cada precio de entrada **P**:

1. **Validación de rango:** si P < 0,01 o P > 100.000 → estado «Fuera de rango».
2. **Clasificación de banda:** se determina a qué banda (1..12) pertenece P contando cuántos límites superiores supera (columna C del Simulador).
3. **Selección de estrategia:** cada banda define un Tipo de redondeo y sus parámetros: paso, período, offsets o precio fijo (columnas D–H, via INDEX sobre la hoja Reglas).
4. **Cálculo del precio redondeado:** según el tipo de la banda (columna L), más metadatos de variación y sentido (M–Q).

**Interpretación de límites (nota explícita del autor del libro, celda A18 de «Reglas»):**

> Los límites superiores son inclusivos. Si el cálculo produce más de dos decimales, cualquier valor mayor al límite superior de una banda pasa a la siguiente (por ejemplo, 0,504 usa la banda de 0,05). El intervalo mostrado originalmente como «1,01 – 5.000» se normaliza como 1.001 – 5.000 para evitar solapamiento con 501 – 1.000.

---

## 3. Tabla maestra de reglas

Reproducción exacta de la hoja «Reglas» (rango E5:R16). Estos son los **parámetros de negocio** que definen el comportamiento del redondeo.

| N° | Desde | Hasta | Tipo | Paso | Período | Offsets / Terminales | Precio fijo |
|----|-------|-------|------|------|---------|----------------------|-------------|
| 1  | 0,01  | 0,50  | Por exceso | 0,01 | — | múltiplo de 0,01 | — |
| 2  | 0,51  | 1,00  | Por exceso | 0,05 | — | múltiplo de 0,05 | — |
| 3  | 1,01  | 2,50  | Por exceso | 0,10 | — | múltiplo de 0,10 | — |
| 4  | 2,51  | 4,75  | Por exceso | 0,25 | — | múltiplo de 0,25 | — |
| 5  | 4,76  | 5,15  | Precio único | — | — | — | **4,99** |
| 6  | 5,16  | 10,15 | Terminal más cercano | — | 1 | 0,29 · 0,49 · 0,69 · 0,99 | — |
| 7  | 10,16 | 50,24 | Terminal más cercano | — | 1 | 0,49 · 0,99 | — |
| 8  | 50,25 | 99,99 | Terminal más cercano | — | 1 | 0,99 | — |
| 9  | 100   | 500   | Terminal más cercano | — | 10 | últ. dígito 3 · 5 · 7 · 9 | — |
| 10 | 501   | 1.000 | Terminal más cercano | — | 10 | últ. dígito 0 · 5 | — |
| 11 | 1.001 | 5.000 | Terminal más cercano | — | 100 | últ. 2 díg. 30 · 50 · 70 · 90 | — |
| 12 | 5.001 | 100.000 | Terminal más cercano | — | 100 | últ. 2 díg. 50 · 90 | — |

**Detalle de offsets (hoja «Cálculos», columnas E–H):**

- La hoja usa siempre **4 offsets** por banda. Cuando una banda tiene menos terminales reales, los sobrantes se rellenan repitiendo el último (p. ej. banda 7 = 0,49 · 0,99 · 0,99 · 0,99). Los duplicados no cambian el resultado.
- En bandas 9–12 los offsets son **dígitos finales** dentro del período (período 10 → offsets 3/5/7/9 = «…3, …5, …7, …9»; período 100 → 30/50/70/90 = «…30, …50, etc.»).
- Banda 10: offset 0 representa la terminal «…0» (p. ej. 500, 510).

---

## 4. Algoritmos de redondeo por tipo

### 4.1 Clasificación de banda (columna C del Simulador)

Se cuenta cuántos límites superiores (H5:H15) supera el precio:

```
si P < 0.01 o P > 100000:  → banda = 0  (Fuera de rango)
sino:
  banda = 1
  para cada límite superior H de bandas 1..11:
     si P > H:  banda += 1
```

Consecuencia: límites superiores **inclusivos**. P = 0,50 → banda 1; P = 0,5001 → banda 2.

### 4.2 Tipo «Por exceso» (bandas 1–4)

Fórmula (columna L): `ROUNDUP(P / paso, 0) * paso`, redondeado a 2 decimales.

```
precio = ROUND( CEILING(P / paso) * paso , 2 )

Ejemplos del libro:
  0,377  paso 0,01  →  0,38
  0,504  paso 0,05  →  0,55
  1,014  paso 0,10  →  1,10
  2,51   paso 0,25  →  2,75
  4,75   paso 0,25  →  4,75  (ya es múltiplo: sin cambio)
```

### 4.3 Tipo «Precio único» (banda 5: 4,76–5,15)

Fórmula (columna L): devuelve directamente el valor de la columna Q de Reglas.

```
precio = 4,99   (para todo P en [4,76 ; 5,15])
```

### 4.4 Tipo «Terminal más cercano» (bandas 6–12)

Algoritmo completo extraído de la hoja «Cálculos» (columnas J–T):

**Parámetros:** `D` = período (col. L de Reglas); offsets = lista de terminales (cols. M–P de Reglas).

```
D = período de la banda
J = FLOOR(P / D) * D              ← col. J: inicio del período que contiene a P

Para cada offset off (cols. E–H de Cálculos):
   inferior = (J + off)   si (J + off) ≤ P   sino  (J − D + off)    ← cols. K–N
   superior = (J + off)   si (J + off) ≥ P   sino  (J + D + off)    ← cols. O–R

S = MAX(inferiores)       ← col. S: terminal inferior (el mayor candidato ≤ P)
T = MIN(superiores)       ← col. T: terminal superior (el menor candidato ≥ P)

Selección final (columna L del Simulador):
   si ROUND(P − S, 6) < ROUND(T − P, 6):  precio = S
   sino:                                    precio = T    ← incluye el empate
   precio = ROUND(precio, 2)
```

**⚠️ Regla de desempate:** si la distancia a S es IGUAL a la distancia a T, se elige **T (el superior)**. Esto está codificado en la fórmula de la columna L: `IF(ROUND(B-J,6) < ROUND(K-B,6), J, K)` — el `<` estricto hace que el empate caiga en el segundo argumento (K = terminal superior).

### 4.5 Ejemplo paso a paso (P = 48,75 — caso por defecto del simulador)

- **Banda:** 48,75 está en 10,16–50,24 → banda 7 (Terminal más cercano; D=1; offsets 0,49 y 0,99).
- **Base:** J = FLOOR(48,75 / 1) × 1 = 48.
- **Inferiores:** 48+0,49 = 48,49 (≤48,75 ✓); 48+0,99 = 48,99 >48,75 → 48−1+0,99 = 47,99. **S = MAX = 48,49**.
- **Superiores:** 48+0,49 = 48,49 <48,75 → 48+1+0,49 = 49,49; 48+0,99 = 48,99 (≥48,75 ✓). **T = MIN = 48,99**.
- **Distancias:** |48,75−48,49| = 0,26 ; |48,99−48,75| = 0,24. Superior más cerca → **precio = 48,99**.

---

## 5. Matriz de pruebas (extraída del libro, columna P del Simulador)

Estos son los **27 casos de prueba definidos en el propio libro** con su resultado esperado. Todos fueron validados: **27/27 correctos**.

| Caso | P | Banda | Tipo | Esperado | | Caso | P | Banda | Tipo | Esperado |
|------|---|-------|------|----------|---|------|---|-------|------|----------|
| 1 | 0,377 | 1 | Exceso | 0,38 | | 15 | 50,24 | 7 | Terminal | 50,49 |
| 2 | 0,504 | 2 | Exceso | 0,55 | | 16 | 50,25 | 8 | Terminal | 49,99 |
| 3 | 0,51 | 2 | Exceso | 0,55 | | 17 | 99,99 | 8 | Terminal | 99,99 |
| 4 | 0,999 | 2 | Exceso | 1,00 | | 18 | 100 | 9 | Terminal | 99 |
| 5 | 1,014 | 3 | Exceso | 1,10 | | 19 | 124 | 9 | Terminal | 125 |
| 6 | 2,51 | 4 | Exceso | 2,75 | | 20 | 500 | 9 | Terminal | 499 |
| 7 | 4,75 | 4 | Exceso | 4,75 | | 21 | 501 | 10 | Terminal | 500 |
| 8 | 4,76 | 5 | Único | 4,99 | | 22 | 1.000 | 10 | Terminal | 1.000 |
| 9 | 5,15 | 5 | Único | 4,99 | | 23 | 1.001 | 11 | Terminal | 990 |
| 10 | 5,16 | 6 | Terminal | 5,29 | | 24 | 5.000 | 11 | Terminal | 4.990 |
| 11 | 5,90 | 6 | Terminal | 5,99 | | 25 | 5.001 | 12 | Terminal | 4.990 |
| 12 | 10,15 | 6 | Terminal | 10,29 | | 26 | 100.000 | 12 | Terminal | 99.990 |
| 13 | 10,16 | 7 | Terminal | 9,99 | | 27 | 48,75 | 7 | Terminal | 48,99 |
| 14 | 25,24 | 7 | Terminal | 25,49 | | — | 100.000,01 | — | F. rango | *(sin precio)* |

---

## 6. Casos borde y decisiones de negocio (identificados en el libro)

Los siguientes puntos surgen directamente del análisis de las fórmulas y los datos del Excel:

- **Límites inclusivos:** P = 0,50 pertenece a la banda 1 (no a la 2). La frontera se decide por `> H` (estrictamente mayor).
- **Desempate al superior:** Codificado en la fórmula de columna L con `<` estricto. 25,24 equidista de 24,99 y 25,49 → resultado 25,49.
- **Banda 5 produce redondeo «por defecto»:** 5,15 → 4,99 (variación −0,16). Es un comportamiento intencional definido en el libro.
- **Fuera de rango (fila 35):** P = 100.000,01 → columna L vacía (null), estado «Fuera de rango». No se produce precio.
- **Normalización banda 11:** El intervalo original «1,01 – 5.000» fue corregido en el libro a 1.001 – 5.000 para evitar solapamiento con la banda 10 (501 – 1.000), documentado en celda A18.
- **Precisión decimal:** Las fórmulas usan `ROUND(..., 6)` para comparar distancias y `ROUND(..., 2)` para el resultado final, mitigando errores de coma flotante.

---

## 7. Implementación de referencia (Python — réplica exacta del libro)

Este código reproduce fielmente las fórmulas del libro. Fue validado contra los 27 casos: **27/27 correctos**. Sirve como oráculo de pruebas y base portable a cualquier lenguaje.

```python
import math

REGLAS = [  # (n, desde, hasta, tipo, paso, periodo, offsets, precio_fijo)
 (1, 0.01, 0.50, "exceso",   0.01, None, None,               None),
 (2, 0.51, 1.00, "exceso",   0.05, None, None,               None),
 (3, 1.01, 2.50, "exceso",   0.10, None, None,               None),
 (4, 2.51, 4.75, "exceso",   0.25, None, None,               None),
 (5, 4.76, 5.15, "unico",    None, None, None,               4.99),
 (6, 5.16, 10.15,"terminal", None, 1,   [0.29,0.49,0.69,0.99], None),
 (7, 10.16,50.24,"terminal", None, 1,   [0.49,0.99,0.99,0.99], None),
 (8, 50.25,99.99,"terminal", None, 1,   [0.99,0.99,0.99,0.99], None),
 (9, 100,  500,  "terminal", None, 10,  [3,5,7,9],           None),
 (10,501,  1000, "terminal", None, 10,  [0,5,5,5],           None),
 (11,1001, 5000, "terminal", None, 100, [30,50,70,90],       None),
 (12,5001, 100000,"terminal",None, 100, [50,90,90,90],       None),
]
MIN_P, MAX_P = 0.01, 100000

def clasificar(p):
    if p < MIN_P or p > MAX_P: return 0
    n = 1
    for r in REGLAS[:-1]:
        if p > r[2]: n += 1
    return n

def redondear(p):
    n = clasificar(p)
    if n == 0: return None
    _,_,_,tipo,paso,per,offs,fijo = REGLAS[n-1]
    if tipo == "exceso":
        return round(math.ceil(round(p/paso,9))*paso, 2)
    if tipo == "unico":
        return round(fijo, 2)
    D = per
    J = math.floor(p/D)*D
    infs = [ (J+o if J+o<=p else J-D+o) for o in offs ]
    sups = [ (J+o if J+o>=p else J+D+o) for o in offs ]
    S, T = max(infs), min(sups)
    return round(S if round(p-S,6) < round(T-p,6) else T, 2)
```

---

## Anexo A. Trazabilidad hoja → celda

| Elemento | Ubicación en el libro |
|----------|----------------------|
| Tabla de reglas (parámetros) | Hoja «Reglas», rango E5:R16 |
| Tabla de negocio (texto) | Hoja «Reglas», rango A4:C16 |
| Nota de interpretación de límites | Hoja «Reglas», celda A18 |
| Clasificación de banda | Hoja «Simulador», columna C |
| Selección de estrategia | Hoja «Simulador», columnas D–H (INDEX sobre Reglas) |
| Base del período (J) | Hoja «Cálculos», columna J |
| Candidatos inferiores | Hoja «Cálculos», columnas K–N |
| Candidatos superiores | Hoja «Cálculos», columnas O–R |
| Terminal inferior (S) / superior (T) | Hoja «Cálculos», columnas S y T |
| Precio final redondeado | Hoja «Simulador», columna L |
| Variación y sentido | Hoja «Simulador», columnas M y N |
| Casos de prueba (esperados) | Hoja «Simulador», columna P |
| Validación (OK/REVISAR) | Hoja «Simulador», columna Q |

---
---

# PARTE II — RECOMENDACIONES PARA EL DESARROLLO DEL SISTEMA

*Todo el contenido de esta parte es **propuesta del analista**. No proviene del archivo Excel. Son recomendaciones de diseño, arquitectura y contrato técnico para construir un sistema que implemente fielmente las reglas de la Parte I.*

---

## 8. Campos de salida recomendados

El simulador expone varios campos auxiliares (columnas C–Q). Se recomienda que el sistema devuelva un **objeto de respuesta** con los siguientes campos para garantizar trazabilidad:

| Campo propuesto | Descripción | Origen |
|-----------------|-------------|--------|
| `precioOriginal` | Precio de entrada tal cual se recibió | Parámetro de entrada |
| `precioRedondeado` | Resultado final (2 decimales); null si fuera de rango | Algoritmo §4 |
| `estado` | «Calculado» o «Fuera de rango» | Validación de rango |
| `regla.numero` | Banda aplicada (1–12) | Clasificación §4.1 |
| `regla.intervalo` | Rango textual (p. ej. «10,16 – 50,24») | Tabla §3 |
| `regla.tipo` | «Por exceso» / «Precio único» / «Terminal más cercano» | Tabla §3 |
| `regla.terminales` | Lista de offsets reales (sin duplicados) | Tabla §3 |
| `regla.paso` | Paso del múltiplo (solo «Por exceso») | Tabla §3 |
| `regla.periodo` | Período (solo «Terminal más cercano») | Tabla §3 |
| `variacion` | precioRedondeado − precioOriginal | Cálculo directo |
| `sentido` | «Por exceso» / «Por defecto» / «Sin cambio» | Signo de variación |
| `traza` | Detalle del cálculo (base, S, T, distancias) | Opcional para debug |

---

## 9. Recomendaciones de arquitectura

1. **Separación en tres capas:**
   - **(a) Repositorio de reglas:** configuración editable (BD o archivo JSON/YAML), **no hardcodeada**. Permite ajustar la política comercial sin recompilar.
   - **(b) Motor de cálculo puro:** función sin efectos laterales que recibe un precio y la tabla de reglas, y devuelve el resultado. Portable y testeable.
   - **(c) API / Casos de uso:** capa de exposición (REST, gRPC, o librería embebida) que valida entradas, invoca el motor y devuelve la respuesta formateada.

2. **Aritmética decimal en producción:** Usar `BigDecimal` (Java), `decimal.Decimal` (Python), o equivalente para evitar errores de coma flotante. Las comparaciones con tolerancia 1e-6 del libro son una mitigación; la aritmética decimal los elimina de raíz.

3. **Suite de pruebas automatizadas:** Incluir los 27 casos de la Parte I (§5) como tests de regresión. **Bloquear despliegues si falla algún caso.** Agregar pruebas en cada límite de banda (0,50/0,51; 4,75/4,76; etc.).

4. **Trazabilidad por operación:** Registrar en log/auditoría: precio de entrada, banda, resultado, variación. Útil para auditoría comercial y resolución de disputas.

5. **Internacionalización de formato:** El separador decimal «,» y de miles «.» deben manejarse en la **capa de presentación**, nunca en el motor de cálculo (que siempre trabaja con números).

6. **Validación de entradas:** Rechazar: nulos, textos, negativos. Definir política clara para «Fuera de rango» (¿error? ¿passthrough? ¿precio original sin cambio?).

7. **Offsets sin duplicados:** Modelar cada banda con su lista real de terminales (banda 7 = [0.49, 0.99], no [0.49, 0.99, 0.99, 0.99]). Los duplicados son una conveniencia de la hoja, no una regla de negocio.

---

## 10. Especificación de la API REST (propuesta)

Contrato propuesto para exponer el motor como servicio. Sin estado, idempotente, con trazabilidad completa.

### 10.1 Convenciones generales

- **Base URL:** `/api/v1`
- **Formato:** JSON (`application/json`), codificación UTF-8.
- Los importes se transmiten como número decimal con **punto** (p. ej. `48.75`), sin separadores de miles.
- Todas las operaciones son de solo lectura/cálculo: seguras de reintentar.
- Versionado en la ruta (`/v1`). Cambios de reglas incompatibles → nueva versión.

### 10.2 `POST /api/v1/redondeo` — Redondear un precio

**Request:**

```json
{
  "precio": 48.75,
  "incluirTraza": true
}
```

**Response 200 OK:**

```json
{
  "precioOriginal": 48.75,
  "precioRedondeado": 48.99,
  "estado": "Calculado",
  "regla": {
    "numero": 7,
    "intervalo": "10,16 – 50,24",
    "tipo": "Terminal más cercano",
    "terminales": [0.49, 0.99],
    "paso": null,
    "periodo": 1
  },
  "variacion": 0.24,
  "sentido": "Por exceso",
  "traza": {
    "base": 48,
    "terminalInferior": 48.49,
    "terminalSuperior": 48.99,
    "distanciaInferior": 0.26,
    "distanciaSuperior": 0.24,
    "criterioSeleccion": "más cercano (superior)"
  }
}
```

**Response 200 OK (fuera de rango):**

```json
{
  "precioOriginal": 100000.01,
  "precioRedondeado": null,
  "estado": "Fuera de rango",
  "regla": null,
  "variacion": null,
  "sentido": null
}
```

### 10.3 `POST /api/v1/redondeo/lote` — Redondeo por lote

Redondea múltiples precios en una sola llamada (útil para catálogos).

**Request:**

```json
{
  "precios": [0.377, 4.76, 48.75, 100000.01],
  "incluirTraza": false
}
```

**Response 200 OK:**

```json
{
  "resultados": [
    { "precioOriginal": 0.377,     "precioRedondeado": 0.38,  "estado": "Calculado",      "regla": {"numero": 1, "...": "..."} },
    { "precioOriginal": 4.76,      "precioRedondeado": 4.99,  "estado": "Calculado",      "regla": {"numero": 5, "...": "..."} },
    { "precioOriginal": 48.75,     "precioRedondeado": 48.99, "estado": "Calculado",      "regla": {"numero": 7, "...": "..."} },
    { "precioOriginal": 100000.01, "precioRedondeado": null,  "estado": "Fuera de rango", "regla": null }
  ],
  "total": 4,
  "calculados": 3,
  "fueraDeRango": 1
}
```

### 10.4 `GET /api/v1/reglas` — Consultar tabla de reglas vigente

Devuelve la configuración de bandas actual (para auditoría y para poblar interfaces).

```json
{
  "version": "v1",
  "moneda": "nacional",
  "minimo": 0.01,
  "maximo": 100000,
  "bandas": [
    {"numero":1, "desde":0.01, "hasta":0.50, "tipo":"Por exceso", "paso":0.01},
    {"numero":5, "desde":4.76, "hasta":5.15, "tipo":"Precio único", "precioFijo":4.99},
    {"numero":7, "desde":10.16,"hasta":50.24,"tipo":"Terminal más cercano","periodo":1,"terminales":[0.49,0.99]}
  ]
}
```

*Nota: se muestran 3 bandas como ejemplo; el endpoint devuelve las 12.*

### 10.5 Códigos de estado y errores

| HTTP | Situación | Cuerpo |
|------|-----------|--------|
| **200** | Cálculo correcto (incluye «Fuera de rango» como resultado de negocio) | Objeto resultado |
| **400** | Entrada inválida: falta `precio`, no es número, es negativo | `{ "error": "PRECIO_INVALIDO", "mensaje": "..." }` |
| **422** | Lote vacío o excede el máximo de elementos permitido | `{ "error": "LOTE_INVALIDO" }` |
| **500** | Error interno inesperado | `{ "error": "ERROR_INTERNO" }` |

> **💡 Decisión de diseño:** «Fuera de rango» **NO** es un error HTTP — es un resultado de negocio válido (respuesta 200). El error 400 se reserva para entradas que no son un precio procesable (nulo, texto, negativo). Esto permite al consumidor distinguir «precio válido pero no redondeable» de «petición malformada».

### 10.6 Contrato de campos de la respuesta

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `precioOriginal` | number | Siempre | Precio de entrada tal cual se recibió |
| `precioRedondeado` | number \| null | Siempre | Precio comercial (2 dec.); null si fuera de rango |
| `estado` | string | Siempre | `"Calculado"` o `"Fuera de rango"` |
| `regla` | object \| null | Siempre | Null si fuera de rango |
| `regla.numero` | int | Si calculado | Banda aplicada (1–12) |
| `regla.intervalo` | string | Si calculado | Rango textual |
| `regla.tipo` | string | Si calculado | Tipo de redondeo |
| `regla.terminales` | number[] | Si calculado | Offsets reales (sin duplicados) |
| `regla.paso` | number \| null | Si calculado | Solo para «Por exceso» |
| `regla.periodo` | number \| null | Si calculado | Solo para «Terminal más cercano» |
| `variacion` | number \| null | Siempre | precioRedondeado − precioOriginal |
| `sentido` | string \| null | Siempre | `"Por exceso"` / `"Por defecto"` / `"Sin cambio"` |
| `traza` | object \| null | Opcional | Solo si `incluirTraza = true` |

---

*Fin del informe.*
