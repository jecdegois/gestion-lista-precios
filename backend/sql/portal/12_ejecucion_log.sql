/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 12 — EJECUCION_LOG

   Tabla de registro de ejecuciones directas de SPs del módulo "Ejecución".
   A diferencia de SOLICITUD (flujo maker-checker), estas ejecuciones son
   iniciadas directamente por un usuario con permiso, sin aprobación previa.

   CONTEXTO DE OBJETOS:
     Base de datos : PORTAL_PRECIOS  (USE al inicio, igual que scripts 09-11)
     Esquema       : uno por empresa  →  [FEBECA], [BEVAL], [SILLACA], …
     Tabla nueva   : [<ESQUEMA_EMPRESA>].[EJECUCION_LOG]

   En este script el esquema activo es FEBECA (entorno de pruebas).
   Para BEVAL / SILLACA: descomentar el bloque correspondiente al final.

   Tipos de ejecución:
     EJECUCION_PRECIOS   — SP de factor / gestión global de precios
     EJECUCION_MARGEN    — SP de recalculo de Margen Mínimo de Utilidad
     EJECUCION_DESCUENTO — SP de descuento puntual artículo-lista

   Estados del ciclo de vida:
     PENDIENTE → EN_PROCESO → COMPLETADO | COMPLETADO_CON_ERRORES | ERROR

   Idempotente: seguro para re-ejecutar en entornos ya actualizados.
   Fecha:       ver historial Git
   ============================================================================ */
USE [PORTAL_PRECIOS];
GO

/* ============================================================================
   12.1 FEBECA.EJECUCION_LOG
   ============================================================================ */
IF OBJECT_ID(N'[FEBECA].[EJECUCION_LOG]', N'U') IS NULL
BEGIN
    CREATE TABLE [FEBECA].[EJECUCION_LOG]
    (
        /* ── PK ──────────────────────────────────────────────────────────── */
        [ID_EJECUCION]          BIGINT IDENTITY(1,1) NOT NULL,

        /* ── Clasificación ───────────────────────────────────────────────── */
        [TIPO_EJECUCION]        VARCHAR(25)   NOT NULL,
            -- EJECUCION_PRECIOS | EJECUCION_MARGEN | EJECUCION_DESCUENTO

        /* ── Contexto del usuario y compañía ─────────────────────────────── */
        [COMPANIA]              VARCHAR(20)   NOT NULL,
        [ID_USUARIO]            INT           NULL,      -- FK → FEBECA.USUARIO (nullable: ejecución de sistema)
        [EJECUTADO_POR_EMAIL]   VARCHAR(120)  NOT NULL,
        [EJECUTADO_POR_NOMBRE]  VARCHAR(120)  NOT NULL,

        /* ── Parámetros de entrada (JSON flexible) ───────────────────────── */
        [PARAMETROS_JSON]       NVARCHAR(MAX) NULL,
            -- lista, factor, porcentajeReduccion, codigoArticulo, etc.

        /* ── Referencia al SP de Softland ────────────────────────────────── */
        [ID_PROCESO_SP]         VARCHAR(30)   NULL,      -- PROC-YYYYMMDD-NNNN
        [SP_NOMBRE]             VARCHAR(100)  NULL,      -- Nombre del SP ejecutado (trazabilidad)

        /* ── Ciclo de vida ───────────────────────────────────────────────── */
        [ESTADO]                VARCHAR(25)   NOT NULL
            CONSTRAINT [DF_FEBECA_EL_ESTADO] DEFAULT ('PENDIENTE'),

        [FECHA_INICIO]          DATETIME      NOT NULL
            CONSTRAINT [DF_FEBECA_EL_FECHA_INICIO] DEFAULT (GETDATE()),
        [FECHA_FIN]             DATETIME      NULL,

        /* ── Resultados ──────────────────────────────────────────────────── */
        [TOTAL_ARTICULOS]       INT           NULL,
        [EXITOSOS]              INT           NULL,
        [FALLIDOS]              INT           NULL,

        /* ── Información de error ────────────────────────────────────────── */
        [CODIGO_ERROR]          VARCHAR(40)   NULL,
        [MENSAJE_ERROR]         VARCHAR(1000) NULL,

        /* ── Observaciones libres ────────────────────────────────────────── */
        [OBSERVACIONES]         VARCHAR(500)  NULL,

        /* ── Concurrencia optimista (igual que SOLICITUD) ────────────────── */
        [VERSION_FILA]          ROWVERSION    NOT NULL,

        /* ── Constraints ─────────────────────────────────────────────────── */
        CONSTRAINT [PK_FEBECA_EJECUCION_LOG]
            PRIMARY KEY CLUSTERED ([ID_EJECUCION]),

        CONSTRAINT [FK_FEBECA_EL_COMPANIA]
            FOREIGN KEY ([COMPANIA])
            REFERENCES [FEBECA].[COMPANIA] ([COMPANIA]),

        CONSTRAINT [FK_FEBECA_EL_USUARIO]
            FOREIGN KEY ([ID_USUARIO])
            REFERENCES [FEBECA].[USUARIO] ([ID_USUARIO]),

        CONSTRAINT [CK_FEBECA_EL_TIPO]
            CHECK ([TIPO_EJECUCION] IN (
                'EJECUCION_PRECIOS',
                'EJECUCION_MARGEN',
                'EJECUCION_DESCUENTO'
            )),

        CONSTRAINT [CK_FEBECA_EL_ESTADO]
            CHECK ([ESTADO] IN (
                'PENDIENTE',
                'EN_PROCESO',
                'COMPLETADO',
                'COMPLETADO_CON_ERRORES',
                'ERROR'
            )),

        -- Coherencia de contadores: si hay resultados, deben ser consistentes.
        CONSTRAINT [CK_FEBECA_EL_CONTADORES]
            CHECK (
                (    [TOTAL_ARTICULOS] IS NULL
                 AND [EXITOSOS]        IS NULL
                 AND [FALLIDOS]        IS NULL)
                OR (    [EXITOSOS]             >= 0
                    AND [FALLIDOS]             >= 0
                    AND [EXITOSOS] + [FALLIDOS] <= [TOTAL_ARTICULOS])
            ),

        -- Si el estado terminal tiene errores, FALLIDOS debe ser > 0.
        CONSTRAINT [CK_FEBECA_EL_ERROR_COHERENTE]
            CHECK (
                [ESTADO] NOT IN ('ERROR', 'COMPLETADO_CON_ERRORES')
                OR ([FALLIDOS] IS NULL OR [FALLIDOS] > 0)
            ),

        -- FECHA_FIN solo en estado terminal.
        CONSTRAINT [CK_FEBECA_EL_FECHA_FIN]
            CHECK (
                [FECHA_FIN] IS NULL
                OR [ESTADO] IN ('COMPLETADO', 'COMPLETADO_CON_ERRORES', 'ERROR')
            )
    );

    /* ── Índices ──────────────────────────────────────────────────────────── */

    -- Consulta principal: últimas ejecuciones por compañía y tipo (módulo UI).
    CREATE INDEX [IX_FEBECA_EL_COMPANIA_TIPO_FECHA]
        ON [FEBECA].[EJECUCION_LOG] ([COMPANIA], [TIPO_EJECUCION], [FECHA_INICIO] DESC)
        INCLUDE ([ESTADO], [TOTAL_ARTICULOS], [EXITOSOS], [FALLIDOS], [ID_PROCESO_SP]);

    -- Historial por usuario.
    CREATE INDEX [IX_FEBECA_EL_USUARIO_FECHA]
        ON [FEBECA].[EJECUCION_LOG] ([EJECUTADO_POR_EMAIL], [FECHA_INICIO] DESC)
        INCLUDE ([TIPO_EJECUCION], [ESTADO], [COMPANIA]);

    -- Monitoreo de ejecuciones activas (polling / dashboard).
    CREATE INDEX [IX_FEBECA_EL_ESTADO_ACTIVO]
        ON [FEBECA].[EJECUCION_LOG] ([ESTADO], [FECHA_INICIO] DESC)
        WHERE [ESTADO] IN ('PENDIENTE', 'EN_PROCESO');

    -- Correlación con el proceso en Softland.
    CREATE INDEX [IX_FEBECA_EL_ID_PROCESO_SP]
        ON [FEBECA].[EJECUCION_LOG] ([ID_PROCESO_SP])
        WHERE [ID_PROCESO_SP] IS NOT NULL;

    PRINT '  Tabla FEBECA.EJECUCION_LOG creada con 4 índices.';
