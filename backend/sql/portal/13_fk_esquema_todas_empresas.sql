/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 13 — FKs del esquema por empresa (multi)

   El script 11 solo corregía FEBECA. Este script itera sobre TODOS los
   esquemas que existan en la base PORTAL_PRECIOS y redirecciona las 8 FKs
   para que cada esquema se referencie a sí mismo (SILLACA → SILLACA, etc.).

   Problema que resuelve:
     Las tablas de [ESQUEMA] se crean con FKs que apuntan a [dbo] (dbo.COMPANIA,
     dbo.SOLICITUD, dbo.USUARIO), que están vacías. Por eso ninguna solicitud
     se puede insertar en SILLACA.SOLICITUD ni en BEVAL.SOLICITUD.
     La FK FK_PP_SOL_COMPANIA falla con:
       "conflict occurred in database PORTAL_PRECIOS, table dbo.COMPANIA"

   Idempotente y transaccional por esquema.
   Ejecutar sobre la base PORTAL_PRECIOS.
   ============================================================================ */
USE [PORTAL_PRECIOS];
GO

SET XACT_ABORT ON;
GO

DECLARE @fks TABLE (
    fk        SYSNAME,
    tabla     SYSNAME,
    col       SYSNAME,
    ref_tabla SYSNAME,
    ref_col   SYSNAME,
    on_delete NVARCHAR(20)
);

INSERT INTO @fks VALUES
    ('FK_AUDITORIA_SOLICITUD', 'AUDITORIA_APROBACION', 'ID_SOLICITUD',           'SOLICITUD', 'ID_SOLICITUD', 'CASCADE'),
    ('FK_PP_LP_COMPANIA',      'LISTA_PRECIO',         'COMPANIA',               'COMPANIA',  'COMPANIA',     'NO ACTION'),
    ('FK_PP_SOL_COMPANIA',     'SOLICITUD',            'COMPANIA',               'COMPANIA',  'COMPANIA',     'NO ACTION'),
    ('FK_PP_SOL_SOLICITANTE',  'SOLICITUD',            'ID_USUARIO_SOLICITANTE', 'USUARIO',   'ID_USUARIO',   'NO ACTION'),
    ('FK_PP_DET_SOLICITUD',    'SOLICITUD_DETALLE',    'ID_SOLICITUD',           'SOLICITUD', 'ID_SOLICITUD', 'NO ACTION'),
    ('FK_REINTENTO_SOLICITUD', 'SOLICITUD_REINTENTO',  'ID_SOLICITUD',           'SOLICITUD', 'ID_SOLICITUD', 'CASCADE'),
    ('FK_AMBITO_USUARIO',      'USUARIO_AMBITO',       'ID_USUARIO',             'USUARIO',   'ID_USUARIO',   'NO ACTION'),
    ('FK_PP_UA_COMPANIA',      'USUARIO_AMBITO',       'COMPANIA',               'COMPANIA',  'COMPANIA',     'NO ACTION');

-- Iterar sobre cada esquema de empresa (excluye esquemas de sistema)
DECLARE cur_esquemas CURSOR LOCAL FAST_FORWARD FOR
    SELECT name
    FROM sys.schemas
    WHERE name NOT IN ('dbo','guest','INFORMATION_SCHEMA','sys',
                       'db_owner','db_accessadmin','db_securityadmin','db_ddladmin',
                       'db_backupoperator','db_datareader','db_datawriter',
                       'db_denydatareader','db_denydatawriter')
      AND SCHEMA_ID(name) IS NOT NULL
      -- Solo procesar esquemas que tengan la tabla SOLICITUD (son esquemas de empresa)
      AND OBJECT_ID(QUOTENAME(name) + '.[SOLICITUD]', 'U') IS NOT NULL;

DECLARE @esquema  SYSNAME;
DECLARE @fk       SYSNAME, @tabla SYSNAME, @col SYSNAME,
        @ref_tabla SYSNAME, @ref_col SYSNAME, @on_delete NVARCHAR(20);
DECLARE @sql      NVARCHAR(MAX);

