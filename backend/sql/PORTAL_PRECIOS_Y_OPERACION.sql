/* ============================================================================
   MV26020 - Gestión Masiva de Precios
   Script DDL parametrizado: arquitectura de DOS ESQUEMAS con responsabilidades
   independientes, aplicable a todas las empresas de la organización.

   ┌───────────────────────────────────────────────────────────────────────┐
   │ [PORTAL_PRECIOS]  → Estado EXCLUSIVO de la aplicación web (multiempresa):│
   │   USUARIO, USUARIO_ROL_COMPANIA, SOLICITUD_PRECIO,                       │
   │   SOLICITUD_PRECIO_DETALLE, AUDITORIA_EVENTOS.                           │
   │   Guarda borradores/solicitudes/estado maker-checker. NO toca Softland. │
   ├───────────────────────────────────────────────────────────────────────┤
   │ [{ESQUEMA_EMPRESA}] (COFER / EMP1 / EMP2 / …) → Operación por empresa:   │
   │   U_FACTOR_REDUCCION_MARGEN (UDF), SP_CALCULAR_MARGEN_MINIMO_ARTICULO,   │
   │   lectura de la tabla nativa ARTICULO_PRECIO.                           │
   │   Solo se toca al APROBAR (Regla de Oro).                                │
   └───────────────────────────────────────────────────────────────────────┘

   PARAMETRIZACIÓN (SQLCMD):
     :setvar DB_PORTAL      SOFTLANDPRD      -- base donde vive [PORTAL_PRECIOS]
     :setvar DB_EMPRESA     SOFTLANDPRD      -- base de la empresa operativa
     :setvar ESQUEMA_EMPRESA COFER           -- esquema operativo de la empresa

   Ejecución por empresa: repetir la SECCIÓN 2 cambiando ESQUEMA_EMPRESA
   (COFER, EMP1, EMP2, …). La SECCIÓN 1 ([PORTAL_PRECIOS]) se crea UNA sola vez.

   Si no usa SQLCMD, reemplace manualmente $(DB_PORTAL), $(DB_EMPRESA) y
   $(ESQUEMA_EMPRESA) por los valores reales.
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDPRD"
:setvar DB_EMPRESA "SOFTLANDPRD"
:setvar ESQUEMA_EMPRESA "COFER"
GO

/* ============================================================================
   SECCIÓN 1 — ESQUEMA [PORTAL_PRECIOS] (una sola vez para toda la organización)
   ============================================================================ */
USE [$(DB_PORTAL)];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF SCHEMA_ID(N'PORTAL_PRECIOS') IS NULL
    EXEC('CREATE SCHEMA [PORTAL_PRECIOS]');
GO

