/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 05 — Extensión para Aprobador: Cancelación,
   Reintentos Detallados y Auditoría de Aprobación

   PROPÓSITO:
   Agregar columnas a SOLICITUD_PRECIO para soportar flujo de cancelación (HU-12)
   y crear dos tablas nuevas para rastrear reintentos transitorios (RF-29/RF-30)
   y auditoría granular de decisiones de Aprobador (RF-32).

   REGLAS CUBIERTAS:
     - HU-12: CANCELACION_SOLICITADA, CANCELACION_CONFIRMADA con campos de auditoría
     - RF-29/30: SOLICITUD_REINTENTO para rastrear cada intento fallido
     - RF-31: Clasificación de errores transitorios (ya existe, validar uso)
     - RF-32: AUDITORIA_APROBACION para auditoría granular de decisiones
     - Índices para queries de reintentos y auditoría de aprobación

   IDEMPOTENCIA: Solo agrega/actualiza si falta; no crea duplicados.
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDQA"
GO

USE [$(DB_PORTAL)];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ============================================================================
   5.1 EXTENSION DE SOLICITUD_PRECIO — Campos de Cancelación (HU-12)
   ============================================================================ */

IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'CANCELACION_SOLICITADA') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [CANCELACION_SOLICITADA] CHAR(1) NOT NULL CONSTRAINT [DF_SP_CANCELA_SOL] DEFAULT ('N');
GO

IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FECHA_SOLICITUD_CANCELACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [FECHA_SOLICITUD_CANCELACION] DATETIME NULL;
GO

IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'USUARIO_SOLICITA_CANCELACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [USUARIO_SOLICITA_CANCELACION] VARCHAR(120) NULL;
GO

IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'CANCELACION_CONFIRMADA') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [CANCELACION_CONFIRMADA] CHAR(1) NOT NULL CONSTRAINT [DF_SP_CANCELA_CONF] DEFAULT ('N');
GO

IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FECHA_CANCELACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [FECHA_CANCELACION] DATETIME NULL;
GO

IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'USUARIO_DECIDE_CANCELACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [USUARIO_DECIDE_CANCELACION] VARCHAR(120) NULL;
GO