END
ELSE
    PRINT '  Tabla FEBECA.EJECUCION_LOG ya existe — sin cambios.';
GO

/* ============================================================================
   Para BEVAL: descomentar cuando el esquema BEVAL esté disponible
   ============================================================================ */
-- IF OBJECT_ID(N'[BEVAL].[EJECUCION_LOG]', N'U') IS NULL
-- BEGIN
--     CREATE TABLE [BEVAL].[EJECUCION_LOG] ( ... );  -- misma estructura, prefijo BEVAL_
--     ...
-- END
-- GO

/* ============================================================================
   Para SILLACA: descomentar cuando el esquema SILLACA esté disponible
   ============================================================================ */
-- IF OBJECT_ID(N'[SILLACA].[EJECUCION_LOG]', N'U') IS NULL
-- BEGIN
--     CREATE TABLE [SILLACA].[EJECUCION_LOG] ( ... );  -- misma estructura, prefijo SILLACA_
--     ...
-- END
-- GO

/* ============================================================================
   12.2 Verificación de integridad
   ============================================================================ */
PRINT '';
PRINT '── Verificación EJECUCION_LOG ──────────────────────────────────────────';

-- Columnas presentes
SELECT
    c.TABLE_SCHEMA          AS ESQUEMA,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.CHARACTER_MAXIMUM_LENGTH AS MAX_LEN,
    c.IS_NULLABLE,
    c.COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA IN ('FEBECA')
  AND c.TABLE_NAME   = 'EJECUCION_LOG'
ORDER BY c.TABLE_SCHEMA, c.ORDINAL_POSITION;

-- Constraints activos
SELECT
    tc.TABLE_SCHEMA         AS ESQUEMA,
    tc.CONSTRAINT_NAME,
    tc.CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
WHERE tc.TABLE_SCHEMA IN ('FEBECA')
  AND tc.TABLE_NAME   = 'EJECUCION_LOG'
ORDER BY tc.TABLE_SCHEMA, tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME;

-- Índices activos
SELECT
    s.name                  AS ESQUEMA,
    i.name                  AS INDICE,
    i.type_desc             AS TIPO,
    i.is_unique             AS ES_UNICO,
    i.has_filter            AS TIENE_FILTRO
FROM sys.indexes i
JOIN sys.objects o  ON o.object_id = i.object_id
JOIN sys.schemas s  ON s.schema_id = o.schema_id
WHERE s.name IN ('FEBECA')
  AND o.name  = 'EJECUCION_LOG'
  AND i.type  > 0
ORDER BY s.name, i.name;

PRINT '';
PRINT 'Script 12 — EJECUCION_LOG: OK';
GO
