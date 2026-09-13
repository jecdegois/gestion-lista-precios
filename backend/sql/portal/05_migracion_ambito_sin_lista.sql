/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL · Migración 05 — Eliminar LISTA del ámbito de autorización

   EJECUTAR DESPUÉS DE:
     01_esquema_y_catalogos.sql
     02_usuarios_y_ambitos.sql
     03_solicitudes.sql
     04_aprobaciones_y_ejecucion.sql

   Esta migración corrige una instalación que ya ejecutó una versión anterior
   del script 02. El ámbito queda únicamente por usuario, compañía y rol.

   NO MODIFICA:
     - PORTAL_PRECIOS.SOLICITUD_PRECIO.LISTA
     - PORTAL_PRECIOS.SOLICITUD_PRECIO_DETALLE.LISTA_CODIGO
     - Los maestros de listas, artículos o precios de Softland.

   Si existían varias filas para el mismo usuario, compañía y rol debido a
   listas diferentes, se conserva una sola fila. El ámbito resultante permite
   operar en la compañía para ese rol; se conserva ACTIVO = 'S' si alguna fila
   histórica estaba activa.
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDQA"
GO

USE [$(DB_PORTAL)];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* La autorización deja de recibir LISTA como parámetro. */
CREATE OR ALTER FUNCTION [PORTAL_PRECIOS].[FN_USUARIO_EN_AMBITO]
(
    @email    VARCHAR(120),
    @compania VARCHAR(20),
    @rol      VARCHAR(15) = NULL
)
RETURNS BIT
AS
BEGIN
    DECLARE @id_usuario INT;

    SELECT @id_usuario = u.[ID_USUARIO]
      FROM [PORTAL_PRECIOS].[USUARIO] u
     WHERE u.[EMAIL]  = @email
       AND u.[ACTIVO] = 'S';

    IF @id_usuario IS NULL RETURN 0;

    IF NOT EXISTS
    (
        SELECT 1
          FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
         WHERE ua.[ID_USUARIO] = @id_usuario
           AND ua.[COMPANIA]   = @compania
           AND ua.[ACTIVO]     = 'S'
           AND (@rol IS NULL OR ua.[ROL] = @rol)
    )
        RETURN 0;

    RETURN 1;
END
GO

/* La vista devuelve el ámbito por usuario, compañía y rol, sin expandir listas. */
CREATE OR ALTER VIEW [PORTAL_PRECIOS].[V_USUARIO_AMBITO]
AS
    SELECT u.[ID_USUARIO],
           u.[EMAIL],
           u.[NOMBRE],
           ua.[COMPANIA],
           c.[NOMBRE] AS [COMPANIA_NOMBRE],
           ua.[ROL]
      FROM [PORTAL_PRECIOS].[USUARIO] u
     INNER JOIN [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
             ON ua.[ID_USUARIO] = u.[ID_USUARIO]
            AND ua.[ACTIVO] = 'S'
     INNER JOIN [PORTAL_PRECIOS].[COMPANIA] c
             ON c.[COMPANIA] = ua.[COMPANIA]
     WHERE u.[ACTIVO] = 'S';
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', N'U') IS NULL
        THROW 51020, 'No existe PORTAL_PRECIOS.USUARIO_AMBITO. Ejecute primero 02_usuarios_y_ambitos.sql.', 1;

    /* Retirar dependencias de la columna LISTA de una versión anterior. */
    IF COL_LENGTH(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', 'LISTA') IS NOT NULL
    BEGIN
        IF EXISTS
        (
            SELECT 1
              FROM sys.foreign_keys
             WHERE name = N'FK_PP_UA_LISTA'
               AND parent_object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
        )
            ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
                DROP CONSTRAINT [FK_PP_UA_LISTA];

        IF EXISTS
        (
            SELECT 1
              FROM sys.key_constraints
             WHERE name = N'UQ_PP_UA'
               AND parent_object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
        )
            ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
                DROP CONSTRAINT [UQ_PP_UA];
        ELSE IF EXISTS
        (
            SELECT 1
              FROM sys.indexes
             WHERE name = N'UQ_PP_UA'
               AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
        )
            DROP INDEX [UQ_PP_UA]
                ON [PORTAL_PRECIOS].[USUARIO_AMBITO];

        IF EXISTS
        (
            SELECT 1
              FROM sys.indexes
             WHERE name = N'IX_PP_UA_COMPANIA_ROL'
               AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
        )
            DROP INDEX [IX_PP_UA_COMPANIA_ROL]
                ON [PORTAL_PRECIOS].[USUARIO_AMBITO];
    END;

    /* Consolidar filas que antes estaban separadas por LISTA. */
    ;WITH Ambitos AS
    (
        SELECT [ID_AMBITO],
               MIN([ID_AMBITO]) OVER
                   (PARTITION BY [ID_USUARIO],[COMPANIA],[ROL]) AS [ID_CONSERVAR],
               MAX(CASE WHEN [ACTIVO] = 'S' THEN 1 ELSE 0 END) OVER
                   (PARTITION BY [ID_USUARIO],[COMPANIA],[ROL]) AS [TIENE_ACTIVO]
          FROM [PORTAL_PRECIOS].[USUARIO_AMBITO]
    )
    UPDATE ua
       SET ua.[ACTIVO] = CASE WHEN a.[TIENE_ACTIVO] = 1 THEN 'S' ELSE ua.[ACTIVO] END
      FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
      INNER JOIN Ambitos a ON a.[ID_AMBITO] = ua.[ID_AMBITO]
     WHERE a.[ID_AMBITO] = a.[ID_CONSERVAR];

    ;WITH Duplicados AS
    (
        SELECT [ID_AMBITO],
               ROW_NUMBER() OVER
               (
                   PARTITION BY [ID_USUARIO],[COMPANIA],[ROL]
                   ORDER BY [ID_AMBITO]
               ) AS [NUMERO]
          FROM [PORTAL_PRECIOS].[USUARIO_AMBITO]
    )
    DELETE ua
      FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
      INNER JOIN Duplicados d ON d.[ID_AMBITO] = ua.[ID_AMBITO]
     WHERE d.[NUMERO] > 1;

    IF COL_LENGTH(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', 'LISTA') IS NOT NULL
        ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
            DROP COLUMN [LISTA];

    IF NOT EXISTS
    (
        SELECT 1
          FROM sys.key_constraints
         WHERE name = N'UQ_PP_UA'
           AND parent_object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
    )
    AND NOT EXISTS
    (
        SELECT 1
          FROM sys.indexes
         WHERE name = N'UQ_PP_UA'
           AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
    )
        ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
            ADD CONSTRAINT [UQ_PP_UA] UNIQUE ([ID_USUARIO],[COMPANIA],[ROL]);

    IF NOT EXISTS
    (
        SELECT 1
          FROM sys.indexes
         WHERE name = N'IX_PP_UA_COMPANIA_ROL'
           AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]')
    )
        CREATE INDEX [IX_PP_UA_COMPANIA_ROL]
            ON [PORTAL_PRECIOS].[USUARIO_AMBITO] ([COMPANIA],[ROL],[ACTIVO])
            INCLUDE ([ID_USUARIO]);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

PRINT 'PORTAL 05 — Ámbito corregido: usuario-compañía-rol, sin LISTA.';
PRINT 'Las listas de solicitudes permanecen en SOLICITUD_PRECIO y SOLICITUD_PRECIO_DETALLE.';
GO
