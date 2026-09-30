# Especificación de Automatización: Cálculo de Listas de Precio

## 1. Resumen ejecutivo

Se propone sustituir el cálculo basado en columnas UDF por lista de precios, como `DCTO_LPV1`, `DCTO_LPV2` o `DCTO_LPV3`, y el cálculo realizado en Venezuela basado en un factor global, por un modelo único y escalable basado en una tabla relacional: `DESCUENTO_LISTA_PRECIO`. Esta tabla define, para cada lista destino y artículo, el factor multiplicador que debe aplicarse sobre el precio de una lista base activa.

El cálculo queda normalizado como:  
$$\text{Precio Destino} = \text{Precio Base} \times \text{Factor Global Opcional} \times \text{Factor de Artículo/Lista}$$

Un factor mayor que 1 aumenta el precio, un factor menor que 1 lo reduce, y un factor igual a 1 conserva el precio base. El procedimiento final permite procesar una lista específica o todas las listas configuradas para la base en una misma ejecución.

La propuesta incluye validaciones para impedir factores inválidos, precios en cero, precios por debajo del costo y márgenes menores al mínimo definido. Los registros inválidos se guardan en una tabla de rechazos y los precios válidos se insertan o actualizan de forma *set-based*.

---

## 2. Situación actual

| País / Esquema | Mecanismo actual | Limitación |
| :--- | :--- | :--- |
| **Costa Rica** | La lista base `MAYOREO` se replica a listas `LPV` usando columnas por lista en `ARTICULO`: `DCTO_LPV1`, `DCTO_LPV2`, `DCTO_LPV3`, `DCTO_LPV4`, etc. | Cada nueva lista exige crear una nueva columna, modificar el Stored Procedure y desplegar cambios técnicos. |
| **Venezuela** | La lista destino se calcula multiplicando el precio base por un factor global administrado en una tabla de gestión. | El factor no permite ajustar de forma específica por artículo/lista salvo con extensiones adicionales. La gestión queda de parte de Intelix. |
| **Ambos** | El SP actual inserta artículos en `ARTICULO_PRECIO` y actualiza precio/márgenes de la lista destino. | Los modelos no están homologados en los tres países, incluyendo a Colombia (Mundial de partes). |

---

## 3. Objetivos de la automatización

* Centralizar el factor de ajuste en una tabla relacional por lista y artículo.
* Permitir aumentar o disminuir precios usando el mismo campo `FACTOR`.
* Eliminar la dependencia de nuevas columnas `DCTO_LPV` para crear listas nuevas.
* Permitir procesar una lista específica o $N$ listas asociadas a una lista base.
* Mantener trazabilidad de la corrida de cálculo, del factor utilizado y del precio aplicado.
* Evitar precios inválidos: cero, negativos, bajo costo o con margen inferior al mínimo configurado.
* Mantener compatibilidad con el proceso actual mediante el parámetro `@p_factor_multiplicador`, que queda como factor global opcional.

---

## 4. Premisas

* La lista base se identifica por `@p_nivel_precio_base` y debe tener una versión activa en `VERSION_NIVEL`.
* Las listas destino deben tener una versión activa igual a `@p_version` antes de ejecutar el cálculo.
* El precio calculado se almacena en `ARTICULO_PRECIO`, por `NIVEL_PRECIO`, `VERSION` y `ARTICULO`.
* El portal de pedidos, AFV, Catálogo Digital o integraciones externas reciben precios ya calculados; no deben recalcular descuentos por lista.
* El factor de `DESCUENTO_LISTA_PRECIO` es multiplicador directo: no es porcentaje y no se divide entre 100.
* Si un artículo no tiene factor configurado, el procedimiento puede usar factor 1.
* La lista base se protege por defecto para evitar que una corrida la modifique accidentalmente.
* Para trazabilidad histórica se recomienda crear una nueva versión de precios por corrida aprobada o conservar la auditoría generada por el SP.
* La restricción final adoptada para el diseño es usar factores multiplicadores y no porcentajes. Por lo tanto, el factor no se divide entre 100; un descuento de 5% se representa como 0.95 y un aumento de 10% como 1.10.

---

## 5. Modelo de datos propuesto

### Tabla principal nueva: `DESCUENTO_LISTA_PRECIO`

| Columna | Tipo sugerido | Uso |
| :--- | :--- | :--- |
| `U_CODIGO` | `BIGINT IDENTITY` | Clave técnica y referencia de auditoría. |
| `U_DESCRIP` | `VARCHAR(50)` | Lista desde la cual se toma el precio base activo. |
| `NIVEL_PRECIO` | `VARCHAR(50)` | Lista destino que recibirá el precio calculado. |
| `ARTICULO` | `VARCHAR(20)` | Artículo al que aplica el factor. |
| `FACTOR` | `DECIMAL(12,2)` | Multiplicador directo con 2 decimales: 0.95 descuenta 5%, 1.10 aumenta 10%. |
| `ACTIVO` | `VARCHAR(1)` | Control funcional de vigencia lógica: S/N. |
| `OBSERVACIONES` | `VARCHAR(255)` | Soporte para gestión funcional y seguimiento de cambios. |

### Tablas auxiliares propuestas para trazabilidad técnica (opcional):

| Tabla | Propósito |
| :--- | :--- |
| `ARTICULO_PRECIO_AJUSTE_LOG` | Registra cada precio insertado o actualizado, con precio base, factor utilizado, precio anterior, precio nuevo, costo y márgenes. |
| `ARTICULO_PRECIO_AJUSTE_RECHAZO` | Registra aquellos artículos que no cumplieron la validación y fueron rechazados del cálculo. |

---

## 6. Reglas de cálculo