OPEN cur_esquemas;
FETCH NEXT FROM cur_esquemas INTO @esquema;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT '-- Procesando esquema: ' + @esquema;

    BEGIN TRANSACTION;

    DECLARE cur_fks CURSOR LOCAL FAST_FORWARD FOR
        SELECT fk, tabla, col, ref_tabla, ref_col, on_delete FROM @fks;
    OPEN cur_fks;
    FETCH NEXT FROM cur_fks INTO @fk, @tabla, @col, @ref_tabla, @ref_col, @on_delete;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Eliminar la FK si apunta fuera del esquema de la empresa
        IF EXISTS (
            SELECT 1 FROM sys.foreign_keys
            WHERE name = @fk
              AND OBJECT_SCHEMA_NAME(parent_object_id) = @esquema
              AND OBJECT_SCHEMA_NAME(referenced_object_id) <> @esquema
        )
        BEGIN
            SET @sql = N'ALTER TABLE ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@tabla)
                     + N' DROP CONSTRAINT ' + QUOTENAME(@fk) + N';';
            EXEC sp_executesql @sql;
            PRINT '   DROP FK ' + @fk + ' (apuntaba fuera del esquema)';
        END;

        -- Crear la FK apuntando al mismo esquema si no existe
        IF NOT EXISTS (
            SELECT 1 FROM sys.foreign_keys
            WHERE name = @fk
              AND OBJECT_SCHEMA_NAME(parent_object_id) = @esquema
        )
        -- Solo crear si la tabla referenciada existe en este esquema
        AND OBJECT_ID(QUOTENAME(@esquema) + N'.' + QUOTENAME(@ref_tabla), N'U') IS NOT NULL
        BEGIN
            SET @sql = N'ALTER TABLE ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@tabla)
                     + N' WITH CHECK ADD CONSTRAINT ' + QUOTENAME(@fk)
                     + N' FOREIGN KEY (' + QUOTENAME(@col) + N')'
                     + N' REFERENCES ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@ref_tabla)
                     + N' (' + QUOTENAME(@ref_col) + N')'
                     + N' ON DELETE ' + @on_delete + N';';
            EXEC sp_executesql @sql;
            PRINT '   ADD FK ' + @fk + ' → ' + @esquema + '.' + @ref_tabla;
        END;

        FETCH NEXT FROM cur_fks INTO @fk, @tabla, @col, @ref_tabla, @ref_col, @on_delete;
    END;

    CLOSE cur_fks;
    DEALLOCATE cur_fks;

    COMMIT TRANSACTION;
    PRINT '   OK: ' + @esquema;

    FETCH NEXT FROM cur_esquemas INTO @esquema;
END;

CLOSE cur_esquemas;
DEALLOCATE cur_esquemas;
GO

-- Verificación: todas las FKs de empresa deben referenciar su propio esquema
SELECT
    OBJECT_SCHEMA_NAME(fk.parent_object_id)      AS esquema,
    fk.name                                       AS fk,
    OBJECT_SCHEMA_NAME(fk.parent_object_id) + '.' + OBJECT_NAME(fk.parent_object_id) AS tabla,
    OBJECT_SCHEMA_NAME(fk.referenced_object_id) + '.' + OBJECT_NAME(fk.referenced_object_id) AS referencia,
    fk.delete_referential_action_desc             AS on_delete,
    CASE WHEN OBJECT_SCHEMA_NAME(fk.parent_object_id) = OBJECT_SCHEMA_NAME(fk.referenced_object_id)
         THEN 'OK' ELSE '*** MAL: FK fuera del esquema ***' END AS estado
FROM sys.foreign_keys fk
WHERE fk.name IN (
    'FK_AUDITORIA_SOLICITUD','FK_PP_LP_COMPANIA','FK_PP_SOL_COMPANIA',
    'FK_PP_SOL_SOLICITANTE','FK_PP_DET_SOLICITUD','FK_REINTENTO_SOLICITUD',
    'FK_AMBITO_USUARIO','FK_PP_UA_COMPANIA'
)
ORDER BY esquema, tabla, fk.name;
GO
