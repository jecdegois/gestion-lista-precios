# Requerimiento: precio original y redondeo de listas

## Objetivo

Modificar el cálculo diario de listas para conservar el precio anterior al redondeo comercial y reconstruir cada precio publicado a partir de ese valor. La ejecución repetida con iguales entradas debe producir exactamente el mismo precio y cero actualizaciones después de la primera publicación.

## Modelo de almacenamiento

Agregar a `COFER.ARTICULO_PRECIO`:

U\_PRECIO\_ORIGINAL DECIMAL(28,8) NULL

Significado por tipo de lista:

| Tipo | `U_PRECIO_ORIGINAL` | `PRECIO` |
| :---- | :---- | :---- |
| Lista raíz MAYOREO/MAYOREOD | Precio original aprobado antes del redondeo | Precio raíz publicado y redondeado |
| LPV directa | MAYOREO técnica × factores, sin redondeo | LPV técnica redondeada |
| MAYOREOB | MAYOREOD técnica × 1,30, sin redondeo | MAYOREOB técnica redondeada |
| Otra lista derivada | Precio original de su base × factores | Resultado redondeado |

## Reglas de actualización

1. En la migración inicial, copiar a `U_PRECIO_ORIGINAL` el precio original vigente de las listas raíz antes de ejecutar cualquier redondeo.  
2. Cuando Compras, una importación o una interfaz modifique un precio raíz, el proceso debe escribir el nuevo valor original en `U_PRECIO_ORIGINAL`.  
3. El job diario debe leer exclusivamente `U_PRECIO_ORIGINAL` de la lista base.  
4. Para cada lista destino, el job calcula y guarda simultáneamente:  
   - `U_PRECIO_ORIGINAL = precio original base × factores`.  
   - `PRECIO = COFER.FN_REDONDEAR_PRECIO(U_PRECIO_ORIGINAL)`.  
5. Ningún job, trigger o interfaz debe ejecutar `U_PRECIO_ORIGINAL=PRECIO` después de la migración inicial.  
6. Las listas deben procesarse en orden de dependencia. MAYOREOD debe tener su precio original vigente antes de calcular MAYOREOB.  
7. El job actual y el nuevo no pueden ejecutarse al mismo tiempo.  
8. Actualizar una fila solamente cuando cambie uno de los valores persistidos.

## Fórmulas

Cuando `U_DCTO_LPVn` contiene un porcentaje entre 0 y 100:

factor\_descuento \= 1 − U\_DCTO\_LPVn / 100

precio\_técnico\_LPV \= precio\_técnico\_MAYOREO × factor\_descuento

precio\_publicado\_LPV \= redondear(precio\_técnico\_LPV)

Con factor por artículo:

precio\_técnico\_LPV \= precio\_técnico\_MAYOREO

                   × factor\_descuento

                   × U\_FACTOR\_ARTICULO

MAYOREOB:

precio\_técnico\_MAYOREOB \= precio\_técnico\_MAYOREOD × 1,30

precio\_publicado\_MAYOREOB \= redondear(precio\_técnico\_MAYOREOB)

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
9. Cambiar el descuento recalcula el técnico desde MAYOREO técnica, sin utilizar la LPV publicada anteriormente.  
10. Cambiar MAYOREOD técnica recalcula MAYOREOB desde el nuevo valor y aplica 1,30 una sola vez.  
11. Si la función devuelve `FUERA_RANGO`, el lote no se publica parcialmente.  
12. Si el precio final queda bajo costo o margen mínimo, el lote se rechaza según la política aprobada.

## Secuencia de despliegue

1. Respaldar el procedimiento y los precios vigentes.  
2. Agregar `U_PRECIO_ORIGINAL` en QA.  
3. Recuperar y cargar los precios originales de MAYOREO y MAYOREOD.  
4. Crear `COFER.FN_REDONDEAR_PRECIO`.  
5. Crear `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2`.  
6. Ejecutar con `@P_SOLO_SIMULAR=1` y conciliar los artículos del archivo de ejemplo.  
7. Aprobar la política para valores mayores de 100.000.  
8. Publicar en QA y repetir el job sin cambios de entrada.  
9. Sustituir el job productivo durante una ventana controlada.

# Ejemplos:

## Por qué 10,16 debe ser 10,49

El precio `10,16` pertenece al intervalo:

10,16–50,24

Para ese intervalo, las únicas terminaciones permitidas son:

0,49 y 0,99

Conservando el bloque entero `10`, los candidatos son:

10,49

10,99

Las distancias son:

|10,49 − 10,16| \= 0,33

|10,99 − 10,16| \= 0,83

Por tanto:

10,16 → 10,49

