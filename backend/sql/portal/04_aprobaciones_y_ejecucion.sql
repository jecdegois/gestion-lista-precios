/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 04 — Aprobación y ejecución (columnas)

   SIMPLIFICACIÓN (respecto de la versión anterior de 4 scripts):
   Las tablas SOLICITUD_APROBACION y SOLICITUD_EJECUCION (+ SEQ_EJECUCION) se
   eliminan. La aplicación ejecuta como máximo UNA aprobación y UNA corrida
   de ejecución por solicitud (una solicitud PENDIENTE solo puede aprobarse o
   rechazarse una vez; al aprobar pasa a EN_PROCESO y de ahí a un estado
   terminal). Modelar eso como tablas 1-a-N por solicitud no aporta nada que
   no puedan dar columnas del propio encabezado: la fila de SOLICITUD_PRECIO
   YA es, por definición, la única decisión y la última ejecución.

   Este script solo AGREGA a SOLICITUD_PRECIO (creada en 03_solicitudes.sql)
   las columnas que hacían falta para cubrir la evidencia de aprobación
   (RF-20) y el control de reintentos transitorios (RF-29/RF-30), sin crear
   tablas nuevas.

   Reglas cubiertas con estas columnas:
     - RF-20: CONFIRMO_IMPACTO (ya existe) + FECHA_REVISION registran que el
       Aprobador abrió el detalle y confirmó el impacto antes de decidir.
     - RNF-05: CK_PP_SP_NO_AUTOAPROBACION (agregada en 03_solicitudes.sql)
       impide que APROBADOR_EMAIL sea igual a SOLICITANTE_EMAIL.
     - RF-19: CK_PP_SP_MOTIVO_RECHAZO (agregada en 03_solicitudes.sql) exige
       motivo cuando ESTADO = RECHAZADO.
     - RNF-08: al haber una sola columna ESTADO por solicitud, nunca puede
       existir más de una ejecución "activa" (EN_PROCESO) simultánea para la
       misma solicitud; no se requiere un índice ni tabla adicional.
     - RF-29/RF-30: INTENTO_EJECUCION cuenta los intentos (máximo 3);
       ES_ERROR_TRANSITORIO marca si el último error admite reintento.
     - RNF-09: ID_PROCESO_SP (ya existe) correlaciona solicitud, aprobación,
       ejecución y auditoría (AUDITORIA_EVENTOS.ID_PROCESO_SP).

   Idempotente: solo agrega columnas si faltan; no crea tablas.
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDQA"
GO

USE [$(DB_PORTAL)];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* 4.1 Evidencia de revisión del Aprobador (RF-20). */
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FECHA_REVISION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [FECHA_REVISION] DATETIME NULL;
GO

/* 4.2 Control de reintentos ante errores transitorios (RF-29/RF-30). */
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'INTENTO_EJECUCION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [INTENTO_EJECUCION] TINYINT NOT NULL CONSTRAINT [DF_SP_INTENTO] DEFAULT (1);
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'ES_ERROR_TRANSITORIO') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO]
        ADD [ES_ERROR_TRANSITORIO] CHAR(1) NOT NULL CONSTRAINT [DF_SP_TRANS] DEFAULT ('N');
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'CODIGO_ERROR') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [CODIGO_ERROR] VARCHAR(40) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'MENSAJE_ERROR') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [MENSAJE_ERROR] VARCHAR(1000) NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FECHA_INICIO_EJECUCION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [FECHA_INICIO_EJECUCION] DATETIME NULL;
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO]', 'FECHA_FIN_EJECUCION') IS NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] ADD [FECHA_FIN_EJECUCION] DATETIME NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_INTENTO')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_INTENTO] CHECK ([INTENTO_EJECUCION] BETWEEN 1 AND 3);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_TRANS')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_TRANS] CHECK ([ES_ERROR_TRANSITORIO] IN ('S','N'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PP_SP_FECHAS_EJEC')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO] WITH CHECK
        ADD CONSTRAINT [CK_PP_SP_FECHAS_EJEC] CHECK (
            [FECHA_FIN_EJECUCION] IS NULL OR [FECHA_INICIO_EJECUCION] IS NULL
            OR [FECHA_FIN_EJECUCION] >= [FECHA_INICIO_EJECUCION]
        );
GO

/* Elimina objetos de una versión anterior con tablas separadas por intento.
   Primero se retira la FK y la columna huérfana en el detalle, para poder
   eliminar SOLICITUD_EJECUCION sin violar dependencias. */
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PP_SPD_EJECUCION')
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] DROP CONSTRAINT [FK_PP_SPD_EJECUCION];
GO
IF COL_LENGTH(N'[PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE]', 'ID_EJECUCION') IS NOT NULL
    ALTER TABLE [PORTAL_PRECIOS].[SOLICITUD_PRECIO_DETALLE] DROP COLUMN [ID_EJECUCION];
GO
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_EJECUCION]', N'U') IS NOT NULL
    DROP TABLE [PORTAL_PRECIOS].[SOLICITUD_EJECUCION];
GO
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SOLICITUD_APROBACION]', N'U') IS NOT NULL
    DROP TABLE [PORTAL_PRECIOS].[SOLICITUD_APROBACION];
GO
IF OBJECT_ID(N'[PORTAL_PRECIOS].[SEQ_EJECUCION]', N'SO') IS NOT NULL
    DROP SEQUENCE [PORTAL_PRECIOS].[SEQ_EJECUCION];
GO

PRINT 'PORTAL 04 — Columnas de aprobación y ejecución verificadas/creadas.';
GO
