/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL · Script 05 — Carga inicial de usuarios para pruebas

   Prerrequisitos:
     1) 01_esquema_y_catalogos.sql
     2) 02_usuarios_y_ambitos.sql

   La carga es idempotente:
     - USUARIO se identifica por EMAIL.
     - USUARIO_AMBITO se identifica por usuario, compañía y rol.
     - IDP_SUBJECT se deja NULL porque los subjects reales del IdP no están
       disponibles en el catálogo de pruebas.

   Los siete usuarios autorizados reciben un ámbito explícito de compañía y
   rol. Las listas de precio no forman parte de la autorización: se consultan
   y validan directamente en los maestros Softland cuando se prepara una
   solicitud. Carlos Gómez se crea activo, pero sin ámbito, para probar el
   rechazo de autorización de una identidad sin permisos.

   Ejecución SQLCMD:
     :setvar DB_PORTAL "SOFTLANDQA"
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDQA"
GO

USE [$(DB_PORTAL)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

IF SCHEMA_ID(N'PORTAL_PRECIOS') IS NULL
BEGIN
    ROLLBACK TRANSACTION;
    ;THROW 51010, 'No existe el esquema PORTAL_PRECIOS. Ejecute primero 01_esquema_y_catalogos.sql.', 1;
END;

IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO]', N'U') IS NULL
   OR OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', N'U') IS NULL
BEGIN
    ROLLBACK TRANSACTION;
    ;THROW 51011, 'No existen las tablas de usuarios. Ejecute primero 02_usuarios_y_ambitos.sql.', 1;
END;

DECLARE @UsuariosSeed TABLE
(
    [EMAIL]    VARCHAR(120) NOT NULL PRIMARY KEY,
    [NOMBRE]   VARCHAR(120) NOT NULL,
    [COMPANIA] VARCHAR(20)  NULL,
    [ACTIVO]   CHAR(1)      NOT NULL
);

INSERT INTO @UsuariosSeed ([EMAIL], [NOMBRE], [COMPANIA], [ACTIVO])
VALUES
    ('jperez@sillaca.com',     'Juan Pérez',      'SILLACA', 'S'),
    ('mrodriguez@sillaca.com', 'María Rodríguez', 'SILLACA', 'S'),
    ('palvarado@beval.com',    'Pedro Alvarado',  'BEVAL',   'S'),
    ('ljimenez@febeca.com',    'Lucía Jiménez',   'FEBECA',  'S'),
    ('rmoreno@febeca.com',     'Ricardo Moreno',  'FEBECA',  'S'),
    ('dvargas@cofersa.com',    'Diego Vargas',    'COFERSA', 'S'),
    ('acastro@cofersa.com',    'Ana Castro',      'COFERSA', 'S'),
    ('cgomez@sinmapeo.com',    'Carlos Gómez',    NULL,      'S');

IF EXISTS
(
    SELECT 1
      FROM @UsuariosSeed s
     WHERE s.[COMPANIA] IS NOT NULL
       AND NOT EXISTS
       (
           SELECT 1
             FROM [PORTAL_PRECIOS].[COMPANIA] c
            WHERE c.[COMPANIA] = s.[COMPANIA]
       )
)
BEGIN
    ROLLBACK TRANSACTION;
    ;THROW 51012, 'Falta una compañía requerida para los usuarios de prueba. Ejecute 01_esquema_y_catalogos.sql.', 1;
END;

MERGE [PORTAL_PRECIOS].[USUARIO] AS t
USING @UsuariosSeed AS s
   ON t.[EMAIL] = s.[EMAIL]
WHEN MATCHED THEN
    UPDATE SET
        t.[NOMBRE] = s.[NOMBRE],
        t.[ACTIVO] = s.[ACTIVO]
WHEN NOT MATCHED THEN
    INSERT ([EMAIL], [NOMBRE], [IDP_SUBJECT], [ACTIVO])
    VALUES (s.[EMAIL], s.[NOMBRE], NULL, s.[ACTIVO]);

