USE [SOFTLANDQA]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* ============================================================================
   PROCEDIMIENTO: [FEBECA].[SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO]
   ----------------------------------------------------------------------------
   Evolución de [FEBECA].[SP_GESTION_LISTAS_PRECIOS_FULL] con TRES cambios
   funcionales respecto al SP original (documentado en
   docs/Especificacion_Automatizacion_Listas_de_Precio.md):

   1) MOTOR DE REDONDEO COMERCIAL
      Cada precio calculado (base) se transforma con [FEBECA].[fn_RedondeoComercial]
      (12 bandas). El PRECIO_REDONDEADO es el que se persiste en ARTICULO_PRECIO.
      Si el precio queda FUERA DEL RANGO [0,01; 100.000,00], la función devuelve
      NULL y la línea se rechaza con motivo 'PRECIO_FUERA_DE_RANGO'.

   2) MARGEN MÍNIMO DINÁMICO POR ARTÍCULO
      El margen se valida contra el MARGEN_UTILIDAD_MIN de cada artículo
      (columna de ARTICULO_PRECIO) y, cuando ese valor no está definido, contra
      el parámetro global @p_margen_minimo (fallback). La fórmula del margen se
      evalúa sobre el PRECIO REDONDEADO (no sobre el precio calculado bruto):

          Margen Calculado = 1 - (COSTO_PROM_DOL / PRECIO_REDONDEADO)

      Si el margen resultante es inferior al mínimo efectivo del artículo, la
      línea se rechaza con motivo 'MARGEN_MINIMO_NO_CUMPLE'.

   3) SOPORTE MASIVO POR ATRIBUTOS DE ARTÍCULO
      Parámetros de filtro opcionales (@p_categoria, @p_linea, @p_proveedor,
      @p_esquema_trabajo). Cuando se envían, el universo de artículos base se
      restringe a los que cumplen el/los atributo(s), permitiendo aplicar reglas
      no solo por lista completa sino por agrupaciones de artículos.

   El parámetro / columna de "Tipo de Variación" NO existe: el signo del ajuste
   ya está expresado por el valor del FACTOR (0.95 = -5%, 1.10 = +10%).
   ============================================================================ */