`9,99` ya no se considera porque pertenece al bloque entero anterior. `10,29` tampoco es válido porque la terminación `0,29` corresponde al intervalo anterior, de `5,16–10,15`.

| Precio | Tramo | Terminales válidos | Resultado |
| :---- | :---- | :---- | :---- |
| 10,15 | 5,16–10,15 | 10,29; 10,49; 10,69; 10,99 | 10,29 |
| 10,16 | 10,16–50,24 | 10,49; 10,99 | 10,49 |

## Por qué 13,195 debe ser 13,49

Si se buscaran terminales globalmente, los candidatos serían:

12,99 → diferencia 0,205

13,49 → diferencia 0,295

Bajo esa interpretación, `12,99` sería matemáticamente más cercano. Esa fue la lógica de la función anterior.

Pero su aclaración indica que debe conservarse el bloque entero del precio. Para `13,195`, el bloque es `13`, por lo que los candidatos permitidos son:

13,49

13,99

Entonces:

|13,49 − 13,195| \= 0,295

|13,99 − 13,195| \= 0,795

Resultado corregido:

13,195 → 13,49

Esta regla debe quedar explícita en el requerimiento:

> Para los intervalos definidos mediante terminales, el sistema conservará el bloque entero, de diez o de cien del precio calculado y sustituirá únicamente su terminación por la alternativa permitida más cercana. No se considerarán terminales pertenecientes al bloque anterior o siguiente. En caso de empate, se seleccionará el terminal superior.

## Fórmula confirmada con el Excel

Los precios reales confirman que `U_DCTO_LPVn` contiene un porcentaje de descuento, no un factor multiplicador directo.

Por ejemplo:

MAYOREO \= 12.940

U\_DCTO\_LPV2 \= 2 %

El cálculo es:

$$ 12.940 \\times \\left(1-\\frac{2}{100}\\right) \=12.940\\times0,98 \=12.681,20 $$

Por tanto, la fórmula correcta es:

FACTOR\_DESCUENTO \= 1 \- U\_DCTO\_LPVn / 100

PRECIO\_TECNICO\_LPV \=

    PRECIO\_TECNICO\_MAYOREO

    × FACTOR\_DESCUENTO

    × FACTOR\_ARTICULO

    × FACTOR\_GLOBAL

PRECIO\_PUBLICADO\_LPV \=

    REDONDEAR(PRECIO\_TECNICO\_LPV)

En SQL Server:

CAST(

    1.0 \-

    (

        CAST(ISNULL(A.U\_DCTO\_LPV2,0) AS DECIMAL(18,8))

        / 100.0

    )

    AS DECIMAL(18,8)

)

Debe eliminarse esta parte del procedimiento original:

ROUND(...,2)

porque convierte, por ejemplo, un factor `0,925` en `0,93` antes de calcular el precio.

## Precio técnico dentro de ARTICULO\_PRECIO

La nueva versión agrega:

ALTER TABLE COFER.ARTICULO\_PRECIO

ADD U\_PRECIO\_TECNICO DECIMAL(28,8) NULL;

Cada fila tendrá dos valores:

| Campo | Significado |
| :---- | :---- |
| `U_PRECIO_TECNICO` | Precio original o calculado antes del redondeo |
| `PRECIO` | Precio comercial redondeado que consumen Softland, AFV y otros canales |

### Ejemplo de MAYOREO y LPV2

MAYOREO.U\_PRECIO\_TECNICO \= 12.940

LPV2 descuento             \= 2 %

LPV2.U\_PRECIO\_TECNICO      \= 12.681,20

LPV2.PRECIO                \= 12.690

Según la interpretación corregida:

Bloque:      12.600

Terminales:  12.650 y 12.690

Más cercano: 12.690

### Ejemplo de MAYOREOD y MAYOREOB

MAYOREOD.U\_PRECIO\_TECNICO \= 10,15

Factor MAYOREOB           \= 1,30

Entonces:

MAYOREOB.U\_PRECIO\_TECNICO \=

    10,15 × 1,30

    \= 13,195

Se aplica el redondeo:

13,195 → 13,49

Y se guarda:

MAYOREOB.U\_PRECIO\_TECNICO \= 13,195

MAYOREOB.PRECIO            \= 13,49

## Cuándo se guarda o actualiza el precio técnico

| Evento | Actualización |
| :---- | :---- |
| Migración inicial | Copiar el precio original vigente de MAYOREO/MAYOREOD a `U_PRECIO_TECNICO` |
| Nuevo precio base aprobado | Actualizar `U_PRECIO_TECNICO` de MAYOREO/MAYOREOD |
| Cambio de descuento LPV | Recalcular el técnico de la LPV desde MAYOREO técnica |
| Cambio del factor 1,30 | Recalcular MAYOREOB desde MAYOREOD técnica |
| Ejecución diaria sin cambios | El técnico y el publicado permanecen iguales |
| Nuevo artículo | Insertar técnico original y precio publicado calculado |

