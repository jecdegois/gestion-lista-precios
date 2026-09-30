# Análisis de `Listas de precios(1).xlsx`

El archivo contiene 32 precios: dos artículos y 16 niveles de precio por artículo. `MAYOREO` es 125.000 para el artículo 5500005 y 12.940 para el artículo 6104571.

Los datos confirman que `U_DCTO_LPVn` representa un porcentaje de descuento, no un multiplicador directo. Por ejemplo:

| Artículo | Lista | MAYOREO | Precio LPV | Descuento efectivo | Fórmula comprobada |
|---|---|---:|---:|---:|---|
| 5500005 | LPV1 | 125.000 | 123.750 | 1 % | 125.000 × (1−1/100) |
| 5500005 | LPV2 | 125.000 | 122.500 | 2 % | 125.000 × (1−2/100) |
| 5500005 | LPV12 | 125.000 | 115.000 | 8 % | 125.000 × (1−8/100) |
| 6104571 | LPV1 | 12.940 | 12.810,60 | 1 % | 12.940 × (1−1/100) |
| 6104571 | LPV2 | 12.940 | 12.681,20 | 2 % | 12.940 × (1−2/100) |
| 6104571 | LPV10 | 12.940 | 11.646 | 10 % | 12.940 × (1−10/100) |
| 6104571 | LPV9 | 12.940 | 10.481,40 | 19 % | 12.940 × (1−19/100) |

La fórmula correcta es:

```text
FACTOR_DESCUENTO = 1 − U_DCTO_LPVn / 100
PRECIO_TECNICO_LPV = MAYOREO.U_PRECIO_TECNICO × FACTOR_DESCUENTO
PRECIO_LPV = REDONDEAR(PRECIO_TECNICO_LPV)
```

Si también aplica `U_FACTOR_ARTICULO`:

```text
PRECIO_TECNICO_LPV = MAYOREO.U_PRECIO_TECNICO
                   × (1 − U_DCTO_LPVn / 100)
                   × U_FACTOR_ARTICULO
```

## Resultados con la interpretación aclarada

Para los terminales de tipo sufijo se conserva el bloque del precio calculado. Por eso:

| Precio calculado | Tramo | Candidatos del mismo bloque | Resultado |
|---:|---|---|---:|
| 10,15 | 5,16–10,15 | 10,29; 10,49; 10,69; 10,99 | 10,29 |
| 10,16 | 10,16–50,24 | 10,49; 10,99 | 10,49 |
| 13,195 | 10,16–50,24 | 13,49; 13,99 | 13,49 |
| 12.940 | 5.001–100.000 | 12.950; 12.990 | 12.950 |
| 12.810,60 | 5.001–100.000 | 12.850; 12.890 | 12.850 |
| 12.681,20 | 5.001–100.000 | 12.650; 12.690 | 12.690 |
| 11.646 | 5.001–100.000 | 11.650; 11.690 | 11.650 |
| 10.481,40 | 5.001–100.000 | 10.450; 10.490 | 10.490 |

`12,99` deja de ser candidato para `13,195` porque pertenece al bloque entero anterior. Esta es una precisión adicional respecto al texto del anexo: el documento dice terminal más cercano, pero no define explícitamente si puede tomarse un sufijo del bloque anterior. La expectativa expresada por negocio (`13,49`) establece que debe conservarse el bloque.

## Precio mayor que 100.000

Las 16 filas del artículo 5500005 tienen precios superiores a 100.000. El anexo termina en 100.000, por lo que la regla documental no permite determinar su redondeo sin una decisión adicional.

La función recibe `@EXTENDER_MAYOR_100000`:

- `0`: devuelve `FUERA_RANGO` y evita publicar.
- `1`: extiende el último patrón, finales 50/90, a precios mayores de 100.000.

Con la extensión propuesta:

| Precio calculado | Resultado propuesto |
|---:|---:|
| 115.000 | 115.050 |
| 117.500 | 117.550 |
| 119.500 | 119.550 |
| 120.000 | 120.050 |
| 122.500 | 122.550 |
| 123.750 | 123.750 |
| 125.000 | 125.050 |

Esta extensión necesita aprobación de Compras porque cambia el alcance escrito de la norma.

## Diferencias observadas por artículo

Para 5500005 varias listas comparten 117.500, equivalente a 6 % respecto de MAYOREO, aunque los descuentos del artículo 6104571 cambian entre esas listas. Esto es compatible con descuentos configurados por artículo/lista.

`EPA` no sigue un porcentaje uniforme: representa 4,4 % para 5500005 y aproximadamente 13,4467 % para 6104571. Debe confirmarse si EPA usa una columna de descuento, un factor independiente o captura manual.