/* ----------------------------------------------------------------------------
   1.1 USUARIO — cuentas del portal (SSO corporativo). El correo determina la
       compañía (S2/SS) y las tarjetas del login del mockup.
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[USUARIO]
    (
        [ID_USUARIO]   INT IDENTITY(1,1) NOT NULL,
        [EMAIL]        VARCHAR(120) NOT NULL,
        [NOMBRE]       VARCHAR(120) NOT NULL,
        [COLOR]        VARCHAR(10)  NULL,               -- avatar (paridad mockup)
        [ACTIVO]       CHAR(1) NOT NULL CONSTRAINT [DF_USUARIO_ACTIVO] DEFAULT ('S'),
        [FECHA_CREACION] DATETIME NOT NULL CONSTRAINT [DF_USUARIO_FCREA] DEFAULT (GETDATE()),
        CONSTRAINT [PK_PP_USUARIO] PRIMARY KEY CLUSTERED ([ID_USUARIO]),
        CONSTRAINT [UQ_PP_USUARIO_EMAIL] UNIQUE ([EMAIL]),
        CONSTRAINT [CK_PP_USUARIO_ACTIVO] CHECK ([ACTIVO] IN ('S','N'))
    );
END
GO

/* ----------------------------------------------------------------------------
   1.2 USUARIO_ROL_COMPANIA — asignación directa de rol por compañía.
       Un usuario puede ser OPERADOR o APROBADOR en una compañía dada.
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_ROL_COMPANIA]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[USUARIO_ROL_COMPANIA]
    (
        [ID_USUARIO_ROL] INT IDENTITY(1,1) NOT NULL,
        [ID_USUARIO]     INT NOT NULL,
        [COMPANIA]       VARCHAR(20) NOT NULL,          -- código de compañía (COFER, FEBECA, …)
        [ROL]            VARCHAR(15) NOT NULL,           -- OPERADOR | APROBADOR
        [ACTIVO]         CHAR(1) NOT NULL CONSTRAINT [DF_URC_ACTIVO] DEFAULT ('S'),
        CONSTRAINT [PK_PP_USUARIO_ROL_COMPANIA] PRIMARY KEY CLUSTERED ([ID_USUARIO_ROL]),
        CONSTRAINT [FK_PP_URC_USUARIO] FOREIGN KEY ([ID_USUARIO])
            REFERENCES [PORTAL_PRECIOS].[USUARIO] ([ID_USUARIO]),
        CONSTRAINT [CK_PP_URC_ROL] CHECK ([ROL] IN ('OPERADOR','APROBADOR')),
        CONSTRAINT [CK_PP_URC_ACTIVO] CHECK ([ACTIVO] IN ('S','N')),
        CONSTRAINT [UQ_PP_URC] UNIQUE ([ID_USUARIO],[COMPANIA],[ROL])
    );
END
GO

/* ----------------------------------------------------------------------------
   1.3 SOLICITUD_PRECIO — encabezado del flujo maker-checker.
       Estados: PENDIENTE, EN_PROCESO, PROCESADO, PROCESADO_CON_ERRORES,
                RECHAZADO, ERROR_EJECUCION.
       Procesos: FACTOR_PRECIO, MAYOREOD_MASIVO, DESCUENTO_LISTA_PRECIO,
                 MARGEN_UTILIDAD_MASIVO.
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
    (
        [ID_SOLICITUD]        INT IDENTITY(1,1) NOT NULL,
        [CODIGO_SOLICITUD]    VARCHAR(20) NOT NULL,       -- SOL-10450, SOL-10451, …
        [COMPANIA]            VARCHAR(20) NOT NULL,
        [PROCESO]             VARCHAR(30) NOT NULL,
        [MODALIDAD]           VARCHAR(10) NOT NULL,        -- manual | excel
        [SOLICITANTE_EMAIL]   VARCHAR(120) NOT NULL,
        [SOLICITANTE_NOMBRE]  VARCHAR(120) NOT NULL,
        [ESTADO]              VARCHAR(25) NOT NULL CONSTRAINT [DF_SP_ESTADO] DEFAULT ('PENDIENTE'),
        [PARAMETROS_JSON]     NVARCHAR(MAX) NULL,          -- parámetros del proceso (nivel, factor, grupo…)
        [ARCHIVO_NOMBRE]      VARCHAR(260) NULL,
        [ARCHIVO_S3_KEY]      VARCHAR(400) NULL,
        [MOTIVO_RECHAZO]      VARCHAR(500) NULL,
        [ID_PROCESO_SP]       VARCHAR(30) NULL,            -- #PROC-YYYYMMDD-NNNN
        [TOTAL_REGISTROS]     INT NULL,
        [EXITOSOS]            INT NULL,                     -- contador de éxito
        [FALLIDOS]            INT NULL,                     -- contador de error
        [LOG_S3_KEY]          VARCHAR(400) NULL,
        [APROBADOR_EMAIL]     VARCHAR(120) NULL,
        [APROBADOR_NOMBRE]    VARCHAR(120) NULL,
        [FECHA_ENVIO]         DATETIME NOT NULL CONSTRAINT [DF_SP_FENVIO] DEFAULT (GETDATE()),
        [FECHA_ULT_ESTADO]    DATETIME NULL,
        CONSTRAINT [PK_PP_SOLICITUD_PRECIO] PRIMARY KEY CLUSTERED ([ID_SOLICITUD]),
        CONSTRAINT [UQ_PP_SOLICITUD_CODIGO] UNIQUE ([CODIGO_SOLICITUD]),
        CONSTRAINT [CK_PP_SP_ESTADO] CHECK ([ESTADO] IN
            ('PENDIENTE','EN_PROCESO','PROCESADO','PROCESADO_CON_ERRORES','RECHAZADO','ERROR_EJECUCION')),
        CONSTRAINT [CK_PP_SP_MODALIDAD] CHECK ([MODALIDAD] IN ('manual','excel')),
        CONSTRAINT [CK_PP_SP_PROCESO] CHECK ([PROCESO] IN
            ('FACTOR_PRECIO','MAYOREOD_MASIVO','DESCUENTO_LISTA_PRECIO','MARGEN_UTILIDAD_MASIVO'))
    );

    CREATE INDEX [IX_PP_SP_BANDEJA]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([COMPANIA],[ESTADO],[PROCESO])
        INCLUDE ([CODIGO_SOLICITUD],[SOLICITANTE_EMAIL],[FECHA_ENVIO]);
    CREATE INDEX [IX_PP_SP_SOLICITANTE]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([SOLICITANTE_EMAIL],[FECHA_ENVIO]);
END
GO

/* ----------------------------------------------------------------------------
   1.4 SOLICITUD_PRECIO_DETALLE — staging de líneas por solicitud.
       Guarda el PORCENTAJE legible (10.50), precios original/calculado/redondeado,
       márgenes y el resultado de validación de cada fila (previo a ejecutar el SP).
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]
    (
        [ID_DETALLE]              BIGINT IDENTITY(1,1) NOT NULL,
        [ID_SOLICITUD]            INT NOT NULL,
        [FILA]                    INT NOT NULL,
        [ARTICULO]                VARCHAR(20) NOT NULL,
        [DESCRIPCION]             VARCHAR(200) NULL,
        [LISTA_CODIGO]            VARCHAR(30) NULL,
        [TIPO_VARIACION]          VARCHAR(15) NULL,          -- AUMENTO | DISMINUCION
        -- Margen: porcentaje legible (10.50 = 10.5%) + factor normalizado (0.1050).
        [PORCENTAJE_REDUCCION]    DECIMAL(9,4) NULL,
        [FACTOR_REDUCCION_NORM]   DECIMAL(9,6) NULL,
        [FACTOR_MULTIPLICADOR]    DECIMAL(9,6) NULL,         -- factor de precio (0.95 / 1.10)
        [PRECIO_ACTUAL]           DECIMAL(28,8) NULL,        -- precio original
        [PRECIO_CALCULADO]        DECIMAL(28,8) NULL,        -- precio base calculado
        [PRECIO_REDONDEADO]       DECIMAL(28,8) NULL,        -- tras las 12 bandas
        [BANDA_REDONDEO]          VARCHAR(60) NULL,
        [ESTADO_REDONDEO]         VARCHAR(20) NULL,          -- CALCULADO | FUERA_DE_RANGO | ALERTA_MARGEN
        [MARGEN_PROMEDIO]         DECIMAL(9,6) NULL,
        [MARGEN_MINIMO]           DECIMAL(9,6) NULL,
        [COSTO_MINIMO]            DECIMAL(28,8) NULL,
        [VALIDO]                  CHAR(1) NOT NULL CONSTRAINT [DF_SPD_VALIDO] DEFAULT ('S'),
        [CODIGO_RECHAZO]          VARCHAR(40) NULL,
        [CAUSA]                   VARCHAR(400) NULL,
        CONSTRAINT [PK_PP_SOLICITUD_PRECIO_DETALLE] PRIMARY KEY CLUSTERED ([ID_DETALLE]),
        CONSTRAINT [FK_PP_SPD_SOLICITUD] FOREIGN KEY ([ID_SOLICITUD])
            REFERENCES [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([ID_SOLICITUD]),
        CONSTRAINT [CK_PP_SPD_VALIDO] CHECK ([VALIDO] IN ('S','N'))
    );

    CREATE INDEX [IX_PP_SPD_SOLICITUD]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ([ID_SOLICITUD]);
END
GO

/* ----------------------------------------------------------------------------
   1.5 AUDITORIA_EVENTOS — registro cronológico de acciones del portal.
       Eventos: SOLICITUD_ENVIADA, SIMULACION_REVISADA, EJECUCION_ENCOLADA,
                EJECUCION_FINALIZADA, SOLICITUD_RECHAZADA, CARGA_EXCEL, etc.
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[AUDITORIA_EVENTOS]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[AUDITORIA_EVENTOS]
    (
        [ID_EVENTO]        BIGINT IDENTITY(1,1) NOT NULL,
        [FECHA]            DATETIME NOT NULL CONSTRAINT [DF_AE_FECHA] DEFAULT (GETDATE()),
        [COMPANIA]         VARCHAR(20) NOT NULL,
        [USUARIO_EMAIL]    VARCHAR(120) NOT NULL,
        [USUARIO_NOMBRE]   VARCHAR(120) NULL,
        [ROL]              VARCHAR(15) NULL,
        [EVENTO]           VARCHAR(50) NOT NULL,
        [CODIGO_SOLICITUD] VARCHAR(20) NULL,
        [ID_PROCESO_SP]    VARCHAR(30) NULL,
        [DETALLE]          VARCHAR(500) NULL,
        CONSTRAINT [PK_PP_AUDITORIA_EVENTOS] PRIMARY KEY CLUSTERED ([ID_EVENTO])
    );

    CREATE INDEX [IX_PP_AE_COMPANIA_FECHA]
        ON [PORTAL_PRECIOS].[AUDITORIA_EVENTOS] ([COMPANIA],[FECHA] DESC);
END
GO

/* Secuencia para generar CODIGO_SOLICITUD (SOL-10450, SOL-10451, …). */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SEQ_SOLICITUD]', N'SO') IS NULL
    CREATE SEQUENCE [PORTAL_PRECIOS].[SEQ_SOLICITUD] AS INT START WITH 10450 INCREMENT BY 1;
