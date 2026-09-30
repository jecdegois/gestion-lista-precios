# Requerimiento para TI: precio técnico y redondeo de listas

## Objetivo

Modificar el cálculo diario de listas para conservar el precio anterior al redondeo comercial y reconstruir cada precio publicado a partir de ese valor. La ejecución repetida con iguales entradas debe producir exactamente el mismo precio y cero actualizaciones después de la primera publicación.

## Modelo de almacenamiento

Agregar a `COFER.ARTICULO_PRECIO`:

```sql
U_PRECIO_TECNICO DECIMAL(28,8) NULL
```

Significado por tipo de lista:

| Tipo | `U_PRECIO_TECNICO` | `PRECIO` |
|---|---|---|
| Lista raíz MAYOREO/MAYOREOD | Precio original aprobado antes del redondeo | Precio raíz publicado y redondeado |
| LPV directa | MAYOREO técnica × factores, sin redondeo | LPV técnica redondeada |
| MAYOREOB | MAYOREOD técnica × 1,30, sin redondeo | MAYOREOB técnica redondeada |
| Otra lista derivada | Precio técnico de su base × factores | Resultado redondeado |

## Reglas de actualización

1. En la migración inicial, copiar a `U_PRECIO_TECNICO` el precio original vigente de las listas raíz antes de ejecutar cualquier redondeo.
2. Cuando Compras, una importación o una interfaz modifique un precio raíz, el proceso debe escribir el nuevo valor original en `U_PRECIO_TECNICO`.
3. El job diario debe leer exclusivamente `U_PRECIO_TECNICO` de la lista base.
4. Para cada lista destino, el job calcula y guarda simultáneamente:
   - `U_PRECIO_TECNICO = precio técnico base × factores`.
   - `PRECIO = COFER.FN_REDONDEAR_PRECIO(U_PRECIO_TECNICO)`.
5. Ningún job, trigger o interfaz debe ejecutar `U_PRECIO_TECNICO=PRECIO` después de la migración inicial.
6. Las listas deben procesarse en orden de dependencia. MAYOREOD debe tener su precio técnico vigente antes de calcular MAYOREOB.
7. El job actual y el nuevo no pueden ejecutarse al mismo tiempo.
8. Actualizar una fila solamente cuando cambie uno de los valores persistidos.

## Fórmulas

Cuando `U_DCTO_LPVn` contiene un porcentaje entre 0 y 100:

```text
factor_descuento = 1 − U_DCTO_LPVn / 100
precio_técnico_LPV = precio_técnico_MAYOREO × factor_descuento
precio_publicado_LPV = redondear(precio_técnico_LPV)
```

Con factor por artículo:

```text
precio_técnico_LPV = precio_técnico_MAYOREO
                   × factor_descuento
                   × U_FACTOR_ARTICULO
```

MAYOREOB:

```text
precio_técnico_MAYOREOB = precio_técnico_MAYOREOD × 1,30
precio_publicado_MAYOREOB = redondear(precio_técnico_MAYOREOB)
```

Los factores se mantienen con al menos ocho decimales durante el cálculo. No aplicar `ROUND(...,2)` al factor.

## Regla corregida de terminales

Para los tramos de terminales, formar los candidatos usando el mismo bloque entero, de diez o de cien del precio calculado:

- `10,16`: bloque 10; terminales permitidos `,49/,99`; resultado `10,49`.
- `13,195`: bloque 13; candidatos `13,49/13,99`; resultado `13,49`.
- Empate: candidato superior.
- Los primeros cuatro tramos continúan usando múltiplo por exceso.
- `4,76–5,15` continúa retornando 4,99.

## Decisiones funcionales requeridas

1. Aprobar que el bloque del precio calculado debe conservarse al generar terminales.
2. Aprobar cómo redondear precios mayores de 100.000. El catálogo real contiene 16 filas fuera del máximo del anexo.
3. Confirmar si la extensión del último patrón 50/90 se aplica sin límite superior.
4. Confirmar que los mismos intervalos corresponden a cada moneda y compañía.
5. Definir el tratamiento de EPA, cuyo porcentaje efectivo varía por artículo.
6. Confirmar la moneda utilizada para validar `COSTO_PROM_DOL` y márgenes.
7. Confirmar la llave real de `ARTICULO_PRECIO` y el tipo de `ESQUEMA_TRABAJO` antes de compilar el SP de QA.

## Criterios de aceptación

1. `10,15 → 10,29`.
2. `10,16 → 10,49`.
3. `13,195 → 13,49`.
4. Un empate selecciona el terminal superior.
5. Un precio superior a 100.000 se rechaza cuando la extensión está desactivada.
6. Para MAYOREO 12.940 y descuento 2 %, la LPV técnica es 12.681,20 antes de redondear.
7. Dos ejecuciones consecutivas con iguales entradas producen iguales precios.
8. La segunda ejecución no actualiza filas ni modifica fechas de auditoría.
9. Cambiar el descuento recalcula el técnico desde MAYOREO técnica, sin utilizar la LPV publicada anterior.
10. Cambiar MAYOREOD técnica recalcula MAYOREOB desde el nuevo valor y aplica 1,30 una sola vez.
11. Si la función devuelve `FUERA_RANGO`, el lote no se publica parcialmente.
12. Si el precio final queda bajo costo o margen mínimo, el lote se rechaza según la política aprobada.

## Secuencia de despliegue

1. Respaldar el procedimiento y los precios vigentes.
2. Agregar `U_PRECIO_TECNICO` en QA.
3. Recuperar y cargar los precios originales de MAYOREO y MAYOREOD.
4. Crear `COFER.FN_REDONDEAR_PRECIO`.
5. Crear `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2`.
6. Ejecutar con `@P_SOLO_SIMULAR=1` y conciliar los artículos del archivo de ejemplo.
7. Aprobar la política para valores mayores de 100.000.
8. Publicar en QA y repetir el job sin cambios de entrada.
9. Sustituir el job productivo durante una ventana controlada.