| Elemento | Regla |
| :--- | :--- |
| **Precio base** | Se toma de `ARTICULO_PRECIO` de la lista base con `VERSION_NIVEL.ESTADO = 'A'`. |
| **Factor global** | Parámetro `@p_factor_multiplicador`. Para el modelo nuevo debe enviarse 1 si `DESCUENTO_LISTA_PRECIO` ya contiene el factor final. |
| **Factor artículo/lista** | `DESCUENTO_LISTA_PRECIO.FACTOR` vigente para `NIVEL_PRECIO_BASE`, `NIVEL_PRECIO` y `ARTICULO`. Si falta y no se exige, se usa 1. |
| **Factor final** | Factor global $\times$ factor artículo/lista. Debe ser mayor que 0 y menor o igual que 2. |
| **Precio destino** | Precio base $\times$ factor final. Se redondea a 4 decimales para coincidir con `DECIMAL(28,4)`. |
| **Margen utilidad** | $1 - (\text{costo promedio} / \text{precio destino})$. Se usa para validación de costo y margen mínimo. |
| **Margen MULR** | Se mantiene con fórmula compatible con la lógica histórica: $1 - (\text{costo promedio} / (\text{precio base} / \text{factor final}))$. Debe ser revisada funcionalmente si se desea homologarla al margen de utilidad. |

---

## 7. Validaciones y manejo de errores

| Validación | Acción del procedimiento |
| :--- | :--- |
| **Rango de fechas inválido** | Cancela la ejecución con `THROW`. |
| **Lista destino sin versión activa** | No se procesa. Si no queda ninguna lista destino, cancela la ejecución. |
| **Precio base nulo, cero o negativo** | Marca el artículo/lista como rechazo. |
| **Factor menor o igual a 0** | Rechaza. La tabla también posee `CHECK` para impedirlo. |
| **Factor mayor que 2** | Rechaza. Evita duplicar más de 100% el precio base. |
| **Precio calculado cero o negativo** | Rechaza y no modifica `ARTICULO_PRECIO`. |
| **Precio calculado por debajo del costo** | Rechaza. |
| **Margen calculado menor que `@p_margen_minimo`** | Rechaza cuando la validación de costo está activa. |
| **Modo de validación = ERROR** | Guarda rechazos y cancela la corrida completa antes de modificar precios. |
| **Modo de validación = OMITIR** | Omite rechazados, actualiza/inserta válidos y devuelve resumen. |

---

## 8. Flujo del procedimiento propuesto

1. Validar parámetros de entrada.
2. Determinar listas destino: una lista indicada por parámetro o todas las listas activas configuradas en `DESCUENTO_LISTA_PRECIO` para la lista base.
3. Cargar precios base activos y costo promedio del artículo.
4. Generar combinatoria eficiente de artículos base por listas destino mediante `CROSS JOIN` controlado.
5. Resolver el factor vigente por artículo/lista con `OUTER APPLY TOP 1`.
6. Calcular precio, margen de utilidad, margen MULR y motivo de rechazo.
7. Registrar rechazos en `ARTICULO_PRECIO_AJUSTE_RECHAZO`.
8. Si el modo es `ERROR` y existen rechazos, cancelar antes de modificar precios.
9. Insertar precios faltantes en `ARTICULO_PRECIO` y actualizar precios existentes solo si cambiaron.
10. Registrar inserciones y actualizaciones en `ARTICULO_PRECIO_AJUSTE_LOG`.
11. Devolver resumen de listas, artículos evaluados, válidos, insertados, actualizados y rechazados.

---

## 9. Ejemplos funcionales

| Caso | Precio base | Costo | Factor | Precio calculado | Resultado |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Descuento 5%** | 100.00 | 70.00 | 0.95 | 95.00 | **Válido.** Margen utilidad aproximado: 26.32%. |
| **Aumento 10%** | 100.00 | 70.00 | 1.10 | 110.00 | **Válido.** Margen utilidad aproximado: 36.36%. |
| **Precio bajo costo** | 100.00 | 75.00 | 0.60 | 60.00 | **Rechazado** por `PRECIO_DEBAJO_COSTO`. |
| **Sin factor configurado** | 100.00 | 70.00 | Sin fila | 100.00 | **Válido** si `@p_exigir_factor_configurado = 0`; **rechazado** si vale `1`. |

---

## 10. Migración sugerida desde Costa Rica

Para cada columna actual `DCTO_LPV`, se debe crear una fila por artículo y lista destino. La fórmula de migración es:
$$\text{FACTOR} = 1 - \left(\frac{\text{descuento}}{100}\right)$$
*Ejemplo:* `DCTO_LPV1 = 5` se convierte en `FACTOR = 0.95` para la lista `LPV1`.

---

## 11. Migración sugerida desde Venezuela

Si el factor global histórico está en una tabla de gestión, existen dos alternativas:
1. Cargar el factor final por artículo/lista en `DESCUENTO_LISTA_PRECIO` y ejecutar el SP con `@p_factor_multiplicador = 1`.
2. Conservar el factor global en `@p_factor_multiplicador` y usar `DESCUENTO_LISTA_PRECIO` únicamente para ajustes adicionales por artículo.

*La opción recomendada para trazabilidad funcional es cargar el factor final en la nueva tabla.*

---

## 12. Restricciones y decisiones de diseño

* No se crearán nuevas columnas por lista en `ARTICULO`.
* No se modelan columnas separadas de aumento y disminución; el signo funcional se expresa por el valor del factor.
* El factor permitido es mayor que 0 y menor o igual que 2.
* El factor no se divide entre 100.
* La lista base no se actualiza por defecto.
* La tabla de factores debe ser administrada por usuarios funcionales autorizados, idealmente Compras/Mercadeo.
* Los rechazos no corrigen precios automáticamente; deben revisarse y ajustarse los factores o costos antes de reejecutar.
* El cálculo de tipo de cambio o moneda local queda fuera de este script salvo que esté representado en el factor final o en el factor global.

---

## 13. Plan de implementación