/* CHECK constraints para campos de cancelación (HU-12) */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_CANCELACION_FLAG')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_CANCELACION_FLAG] CHECK ([CANCELACION_SOLICITADA] IN ('S','N'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_CANCELACION_CONFIRMADA')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_CANCELACION_CONFIRMADA] CHECK ([CANCELACION_CONFIRMADA] IN ('S','N'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_CANCELACION_LOGICA')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_CANCELACION_LOGICA] CHECK (
            -- Si hay cancelación confirmada, debe haber solicitud previa
            [CANCELACION_CONFIRMADA] = 'N' OR [CANCELACION_SOLICITADA] = 'S'
        );
GO

/* ============================================================================
   5.2 SOLICITUD_REINTENTO — Rastreo de Reintentos Transitorios (RF-29/RF-30)
   ============================================================================ */

IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_REINTENTO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[SOLICITUD_REINTENTO]
    (
        [ID_REINTENTO]                    BIGINT IDENTITY(1,1) NOT NULL,
        [ID_SOLICITUD]                    INT          NOT NULL,
        [INTENTO_NUMERO]                  TINYINT      NOT NULL,
        [FECHA_INTENTO]                   DATETIME     NOT NULL CONSTRAINT [DF_SR_FECHA] DEFAULT (GETDATE()),
        [TIPO_ERROR]                      VARCHAR(40)  NOT NULL,  -- connection_timeout, temporary_lock, service_unavailable, etc.
        [CODIGO_ERROR]                    VARCHAR(40)  NULL,      -- Error code de SQL Server o aplicación
        [MENSAJE_ERROR]                   VARCHAR(1000) NULL,     -- Detalle del error
        [BACKOFF_SEGUNDOS]                INT          NULL,      -- Exponential backoff: 2^intento
        [PROXIMO_REINTENTO_PROGRAMADO]    DATETIME     NULL,      -- Cuándo ejecutar el siguiente intento
        [RESULTADO_REINTENTO]             VARCHAR(15)  NULL,      -- PENDIENTE, EXITOSO, FALLIDO
        [NOTAS]                           VARCHAR(500) NULL,
        CONSTRAINT [PK_PP_SOLICITUD_REINTENTO] PRIMARY KEY CLUSTERED ([ID_REINTENTO]),
        CONSTRAINT [FK_PP_SR_SOLICITUD] FOREIGN KEY ([ID_SOLICITUD])
            REFERENCES [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([ID_SOLICITUD]) ON DELETE CASCADE,
        CONSTRAINT [CK_PP_SR_INTENTO] CHECK ([INTENTO_NUMERO] BETWEEN 1 AND 3),
        CONSTRAINT [CK_PP_SR_TIPO_ERROR] CHECK ([TIPO_ERROR] IN
            ('connection_timeout','temporary_lock','service_unavailable','transient_database_error','other_transient'))
    );

    CREATE INDEX [IX_PP_SR_SOLICITUD_INTENTO]
        ON [PORTAL_PRECIOS].[SOLICITUD_REINTENTO] ([ID_SOLICITUD], [INTENTO_NUMERO]);
    CREATE INDEX [IX_PP_SR_PROXIMO_REINTENTO]
        ON [PORTAL_PRECIOS].[SOLICITUD_REINTENTO] ([PROXIMO_REINTENTO_PROGRAMADO])
        WHERE [PROXIMO_REINTENTO_PROGRAMADO] IS NOT NULL AND [RESULTADO_REINTENTO] IS NULL;
    CREATE INDEX [IX_PP_SR_FECHA]
        ON [PORTAL_PRECIOS].[SOLICITUD_REINTENTO] ([FECHA_INTENTO] DESC);
END
GO

/* ============================================================================
   5.3 AUDITORIA_APROBACION — Auditoría Granular de Decisiones de Aprobador
   ============================================================================ */

IF OBJECT_ID(N'[PORTAL_PRECIOS].[AUDITORIA_APROBACION]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[AUDITORIA_APROBACION]
    (
        [ID_APROBACION]             BIGINT IDENTITY(1,1) NOT NULL,
        [ID_SOLICITUD]              INT          NOT NULL,
        [FECHA]                     DATETIME     NOT NULL CONSTRAINT [DF_AA_FECHA] DEFAULT (GETDATE()),
        [USUARIO_EMAIL]             VARCHAR(120) NOT NULL,
        [USUARIO_NOMBRE]            VARCHAR(120) NULL,
        [ACCION]                    VARCHAR(30)  NOT NULL,  -- APROBADA, RECHAZADA, CANCELACION_*, REPROCESO_AUTORIZADO
        [ESTADO_ANTERIOR]           VARCHAR(25)  NULL,
        [ESTADO_NUEVO]              VARCHAR(25)  NULL,
        [COMENTARIO_DECISION]       VARCHAR(1000) NULL,     -- Motivo de rechazo o comentario
        [IMPACTO_CONFIRMADO]        VARCHAR(500) NULL,      -- Resumen de impacto confirmado
        [RESULTADO_EJECUCION]       VARCHAR(15)  NULL,      -- Después de ejecutar: OK, CON_ERRORES, ERROR_EJECUCION
        [DETALLE_JSON]              NVARCHAR(MAX) NULL,     -- Campo flexible para futuras extensiones
        CONSTRAINT [PK_PP_AUDITORIA_APROBACION] PRIMARY KEY CLUSTERED ([ID_APROBACION]),
        CONSTRAINT [FK_PP_AA_SOLICITUD] FOREIGN KEY ([ID_SOLICITUD])
            REFERENCES [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([ID_SOLICITUD]) ON DELETE CASCADE,
        CONSTRAINT [CK_PP_AA_ACCION] CHECK ([ACCION] IN
            ('APROBADA','RECHAZADA','CANCELACION_SOLICITADA','CANCELACION_CONFIRMADA','CANCELACION_DENEGADA','REPROCESO_AUTORIZADO')),
        -- RF-19: Rechazo requiere comentario obligatorio
        CONSTRAINT [CK_PP_AA_MOTIVO_RECHAZO] CHECK (
            [ACCION] <> 'RECHAZADA' OR ([COMENTARIO_DECISION] IS NOT NULL AND LEN(LTRIM(RTRIM([COMENTARIO_DECISION]))) > 0)
        )
    );

    CREATE INDEX [IX_PP_AA_SOLICITUD_FECHA]
        ON [PORTAL_PRECIOS].[AUDITORIA_APROBACION] ([ID_SOLICITUD], [FECHA] DESC);
    CREATE INDEX [IX_PP_AA_USUARIO_FECHA]
        ON [PORTAL_PRECIOS].[AUDITORIA_APROBACION] ([USUARIO_EMAIL], [FECHA] DESC);
    CREATE INDEX [IX_PP_AA_ACCION]
        ON [PORTAL_PRECIOS].[AUDITORIA_APROBACION] ([ACCION], [FECHA] DESC);
END
GO

/* ============================================================================
   5.4 Verificación de Integridad y Documentación
   ============================================================================ */

PRINT 'PORTAL 05 — Extensión para Aprobador: Cancelación, Reintentos y Auditoría.';
PRINT '';
PRINT 'Cambios realizados:';
PRINT '  1. Agregadas 6 columnas a SOLICITUD_PRECIO para cancelación (HU-12)';
PRINT '  2. Creada tabla SOLICITUD_REINTENTO para rastrear reintentos transitorios (RF-29/RF-30)';
PRINT '  3. Creada tabla AUDITORIA_APROBACION para decisiones de Aprobador (RF-32)';
PRINT '';
PRINT 'Nuevas columnas en SOLICITUD_PRECIO:';
PRINT '  - CANCELACION_SOLICITADA (CHAR(1) = ''S''/''N'')';
PRINT '  - FECHA_SOLICITUD_CANCELACION (DATETIME NULL)';
PRINT '  - USUARIO_SOLICITA_CANCELACION (VARCHAR(120) NULL)';
PRINT '  - CANCELACION_CONFIRMADA (CHAR(1) = ''S''/''N'')';
PRINT '  - FECHA_CANCELACION (DATETIME NULL)';
PRINT '  - USUARIO_DECIDE_CANCELACION (VARCHAR(120) NULL)';
PRINT '';
PRINT 'Nuevas tablas:';
PRINT '  - SOLICITUD_REINTENTO (BIGINT, rastreo granular)';
PRINT '  - AUDITORIA_APROBACION (BIGINT, decisiones de Aprobador)';
PRINT '';
PRINT 'Cobertura:';
PRINT '  - RF-29/RF-30: Reintentos transitorios hasta 3 veces';
PRINT '  - RF-31: Clasificación de errores (transitorio vs funcional)';
PRINT '  - RF-32: Auditoría completa de aprobaciones';
PRINT '  - HU-12: Cancelación solicitada/confirmada/denegada';
PRINT '';
GO

