/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 03 — Solicitudes, evidencia y auditoría

   Objetos:
     SEQ_SOLICITUD            — generador de CODIGO_SOLICITUD (SOL-10450, …).
     SOLICITUD_PRECIO         — encabezado del flujo maker-checker.
     SOLICITUD_PRECIO_DETALLE — evidencia fila por fila de la simulación y,
                                tras ejecutar, resultado aplicado por fila.
     AUDITORIA_EVENTOS        — bitácora cronológica de todo el flujo (RF-32):
                                envío, revisión, aprobación/rechazo, ejecución
                                y cambios de estado. Sustituye, sin perder
                                capacidad, a las tablas separadas
                                SOLICITUD_ESTADO_HISTORIAL y SOLICITUD_ARCHIVO
                                de una versión anterior de este DDL (ver nota
                                de simplificación más abajo).

   SIMPLIFICACIÓN (respecto de la versión anterior de 4 scripts):
     - SOLICITUD_ARCHIVO se elimina como tabla independiente: el nombre y la
       llave del archivo cargado, el log de auditoría y el reporte de errores
       ya se guardan en columnas del propio encabezado/detalle
       (ARCHIVO_NOMBRE, ARCHIVO_S3_KEY, LOG_S3_KEY). Un archivo por solicitud
       no justifica una tabla 1-a-N aparte.
     - SOLICITUD_ESTADO_HISTORIAL se elimina como tabla independiente: cada
       cambio de estado ya se registra como fila de AUDITORIA_EVENTOS
       (columna EVENTO), que es la tabla que la aplicación consulta para la
       pantalla de Auditoría. Mantener dos bitácoras paralelas duplicaba
       datos sin aportar información distinta.
     - Los CHECK de ESTADO y PROCESO reemplazan las llaves foráneas a tablas
       catálogo (eliminadas en 01_esquema_y_catalogos.sql): son un conjunto
       cerrado que ya vive en app-web/src/lib/domain-types.ts.

   Reglas implementadas:
     - RF-17/RF-18: una solicitud PENDIENTE no se modifica (se cancela o se
       crea otra); el ESTADO está acotado por CHECK.
     - RF-27/RF-28: totales y evidencia se conservan en el detalle.
     - RF-32: AUDITORIA_EVENTOS registra creación, envío, revisión, apertura,
       aprobación/rechazo, ejecución y resultado final.
     - RF-34: se conserva el impacto simulado y el motivo de rechazo.
     - Cambio de alcance de precio técnico: PRECIO_TECNICO queda disponible
       en el detalle para reconstruir precios publicados desde el valor
       previo al redondeo comercial.

   Compatibilidad: se conservan los nombres de tabla, secuencia y columnas que
   ya consume app-web/src/server/portal-repository.ts.

   Idempotente: crea lo que falta y actualiza (ALTER) la versión anterior del DDL.
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
   3.1 SEQ_SOLICITUD — correlativo visible de la solicitud.
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SEQ_SOLICITUD]', N'SO') IS NULL
    CREATE SEQUENCE [PORTAL_PRECIOS].[SEQ_SOLICITUD] AS INT START WITH 10450 INCREMENT BY 1;
GO