| Fase | Actividades | Criterio de salida |
| :--- | :--- | :--- |
| **1. Preparación** | Respaldar SP actual, validar nombres de esquemas y confirmar columnas reales de `ARTICULO`, `ARTICULO_PRECIO` y `VERSION_NIVEL`. | Inventario técnico aprobado. |
| **2. DDL** | Crear tabla `DESCUENTO_LISTA_PRECIO`, índices y permisos. | Objetos creados en QA. |
| **3. Migración** | Cargar factores desde UDFs de Costa Rica y tabla de gestión de Venezuela. | Muestreo de factores aprobados por negocio. |
| **4. Prueba cálculo** | Ejecutar SP con `@p_modo_validacion = 'ERROR'` para detectar inconsistencias sin actualizar precios. | Cero rechazos críticos o plan de corrección. |
| **5. Prueba actualización** | Ejecutar en QA con `@p_modo_validacion = 'OMITIR'` y comparar precios resultantes contra cálculo esperado. | Exactitud de precios y márgenes. |
| **6. Producción** | Desplegar SP y habilitar job con monitoreo de tabla de rechazos y log. | Primera corrida productiva conciliada. |

---

## 14. Script SQL sugerido

El siguiente script crea la tabla de factores, las tablas de trazabilidad y reemplaza el procedimiento FULL con una versión *set-based*. Antes de ejecutarlo en producción, validar en QA y ajustar el esquema si corresponde a Costa Rica u otra compañía.