GO

PRINT 'Esquema [PORTAL_PRECIOS] verificado/creado.';
GO

/* ============================================================================
   SECCIÓN 2 — ESQUEMA OPERATIVO DE EMPRESA [$(ESQUEMA_EMPRESA)]
   Repetir esta sección por cada empresa (COFER, EMP1, EMP2, …).
   ============================================================================ */
USE [$(DB_EMPRESA)];
GO

IF SCHEMA_ID(N'$(ESQUEMA_EMPRESA)') IS NULL
    EXEC('CREATE SCHEMA [$(ESQUEMA_EMPRESA)]');
GO

/* ----------------------------------------------------------------------------
   2.1 U_FACTOR_REDUCCION_MARGEN — UDF de excepciones de factor por artículo.
       U_FACTOR_REDUCCION guarda el PORCENTAJE legible (10.00 = 10%). El SP y la
       app dividen entre 100 al calcular. Estructura Softland (UDF nativa).
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[$(ESQUEMA_EMPRESA)].[U_FACTOR_REDUCCION_MARGEN]', N'U') IS NULL
BEGIN
    CREATE TABLE [$(ESQUEMA_EMPRESA)].[U_FACTOR_REDUCCION_MARGEN]
    (
        [U_CODIGO]           VARCHAR(260) NOT NULL,
        [U_DESCRIP]          VARCHAR(260) NOT NULL,
        [U_FACTOR_REDUCCION] DECIMAL(18,2) NULL,             -- porcentaje legible: 10.00 = 10%
        [U_ACTIVO]           VARCHAR(1) NOT NULL,
        [NoteExistsFlag]     TINYINT NOT NULL CONSTRAINT [DF_UFRM_NEF_$(ESQUEMA_EMPRESA)] DEFAULT (0),
        [RecordDate]         DATETIME NOT NULL CONSTRAINT [DF_UFRM_RD_$(ESQUEMA_EMPRESA)] DEFAULT (GETDATE()),
        [RowPointer]         UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_UFRM_RP_$(ESQUEMA_EMPRESA)] DEFAULT (NEWID()),
        [CreatedBy]          VARCHAR(30) NOT NULL CONSTRAINT [DF_UFRM_CB_$(ESQUEMA_EMPRESA)] DEFAULT ('SD'),
        [UpdatedBy]          VARCHAR(30) NOT NULL CONSTRAINT [DF_UFRM_UB_$(ESQUEMA_EMPRESA)] DEFAULT ('SD'),
        [CreateDate]         DATETIME NOT NULL CONSTRAINT [DF_UFRM_CD_$(ESQUEMA_EMPRESA)] DEFAULT (GETDATE()),
        CONSTRAINT [PK_UFRM_$(ESQUEMA_EMPRESA)] PRIMARY KEY CLUSTERED ([U_CODIGO],[U_DESCRIP])
    );

    CREATE INDEX [IX_UFRM_CODIGO_ACTIVO_$(ESQUEMA_EMPRESA)]
        ON [$(ESQUEMA_EMPRESA)].[U_FACTOR_REDUCCION_MARGEN] ([U_CODIGO],[U_ACTIVO])
        INCLUDE ([U_FACTOR_REDUCCION]);
END
GO

/* ----------------------------------------------------------------------------
   2.2 Lectura de la tabla nativa Softland ARTICULO_PRECIO.
       Se asume que [$(ESQUEMA_EMPRESA)].[ARTICULO_PRECIO] y [ARTICULO] ya existen
       en Softland. Se crea una VISTA de apoyo para el portal (precio + costo).
   ---------------------------------------------------------------------------- */