La carga inicial sería:

UPDATE AP

SET AP.U\_PRECIO\_TECNICO \=

    CAST(AP.PRECIO AS DECIMAL(28,8))

FROM COFER.ARTICULO\_PRECIO AP

JOIN COFER.VERSION\_NIVEL VN

  ON VN.NIVEL\_PRECIO=AP.NIVEL\_PRECIO

 AND VN.VERSION=AP.VERSION

 AND VN.ESTADO='A'

WHERE AP.NIVEL\_PRECIO IN ('MAYOREO','MAYOREOD')

  AND AP.U\_PRECIO\_TECNICO IS NULL;

Esto debe ejecutarse una sola vez y antes de comenzar a redondear.

Cuando Compras cambie el precio base, la interfaz o importación debe actualizar:

U\_PRECIO\_TECNICO \= nuevo precio original

El job será el responsable de calcular el nuevo `PRECIO` publicado.

## Cómo evita el redondeo repetido

Primera ejecución:

Técnico:   13,195

Publicado: 13,49

Segunda ejecución:

Origen leído: 13,195

Redondeo:     13,49

Tercera ejecución:

Origen leído: 13,195

Redondeo:     13,49

El procedimiento nunca hace:

13,49 → volver a redondear

Siempre hace:

13,195 → 13,49

La estabilidad no depende de que la función sea matemáticamente idempotente. Depende de que el job siempre lea `U_PRECIO_TECNICO` y nunca utilice el `PRECIO` publicado como origen.

Debe existir esta prohibición técnica:

> Después de la migración inicial, ningún job, trigger, interfaz o procedimiento podrá copiar `PRECIO` hacia `U_PRECIO_TECNICO`.

## Aplicación en el procedimiento

El procedimiento original utiliza:

AP.PRECIO

Debe utilizar:

AP.U\_PRECIO\_TECNICO

El cálculo queda:

PRECIO\_TECNICO\_DESTINO \=

    AP.U\_PRECIO\_TECNICO

    \* FACTOR\_DESCUENTO

    \* FACTOR\_GLOBAL

    \* FACTOR\_ARTICULO

Después:

CROSS APPLY COFER.FN\_REDONDEAR\_PRECIO

(

    PRECIO\_TECNICO\_DESTINO,

    @P\_EXTENDER\_MAYOR\_100000

) R

Finalmente se guardan ambos valores:

UPDATE AP

SET

    AP.U\_PRECIO\_TECNICO \= C.PRECIO\_TECNICO\_DESTINO,

    AP.PRECIO           \= C.PRECIO\_REDONDEADO

Para MAYOREOB:

EXEC COFER.SP\_GESTION\_LISTAS\_PRECIOS\_FULL\_QA\_V2

    @P\_NIVEL\_PRECIO          \= 'MAYOREOB',

    @P\_FECHA\_INICIO          \= '20260910',

    @P\_FECHA\_FIN             \= '99991231',

    @P\_NIVEL\_PRECIO\_BASE     \= 'MAYOREOD',

    @P\_VERSION               \= 1,

    @COLUMNA\_DCTO            \= NULL,

    @P\_FACTOR\_GLOBAL         \= 1.30,

    @P\_EXTENDER\_MAYOR\_100000 \= 0,

    @P\_SOLO\_SIMULAR          \= 1;

## Hallazgo relevante del Excel

El archivo contiene 32 registros. Las 16 filas del artículo `5500005` tienen precios mayores de 100.000, pero la norma termina en 100.000.

Por eso, la función incorpora dos comportamientos:

@EXTENDER\_MAYOR\_100000 \= 0

Devuelve `FUERA_RANGO` y detiene la publicación.

@EXTENDER\_MAYOR\_100000 \= 1

Extiende el último patrón de terminales `50/90` a valores superiores.

Ejemplos de esa extensión:

| Precio técnico | Precio propuesto |
| :---- | :---- |
| 115.000 | 115.050 |
| 117.500 | 117.550 |
| 119.500 | 119.550 |
| 120.000 | 120.050 |
| 122.500 | 122.550 |
| 125.000 | 125.050 |

Compras debe aprobar esta extensión antes de usar el valor `1`.

El paquete V2 contiene 11 pruebas de borde, una simulación de 30 ejecuciones estables y conciliaciones con los precios `12.940 → 12.681,20` y `125.000 → 115.000`. El procedimiento tiene modo de simulación y todavía debe compilarse contra los tipos y la llave reales de `COFER.ARTICULO_PRECIO` en QA.  
