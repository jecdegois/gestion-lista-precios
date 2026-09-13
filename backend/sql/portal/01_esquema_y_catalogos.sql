/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 01 — Esquema y catálogos maestros

   Crea el esquema [PORTAL_PRECIOS] y los ÚNICOS catálogos maestros que son
   datos reales de negocio (compañías y listas de precio por compañía).

   SIMPLIFICACIÓN (respecto de la versión anterior de 4 scripts):
   Los códigos de rol, estado, proceso, evento y motivo de rechazo NO se
   modelan como tablas-catálogo. Son un conjunto cerrado y estable que ya vive
   como enumeraciones en la aplicación (app-web/src/lib/domain-types.ts) y se
   valida en base de datos con CHECK constraints simples sobre las tablas que
   los usan (ver 03_solicitudes.sql y 04_aprobaciones_y_ejecucion.sql). Esto
   evita mantener 6 tablas de una sola fila por código sin ganancia real: la
   app nunca las consulta y agregar un valor nuevo requiere tocar código de
   todas formas.

   Valores cerrados documentados aquí (para referencia, no son tablas):
     ROL              -> OPERADOR | APROBADOR | AUDITOR | SIN_PERMISO
     ESTADO_SOLICITUD -> BORRADOR | PENDIENTE | EN_PROCESO | PROCESADO |
                         PROCESADO_CON_ERRORES | RECHAZADO | ERROR_EJECUCION |
                         CANCELADO
     PROCESO          -> FACTOR_PRECIO | MAYOREOD_MASIVO |
                         DESCUENTO_LISTA_PRECIO | MARGEN_UTILIDAD_MASIVO
     EVENTO (auditoría) -> ver CHECK de AUDITORIA_EVENTOS en 03_solicitudes.sql

   PARAMETRIZACIÓN (SQLCMD):
     :setvar DB_PORTAL   SOFTLANDQA   -- base donde vive [PORTAL_PRECIOS]

   El nombre del esquema es literal [PORTAL_PRECIOS] y debe coincidir con la
   variable de entorno PORTAL_SCHEMA de la aplicación (default PORTAL_PRECIOS).

   Orden de ejecución: 01 → 02 → 03 → 04.
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDQA"
GO

USE [$(DB_PORTAL)];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF SCHEMA_ID(N'PORTAL_PRECIOS') IS NULL
    EXEC(N'CREATE SCHEMA [PORTAL_PRECIOS]');
GO