```sql
USE [SOFTLANDPRD]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*
Script final de referencia - Automatización de listas de precios por factor
Tabla nueva: DESCUENTO_LISTA_PRECIO
Procedimiento: SP_GESTION_LISTAS_PRECIOS_FULL

Este script está escrito para el esquema FEBECA porque el SP recibido pertenece a [FEBECA].
Para Costa Rica u otra compañía, reemplace el esquema FEBECA por el esquema correspondiente
(por ejemplo, COFER, COFERSA, SILLACA o BEVAL según aplique) y valide los nombres reales
de columnas UDF antes de migrar datos.
*/

/* ================================================================
1) Tabla de factores por artículo y lista de precios
================================================================ */
IF OBJECT_ID(N'[FEBECA].[DESCUENTO_LISTA_PRECIO]', N'U') IS NULL
BEGIN 
    CREATE TABLE [FEBECA].[DESCUENTO_LISTA_PRECIO]
    (
        [ID_DESCUENTO_LISTA_PRECIO] BIGINT IDENTITY(1,1) NOT NULL,
        [NIVEL_PRECIO_BASE] VARCHAR(50) NOT NULL,
        [NIVEL_PRECIO] VARCHAR(50) NOT NULL,
        [ARTICULO] VARCHAR(20) NOT NULL,
        [FACTOR] DECIMAL(12,2) NOT NULL,
        [FECHA_INICIO] DATE NOT NULL
            CONSTRAINT [DF_DLP_FECHA_INICIO] DEFAULT (CONVERT(date,'19000101')),
        [FECHA_FIN] DATE NOT NULL
            CONSTRAINT [DF_DLP_FECHA_FIN] DEFAULT (CONVERT(date,'99991231')),
        [ACTIVO] CHAR(1) NOT NULL
            CONSTRAINT [DF_DLP_ACTIVO] DEFAULT ('S'),
        [OBSERVACION] VARCHAR(250) NULL,
        [FECHA_CREACION] DATETIME NOT NULL
            CONSTRAINT [DF_DLP_FECHA_CREACION] DEFAULT (GETDATE()),
        [USUARIO_CREACION] VARCHAR(50) NOT NULL
            CONSTRAINT [DF_DLP_USUARIO_CREACION] DEFAULT (SUSER_SNAME()),
        [FECHA_ULT_MODIF] DATETIME NULL,
        [USUARIO_ULT_MODIF] VARCHAR(50) NULL,
        CONSTRAINT [PK_DESCUENTO_LISTA_PRECIO]
            PRIMARY KEY CLUSTERED ([ID_DESCUENTO_LISTA_PRECIO]),
        CONSTRAINT [CK_DLP_FACTOR]
            CHECK ([FACTOR] > 0 AND [FACTOR] <= 2),
        CONSTRAINT [CK_DLP_ACTIVO]
            CHECK ([ACTIVO] IN ('S','N')),
        CONSTRAINT [CK_DLP_FECHAS]
            CHECK ([FECHA_FIN] >= [FECHA_INICIO])
    );
END 
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE [name] = N'IX_DLP_CALCULO'
    AND [object_id] = OBJECT_ID(N'[FEBECA].[DESCUENTO_LISTA_PRECIO]')
)
BEGIN
    CREATE INDEX [IX_DLP_CALCULO]
    ON [FEBECA].[DESCUENTO_LISTA_PRECIO]
    (
        [NIVEL_PRECIO_BASE],
        [NIVEL_PRECIO],
        [ARTICULO],
        [ACTIVO],
        [FECHA_INICIO],
        [FECHA_FIN]
    )
    INCLUDE ([FACTOR]);
END
GO

/* ================================================================
2) Tabla de auditoría de precios aplicados
================================================================ */
IF OBJECT_ID(N'[FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]', N'U') IS NULL
BEGIN
    CREATE TABLE [FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]
    (
        [ID_LOG] BIGINT IDENTITY(1,1) NOT NULL, 
        [RUN_ID] UNIQUEIDENTIFIER NOT NULL,
        [ACCION] VARCHAR(10) NOT NULL,
        [NIVEL_PRECIO_BASE] VARCHAR(50) NOT NULL,
        [VERSION_BASE] INT NULL,
        [NIVEL_PRECIO] VARCHAR(50) NOT NULL,
        [VERSION] INT NOT NULL,
        [ARTICULO] VARCHAR(20) NOT NULL,
        [PRECIO_BASE] DECIMAL(28,8) NULL,
        [FACTOR_GLOBAL] DECIMAL(28,8) NULL,
        [FACTOR_LISTA_ARTICULO] DECIMAL(28,8) NULL,
        [FACTOR_FINAL] DECIMAL(28,8) NULL,
        [PRECIO_ANTERIOR] DECIMAL(28,8) NULL,
        [PRECIO_NUEVO] DECIMAL(28,8) NULL,
        [COSTO_PROM_DOL] DECIMAL(28,8) NULL,
        [MARGEN_UTILIDAD_NUEVO] DECIMAL(28,8) NULL,
        [MARGEN_MULR_NUEVO] DECIMAL(28,8) NULL,
        [ID_DESCUENTO_LISTA_PRECIO] BIGINT NULL,
        [FECHA_EJECUCION] DATETIME NOT NULL
            CONSTRAINT [DF_APAL_FECHA_EJECUCION] DEFAULT (GETDATE()),
        [USUARIO_EJECUCION] VARCHAR(50) NOT NULL,
        CONSTRAINT [PK_ARTICULO_PRECIO_AJUSTE_LOG]
            PRIMARY KEY CLUSTERED ([ID_LOG]),
        CONSTRAINT [CK_APAL_ACCION]
            CHECK ([ACCION] IN ('INSERT','UPDATE'))
    );
END
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes 
    WHERE [name] = N'IX_APAL_BUSQUEDA'
    AND [object_id] = OBJECT_ID(N'[FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]')
)
BEGIN
    CREATE INDEX [IX_APAL_BUSQUEDA]
    ON [FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]
    ([RUN_ID], [NIVEL_PRECIO], [VERSION], [ARTICULO]);
END
GO

/* ================================================================
3) Tabla de rechazos de validación
================================================================ */
IF OBJECT_ID(N'[FEBECA].[ARTICULO_PRECIO_AJUSTE_RECHAZO]', N'U') IS NULL
BEGIN
    CREATE TABLE [FEBECA].[ARTICULO_PRECIO_AJUSTE_RECHAZO]
    (
        [ID_RECHAZO] BIGINT IDENTITY(1,1) NOT NULL,
        [RUN_ID] UNIQUEIDENTIFIER NOT NULL,
        [NIVEL_PRECIO_BASE] VARCHAR(50) NOT NULL,
        [VERSION_BASE] INT NULL,
        [NIVEL_PRECIO] VARCHAR(50) NOT NULL,
        [VERSION] INT NOT NULL,
        [ARTICULO] VARCHAR(20) NOT NULL,
        [PRECIO_BASE] DECIMAL(28,8) NULL,
        [FACTOR_GLOBAL] DECIMAL(28,8) NULL,
        [FACTOR_LISTA_ARTICULO] DECIMAL(28,8) NULL,
        [FACTOR_FINAL] DECIMAL(28,8) NULL,
        [PRECIO_CALCULADO] DECIMAL(28,8) NULL,
        [COSTO_PROM_DOL] DECIMAL(28,8) NULL,
        [MARGEN_UTILIDAD_CALCULADO] DECIMAL(28,8) NULL, 
        [MOTIVO_RECHAZO] VARCHAR(100) NOT NULL,
        [FECHA_EJECUCION] DATETIME NOT NULL
            CONSTRAINT [DF_APAR_FECHA_EJECUCION] DEFAULT (GETDATE()),
        [USUARIO_EJECUCION] VARCHAR(50) NOT NULL,
        CONSTRAINT [PK_ARTICULO_PRECIO_AJUSTE_RECHAZO]
            PRIMARY KEY CLUSTERED ([ID_RECHAZO])
    );
END
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE [name] = N'IX_APAR_BUSQUEDA'
    AND [object_id] = OBJECT_ID(N'[FEBECA].[ARTICULO_PRECIO_AJUSTE_RECHAZO]')
)
BEGIN
    CREATE INDEX [IX_APAR_BUSQUEDA]
    ON [FEBECA].[ARTICULO_PRECIO_AJUSTE_RECHAZO]
    ([RUN_ID], [NIVEL_PRECIO], [VERSION], [ARTICULO], [MOTIVO_RECHAZO]);
END
GO

/* ================================================================
4) Procedimiento FULL escalable para una o N listas destino
================================================================ */
CREATE OR ALTER PROCEDURE [FEBECA].[SP_GESTION_LISTAS_PRECIOS_FULL]
    @p_nivel_precio VARCHAR(50),
    @p_fecha_inicio DATE,
    @p_fecha_fin DATE, 
    @p_nivel_precio_base VARCHAR(50),
    @p_factor_multiplicador DECIMAL(28,8),
    @p_version INTEGER,
    @p_usuario_ult_modif VARCHAR(50) = 'SD',
    @p_margen_minimo DECIMAL(28,8) = 0,
    @p_validar_precio_bajo_costo BIT = 1,
    @p_exigir_factor_configurado BIT = 0,
    @p_actualizar_lista_base BIT = 0,
    @p_modo_validacion VARCHAR(10) = 'OMITIR'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RunId UNIQUEIDENTIFIER = NEWID();
    DECLARE @FechaEjecucion DATETIME = GETDATE();
    DECLARE @FactorGlobal DECIMAL(28,8) = COALESCE(@p_factor_multiplicador, 1);
    DECLARE @ModoValidacion VARCHAR(10) = UPPER(LTRIM(RTRIM(COALESCE(@p_modo_validacion, 'OMITIR'))));

    SET @p_nivel_precio = NULLIF(LTRIM(RTRIM(@p_nivel_precio)), '');
    SET @p_nivel_precio_base = NULLIF(LTRIM(RTRIM(@p_nivel_precio_base)), '');
    SET @p_usuario_ult_modif = COALESCE(NULLIF(LTRIM(RTRIM(@p_usuario_ult_modif)), ''), 'SD');
    SET @p_margen_minimo = COALESCE(@p_margen_minimo, 0);

    IF @p_fecha_inicio IS NULL OR @p_fecha_fin IS NULL OR @p_fecha_fin < @p_fecha_inicio
        THROW 51001, 'Rango de fechas inválido para la actualización de listas de precios.', 1; 

    IF @p_nivel_precio_base IS NULL
        THROW 51002, 'Debe indicar la lista de precios base.', 1;

    IF @p_version IS NULL
        THROW 51003, 'Debe indicar la versión destino.', 1;

    IF @FactorGlobal <= 0 OR @FactorGlobal > 2
        THROW 51004, 'El factor multiplicador global debe ser mayor que 0 y menor o igual que 2.', 1;

    IF @ModoValidacion NOT IN ('OMITIR','ERROR')
        THROW 51005, 'Modo de validación inválido. Valores permitidos: OMITIR, ERROR.', 1;

    CREATE TABLE #Listas
    (
        NIVEL_PRECIO VARCHAR(50) NOT NULL PRIMARY KEY,
        MONEDA_DESTINO VARCHAR(1) NULL
    );

    IF @p_nivel_precio IS NOT NULL
    BEGIN
        INSERT INTO #Listas (NIVEL_PRECIO, MONEDA_DESTINO)
        SELECT VN.NIVEL_PRECIO, MAX(VN.MONEDA) AS MONEDA_DESTINO
        FROM [FEBECA].[VERSION_NIVEL] VN
        WHERE VN.NIVEL_PRECIO = @p_nivel_precio
          AND VN.VERSION = @p_version
          AND VN.ESTADO = 'A'
          AND (@p_actualizar_lista_base = 1 OR VN.NIVEL_PRECIO <> @p_nivel_precio_base)
        GROUP BY VN.NIVEL_PRECIO; 
    END
    ELSE
    BEGIN
        INSERT INTO #Listas (NIVEL_PRECIO, MONEDA_DESTINO)
        SELECT VN.NIVEL_PRECIO, MAX(VN.MONEDA) AS MONEDA_DESTINO
        FROM
        (
            SELECT DISTINCT DLP.NIVEL_PRECIO
            FROM [FEBECA].[DESCUENTO_LISTA_PRECIO] DLP
            WHERE DLP.NIVEL_PRECIO_BASE = @p_nivel_precio_base
              AND DLP.ACTIVO = 'S'
              AND @p_fecha_inicio BETWEEN DLP.FECHA_INICIO AND DLP.FECHA_FIN
              AND (@p_actualizar_lista_base = 1 OR DLP.NIVEL_PRECIO <> @p_nivel_precio_base)
        ) L
        INNER JOIN [FEBECA].[VERSION_NIVEL] VN
            ON VN.NIVEL_PRECIO = L.NIVEL_PRECIO
           AND VN.VERSION = @p_version
           AND VN.ESTADO = 'A'
        GROUP BY VN.NIVEL_PRECIO;
    END;

    IF NOT EXISTS (SELECT 1 FROM #Listas)
        THROW 51006, 'No se encontraron listas destino con versión activa para procesar.', 1;

    ;WITH BaseActiva AS
    (
        SELECT
            AP.ARTICULO,
            AP.MONEDA, 
            AP.VERSION AS VERSION_BASE,
            AP.VERSION_ARTICULO,
            AP.PRECIO AS PRECIO_BASE,
            AP.ESQUEMA_TRABAJO,
            AP.MARGEN_UTILIDAD_MIN,
            CAST(A.COSTO_PROM_DOL AS DECIMAL(28,8)) AS COSTO_PROM_DOL,
            ROW_NUMBER() OVER (PARTITION BY AP.ARTICULO ORDER BY AP.VERSION DESC) AS RN
        FROM [FEBECA].[ARTICULO_PRECIO] AP
        INNER JOIN [FEBECA].[VERSION_NIVEL] VN
            ON AP.NIVEL_PRECIO = VN.NIVEL_PRECIO
           AND AP.VERSION = VN.VERSION
        INNER JOIN [FEBECA].[ARTICULO] A
            ON AP.ARTICULO = A.ARTICULO
        WHERE AP.NIVEL_PRECIO = @p_nivel_precio_base
          AND VN.ESTADO = 'A'
    )
    SELECT
        ARTICULO,
        MONEDA,
        VERSION_BASE,
        VERSION_ARTICULO,
        PRECIO_BASE,
        ESQUEMA_TRABAJO,
        MARGEN_UTILIDAD_MIN,
        COSTO_PROM_DOL
    INTO #Base
    FROM BaseActiva
    WHERE RN = 1;

    IF NOT EXISTS (SELECT 1 FROM #Base) 
        THROW 51007, 'No se encontraron precios base activos para la lista indicada.', 1;

    CREATE UNIQUE CLUSTERED INDEX IX_Base_Articulo ON #Base (ARTICULO);

    SELECT
        L.NIVEL_PRECIO,
        B.ARTICULO,
        COALESCE(NULLIF(L.MONEDA_DESTINO, ''), B.MONEDA) AS MONEDA,
        B.VERSION_BASE,
        B.VERSION_ARTICULO,
        B.PRECIO_BASE,
        B.ESQUEMA_TRABAJO,
        B.MARGEN_UTILIDAD_MIN,
        B.COSTO_PROM_DOL,
        FA.ID_DESCUENTO_LISTA_PRECIO,
        CAST(@FactorGlobal AS DECIMAL(28,8)) AS FACTOR_GLOBAL,
        CAST(COALESCE(FA.FACTOR, 1) AS DECIMAL(28,8)) AS FACTOR_LISTA_ARTICULO,
        CAST(ROUND(@FactorGlobal * COALESCE(FA.FACTOR, 1), 8) AS DECIMAL(28,8)) AS FACTOR_FINAL,
        CAST(ROUND(B.PRECIO_BASE * @FactorGlobal * COALESCE(FA.FACTOR, 1), 8) AS DECIMAL(28,8)) AS PRECIO_CALCULADO,
        CASE WHEN FA.ID_DESCUENTO_LISTA_PRECIO IS NULL THEN 0 ELSE 1 END AS TIENE_FACTOR_CONFIGURADO
    INTO #CalculoBase
    FROM #Base B
    CROSS JOIN #Listas L
    OUTER APPLY
    (
        SELECT TOP (1)
            DLP.ID_DESCUENTO_LISTA_PRECIO, DLP.FACTOR
        FROM [FEBECA].[DESCUENTO_LISTA_PRECIO] DLP
        WHERE DLP.NIVEL_PRECIO_BASE = @p_nivel_precio_base
          AND DLP.NIVEL_PRECIO = L.NIVEL_PRECIO
          AND DLP.ARTICULO = B.ARTICULO
          AND DLP.ACTIVO = 'S'
          AND @p_fecha_inicio BETWEEN DLP.FECHA_INICIO AND DLP.FECHA_FIN
        ORDER BY DLP.FECHA_INICIO DESC, DLP.ID_DESCUENTO_LISTA_PRECIO DESC
    ) FA;

    CREATE CLUSTERED INDEX IX_CalculoBase ON #CalculoBase (NIVEL_PRECIO, ARTICULO);

    SELECT
        C.*,
        CAST(
            CASE
                WHEN C.PRECIO_CALCULADO > 0 AND C.COSTO_PROM_DOL IS NOT NULL
                THEN 1 - (C.COSTO_PROM_DOL / NULLIF(C.PRECIO_CALCULADO, 0))
                ELSE NULL
            END AS DECIMAL(28,8)
        ) AS MARGEN_UTILIDAD_CALC,
        CAST(
            CASE
                WHEN C.PRECIO_BASE > 0 AND C.FACTOR_FINAL > 0 AND C.COSTO_PROM_DOL IS NOT NULL
                THEN 1 - (C.COSTO_PROM_DOL / NULLIF((C.PRECIO_BASE / C.FACTOR_FINAL), 0))
                ELSE NULL 
            END AS DECIMAL(28,8)
        ) AS MARGEN_MULR_CALC,
        CAST(
            CASE
                WHEN C.PRECIO_BASE IS NULL OR C.PRECIO_BASE <= 0
                THEN 'PRECIO_BASE_INVALIDO'
                WHEN @p_exigir_factor_configurado = 1 AND C.TIENE_FACTOR_CONFIGURADO = 0
                THEN 'FACTOR_NO_CONFIGURADO'
                WHEN C.FACTOR_LISTA_ARTICULO <= 0 OR C.FACTOR_LISTA_ARTICULO > 2
                THEN 'FACTOR_LISTA_FUERA_RANGO'
                WHEN C.FACTOR_FINAL <= 0 OR C.FACTOR_FINAL > 2
                THEN 'FACTOR_FINAL_FUERA_RANGO'
                WHEN C.PRECIO_CALCULADO IS NULL OR C.PRECIO_CALCULADO <= 0
                THEN 'PRECIO_CALCULADO_INVALIDO'
                WHEN @p_validar_precio_bajo_costo = 1
                 AND C.COSTO_PROM_DOL IS NOT NULL
                 AND C.PRECIO_CALCULADO < C.COSTO_PROM_DOL
                THEN 'PRECIO_DEBAJO_COSTO'
                WHEN @p_validar_precio_bajo_costo = 1
                 AND C.COSTO_PROM_DOL IS NOT NULL
                 AND (1 - (C.COSTO_PROM_DOL / NULLIF(C.PRECIO_CALCULADO, 0))) < @p_margen_minimo
                THEN 'MARGEN_MINIMO_NO_CUMPLE'
                ELSE NULL
            END AS VARCHAR(100)
        ) AS MOTIVO_RECHAZO
    INTO #Calculo
    FROM #CalculoBase C; 

    CREATE CLUSTERED INDEX IX_Calculo ON #Calculo (NIVEL_PRECIO, ARTICULO);

    INSERT INTO [FEBECA].[ARTICULO_PRECIO_AJUSTE_RECHAZO]
    (
        RUN_ID,
        NIVEL_PRECIO_BASE,
        VERSION_BASE,
        NIVEL_PRECIO,
        VERSION,
        ARTICULO,
        PRECIO_BASE,
        FACTOR_GLOBAL,
        FACTOR_LISTA_ARTICULO,
        FACTOR_FINAL,
        PRECIO_CALCULADO,
        COSTO_PROM_DOL,
        MARGEN_UTILIDAD_CALCULADO,
        MOTIVO_RECHAZO,
        FECHA_EJECUCION,
        USUARIO_EJECUCION
    )
    SELECT
        @RunId,
        @p_nivel_precio_base,
        C.VERSION_BASE,
        C.NIVEL_PRECIO,
        @p_version,
        C.ARTICULO,
        C.PRECIO_BASE,
        C.FACTOR_GLOBAL,
        C.FACTOR_LISTA_ARTICULO, 
        C.FACTOR_FINAL,
        C.PRECIO_CALCULADO,
        C.COSTO_PROM_DOL,
        C.MARGEN_UTILIDAD_CALC,
        C.MOTIVO_RECHAZO,
        @FechaEjecucion,
        @p_usuario_ult_modif
    FROM #Calculo C
    WHERE C.MOTIVO_RECHAZO IS NOT NULL;

    DECLARE @CantidadRechazos INT = (SELECT COUNT(1) FROM #Calculo WHERE MOTIVO_RECHAZO IS NOT NULL);

    IF @ModoValidacion = 'ERROR' AND @CantidadRechazos > 0
    BEGIN
        DECLARE @MensajeError NVARCHAR(2048) = CONCAT(
            'La actualización fue cancelada por validaciones de precios. Rechazos: ',
            @CantidadRechazos,
            '. RUN_ID: ',
            CONVERT(VARCHAR(36), @RunId),
            '. Revise FEBECA.ARTICULO_PRECIO_AJUSTE_RECHAZO.'
        );
        THROW 51008, @MensajeError, 1;
    END;

    SELECT
        NIVEL_PRECIO,
        ARTICULO,
        MONEDA,
        VERSION_BASE,
        VERSION_ARTICULO, 
        PRECIO_BASE,
        ESQUEMA_TRABAJO,
        MARGEN_UTILIDAD_MIN,
        COSTO_PROM_DOL,
        ID_DESCUENTO_LISTA_PRECIO,
        FACTOR_GLOBAL,
        FACTOR_LISTA_ARTICULO,
        FACTOR_FINAL,
        PRECIO_CALCULADO,
        MARGEN_UTILIDAD_CALC,
        MARGEN_MULR_CALC
    INTO #Validos
    FROM #Calculo
    WHERE MOTIVO_RECHAZO IS NULL;

    CREATE UNIQUE CLUSTERED INDEX IX_Validos ON #Validos (NIVEL_PRECIO, ARTICULO);

    SELECT
        V.*,
        T.PRECIO AS PRECIO_ANTERIOR
    INTO #Actualizables
    FROM #Validos V
    INNER JOIN [FEBECA].[ARTICULO_PRECIO] T
        ON T.NIVEL_PRECIO = V.NIVEL_PRECIO
       AND T.VERSION = @p_version
       AND T.ARTICULO = V.ARTICULO
    WHERE ISNULL(T.PRECIO, -1) <> ISNULL(V.PRECIO_CALCULADO, -1)
       OR ISNULL(T.MARGEN_UTILIDAD, -999999) <> ISNULL(V.MARGEN_UTILIDAD_CALC, -999999)
       OR ISNULL(T.MARGEN_MULR, -999999) <> ISNULL(V.MARGEN_MULR_CALC, -999999); 

    CREATE UNIQUE CLUSTERED INDEX IX_Actualizables ON #Actualizables (NIVEL_PRECIO, ARTICULO);

    SELECT V.*
    INTO #Insertables
    FROM #Validos V
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM [FEBECA].[ARTICULO_PRECIO] T
        WHERE T.NIVEL_PRECIO = V.NIVEL_PRECIO
          AND T.VERSION = @p_version
          AND T.ARTICULO = V.ARTICULO
    );

    CREATE UNIQUE CLUSTERED INDEX IX_Insertables ON #Insertables (NIVEL_PRECIO, ARTICULO);

    DECLARE @Actualizados INT = 0;
    DECLARE @Insertados INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE T
        SET
            T.PRECIO = V.PRECIO_CALCULADO,
            T.MARGEN_UTILIDAD = V.MARGEN_UTILIDAD_CALC,
            T.MARGEN_MULR = V.MARGEN_MULR_CALC,
            T.FECHA_ULT_MODIF = @FechaEjecucion,
            T.USUARIO_ULT_MODIF = @p_usuario_ult_modif 
        FROM [FEBECA].[ARTICULO_PRECIO] T
        INNER JOIN #Actualizables V
            ON T.NIVEL_PRECIO = V.NIVEL_PRECIO
           AND T.VERSION = @p_version
           AND T.ARTICULO = V.ARTICULO;

        SET @Actualizados = @@ROWCOUNT;

        INSERT INTO [FEBECA].[ARTICULO_PRECIO]
        (
            NIVEL_PRECIO,
            MONEDA,
            VERSION,
            ARTICULO,
            VERSION_ARTICULO,
            PRECIO,
            ESQUEMA_TRABAJO,
            MARGEN_MULR,
            MARGEN_UTILIDAD,
            FECHA_INICIO,
            FECHA_FIN,
            FECHA_ULT_MODIF,
            USUARIO_ULT_MODIF,
            MARGEN_UTILIDAD_MIN
        )
        SELECT
            V.NIVEL_PRECIO,
            V.MONEDA,
            @p_version,
            V.ARTICULO,
            V.VERSION_ARTICULO,
            V.PRECIO_CALCULADO, 
            V.ESQUEMA_TRABAJO,
            V.MARGEN_MULR_CALC,
            V.MARGEN_UTILIDAD_CALC,
            @p_fecha_inicio,
            @p_fecha_fin,
            @FechaEjecucion,
            @p_usuario_ult_modif,
            V.MARGEN_UTILIDAD_MIN
        FROM #Insertables V;

        SET @Insertados = @@ROWCOUNT;

        INSERT INTO [FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]
        (
            RUN_ID,
            ACCION,
            NIVEL_PRECIO_BASE,
            VERSION_BASE,
            NIVEL_PRECIO,
            VERSION,
            ARTICULO,
            PRECIO_BASE,
            FACTOR_GLOBAL,
            FACTOR_LISTA_ARTICULO,
            FACTOR_FINAL,
            PRECIO_ANTERIOR,
            PRECIO_NUEVO,
            COSTO_PROM_DOL,
            MARGEN_UTILIDAD_NUEVO,
            MARGEN_MULR_NUEVO,
            ID_DESCUENTO_LISTA_PRECIO,
            FECHA_EJECUCION, 
            USUARIO_EJECUCION
        )
        SELECT
            @RunId,
            'UPDATE',
            @p_nivel_precio_base,
            V.VERSION_BASE,
            V.NIVEL_PRECIO,
            @p_version,
            V.ARTICULO,
            V.PRECIO_BASE,
            V.FACTOR_GLOBAL,
            V.FACTOR_LISTA_ARTICULO,
            V.FACTOR_FINAL,
            V.PRECIO_ANTERIOR,
            V.PRECIO_CALCULADO,
            V.COSTO_PROM_DOL,
            V.MARGEN_UTILIDAD_CALC,
            V.MARGEN_MULR_CALC,
            V.ID_DESCUENTO_LISTA_PRECIO,
            @FechaEjecucion,
            @p_usuario_ult_modif
        FROM #Actualizables V;

        INSERT INTO [FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]
        (
            RUN_ID,
            ACCION,
            NIVEL_PRECIO_BASE,
            VERSION_BASE,
            NIVEL_PRECIO,
            VERSION, 
            ARTICULO,
            PRECIO_BASE,
            FACTOR_GLOBAL,
            FACTOR_LISTA_ARTICULO,
            FACTOR_FINAL,
            PRECIO_ANTERIOR,
            PRECIO_NUEVO,
            COSTO_PROM_DOL,
            MARGEN_UTILIDAD_NUEVO,
            MARGEN_MULR_NUEVO,
            ID_DESCUENTO_LISTA_PRECIO,
            FECHA_EJECUCION,
            USUARIO_EJECUCION
        )
        SELECT
            @RunId,
            'INSERT',
            @p_nivel_precio_base,
            V.VERSION_BASE,
            V.NIVEL_PRECIO,
            @p_version,
            V.ARTICULO,
            V.PRECIO_BASE,
            V.FACTOR_GLOBAL,
            V.FACTOR_LISTA_ARTICULO,
            V.FACTOR_FINAL,
            NULL,
            V.PRECIO_CALCULADO,
            V.COSTO_PROM_DOL,
            V.MARGEN_UTILIDAD_CALC,
            V.MARGEN_MULR_CALC,
            V.ID_DESCUENTO_LISTA_PRECIO, 
            @FechaEjecucion,
            @p_usuario_ult_modif
        FROM #Insertables V;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        @RunId AS RUN_ID,
        @p_nivel_precio_base AS NIVEL_PRECIO_BASE,
        COALESCE(@p_nivel_precio, '<TODAS>') AS NIVEL_PRECIO_PARAMETRO,
        @p_version AS VERSION_DESTINO,
        @FactorGlobal AS FACTOR_GLOBAL,
        @ModoValidacion AS MODO_VALIDACION,
        (SELECT COUNT(1) FROM #Listas) AS LISTAS_DESTINO,
        (SELECT COUNT(1) FROM #Base) AS ARTICULOS_BASE,
        (SELECT COUNT(1) FROM #Calculo) AS PRECIOS_EVALUADOS,
        (SELECT COUNT(1) FROM #Validos) AS PRECIOS_VALIDOS,
        @Insertados AS PRECIOS_INSERTADOS,
        @Actualizados AS PRECIOS_ACTUALIZADOS,
        @CantidadRechazos AS PRECIOS_RECHAZADOS;

    SELECT TOP (200)
        NIVEL_PRECIO,
        ARTICULO,
        PRECIO_BASE,
        FACTOR_GLOBAL, 
        FACTOR_LISTA_ARTICULO,
        FACTOR_FINAL,
        PRECIO_CALCULADO,
        COSTO_PROM_DOL,
        MARGEN_UTILIDAD_CALC,
        MOTIVO_RECHAZO
    FROM #Calculo
    WHERE MOTIVO_RECHAZO IS NOT NULL
    ORDER BY NIVEL_PRECIO, ARTICULO;
END
GO
```

