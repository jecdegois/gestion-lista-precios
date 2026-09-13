USE [SOFTLANDQA]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* ============================================================================
   PROCEDIMIENTO: [COFER].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO]
   ----------------------------------------------------------------------------
   Regla de Mayoreo — calcula y persiste el MARGEN MÍNIMO por artículo en la
   columna nativa [COFER].[ARTICULO_PRECIO].[MARGEN_UTILIDAD_MIN].

   Para cada artículo de la lista/versión indicada:

     1) Margen Promedio = (Precio Lista - Costo Promedio) / Precio Lista
        (equivalente a 1 - Costo/Precio; se protege contra Precio <= 0).

     2) Factor de Reducción: se lee la excepción activa del artículo en la UDF
        real [COFER].[U_FACTOR_REDUCCION_MARGEN] (U_CODIGO = ARTICULO,
        U_ACTIVO = 'S'). Esa columna almacena el PORCENTAJE explícito
        (10.00 = 10%), por lo que el SP lo divide entre 100.0 para obtener el
        factor normalizado (0.10). Si no existe registro, aplica el 10% general
        por defecto (@p_factor_reduccion_default = 0.10, ya normalizado).

     3) Margen Mínimo = Margen Promedio * (1 - Factor Reducción normalizado).

     4) Se actualiza ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN con ese valor.

   El SP puede ejecutarse:
     - Para un artículo específico  (@p_articulo = 'ART-231')
     - Para toda una lista/versión  (@p_articulo = NULL)

   Entorno MULTIEMPRESA: este script usa el esquema [COFER] como referencia.
   La capa de datos conecta dinámicamente a la base Softland de la compañía
   activa y ejecuta el SP y la lectura de la UDF sobre ese catálogo; para otra
   compañía se despliega el mismo objeto cambiando el esquema/catálogo destino.

   Es idempotente: recalcula y sobrescribe MARGEN_UTILIDAD_MIN en cada corrida.
   ============================================================================ */