/* ============================================================================
   1.1 COMPANIA — compañías habilitadas en el portal (multiempresa).
       El CÓDIGO debe coincidir con la clave usada en COMPANIES_CONFIG de la
       aplicación, y ESQUEMA_SOFTLAND con el esquema operativo (COFER, EMP1,
       …). La compañía NO se infiere del dominio de correo: se autoriza de
       forma explícita por usuario mediante USUARIO_AMBITO e IDP_SUBJECT.
       NUNCA se almacenan servidor, usuario ni contraseña: las credenciales
       viven en el gestor de secretos / variables de entorno (RF-35).
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[COMPANIA]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[COMPANIA]
    (
        [COMPANIA]         VARCHAR(20)  NOT NULL,
        [NOMBRE]           VARCHAR(80)  NOT NULL,
        [ESQUEMA_SOFTLAND] VARCHAR(30)  NULL,
        [ACTIVO]           CHAR(1)      NOT NULL CONSTRAINT [DF_COMP_ACTIVO] DEFAULT ('S'),
        [FECHA_CREACION]   DATETIME     NOT NULL CONSTRAINT [DF_COMP_FCREA]  DEFAULT (GETDATE()),
        CONSTRAINT [PK_PP_COMPANIA] PRIMARY KEY CLUSTERED ([COMPANIA]),
        CONSTRAINT [CK_PP_COMP_ACTIVO] CHECK ([ACTIVO] IN ('S','N'))
    );
END
GO

MERGE [PORTAL_PRECIOS].[COMPANIA] AS t
USING (VALUES
    ('SILLACA',  'SILLACA',  'SILLACA'),
    ('BEVAL',    'BEVAL',    'BEVAL'),
    ('FEBECA',   'FEBECA',   'FEBECA'),
    ('COFERSA',  'COFERSA',  'COFER')
) AS s ([COMPANIA],[NOMBRE],[ESQUEMA_SOFTLAND])
   ON t.[COMPANIA] = s.[COMPANIA]
WHEN MATCHED THEN UPDATE SET
    t.[NOMBRE] = s.[NOMBRE], t.[ESQUEMA_SOFTLAND] = s.[ESQUEMA_SOFTLAND]
WHEN NOT MATCHED THEN
    INSERT ([COMPANIA],[NOMBRE],[ESQUEMA_SOFTLAND])
    VALUES (s.[COMPANIA],s.[NOMBRE],s.[ESQUEMA_SOFTLAND]);
GO

/* ============================================================================
   1.2 LISTA_PRECIO — listas por compañía (RF-02, RNF-06: ámbito por lista).
       ES_LISTA_BASE marca la lista base (MAYOREOD), gestionada
       exclusivamente desde Actualización Masiva de Precios. Las reglas de
       qué proceso puede tocar qué lista viven en el código de la aplicación
       (catalog.ts) junto con ES_LISTA_BASE; no se duplican aquí banderas por
       proceso.
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[LISTA_PRECIO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[LISTA_PRECIO]
    (
        [COMPANIA]      VARCHAR(20) NOT NULL,
        [LISTA]         VARCHAR(30) NOT NULL,
        [NOMBRE]        VARCHAR(80) NOT NULL,
        [NIVEL_PRECIO]  VARCHAR(50) NULL,          -- NIVEL_PRECIO en Softland
        [ES_LISTA_BASE] CHAR(1)     NOT NULL CONSTRAINT [DF_LP_BASE]   DEFAULT ('N'),
        [ACTIVO]        CHAR(1)     NOT NULL CONSTRAINT [DF_LP_ACTIVO] DEFAULT ('S'),
        CONSTRAINT [PK_PP_LISTA_PRECIO] PRIMARY KEY CLUSTERED ([COMPANIA],[LISTA]),
        CONSTRAINT [FK_PP_LP_COMPANIA] FOREIGN KEY ([COMPANIA])
            REFERENCES [PORTAL_PRECIOS].[COMPANIA] ([COMPANIA]),
        CONSTRAINT [CK_PP_LP_BASE]   CHECK ([ES_LISTA_BASE] IN ('S','N')),
        CONSTRAINT [CK_PP_LP_ACTIVO] CHECK ([ACTIVO]        IN ('S','N'))
    );
END
GO

/* Listas fijas de SILLACA, BEVAL y FEBECA. */
MERGE [PORTAL_PRECIOS].[LISTA_PRECIO] AS t
USING (
    SELECT c.[COMPANIA],
           l.[LISTA],
           l.[LISTA]        AS [NOMBRE],
           l.[NIVEL_PRECIO],
           l.[ES_LISTA_BASE]
      FROM (VALUES ('SILLACA'),('BEVAL'),('FEBECA')) AS c([COMPANIA])
     CROSS JOIN (VALUES
            ('MAYOREOD',  'MayoreoD', 'S'),
            ('MAYOREOB',  'MayoreoB', 'N'),
            ('LPARAGUA',  NULL,       'N'),
            ('GRUPOPICO', NULL,       'N'),
            ('LARAB',     NULL,       'N')
     ) AS l([LISTA],[NIVEL_PRECIO],[ES_LISTA_BASE])
) AS s
   ON t.[COMPANIA] = s.[COMPANIA] AND t.[LISTA] = s.[LISTA]
WHEN MATCHED THEN UPDATE SET
    t.[NOMBRE] = s.[NOMBRE], t.[NIVEL_PRECIO] = s.[NIVEL_PRECIO], t.[ES_LISTA_BASE] = s.[ES_LISTA_BASE]
WHEN NOT MATCHED THEN
    INSERT ([COMPANIA],[LISTA],[NOMBRE],[NIVEL_PRECIO],[ES_LISTA_BASE])
    VALUES (s.[COMPANIA],s.[LISTA],s.[NOMBRE],s.[NIVEL_PRECIO],s.[ES_LISTA_BASE]);
GO

/* Listas LPV1 … LPV18 de COFERSA. */
MERGE [PORTAL_PRECIOS].[LISTA_PRECIO] AS t
USING (
    SELECT 'COFERSA' AS [COMPANIA],
           'LPV' + CAST(n AS VARCHAR(2)) AS [LISTA],
           'LPV' + CAST(n AS VARCHAR(2)) AS [NOMBRE]
      FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
                   (11),(12),(13),(14),(15),(16),(17),(18)) AS v(n)
) AS s
   ON t.[COMPANIA] = s.[COMPANIA] AND t.[LISTA] = s.[LISTA]
WHEN MATCHED THEN UPDATE SET t.[NOMBRE] = s.[NOMBRE]
WHEN NOT MATCHED THEN
    INSERT ([COMPANIA],[LISTA],[NOMBRE],[ES_LISTA_BASE])
    VALUES (s.[COMPANIA],s.[LISTA],s.[NOMBRE],'N');
GO

PRINT 'PORTAL 01 — Esquema [PORTAL_PRECIOS] y catálogos maestros verificados/creados.';
GO