/* ============================================================================
   3.2 SOLICITUD_PRECIO — encabezado del flujo maker-checker.
       ESTADO: BORRADOR | PENDIENTE | EN_PROCESO | PROCESADO |
               PROCESADO_CON_ERRORES | RECHAZADO | ERROR_EJECUCION | CANCELADO
       PROCESO: FACTOR_PRECIO | MAYOREOD_MASIVO | DESCUENTO_LISTA_PRECIO |
                MARGEN_UTILIDAD_MASIVO
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
    (
        [ID_SOLICITUD]           INT IDENTITY(1,1) NOT NULL,
        [CODIGO_SOLICITUD]       VARCHAR(20)  NOT NULL,      -- SOL-10450, SOL-10451, …
        [COMPANIA]               VARCHAR(20)  NOT NULL,
        [PROCESO]                VARCHAR(30)  NOT NULL,
        [MODALIDAD]              VARCHAR(10)  NOT NULL,      -- manual | excel
        [ESTADO]                 VARCHAR(25)  NOT NULL CONSTRAINT [DF_SP_ESTADO] DEFAULT ('PENDIENTE'),
        -- Solicitante (correo + vínculo opcional al usuario).
        [ID_USUARIO_SOLICITANTE] INT          NULL,
        [SOLICITANTE_EMAIL]      VARCHAR(120) NOT NULL,
        [SOLICITANTE_NOMBRE]     VARCHAR(120) NOT NULL,
        -- Parámetros del proceso: JSON completo + columnas de consulta/reporte.
        [PARAMETROS_JSON]        NVARCHAR(MAX) NULL,
        [LISTA]                  VARCHAR(30)  NULL,          -- lista objetivo
        [NIVEL_PRECIO]           VARCHAR(50)  NULL,          -- NIVEL_PRECIO de Softland
        [GRUPO_ARTICULOS]        VARCHAR(60)  NULL,          -- Actualización Masiva
        [TIPO_VARIACION]         VARCHAR(15)  NULL,          -- AUMENTO | DISMINUCION
        [VARIACION_PORCENTAJE]   DECIMAL(9,4) NULL,          -- Factor % capturado (10.00 = 10%)
        [FACTOR_APLICADO]        DECIMAL(9,6) NULL,          -- multiplicador derivado (1.10)
        [CONFIRMO_IMPACTO]       CHAR(1)      NOT NULL CONSTRAINT [DF_SP_CONFIRMA] DEFAULT ('N'),
        -- Evidencia de simulación previa al envío (RF-06/RF-07/RF-12).
        [FECHA_SIMULACION]       DATETIME     NULL,
        [SIM_TOTAL_REGISTROS]    INT          NULL,
        [SIM_VALIDOS]            INT          NULL,
        [SIM_INVALIDOS]          INT          NULL,
        -- Archivo cargado y artefactos de resultado (sin tabla aparte).
        [ARCHIVO_NOMBRE]         VARCHAR(260) NULL,
        [ARCHIVO_S3_KEY]         VARCHAR(400) NULL,
        [LOG_S3_KEY]             VARCHAR(400) NULL,
        -- Decisión y ejecución.
        [MOTIVO_RECHAZO]         VARCHAR(500) NULL,
        [ID_PROCESO_SP]          VARCHAR(30)  NULL,          -- PROC-YYYYMMDD-NNNN
        [TOTAL_REGISTROS]        INT          NULL,
        [EXITOSOS]               INT          NULL,
        [FALLIDOS]               INT          NULL,
        [APROBADOR_EMAIL]        VARCHAR(120) NULL,
        [APROBADOR_NOMBRE]       VARCHAR(120) NULL,
        [FECHA_ENVIO]            DATETIME     NOT NULL CONSTRAINT [DF_SP_FENVIO] DEFAULT (GETDATE()),
        [FECHA_ULT_ESTADO]       DATETIME     NULL,
        [VERSION_FILA]           ROWVERSION   NOT NULL,      -- concurrencia optimista
        CONSTRAINT [PK_PP_SOLICITUD_PRECIO] PRIMARY KEY CLUSTERED ([ID_SOLICITUD]),
        CONSTRAINT [UQ_PP_SOLICITUD_CODIGO] UNIQUE ([CODIGO_SOLICITUD]),
        CONSTRAINT [FK_PP_SP_COMPANIA] FOREIGN KEY ([COMPANIA])
            REFERENCES [PORTAL_PRECIOS].[COMPANIA] ([COMPANIA]),
        CONSTRAINT [FK_PP_SP_USUARIO] FOREIGN KEY ([ID_USUARIO_SOLICITANTE])
            REFERENCES [PORTAL_PRECIOS].[USUARIO] ([ID_USUARIO]),
        CONSTRAINT [CK_PP_SP_ESTADO] CHECK ([ESTADO] IN
            ('BORRADOR','PENDIENTE','EN_PROCESO','PROCESADO','PROCESADO_CON_ERRORES','RECHAZADO','ERROR_EJECUCION','CANCELADO')),
        CONSTRAINT [CK_PP_SP_PROCESO] CHECK ([PROCESO] IN
            ('FACTOR_PRECIO','MAYOREOD_MASIVO','DESCUENTO_LISTA_PRECIO','MARGEN_UTILIDAD_MASIVO')),
        CONSTRAINT [CK_PP_SP_MODALIDAD] CHECK ([MODALIDAD] IN ('manual','excel')),
        CONSTRAINT [CK_PP_SP_TIPO_VARIACION] CHECK ([TIPO_VARIACION] IS NULL OR [TIPO_VARIACION] IN ('AUMENTO','DISMINUCION')),
        CONSTRAINT [CK_PP_SP_CONFIRMA] CHECK ([CONFIRMO_IMPACTO] IN ('S','N')),
        CONSTRAINT [CK_PP_SP_FACTOR] CHECK ([FACTOR_APLICADO] IS NULL OR ([FACTOR_APLICADO] > 0 AND [FACTOR_APLICADO] <= 2)),
        CONSTRAINT [CK_PP_SP_VARIACION] CHECK ([VARIACION_PORCENTAJE] IS NULL OR [VARIACION_PORCENTAJE] >= 0),
        CONSTRAINT [CK_PP_SP_CONTADORES] CHECK (
            ([TOTAL_REGISTROS] IS NULL AND [EXITOSOS] IS NULL AND [FALLIDOS] IS NULL)
            OR ([EXITOSOS] >= 0 AND [FALLIDOS] >= 0 AND [EXITOSOS] + [FALLIDOS] <= [TOTAL_REGISTROS])
        ),
        -- RNF-05: segregación de funciones, sin autoaprobación. Antes vivía en
        -- la tabla separada SOLICITUD_APROBACION; ambos correos ya están aquí.
        CONSTRAINT [CK_PP_SP_NO_AUTOAPROBACION] CHECK (
            [APROBADOR_EMAIL] IS NULL OR [APROBADOR_EMAIL] <> [SOLICITANTE_EMAIL]
        ),
        -- RF-19: un rechazo siempre lleva motivo.
        CONSTRAINT [CK_PP_SP_MOTIVO_RECHAZO] CHECK (
            [ESTADO] <> 'RECHAZADO' OR ([MOTIVO_RECHAZO] IS NOT NULL AND LEN(LTRIM(RTRIM([MOTIVO_RECHAZO]))) > 0)
        )
    );

    CREATE INDEX [IX_PP_SP_BANDEJA]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([COMPANIA],[ESTADO],[PROCESO])
        INCLUDE ([CODIGO_SOLICITUD],[SOLICITANTE_EMAIL],[FECHA_ENVIO]);
    CREATE INDEX [IX_PP_SP_SOLICITANTE]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([SOLICITANTE_EMAIL],[FECHA_ENVIO]);
END
GO

/* --- Actualización de versiones previas de SOLICITUD_PRECIO ---------------- */
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'ID_USUARIO_SOLICITANTE') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [ID_USUARIO_SOLICITANTE] INT NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'LISTA') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [LISTA] VARCHAR(30) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'NIVEL_PRECIO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [NIVEL_PRECIO] VARCHAR(50) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'GRUPO_ARTICULOS') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [GRUPO_ARTICULOS] VARCHAR(60) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'TIPO_VARIACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [TIPO_VARIACION] VARCHAR(15) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'VARIACION_PORCENTAJE') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [VARIACION_PORCENTAJE] DECIMAL(9,4) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FACTOR_APLICADO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [FACTOR_APLICADO] DECIMAL(9,6) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'CONFIRMO_IMPACTO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [CONFIRMO_IMPACTO] CHAR(1) NOT NULL CONSTRAINT [DF_SP_CONFIRMA] DEFAULT ('N');
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FECHA_SIMULACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [FECHA_SIMULACION] DATETIME NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'SIM_TOTAL_REGISTROS') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [SIM_TOTAL_REGISTROS] INT NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'SIM_VALIDOS') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [SIM_VALIDOS] INT NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'SIM_INVALIDOS') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [SIM_INVALIDOS] INT NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'LOG_S3_KEY') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [LOG_S3_KEY] VARCHAR(400) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'VERSION_FILA') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [VERSION_FILA] ROWVERSION NOT NULL;
GO