### Ejemplos de ejecución

```sql
/* Ejemplo A: procesar una lista específica con factor final en DESCUENTO_LISTA_PRECIO. */
EXEC [FEBECA].[SP_GESTION_LISTAS_PRECIOS_FULL]
    @p_nivel_precio = 'LPV1',
    @p_fecha_inicio = '2026-05-04',
    @p_fecha_fin = '9999-12-31',
    @p_nivel_precio_base = 'MAYOREO',
    @p_factor_multiplicador = 1,
    @p_version = 1,
    @p_usuario_ult_modif = 'SD',
    @p_margen_minimo = 0,
    @p_validar_precio_bajo_costo = 1,
    @p_exigir_factor_configurado = 0,
    @p_modo_validacion = 'OMITIR';

/* Ejemplo B: procesar todas las listas configuradas para la base. */
EXEC [FEBECA].[SP_GESTION_LISTAS_PRECIOS_FULL]
    @p_nivel_precio = NULL,
    @p_fecha_inicio = '2026-05-04',
    @p_fecha_fin = '9999-12-31',
    @p_nivel_precio_base = 'MAYOREOD',
    @p_factor_multiplicador = 1,
    @p_version = 1,
    @p_usuario_ult_modif = 'SD',
    @p_margen_minimo = 0,
    @p_validar_precio_bajo_costo = 1,
    @p_exigir_factor_configurado = 0,
    @p_modo_validacion = 'OMITIR';

/* Ejemplo C: cancelar toda la corrida si existe cualquier precio inválido. */
EXEC [FEBECA].[SP_GESTION_LISTAS_PRECIOS_FULL]
    @p_nivel_precio = NULL,
    @p_fecha_inicio = '2026-05-04',
    @p_fecha_fin = '9999-12-31',
    @p_nivel_precio_base = 'MAYOREOD',
    @p_factor_multiplicador = 1,
    @p_version = 2,
    @p_usuario_ult_modif = 'SD',
    @p_margen_minimo = 0.05,
    @p_validar_precio_bajo_costo = 1,
    @p_exigir_factor_configurado = 1,
    @p_modo_validacion = 'ERROR';
```

---

## 15. Recomendaciones finales

* Ejecutar primero con `@p_modo_validacion = 'ERROR'` para detectar datos inválidos sin modificar `ARTICULO_PRECIO`.
* Conciliar una muestra de artículos por lista contra cálculo manual antes de activar el job productivo.
* Mantener un reporte operativo sobre `ARTICULO_PRECIO_AJUSTE_RECHAZO` para que Compras/Mercadeo corrijan factores fuera de rango o precios bajo costo.
* Crear una política de versiones: cuando existan transacciones relevantes, evitar sobrescribir una versión histórica y preferir una versión nueva aprobada.
* Medir y comparar los tiempos de ejecución de la versión actual y el script modificado.
