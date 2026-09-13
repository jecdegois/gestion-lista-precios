USE [SOFTLANDQA]
GO

/****** Object:  StoredProcedure [BEVAL].[SP_GESTION_LISTAS_PRECIOS_PARCIAL]    Script Date: 13/9/2026 2:16:11 p. m. ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


------------------------------------------------------------------------------
-- 7) BEVAL.SP_GESTION_LISTAS_PRECIOS_PARCIAL
------------------------------------------------------------------------------
CREATE   procedure [BEVAL].[SP_GESTION_LISTAS_PRECIOS_PARCIAL]
    @p_nivel_precio VARCHAR(50),
    @p_fecha_inicio DATE,
    @p_fecha_fin DATE,
    @p_nivel_precio_base VARCHAR(50),
    @p_factor_multiplicador DECIMAL(28,8),
    @p_horas_atras INTEGER,
    @p_version INTEGER,
    @p_usuario_ult_modif VARCHAR(50) = 'SD',
    @p_validar_precio_bajo_costo BIT = 1,
    @p_exigir_factor_configurado BIT = 1,
    @p_excepciones VARCHAR(MAX) = NULL
	AS
    BEGIN
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        DECLARE @RunId UNIQUEIDENTIFIER = NEWID();
        DECLARE @FechaEjecucion DATETIME = GETDATE();
        DECLARE @Insertados INT = 0;
        DECLARE @Actualizados INT = 0;
        DECLARE @Rechazados INT = 0;
        DECLARE @VersionBase INT = NULL;
        DECLARE @Estado VARCHAR(15) = 'FINALIZADO';
        DECLARE @MensajeError VARCHAR(2048) = NULL;
        DECLARE @FechaLimite DATETIME;

        IF @p_nivel_precio IS NULL OR @p_nivel_precio_base IS NULL
            THROW 52001, 'Debe indicar la lista destino y la lista base.', 1;
        IF @p_nivel_precio = @p_nivel_precio_base
            THROW 52002, 'La lista destino no puede ser la misma lista base.', 1;
        IF @p_factor_multiplicador IS NULL OR @p_factor_multiplicador <= 0 OR @p_factor_multiplicador > 2
            THROW 52003, 'El factor multiplicador global debe ser mayor que 0 y menor o igual que 2.', 1;
        IF @p_version IS NULL OR @p_version <= 0
            THROW 52004, 'Debe indicar una version destino valida.', 1;
        IF @p_horas_atras IS NULL OR @p_horas_atras < 0
            THROW 52005, 'HORAS_ATRAS debe ser mayor o igual que cero.', 1;

        BEGIN TRY
            SELECT @VersionBase = MAX(VN.VERSION)
            FROM BEVAL.VERSION_NIVEL VN (NOLOCK)
            WHERE VN.NIVEL_PRECIO = @p_nivel_precio_base AND VN.ESTADO = 'A';

            SET @FechaLimite = DATEADD(HOUR, -@p_horas_atras, GETDATE());

            CREATE TABLE #temporal_excepciones (ARTICULO VARCHAR(20) NOT NULL PRIMARY KEY);
            IF @p_excepciones IS NOT NULL AND LEN(@p_excepciones) > 0
            BEGIN
                INSERT INTO #temporal_excepciones (ARTICULO)
                SELECT DISTINCT CAST(Split.a.value('.', 'NVARCHAR(MAX)') AS VARCHAR(20))
                FROM (SELECT CAST('<X>' + REPLACE(@p_excepciones, ',', '</X><X>') + '</X>' AS XML) AS Cadena) AS X
                CROSS APPLY Cadena.nodes('/X') AS Split(a);
            END

            BEGIN TRANSACTION;

            INSERT
            INTO
                BEVAL.ARTICULO_PRECIO
                (NIVEL_PRECIO,MONEDA,VERSION,ARTICULO,VERSION_ARTICULO,PRECIO,ESQUEMA_TRABAJO,MARGEN_MULR,MARGEN_UTILIDAD,FECHA_INICIO,FECHA_FIN,FECHA_ULT_MODIF,USUARIO_ULT_MODIF,MARGEN_UTILIDAD_MIN)
            SELECT
                @p_nivel_precio, AP.MONEDA, @p_version, AP.ARTICULO, AP.VERSION_ARTICULO, AP.PRECIO,
                AP.ESQUEMA_TRABAJO, AP.MARGEN_MULR, AP.MARGEN_UTILIDAD, @p_fecha_inicio, @p_fecha_fin,
                GETDATE(), @p_usuario_ult_modif, AP.MARGEN_UTILIDAD_MIN
            FROM BEVAL.ARTICULO_PRECIO AP (NOLOCK)
            INNER JOIN BEVAL.VERSION_NIVEL VN (NOLOCK) ON AP.NIVEL_PRECIO = VN.NIVEL_PRECIO AND AP.VERSION = VN.VERSION
            LEFT JOIN BEVAL.FACTOR_ARTICULO_LISTA FAL (NOLOCK)
                ON FAL.NIVEL_PRECIO_BASE = AP.NIVEL_PRECIO AND FAL.NIVEL_PRECIO = @p_nivel_precio
               AND FAL.VERSION = @p_version AND FAL.ARTICULO = AP.ARTICULO
            WHERE AP.NIVEL_PRECIO = @p_nivel_precio_base
            AND VN.ESTADO = 'A'
            AND (AP.RecordDate >= @FechaLimite OR FAL.RecordDate >= @FechaLimite)
            AND AP.ARTICULO NOT IN
                (SELECT AP2.ARTICULO
                    FROM BEVAL.ARTICULO_PRECIO AP2 (NOLOCK)
                    INNER JOIN BEVAL.VERSION_NIVEL VN2 (NOLOCK) ON AP2.NIVEL_PRECIO = VN2.NIVEL_PRECIO AND AP2.VERSION = VN2.VERSION
                    WHERE AP2.NIVEL_PRECIO = @p_nivel_precio AND VN2.ESTADO = 'A' AND AP2.VERSION = @p_version);

            SET @Insertados = @@ROWCOUNT;

            SELECT AP.ARTICULO, AP.PRECIO, AP.MARGEN_MULR, AP.MARGEN_UTILIDAD, AP.MARGEN_UTILIDAD_MIN
            INTO #temporal_factor_lista
            FROM BEVAL.ARTICULO_PRECIO AP (NOLOCK)
            INNER JOIN BEVAL.VERSION_NIVEL VN (NOLOCK) ON AP.NIVEL_PRECIO = VN.NIVEL_PRECIO AND AP.VERSION = VN.VERSION
            LEFT JOIN BEVAL.FACTOR_ARTICULO_LISTA FAL (NOLOCK)
                ON FAL.NIVEL_PRECIO_BASE = AP.NIVEL_PRECIO AND FAL.NIVEL_PRECIO = @p_nivel_precio
               AND FAL.VERSION = @p_version AND FAL.ARTICULO = AP.ARTICULO
            WHERE AP.NIVEL_PRECIO = @p_nivel_precio_base
            AND VN.ESTADO = 'A'
            AND (AP.RecordDate >= @FechaLimite OR FAL.RecordDate >= @FechaLimite);

            SELECT FAL.ARTICULO, FAL.FACTOR, FAL.ID_FACTOR_ARTICULO_LISTA
            INTO #temporal_factor_articulo
            FROM BEVAL.FACTOR_ARTICULO_LISTA FAL (NOLOCK)
            WHERE FAL.NIVEL_PRECIO_BASE = @p_nivel_precio_base
              AND FAL.NIVEL_PRECIO = @p_nivel_precio AND FAL.VERSION = @p_version
              AND FAL.ACTIVO = 'S' AND @p_fecha_inicio BETWEEN FAL.FECHA_INICIO AND FAL.FECHA_FIN;

            -- Margen minimo exigido: el del propio articulo en la lista DESTINO
            -- (AP.MARGEN_UTILIDAD_MIN) si ya fue calculado; si es NULL (articulo
            -- recien insertado, aun sin corrida de SP_CALCULAR_MARGEN_MINIMO), se
            -- usa como fallback el MARGEN_UTILIDAD_MIN del mismo articulo en la
            -- lista BASE (TFL.MARGEN_UTILIDAD_MIN). Ya NO se usa el margen minimo
            -- global de la lista (columna retirada de dbo.GESTION_LISTAS_PRECIOS).
            UPDATE AP
            SET AP.PRECIO = (TFL.PRECIO * (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1))),
                AP.MARGEN_UTILIDAD = 1 - CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END / (TFL.PRECIO *  (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1))),
                AP.MARGEN_MULR = 1 - CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END / (TFL.PRECIO /  (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)))
            FROM BEVAL.ARTICULO_PRECIO AP
            INNER JOIN BEVAL.ARTICULO A ON AP.ARTICULO = A.ARTICULO
            INNER JOIN #temporal_factor_lista TFL ON AP.ARTICULO = TFL.ARTICULO
            INNER JOIN BEVAL.VERSION_NIVEL VN ON AP.NIVEL_PRECIO = VN.NIVEL_PRECIO AND AP.VERSION = VN.VERSION
            LEFT JOIN #temporal_factor_articulo TFA ON AP.ARTICULO = TFA.ARTICULO
            LEFT JOIN #temporal_excepciones TEX ON AP.ARTICULO = TEX.ARTICULO
            WHERE AP.NIVEL_PRECIO = @p_nivel_precio AND VN.ESTADO = 'A' AND AP.VERSION = @p_version
              AND TEX.ARTICULO IS NULL
              AND TFL.PRECIO > 0
              AND (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)) > 0
              AND (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)) <= 2
              AND (@p_exigir_factor_configurado = 0 OR TFA.ID_FACTOR_ARTICULO_LISTA IS NOT NULL)
              AND (@p_validar_precio_bajo_costo = 0
                    OR (TFL.PRECIO * (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1))) >= CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END)
              AND (@p_validar_precio_bajo_costo = 0
                    OR (1 - CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END / (TFL.PRECIO * (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)))) >= COALESCE(AP.MARGEN_UTILIDAD_MIN, TFL.MARGEN_UTILIDAD_MIN));

            SET @Actualizados = @@ROWCOUNT;

            COMMIT TRANSACTION;

            SELECT
                AP.ARTICULO, TFL.PRECIO AS PRECIO_BASE, @p_factor_multiplicador AS FACTOR_GLOBAL,
                COALESCE(TFA.FACTOR,1) AS FACTOR_ARTICULO,
                (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)) AS FACTOR_FINAL,
                (TFL.PRECIO * (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1))) AS PRECIO_CALCULADO,
                CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END AS COSTO_PROM_DOL,
                CASE
                    WHEN TEX.ARTICULO IS NOT NULL THEN 'ARTICULO_EN_EXCEPCION'
                    WHEN TFL.PRECIO IS NULL OR TFL.PRECIO <= 0 THEN 'PRECIO_BASE_INVALIDO'
                    WHEN @p_exigir_factor_configurado = 1 AND TFA.ID_FACTOR_ARTICULO_LISTA IS NULL THEN 'FACTOR_NO_CONFIGURADO'
                    WHEN (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)) <= 0 OR (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)) > 2 THEN 'FACTOR_FINAL_FUERA_RANGO'
                    WHEN @p_validar_precio_bajo_costo = 1 AND (TFL.PRECIO * (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1))) < CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END THEN 'PRECIO_DEBAJO_COSTO'
                    WHEN @p_validar_precio_bajo_costo = 1 AND (1 - CASE WHEN AP.MONEDA = 'L' THEN A.COSTO_PROM_LOC ELSE A.COSTO_PROM_DOL END / (TFL.PRECIO * (@p_factor_multiplicador * COALESCE(TFA.FACTOR,1)))) < COALESCE(AP.MARGEN_UTILIDAD_MIN, TFL.MARGEN_UTILIDAD_MIN) THEN 'MARGEN_MINIMO_NO_CUMPLE'
                    ELSE NULL
                END AS MOTIVO_RECHAZO
            INTO #temporal_rechazos
            FROM BEVAL.ARTICULO_PRECIO AP
            INNER JOIN BEVAL.ARTICULO A ON AP.ARTICULO = A.ARTICULO
            INNER JOIN #temporal_factor_lista TFL ON AP.ARTICULO = TFL.ARTICULO
            INNER JOIN BEVAL.VERSION_NIVEL VN ON AP.NIVEL_PRECIO = VN.NIVEL_PRECIO AND AP.VERSION = VN.VERSION
            LEFT JOIN #temporal_factor_articulo TFA ON AP.ARTICULO = TFA.ARTICULO
            LEFT JOIN #temporal_excepciones TEX ON AP.ARTICULO = TEX.ARTICULO
            WHERE AP.NIVEL_PRECIO = @p_nivel_precio AND VN.ESTADO = 'A' AND AP.VERSION = @p_version;

            SELECT @Rechazados = COUNT(1) FROM #temporal_rechazos WHERE MOTIVO_RECHAZO IS NOT NULL;

            INSERT INTO dbo.LISTAS_PRECIOS_RECHAZO
            (RUN_ID, COMPANIA, NIVEL_PRECIO_BASE, VERSION_BASE, NIVEL_PRECIO, VERSION, ARTICULO,
             PRECIO_BASE, FACTOR_GLOBAL, FACTOR_ARTICULO, FACTOR_FINAL, PRECIO_CALCULADO,
             COSTO_PROM_DOL, MOTIVO_RECHAZO, FECHA_EJECUCION, USUARIO_EJECUCION)
            SELECT
                @RunId, 'BEVAL', @p_nivel_precio_base, @VersionBase, @p_nivel_precio, @p_version, TR.ARTICULO,
                TR.PRECIO_BASE, TR.FACTOR_GLOBAL, TR.FACTOR_ARTICULO, TR.FACTOR_FINAL, TR.PRECIO_CALCULADO,
                TR.COSTO_PROM_DOL, TR.MOTIVO_RECHAZO, @FechaEjecucion, @p_usuario_ult_modif
            FROM #temporal_rechazos TR
            WHERE TR.MOTIVO_RECHAZO IS NOT NULL;

            INSERT INTO dbo.LISTAS_PRECIOS_LOG_EJECUCION
            (RUN_ID, COMPANIA, NIVEL_PRECIO, NIVEL_PRECIO_BASE, VERSION, TIPO_EJECUCION, ESTADO,
             ARTICULOS_EVALUADOS, ARTICULOS_INSERTADOS, ARTICULOS_ACTUALIZADOS, ARTICULOS_RECHAZADOS,
             FECHA_INICIO, FECHA_FIN, USUARIO_EJECUCION)
            SELECT
                @RunId, 'BEVAL', @p_nivel_precio, @p_nivel_precio_base, @p_version, 'PARCIAL', @Estado,
                (SELECT COUNT(1) FROM #temporal_rechazos), @Insertados, @Actualizados, @Rechazados,
                @FechaEjecucion, GETDATE(), @p_usuario_ult_modif;

            DROP TABLE #temporal_factor_lista;
            DROP TABLE #temporal_factor_articulo;
            DROP TABLE #temporal_excepciones;
            DROP TABLE #temporal_rechazos;
        END TRY
        BEGIN CATCH
            IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;

            SET @MensajeError = ERROR_MESSAGE();

            INSERT INTO dbo.LISTAS_PRECIOS_LOG_EJECUCION
            (RUN_ID, COMPANIA, NIVEL_PRECIO, NIVEL_PRECIO_BASE, VERSION, TIPO_EJECUCION, ESTADO,
             ARTICULOS_INSERTADOS, ARTICULOS_ACTUALIZADOS, ARTICULOS_RECHAZADOS, MENSAJE_ERROR,
             FECHA_INICIO, FECHA_FIN, USUARIO_EJECUCION)
            SELECT
                @RunId, 'BEVAL', @p_nivel_precio, @p_nivel_precio_base, @p_version, 'PARCIAL', 'ERROR',
                @Insertados, @Actualizados, @Rechazados, @MensajeError,
                @FechaEjecucion, GETDATE(), @p_usuario_ult_modif;

            IF OBJECT_ID('tempdb..#temporal_factor_lista') IS NOT NULL DROP TABLE #temporal_factor_lista;
            IF OBJECT_ID('tempdb..#temporal_factor_articulo') IS NOT NULL DROP TABLE #temporal_factor_articulo;
            IF OBJECT_ID('tempdb..#temporal_excepciones') IS NOT NULL DROP TABLE #temporal_excepciones;
            IF OBJECT_ID('tempdb..#temporal_rechazos') IS NOT NULL DROP TABLE #temporal_rechazos;

            THROW;
        END CATCH
END;
GO