/* Las llaves foráneas a catálogos de una versión intermedia se retiran: el
   conjunto de estados/procesos vuelve a validarse con CHECK (ver 01). */
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PP_SP_ESTADO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] DROP CONSTRAINT [FK_PP_SP_ESTADO];
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PP_SP_PROCESO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] DROP CONSTRAINT [FK_PP_SP_PROCESO];
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_ESTADO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_ESTADO] CHECK ([ESTADO] IN
            ('BORRADOR','PENDIENTE','EN_PROCESO','PROCESADO','PROCESADO_CON_ERRORES','RECHAZADO','ERROR_EJECUCION','CANCELADO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_PROCESO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_PROCESO] CHECK ([PROCESO] IN
            ('FACTOR_PRECIO','MAYOREOD_MASIVO','DESCUENTO_LISTA_PRECIO','MARGEN_UTILIDAD_MASIVO'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PP_SP_COMPANIA')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [FK_PP_SP_COMPANIA] FOREIGN KEY ([COMPANIA])
            REFERENCES [PORTAL_PRECIOS].[COMPANIA] ([COMPANIA]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PP_SP_USUARIO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [FK_PP_SP_USUARIO] FOREIGN KEY ([ID_USUARIO_SOLICITANTE])
            REFERENCES [PORTAL_PRECIOS].[USUARIO] ([ID_USUARIO]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_NO_AUTOAPROBACION')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_NO_AUTOAPROBACION] CHECK (
            [APROBADOR_EMAIL] IS NULL OR [APROBADOR_EMAIL] <> [SOLICITANTE_EMAIL]
        );
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_MOTIVO_RECHAZO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_MOTIVO_RECHAZO] CHECK (
            [ESTADO] <> 'RECHAZADO' OR ([MOTIVO_RECHAZO] IS NOT NULL AND LEN(LTRIM(RTRIM([MOTIVO_RECHAZO]))) > 0)
        );
GO

/* ============================================================================
   3.3 SOLICITUD_PRECIO_DETALLE — evidencia fila por fila.
       Antes de aprobar guarda la simulación (precio actual, calculado,
       técnico, redondeado, banda, márgenes, validación). Después de ejecutar
       guarda el resultado aplicado de cada fila.
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]
    (
        [ID_DETALLE]                     BIGINT IDENTITY(1,1) NOT NULL,
        [ID_SOLICITUD]                   INT          NOT NULL,
        [FILA]                           INT          NOT NULL,
        [ARTICULO]                       VARCHAR(20)  NOT NULL,
        [DESCRIPCION]                    VARCHAR(200) NULL,
        [LISTA_CODIGO]                   VARCHAR(30)  NULL,
        [GRUPO_ARTICULO]                 VARCHAR(60)  NULL,
        [TIPO_VARIACION]                 VARCHAR(15)  NULL,       -- AUMENTO | DISMINUCION
        -- Captura: porcentaje legible y multiplicadores derivados.
        [VARIACION_PORCENTAJE]           DECIMAL(9,4) NULL,       -- Factor % (10.50 = 10,5%)
        [PORCENTAJE_REDUCCION]           DECIMAL(9,4) NULL,       -- margen: 10.50 = 10,5%
        [FACTOR_REDUCCION_NORM]          DECIMAL(9,6) NULL,       -- margen: 0.1050
        [FACTOR_MULTIPLICADOR]           DECIMAL(9,6) NULL,       -- precio: 0.95 / 1.10
        [MULTIPLICADOR_MARGEN]           DECIMAL(9,6) NULL,       -- margen: (1 - factor)
        -- Precios de la simulación.
        [PRECIO_ACTUAL]                  DECIMAL(28,8) NULL,
        [PRECIO_CALCULADO]               DECIMAL(28,8) NULL,      -- base, antes de redondear
        [PRECIO_TECNICO]                 DECIMAL(28,8) NULL,      -- precio original/técnico
        [PRECIO_REDONDEADO]              DECIMAL(28,8) NULL,      -- tras las 12 bandas
        [BANDA_NUMERO]                   TINYINT       NULL,
        [BANDA_REDONDEO]                 VARCHAR(60)   NULL,
        [ESTADO_REDONDEO]                VARCHAR(20)   NULL,      -- CALCULADO | FUERA_DE_RANGO | ALERTA_MARGEN
        -- Márgenes y costos.
        [MARGEN_PROMEDIO]                DECIMAL(9,6)  NULL,
        [MARGEN_SOBRE_PRECIO_REDONDEADO] DECIMAL(9,6)  NULL,
        [MARGEN_MINIMO]                  DECIMAL(9,6)  NULL,
        [COSTO_MINIMO]                   DECIMAL(28,8) NULL,
        -- Validación previa al envío.
        [VALIDO]                         CHAR(1)       NOT NULL CONSTRAINT [DF_SPD_VALIDO] DEFAULT ('S'),
        [CODIGO_RECHAZO]                 VARCHAR(40)   NULL,
        [CAUSA]                          VARCHAR(400)  NULL,
        -- Resultado tras la ejecución autorizada (RF-27).
        [RESULTADO]                      VARCHAR(15)   NULL,      -- OK | ERROR | NO_APLICADO
        [PRECIO_APLICADO]                DECIMAL(28,8) NULL,
        [MENSAJE_RESULTADO]              VARCHAR(400)  NULL,
        [FECHA_APLICACION]               DATETIME      NULL,
        CONSTRAINT [PK_PP_SOLICITUD_PRECIO_DETALLE] PRIMARY KEY CLUSTERED ([ID_DETALLE]),
        CONSTRAINT [FK_PP_SPD_SOLICITUD] FOREIGN KEY ([ID_SOLICITUD])
            REFERENCES [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ([ID_SOLICITUD]),
        CONSTRAINT [CK_PP_SPD_VALIDO] CHECK ([VALIDO] IN ('S','N')),
        CONSTRAINT [CK_PP_SPD_ESTADO_REDONDEO] CHECK ([ESTADO_REDONDEO] IS NULL OR [ESTADO_REDONDEO] IN ('CALCULADO','FUERA_DE_RANGO','ALERTA_MARGEN')),
        CONSTRAINT [CK_PP_SPD_RESULTADO] CHECK ([RESULTADO] IS NULL OR [RESULTADO] IN ('OK','ERROR','NO_APLICADO')),
        CONSTRAINT [CK_PP_SPD_TIPO_VARIACION] CHECK ([TIPO_VARIACION] IS NULL OR [TIPO_VARIACION] IN ('AUMENTO','DISMINUCION')),
        CONSTRAINT [CK_PP_SPD_BANDA] CHECK ([BANDA_NUMERO] IS NULL OR [BANDA_NUMERO] BETWEEN 1 AND 12)
    );

    CREATE INDEX [IX_PP_SPD_SOLICITUD]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ([ID_SOLICITUD]);
    CREATE INDEX [IX_PP_SPD_ARTICULO]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ([ARTICULO],[LISTA_CODIGO]);
    CREATE INDEX [IX_PP_SPD_INVALIDOS]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ([ID_SOLICITUD],[VALIDO])
        INCLUDE ([FILA],[ARTICULO],[CODIGO_RECHAZO]);
END
GO

/* --- Actualización de versiones previas del detalle ------------------------ */
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'GRUPO_ARTICULO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [GRUPO_ARTICULO] VARCHAR(60) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'VARIACION_PORCENTAJE') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [VARIACION_PORCENTAJE] DECIMAL(9,4) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'MULTIPLICADOR_MARGEN') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [MULTIPLICADOR_MARGEN] DECIMAL(9,6) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'PRECIO_TECNICO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [PRECIO_TECNICO] DECIMAL(28,8) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'BANDA_NUMERO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [BANDA_NUMERO] TINYINT NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'MARGEN_SOBRE_PRECIO_REDONDEADO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [MARGEN_SOBRE_PRECIO_REDONDEADO] DECIMAL(9,6) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'RESULTADO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [RESULTADO] VARCHAR(15) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'PRECIO_APLICADO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [PRECIO_APLICADO] DECIMAL(28,8) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'MENSAJE_RESULTADO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [MENSAJE_RESULTADO] VARCHAR(400) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'FECHA_APLICACION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ADD [FECHA_APLICACION] DATETIME NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE name = N'IX_PP_SPD_ARTICULO'
                  AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]'))
    CREATE INDEX [IX_PP_SPD_ARTICULO]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ([ARTICULO],[LISTA_CODIGO]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE name = N'IX_PP_SPD_INVALIDOS'
                  AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]'))
    CREATE INDEX [IX_PP_SPD_INVALIDOS]
        ON [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] ([ID_SOLICITUD],[VALIDO])
        INCLUDE ([FILA],[ARTICULO],[CODIGO_RECHAZO]);
GO

/* Elimina la tabla SOLICITUD_ARCHIVO de una versión anterior: su contenido
   se consolidó en columnas de SOLICITUD_PRECIO (ver nota de simplificación). */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_ARCHIVO]', N'U') IS NOT NULL
    DROP TABLE [PORTAL_PRECIOS].[SOLICITUD_ARCHIVO];
GO

/* ============================================================================
   3.4 AUDITORIA_EVENTOS — registro cronológico de todo el flujo (RF-32).
       Cubre creación/envío, revisión, apertura por el Aprobador, aprobación
       o rechazo, ejecución y cambios de estado. Sustituye a
       SOLICITUD_ESTADO_HISTORIAL de una versión anterior: cada transición se
       audita aquí como un evento más, sin tabla aparte.
       EVENTO: SOLICITUD_ENVIADA | SOLICITUD_RECHAZADA | SIMULACION_REVISADA |
               SIMULACION_EJECUTADA_COMO_SOLICITANTE | EJECUCION_ENCOLADA |
               EJECUCION_FINALIZADA | SOLICITUD_APROBADA | SOLICITUD_CREADA |
               SOLICITUD_CANCELADA | ARCHIVO_CARGADO | SESION_INICIADA |
               ACCESO_DENEGADO
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[AUDITORIA_EVENTOS]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[AUDITORIA_EVENTOS]
    (
        [ID_EVENTO]        BIGINT IDENTITY(1,1) NOT NULL,
        [FECHA]            DATETIME     NOT NULL CONSTRAINT [DF_AE_FECHA] DEFAULT (GETDATE()),
        [COMPANIA]         VARCHAR(20)  NOT NULL,
        [USUARIO_EMAIL]    VARCHAR(120) NOT NULL,
        [USUARIO_NOMBRE]   VARCHAR(120) NULL,
        [ROL]              VARCHAR(15)  NULL,
        [EVENTO]           VARCHAR(50)  NOT NULL,
        [CODIGO_SOLICITUD] VARCHAR(20)  NULL,
        [ID_PROCESO_SP]    VARCHAR(30)  NULL,
        [ESTADO_ANTERIOR]  VARCHAR(25)  NULL,          -- opcional: para eventos de cambio de estado
        [ESTADO_NUEVO]     VARCHAR(25)  NULL,
        [DETALLE]          VARCHAR(500) NULL,
        CONSTRAINT [PK_PP_AUDITORIA_EVENTOS] PRIMARY KEY CLUSTERED ([ID_EVENTO])
    );

    CREATE INDEX [IX_PP_AE_COMPANIA_FECHA]
        ON [PORTAL_PRECIOS].[AUDITORIA_EVENTOS] ([COMPANIA],[FECHA] DESC);
    CREATE INDEX [IX_PP_AE_SOLICITUD]
        ON [PORTAL_PRECIOS].[AUDITORIA_EVENTOS] ([CODIGO_SOLICITUD],[FECHA]);
END
GO

/* Elimina SOLICITUD_ESTADO_HISTORIAL de una versión anterior si existe: su
   contenido se registra ahora como eventos de AUDITORIA_EVENTOS. */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_ESTADO_HISTORIAL]', N'U') IS NOT NULL
    DROP TABLE [PORTAL_PRECIOS].[SOLICITUD_ESTADO_HISTORIAL];
GO

PRINT 'PORTAL 03 — Solicitudes, detalle y auditoría verificados/creados.';
GO