DECLARE @AmbitosSeed TABLE
(
    [EMAIL]    VARCHAR(120) NOT NULL,
    [COMPANIA] VARCHAR(20)  NOT NULL,
    [ROL]      VARCHAR(15)  NOT NULL
);

INSERT INTO @AmbitosSeed ([EMAIL], [COMPANIA], [ROL])
VALUES
    ('jperez@sillaca.com',     'SILLACA', 'OPERADOR'),
    ('mrodriguez@sillaca.com', 'SILLACA', 'APROBADOR'),
    ('palvarado@beval.com',    'BEVAL',   'OPERADOR'),
    ('ljimenez@febeca.com',    'FEBECA',  'APROBADOR'),
    ('rmoreno@febeca.com',     'FEBECA',  'OPERADOR'),
    ('dvargas@cofersa.com',    'COFERSA', 'OPERADOR'),
    ('acastro@cofersa.com',    'COFERSA', 'APROBADOR');

IF EXISTS
(
    SELECT 1
      FROM @AmbitosSeed s
     WHERE NOT EXISTS
       (
           SELECT 1
             FROM [PORTAL_PRECIOS].[COMPANIA] c
            WHERE c.[COMPANIA] = s.[COMPANIA]
       )
)
BEGIN
    ROLLBACK TRANSACTION;
    ;THROW 51013, 'Falta una compañía requerida para los ámbitos de prueba. Ejecute 01_esquema_y_catalogos.sql.', 1;
END;

MERGE [PORTAL_PRECIOS].[USUARIO_AMBITO] AS t
USING
(
    SELECT u.[ID_USUARIO], s.[COMPANIA], s.[ROL]
      FROM @AmbitosSeed s
      INNER JOIN [PORTAL_PRECIOS].[USUARIO] u
              ON u.[EMAIL] = s.[EMAIL]
) AS s
   ON t.[ID_USUARIO] = s.[ID_USUARIO]
  AND t.[COMPANIA]  = s.[COMPANIA]
  AND t.[ROL]       = s.[ROL]
WHEN MATCHED THEN
    UPDATE SET
        t.[ACTIVO] = 'S',
        t.[ASIGNADO_POR] = 'SEED_PRUEBAS'
WHEN NOT MATCHED THEN
    INSERT ([ID_USUARIO], [COMPANIA], [ROL], [ACTIVO], [ASIGNADO_POR])
    VALUES (s.[ID_USUARIO], s.[COMPANIA], s.[ROL], 'S', 'SEED_PRUEBAS');

/* Carlos se mantiene identificable, pero sin ámbito autorizado. */
UPDATE ua
   SET ua.[ACTIVO] = 'N'
  FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
  INNER JOIN [PORTAL_PRECIOS].[USUARIO] u
          ON u.[ID_USUARIO] = ua.[ID_USUARIO]
 WHERE u.[EMAIL] = 'cgomez@sinmapeo.com';

COMMIT TRANSACTION;

SELECT u.[ID_USUARIO],
       u.[EMAIL],
       u.[NOMBRE],
       u.[ACTIVO],
       ua.[COMPANIA],
       ua.[ROL],
       ua.[ACTIVO] AS [AMBITO_ACTIVO]
  FROM [PORTAL_PRECIOS].[USUARIO] u
  LEFT JOIN [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
         ON ua.[ID_USUARIO] = u.[ID_USUARIO]
        AND ua.[ACTIVO] = 'S'
 WHERE u.[EMAIL] IN (SELECT [EMAIL] FROM @UsuariosSeed)
 ORDER BY u.[EMAIL], ua.[COMPANIA], ua.[ROL];

PRINT 'PORTAL 05 — Usuarios y ámbitos de prueba cargados/verificados sin restricción por lista.';
GO