CREATE OR ALTER PROCEDURE [FEBECA].[SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO]
    @p_nivel_precio VARCHAR(50),
    @p_fecha_inicio DATE,
    @p_fecha_fin DATE,
    @p_nivel_precio_base VARCHAR(50),
    @p_factor_multiplicador DECIMAL(28,8),
    @p_version INTEGER,
    @p_usuario_ult_modif VARCHAR(50) = 'SD',
    @p_margen_minimo DECIMAL(28,8) = 0,          -- Fallback cuando el artículo no define MARGEN_UTILIDAD_MIN
    @p_validar_precio_bajo_costo BIT = 1,
    @p_exigir_factor_configurado BIT = 0,
    @p_actualizar_lista_base BIT = 0,
    @p_modo_validacion VARCHAR(10) = 'OMITIR',
    @p_aplicar_redondeo BIT = 1,                 -- Permite desactivar el redondeo (compatibilidad)
    /* ---- Filtros por atributos de artículo (soporte masivo por agrupación) ---- */
    @p_categoria VARCHAR(50) = NULL,
    @p_linea VARCHAR(50) = NULL,
    @p_proveedor VARCHAR(50) = NULL,
    @p_esquema_trabajo VARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RunId UNIQUEIDENTIFIER = NEWID();
    DECLARE @FechaEjecucion DATETIME = GETDATE();
    DECLARE @FactorGlobal DECIMAL(28,8) = COALESCE(@p_factor_multiplicador, 1);
    DECLARE @ModoValidacion VARCHAR(10) = UPPER(LTRIM(RTRIM(COALESCE(@p_modo_validacion, 'OMITIR'))));

    SET @p_nivel_precio       = NULLIF(LTRIM(RTRIM(@p_nivel_precio)), '');
    SET @p_nivel_precio_base  = NULLIF(LTRIM(RTRIM(@p_nivel_precio_base)), '');
    SET @p_usuario_ult_modif  = COALESCE(NULLIF(LTRIM(RTRIM(@p_usuario_ult_modif)), ''), 'SD');
    SET @p_margen_minimo      = COALESCE(@p_margen_minimo, 0);
    SET @p_categoria          = NULLIF(LTRIM(RTRIM(@p_categoria)), '');
    SET @p_linea              = NULLIF(LTRIM(RTRIM(@p_linea)), '');
    SET @p_proveedor          = NULLIF(LTRIM(RTRIM(@p_proveedor)), '');
    SET @p_esquema_trabajo    = NULLIF(LTRIM(RTRIM(@p_esquema_trabajo)), '');

    /* ------------------------------ Validaciones de parámetros ------------- */
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

    /* ------------------------------ Listas destino ------------------------- */
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

    /* ------------------------------ Base activa ---------------------------- *
       CAMBIO (3): el JOIN con ARTICULO ahora también expone los atributos de
       agrupación (CATEGORIA, LINEA, PROVEEDOR) y aplica los filtros opcionales.
       Ajuste los nombres de columnas de atributos al modelo real de ARTICULO
       si difieren (CATEGORIA / LINEA / PROVEEDOR).
       ---------------------------------------------------------------------- */
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
            A.CATEGORIA,
            A.LINEA,
            A.PROVEEDOR,
            ROW_NUMBER() OVER (PARTITION BY AP.ARTICULO ORDER BY AP.VERSION DESC) AS RN
        FROM [FEBECA].[ARTICULO_PRECIO] AP
        INNER JOIN [FEBECA].[VERSION_NIVEL] VN
            ON AP.NIVEL_PRECIO = VN.NIVEL_PRECIO
           AND AP.VERSION = VN.VERSION
        INNER JOIN [FEBECA].[ARTICULO] A
            ON AP.ARTICULO = A.ARTICULO
        WHERE AP.NIVEL_PRECIO = @p_nivel_precio_base
          AND VN.ESTADO = 'A'
          AND (@p_categoria       IS NULL OR A.CATEGORIA      = @p_categoria)
          AND (@p_linea           IS NULL OR A.LINEA          = @p_linea)
          AND (@p_proveedor       IS NULL OR A.PROVEEDOR      = @p_proveedor)
          AND (@p_esquema_trabajo IS NULL OR AP.ESQUEMA_TRABAJO = @p_esquema_trabajo)
    )
    SELECT
        ARTICULO,
        MONEDA,
        VERSION_BASE,
        VERSION_ARTICULO,
        PRECIO_BASE,
        ESQUEMA_TRABAJO,
        MARGEN_UTILIDAD_MIN,
        COSTO_PROM_DOL,
        CATEGORIA,
        LINEA,
        PROVEEDOR
    INTO #Base
    FROM BaseActiva
    WHERE RN = 1;

    IF NOT EXISTS (SELECT 1 FROM #Base)
        THROW 51007, 'No se encontraron precios base activos para la lista/atributos indicados.', 1;

    CREATE UNIQUE CLUSTERED INDEX IX_Base_Articulo ON #Base (ARTICULO);

    /* ------------------------------ Cálculo base --------------------------- *
       Se calcula el PRECIO_CALCULADO (bruto) y, adicionalmente, el
       PRECIO_REDONDEADO aplicando fn_RedondeoComercial cuando @p_aplicar_redondeo=1.
       El precio "efectivo" que se validará y persistirá es el redondeado si
       existe; en caso contrario, el calculado.
       ---------------------------------------------------------------------- */
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
        B.CATEGORIA,
        B.LINEA,
        B.PROVEEDOR,
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

    /* ------------------------------ Redondeo + márgenes + motivo ----------- *
       CAMBIO (1): PRECIO_REDONDEADO vía fn_RedondeoComercial.
       CAMBIO (2): margen efectivo por artículo y validación sobre el precio
                   redondeado (PRECIO_EFECTIVO).
       ---------------------------------------------------------------------- */
    SELECT
        C.*,
        /* Precio redondeado (NULL si fuera de rango o si el redondeo está apagado
           se usa el calculado como "redondeado" para no romper el flujo). */
        CAST(
            CASE
                WHEN @p_aplicar_redondeo = 1 THEN [FEBECA].[fn_RedondeoComercial](C.PRECIO_CALCULADO)
                ELSE C.PRECIO_CALCULADO
            END AS DECIMAL(28,8)
        ) AS PRECIO_REDONDEADO
    INTO #ConRedondeo
    FROM #CalculoBase C;

    CREATE CLUSTERED INDEX IX_ConRedondeo ON #ConRedondeo (NIVEL_PRECIO, ARTICULO);

    SELECT
        R.*,
        /* Precio efectivo: el redondeado si existe, si no el calculado. */
        CAST(COALESCE(R.PRECIO_REDONDEADO, R.PRECIO_CALCULADO) AS DECIMAL(28,8)) AS PRECIO_EFECTIVO,
        /* Margen mínimo efectivo del artículo: MARGEN_UTILIDAD_MIN si está
           definido y es > 0; en caso contrario, el parámetro global. */
        CAST(
            CASE
                WHEN R.MARGEN_UTILIDAD_MIN IS NOT NULL AND R.MARGEN_UTILIDAD_MIN > 0
                THEN R.MARGEN_UTILIDAD_MIN
                ELSE @p_margen_minimo
            END AS DECIMAL(28,8)
        ) AS MARGEN_MINIMO_EFECTIVO
    INTO #ConMargen
    FROM #ConRedondeo R;

    CREATE CLUSTERED INDEX IX_ConMargen ON #ConMargen (NIVEL_PRECIO, ARTICULO);

    SELECT
        M.*,
        /* Margen de utilidad calculado SOBRE EL PRECIO EFECTIVO (redondeado). */
        CAST(
            CASE
                WHEN M.PRECIO_EFECTIVO > 0 AND M.COSTO_PROM_DOL IS NOT NULL
                THEN 1 - (M.COSTO_PROM_DOL / NULLIF(M.PRECIO_EFECTIVO, 0))
                ELSE NULL
            END AS DECIMAL(28,8)
        ) AS MARGEN_UTILIDAD_CALC,
        /* Margen MULR compatible con la lógica histórica (sobre precio base / factor). */
        CAST(
            CASE
                WHEN M.PRECIO_BASE > 0 AND M.FACTOR_FINAL > 0 AND M.COSTO_PROM_DOL IS NOT NULL
                THEN 1 - (M.COSTO_PROM_DOL / NULLIF((M.PRECIO_BASE / M.FACTOR_FINAL), 0))
                ELSE NULL
            END AS DECIMAL(28,8)
        ) AS MARGEN_MULR_CALC,
        CAST(
            CASE
                WHEN M.PRECIO_BASE IS NULL OR M.PRECIO_BASE <= 0
                    THEN 'PRECIO_BASE_INVALIDO'
                WHEN @p_exigir_factor_configurado = 1 AND M.TIENE_FACTOR_CONFIGURADO = 0
                    THEN 'FACTOR_NO_CONFIGURADO'
                WHEN M.FACTOR_LISTA_ARTICULO <= 0 OR M.FACTOR_LISTA_ARTICULO > 2
                    THEN 'FACTOR_LISTA_FUERA_RANGO'
                WHEN M.FACTOR_FINAL <= 0 OR M.FACTOR_FINAL > 2
                    THEN 'FACTOR_FINAL_FUERA_RANGO'
                WHEN M.PRECIO_CALCULADO IS NULL OR M.PRECIO_CALCULADO <= 0
                    THEN 'PRECIO_CALCULADO_INVALIDO'
                /* CAMBIO (1): rechazo si el precio quedó fuera del rango del
                   motor de redondeo (fn_RedondeoComercial devolvió NULL). */
                WHEN @p_aplicar_redondeo = 1 AND M.PRECIO_REDONDEADO IS NULL
                    THEN 'PRECIO_FUERA_DE_RANGO'
                WHEN @p_validar_precio_bajo_costo = 1
                     AND M.COSTO_PROM_DOL IS NOT NULL
                     AND M.PRECIO_EFECTIVO < M.COSTO_PROM_DOL
                    THEN 'PRECIO_DEBAJO_COSTO'
                /* CAMBIO (2): margen dinámico por artículo, evaluado sobre el
                   precio efectivo (redondeado). */
                WHEN @p_validar_precio_bajo_costo = 1
                     AND M.COSTO_PROM_DOL IS NOT NULL
                     AND (1 - (M.COSTO_PROM_DOL / NULLIF(M.PRECIO_EFECTIVO, 0))) < M.MARGEN_MINIMO_EFECTIVO
                    THEN 'MARGEN_MINIMO_NO_CUMPLE'
                ELSE NULL
            END AS VARCHAR(100)
        ) AS MOTIVO_RECHAZO
    INTO #Calculo
    FROM #ConMargen M;

    CREATE CLUSTERED INDEX IX_Calculo ON #Calculo (NIVEL_PRECIO, ARTICULO);

    /* ------------------------------ Registro de rechazos ------------------- */
    INSERT INTO [FEBECA].[ARTICULO_PRECIO_AJUSTE_RECHAZO]
    (
        RUN_ID, NIVEL_PRECIO_BASE, VERSION_BASE, NIVEL_PRECIO, VERSION, ARTICULO,
        PRECIO_BASE, FACTOR_GLOBAL, FACTOR_LISTA_ARTICULO, FACTOR_FINAL,
        PRECIO_CALCULADO, COSTO_PROM_DOL, MARGEN_UTILIDAD_CALCULADO,
        MOTIVO_RECHAZO, FECHA_EJECUCION, USUARIO_EJECUCION
    )
    SELECT
        @RunId, @p_nivel_precio_base, C.VERSION_BASE, C.NIVEL_PRECIO, @p_version, C.ARTICULO,
        C.PRECIO_BASE, C.FACTOR_GLOBAL, C.FACTOR_LISTA_ARTICULO, C.FACTOR_FINAL,
        /* Se registra el precio efectivo (redondeado) como PRECIO_CALCULADO del rechazo
           para que Compras/Mercadeo vean el valor que realmente se evaluó. */
        C.PRECIO_EFECTIVO, C.COSTO_PROM_DOL, C.MARGEN_UTILIDAD_CALC,
        C.MOTIVO_RECHAZO, @FechaEjecucion, @p_usuario_ult_modif
    FROM #Calculo C
    WHERE C.MOTIVO_RECHAZO IS NOT NULL;

    DECLARE @CantidadRechazos INT = (SELECT COUNT(1) FROM #Calculo WHERE MOTIVO_RECHAZO IS NOT NULL);

    IF @ModoValidacion = 'ERROR' AND @CantidadRechazos > 0
    BEGIN
        DECLARE @MensajeError NVARCHAR(2048) = CONCAT(
            'La actualización fue cancelada por validaciones de precios. Rechazos: ',
            @CantidadRechazos,
            '. RUN_ID: ', CONVERT(VARCHAR(36), @RunId),
            '. Revise FEBECA.ARTICULO_PRECIO_AJUSTE_RECHAZO.'
        );
        THROW 51008, @MensajeError, 1;
    END;

    /* ------------------------------ Válidos -------------------------------- *
       PRECIO_A_PERSISTIR = precio efectivo (redondeado). Es el que se escribe
       en ARTICULO_PRECIO.PRECIO.
       ---------------------------------------------------------------------- */
    SELECT
        NIVEL_PRECIO, ARTICULO, MONEDA, VERSION_BASE, VERSION_ARTICULO,
        PRECIO_BASE, ESQUEMA_TRABAJO, MARGEN_UTILIDAD_MIN, COSTO_PROM_DOL,
        ID_DESCUENTO_LISTA_PRECIO, FACTOR_GLOBAL, FACTOR_LISTA_ARTICULO, FACTOR_FINAL,
        PRECIO_CALCULADO,
        PRECIO_REDONDEADO,
        PRECIO_EFECTIVO AS PRECIO_A_PERSISTIR,
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
    WHERE ISNULL(T.PRECIO, -1) <> ISNULL(V.PRECIO_A_PERSISTIR, -1)
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
            T.PRECIO = V.PRECIO_A_PERSISTIR,
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
            NIVEL_PRECIO, MONEDA, VERSION, ARTICULO, VERSION_ARTICULO, PRECIO,
            ESQUEMA_TRABAJO, MARGEN_MULR, MARGEN_UTILIDAD, FECHA_INICIO, FECHA_FIN,
            FECHA_ULT_MODIF, USUARIO_ULT_MODIF, MARGEN_UTILIDAD_MIN
        )
        SELECT
            V.NIVEL_PRECIO, V.MONEDA, @p_version, V.ARTICULO, V.VERSION_ARTICULO, V.PRECIO_A_PERSISTIR,
            V.ESQUEMA_TRABAJO, V.MARGEN_MULR_CALC, V.MARGEN_UTILIDAD_CALC, @p_fecha_inicio, @p_fecha_fin,
            @FechaEjecucion, @p_usuario_ult_modif, V.MARGEN_UTILIDAD_MIN
        FROM #Insertables V;

        SET @Insertados = @@ROWCOUNT;

        /* Auditoría: UPDATE. Se registra el precio redondeado como PRECIO_NUEVO. */
        INSERT INTO [FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]
        (
            RUN_ID, ACCION, NIVEL_PRECIO_BASE, VERSION_BASE, NIVEL_PRECIO, VERSION, ARTICULO,
            PRECIO_BASE, FACTOR_GLOBAL, FACTOR_LISTA_ARTICULO, FACTOR_FINAL,
            PRECIO_ANTERIOR, PRECIO_NUEVO, COSTO_PROM_DOL,
            MARGEN_UTILIDAD_NUEVO, MARGEN_MULR_NUEVO, ID_DESCUENTO_LISTA_PRECIO,
            FECHA_EJECUCION, USUARIO_EJECUCION
        )
        SELECT
            @RunId, 'UPDATE', @p_nivel_precio_base, V.VERSION_BASE, V.NIVEL_PRECIO, @p_version, V.ARTICULO,
            V.PRECIO_BASE, V.FACTOR_GLOBAL, V.FACTOR_LISTA_ARTICULO, V.FACTOR_FINAL,
            V.PRECIO_ANTERIOR, V.PRECIO_A_PERSISTIR, V.COSTO_PROM_DOL,
            V.MARGEN_UTILIDAD_CALC, V.MARGEN_MULR_CALC, V.ID_DESCUENTO_LISTA_PRECIO,
            @FechaEjecucion, @p_usuario_ult_modif
        FROM #Actualizables V;

        /* Auditoría: INSERT. */
        INSERT INTO [FEBECA].[ARTICULO_PRECIO_AJUSTE_LOG]
        (
            RUN_ID, ACCION, NIVEL_PRECIO_BASE, VERSION_BASE, NIVEL_PRECIO, VERSION, ARTICULO,
            PRECIO_BASE, FACTOR_GLOBAL, FACTOR_LISTA_ARTICULO, FACTOR_FINAL,
            PRECIO_ANTERIOR, PRECIO_NUEVO, COSTO_PROM_DOL,
            MARGEN_UTILIDAD_NUEVO, MARGEN_MULR_NUEVO, ID_DESCUENTO_LISTA_PRECIO,
            FECHA_EJECUCION, USUARIO_EJECUCION
        )
        SELECT
            @RunId, 'INSERT', @p_nivel_precio_base, V.VERSION_BASE, V.NIVEL_PRECIO, @p_version, V.ARTICULO,
            V.PRECIO_BASE, V.FACTOR_GLOBAL, V.FACTOR_LISTA_ARTICULO, V.FACTOR_FINAL,
            NULL, V.PRECIO_A_PERSISTIR, V.COSTO_PROM_DOL,
            V.MARGEN_UTILIDAD_CALC, V.MARGEN_MULR_CALC, V.ID_DESCUENTO_LISTA_PRECIO,
            @FechaEjecucion, @p_usuario_ult_modif
        FROM #Insertables V;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    /* ------------------------------ Resumen de la corrida ------------------ */
    SELECT
        @RunId AS RUN_ID,
        @p_nivel_precio_base AS NIVEL_PRECIO_BASE,
        COALESCE(@p_nivel_precio, '<TODAS>') AS NIVEL_PRECIO_PARAMETRO,
        @p_version AS VERSION_DESTINO,
        @FactorGlobal AS FACTOR_GLOBAL,
        @ModoValidacion AS MODO_VALIDACION,
        @p_aplicar_redondeo AS APLICA_REDONDEO,
        @p_categoria AS FILTRO_CATEGORIA,
        @p_linea AS FILTRO_LINEA,
        @p_proveedor AS FILTRO_PROVEEDOR,
        @p_esquema_trabajo AS FILTRO_ESQUEMA_TRABAJO,
        (SELECT COUNT(1) FROM #Listas) AS LISTAS_DESTINO,
        (SELECT COUNT(1) FROM #Base) AS ARTICULOS_BASE,
        (SELECT COUNT(1) FROM #Calculo) AS PRECIOS_EVALUADOS,
        (SELECT COUNT(1) FROM #Validos) AS PRECIOS_VALIDOS,
        @Insertados AS PRECIOS_INSERTADOS,
        @Actualizados AS PRECIOS_ACTUALIZADOS,
        @CantidadRechazos AS PRECIOS_RECHAZADOS;

    /* Detalle de rechazos (para poblar el estado de la solicitud en el API). */
    SELECT TOP (500)
        NIVEL_PRECIO,
        ARTICULO,
        CATEGORIA,
        LINEA,
        PROVEEDOR,
        PRECIO_BASE,
        FACTOR_GLOBAL,
        FACTOR_LISTA_ARTICULO,
        FACTOR_FINAL,
        PRECIO_CALCULADO,
        PRECIO_REDONDEADO,
        PRECIO_EFECTIVO,
        COSTO_PROM_DOL,
        MARGEN_MINIMO_EFECTIVO,
        MARGEN_UTILIDAD_CALC,
        MOTIVO_RECHAZO
    FROM #Calculo
    WHERE MOTIVO_RECHAZO IS NOT NULL
    ORDER BY NIVEL_PRECIO, ARTICULO;
END
GO