IF OBJECT_ID(N'[$(ESQUEMA_EMPRESA)].[V_ARTICULO_PRECIO_COSTO]', N'V') IS NOT NULL
    EXEC('DROP VIEW [$(ESQUEMA_EMPRESA)].[V_ARTICULO_PRECIO_COSTO]');
GO
EXEC('
CREATE VIEW [$(ESQUEMA_EMPRESA)].[V_ARTICULO_PRECIO_COSTO]
AS
    SELECT AP.ARTICULO,
           A.DESCRIPCION,
           AP.NIVEL_PRECIO,
           AP.VERSION,
           CAST(AP.PRECIO AS DECIMAL(28,8))        AS PRECIO_LISTA,
           CAST(A.COSTO_PROM_DOL AS DECIMAL(28,8)) AS COSTO_PROM_DOL,
           AP.MARGEN_UTILIDAD_MIN
      FROM [$(ESQUEMA_EMPRESA)].[ARTICULO_PRECIO] AP
      INNER JOIN [$(ESQUEMA_EMPRESA)].[ARTICULO] A ON A.ARTICULO = AP.ARTICULO;
');
GO

/* ----------------------------------------------------------------------------
   2.3 SP_CALCULAR_MARGEN_MINIMO_ARTICULO — Regla de Mayoreo.
       Lee el porcentaje activo de U_FACTOR_REDUCCION_MARGEN (U_ACTIVO='S'),
       lo normaliza (/100.0), calcula Margen Mínimo = Margen Promedio × (1-factor)
       y actualiza ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN. Solo se ejecuta al aprobar.
   ---------------------------------------------------------------------------- */
EXEC('
CREATE OR ALTER PROCEDURE [$(ESQUEMA_EMPRESA)].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO]
    @p_nivel_precio VARCHAR(50),
    @p_version INTEGER,
    @p_articulo VARCHAR(20) = NULL,
    @p_factor_reduccion_default DECIMAL(5,4) = 0.10,
    @p_usuario_ult_modif VARCHAR(50) = ''SD''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FechaEjecucion DATETIME = GETDATE();
    SET @p_nivel_precio = NULLIF(LTRIM(RTRIM(@p_nivel_precio)), '''');
    SET @p_articulo = NULLIF(LTRIM(RTRIM(@p_articulo)), '''');
    SET @p_usuario_ult_modif = COALESCE(NULLIF(LTRIM(RTRIM(@p_usuario_ult_modif)), ''''), ''SD'');
    SET @p_factor_reduccion_default = COALESCE(@p_factor_reduccion_default, 0.10);

    IF @p_nivel_precio IS NULL THROW 52001, ''Debe indicar la lista de precios.'', 1;
    IF @p_version IS NULL THROW 52002, ''Debe indicar la versión.'', 1;

    SELECT
        AP.ARTICULO, AP.NIVEL_PRECIO, AP.VERSION,
        CAST(AP.PRECIO AS DECIMAL(28,8)) AS PRECIO_LISTA,
        CAST(A.COSTO_PROM_DOL AS DECIMAL(28,8)) AS COSTO_PROM_DOL,
        CAST(CASE WHEN AP.PRECIO > 0 AND A.COSTO_PROM_DOL IS NOT NULL
                  THEN (AP.PRECIO - A.COSTO_PROM_DOL) / NULLIF(AP.PRECIO,0) END AS DECIMAL(28,8)) AS MARGEN_PROMEDIO,
        CAST(CASE WHEN FR.U_FACTOR_REDUCCION IS NULL THEN @p_factor_reduccion_default
                  ELSE FR.U_FACTOR_REDUCCION / 100.0 END AS DECIMAL(9,6)) AS FACTOR_REDUCCION_EFECTIVO,
        CASE WHEN FR.U_FACTOR_REDUCCION IS NULL THEN 0 ELSE 1 END AS TIENE_EXCEPCION
    INTO #Calculo
    FROM [$(ESQUEMA_EMPRESA)].[ARTICULO_PRECIO] AP
    INNER JOIN [$(ESQUEMA_EMPRESA)].[ARTICULO] A ON A.ARTICULO = AP.ARTICULO
    OUTER APPLY (
        SELECT TOP (1) U.U_FACTOR_REDUCCION
        FROM [$(ESQUEMA_EMPRESA)].[U_FACTOR_REDUCCION_MARGEN] U
        WHERE U.U_CODIGO = AP.ARTICULO AND U.U_ACTIVO = ''S''
        ORDER BY U.U_FACTOR_REDUCCION DESC
    ) FR
    WHERE AP.NIVEL_PRECIO = @p_nivel_precio
      AND AP.VERSION = @p_version
      AND (@p_articulo IS NULL OR AP.ARTICULO = @p_articulo);

    ALTER TABLE #Calculo ADD MARGEN_MINIMO DECIMAL(28,8) NULL;
    UPDATE #Calculo
    SET MARGEN_MINIMO = CASE WHEN MARGEN_PROMEDIO IS NULL THEN NULL
                             WHEN MARGEN_PROMEDIO * (1 - FACTOR_REDUCCION_EFECTIVO) < 0 THEN 0
                             ELSE MARGEN_PROMEDIO * (1 - FACTOR_REDUCCION_EFECTIVO) END;

    DECLARE @Actualizados INT = 0;
    BEGIN TRY
        BEGIN TRANSACTION;
        UPDATE AP
           SET AP.MARGEN_UTILIDAD_MIN = C.MARGEN_MINIMO,
               AP.FECHA_ULT_MODIF = @FechaEjecucion,
               AP.USUARIO_ULT_MODIF = @p_usuario_ult_modif
          FROM [$(ESQUEMA_EMPRESA)].[ARTICULO_PRECIO] AP
          INNER JOIN #Calculo C
             ON C.ARTICULO = AP.ARTICULO AND C.NIVEL_PRECIO = AP.NIVEL_PRECIO AND C.VERSION = AP.VERSION
         WHERE C.MARGEN_MINIMO IS NOT NULL;
        SET @Actualizados = @@ROWCOUNT;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT @p_nivel_precio AS NIVEL_PRECIO, @p_version AS VERSION,
           COALESCE(@p_articulo, ''<TODOS>'') AS ARTICULO_PARAMETRO,
           (SELECT COUNT(1) FROM #Calculo) AS ARTICULOS_EVALUADOS,
           (SELECT COUNT(1) FROM #Calculo WHERE MARGEN_MINIMO IS NOT NULL) AS ARTICULOS_CON_MARGEN,
           @Actualizados AS ARTICULOS_ACTUALIZADOS;

    SELECT ARTICULO, PRECIO_LISTA, COSTO_PROM_DOL, MARGEN_PROMEDIO,
           FACTOR_REDUCCION_EFECTIVO,
           CASE WHEN TIENE_EXCEPCION = 1 THEN ''EXCEPCION_UDF'' ELSE ''DEFAULT_10PCT'' END AS ORIGEN_FACTOR,
           MARGEN_MINIMO
    FROM #Calculo ORDER BY ARTICULO;
END
');
GO

PRINT 'Esquema operativo [$(ESQUEMA_EMPRESA)] verificado/creado.';
GO