CREATE OR ALTER PROCEDURE [COFER].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO]
    @p_nivel_precio VARCHAR(50),
    @p_version INTEGER,
    @p_articulo VARCHAR(20) = NULL,                 -- NULL => todos los artículos de la lista/versión
    @p_factor_reduccion_default DECIMAL(5,4) = 0.10, -- fracción interna normalizada: 10%; no recibe porcentajes enteros
    @p_usuario_ult_modif VARCHAR(50) = 'SD'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FechaEjecucion DATETIME = GETDATE();

    SET @p_nivel_precio      = NULLIF(LTRIM(RTRIM(@p_nivel_precio)), '');
    SET @p_articulo          = NULLIF(LTRIM(RTRIM(@p_articulo)), '');
    SET @p_usuario_ult_modif = COALESCE(NULLIF(LTRIM(RTRIM(@p_usuario_ult_modif)), ''), 'SD');
    SET @p_factor_reduccion_default = COALESCE(@p_factor_reduccion_default, 0.10);

    IF @p_nivel_precio IS NULL
        THROW 52001, 'Debe indicar la lista de precios (nivel de precio).', 1;

    IF @p_version IS NULL
        THROW 52002, 'Debe indicar la versión.', 1;

    IF @p_factor_reduccion_default < 0 OR @p_factor_reduccion_default >= 1
        THROW 52003, 'El factor de reducción por defecto debe estar en el rango [0, 1).', 1;

    /* --------------------------------------------------------------------
       Cálculo set-based: margen promedio, factor de reducción efectivo y
       margen mínimo por artículo.
       -------------------------------------------------------------------- */
    SELECT
        AP.ARTICULO,
        AP.NIVEL_PRECIO,
        AP.VERSION,
        CAST(AP.PRECIO AS DECIMAL(28,8)) AS PRECIO_LISTA,
        CAST(A.COSTO_PROM_DOL AS DECIMAL(28,8)) AS COSTO_PROM_DOL,
        /* Margen Promedio = (Precio - Costo) / Precio. NULL si precio <= 0. */
        CAST(
            CASE
                WHEN AP.PRECIO > 0 AND A.COSTO_PROM_DOL IS NOT NULL
                THEN (AP.PRECIO - A.COSTO_PROM_DOL) / NULLIF(AP.PRECIO, 0)
                ELSE NULL
            END AS DECIMAL(28,8)
        ) AS MARGEN_PROMEDIO,
        /* Factor de reducción efectivo del artículo, ya NORMALIZADO en [0,1).
           La UDF real [COFER].[U_FACTOR_REDUCCION_MARGEN] guarda el PORCENTAJE
           explícito (10.00 = 10%), por lo que se divide entre 100.0. Si el
           artículo no tiene excepción activa, se usa el default normalizado. */
        CAST(
            CASE
                WHEN FR.U_FACTOR_REDUCCION IS NULL THEN @p_factor_reduccion_default
                ELSE FR.U_FACTOR_REDUCCION / 100.0
            END AS DECIMAL(9,6)
        ) AS FACTOR_REDUCCION_EFECTIVO,
        CASE WHEN FR.U_FACTOR_REDUCCION IS NULL THEN 0 ELSE 1 END AS TIENE_EXCEPCION
    INTO #Calculo
    FROM [COFER].[ARTICULO_PRECIO] AP
    INNER JOIN [COFER].[ARTICULO] A
        ON A.ARTICULO = AP.ARTICULO
    OUTER APPLY
    (
        /* Excepción activa por artículo. La UDF no maneja vigencias: solo se
           evalúa U_ACTIVO = 'S' (U_CODIGO es el código de artículo). */
        SELECT TOP (1) U.U_FACTOR_REDUCCION
        FROM [COFER].[U_FACTOR_REDUCCION_MARGEN] U
        WHERE U.U_CODIGO = AP.ARTICULO
          AND U.U_ACTIVO = 'S'
        ORDER BY U.U_FACTOR_REDUCCION DESC
    ) FR
    WHERE AP.NIVEL_PRECIO = @p_nivel_precio
      AND AP.VERSION = @p_version
      AND (@p_articulo IS NULL OR AP.ARTICULO = @p_articulo);

    /* Margen Mínimo = Margen Promedio * (1 - Factor Reducción).
       Se acota a [0, 1) para evitar valores negativos por costos > precio. */
    ALTER TABLE #Calculo ADD MARGEN_MINIMO DECIMAL(28,8) NULL;

    UPDATE #Calculo
    SET MARGEN_MINIMO =
        CASE
            WHEN MARGEN_PROMEDIO IS NULL THEN NULL
            ELSE
                CASE
                    WHEN MARGEN_PROMEDIO * (1 - FACTOR_REDUCCION_EFECTIVO) < 0 THEN 0
                    ELSE MARGEN_PROMEDIO * (1 - FACTOR_REDUCCION_EFECTIVO)
                END
        END;

    /* --------------------------------------------------------------------
       Persistencia en ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN.
       -------------------------------------------------------------------- */
    DECLARE @Actualizados INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE AP
        SET
            AP.MARGEN_UTILIDAD_MIN = C.MARGEN_MINIMO,
            AP.FECHA_ULT_MODIF = @FechaEjecucion,
            AP.USUARIO_ULT_MODIF = @p_usuario_ult_modif
        FROM [COFER].[ARTICULO_PRECIO] AP
        INNER JOIN #Calculo C
            ON C.ARTICULO = AP.ARTICULO
           AND C.NIVEL_PRECIO = AP.NIVEL_PRECIO
           AND C.VERSION = AP.VERSION
        WHERE C.MARGEN_MINIMO IS NOT NULL;

        SET @Actualizados = @@ROWCOUNT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    /* --------------------------------------------------------------------
       Salidas: resumen + detalle (útil para auditoría y para poblar la UI).
       -------------------------------------------------------------------- */
    SELECT
        @p_nivel_precio AS NIVEL_PRECIO,
        @p_version AS VERSION,
        COALESCE(@p_articulo, '<TODOS>') AS ARTICULO_PARAMETRO,
        @p_factor_reduccion_default AS FACTOR_REDUCCION_DEFAULT,
        (SELECT COUNT(1) FROM #Calculo) AS ARTICULOS_EVALUADOS,
        (SELECT COUNT(1) FROM #Calculo WHERE MARGEN_MINIMO IS NOT NULL) AS ARTICULOS_CON_MARGEN,
        @Actualizados AS ARTICULOS_ACTUALIZADOS;

    SELECT
        ARTICULO,
        PRECIO_LISTA,
        COSTO_PROM_DOL,
        MARGEN_PROMEDIO,
        FACTOR_REDUCCION_EFECTIVO,
        CASE WHEN TIENE_EXCEPCION = 1 THEN 'EXCEPCION_UDF' ELSE 'DEFAULT_10PCT' END AS ORIGEN_FACTOR,
        MARGEN_MINIMO
    FROM #Calculo
    ORDER BY ARTICULO;
END
GO
