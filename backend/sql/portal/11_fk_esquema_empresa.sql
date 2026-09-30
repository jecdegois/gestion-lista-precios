/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 11 — FKs del esquema de la empresa

   Las tablas de [FEBECA] se crearon con sus FKs apuntando a las tablas de
   [dbo] (dbo.COMPANIA, dbo.SOLICITUD, dbo.USUARIO), que están vacías. Por eso
   ninguna solicitud se puede insertar en FEBECA.SOLICITUD, ni su detalle en
   FEBECA.SOLICITUD_DETALLE.

   Este script recrea las 8 FKs apuntando a las tablas del MISMO esquema,
   con las mismas columnas y reglas ON DELETE que tenían.

   Idempotente y transaccional. Ejecutar sobre la base PORTAL_PRECIOS.
   Para BEVAL/SILLACA: reemplazar FEBECA por el esquema de la empresa.
   ============================================================================ */
USE [PORTAL_PRECIOS];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @fks TABLE (fk SYSNAME, tabla SYSNAME, col SYSNAME, ref_tabla SYSNAME, ref_col SYSNAME, on_delete NVARCHAR(20));
INSERT INTO @fks VALUES
    ('FK_AUDITORIA_SOLICITUD', 'AUDITORIA_APROBACION', 'ID_SOLICITUD',           'SOLICITUD', 'ID_SOLICITUD', 'CASCADE'),
    ('FK_PP_LP_COMPANIA',      'LISTA_PRECIO',         'COMPANIA',               'COMPANIA',  'COMPANIA',     'NO ACTION'),
    ('FK_PP_SOL_COMPANIA',     'SOLICITUD',            'COMPANIA',               'COMPANIA',  'COMPANIA',     'NO ACTION'),
    ('FK_PP_SOL_SOLICITANTE',  'SOLICITUD',            'ID_USUARIO_SOLICITANTE', 'USUARIO',   'ID_USUARIO',   'NO ACTION'),
    ('FK_PP_DET_SOLICITUD',    'SOLICITUD_DETALLE',    'ID_SOLICITUD',           'SOLICITUD', 'ID_SOLICITUD', 'NO ACTION'),
    ('FK_REINTENTO_SOLICITUD', 'SOLICITUD_REINTENTO',  'ID_SOLICITUD',           'SOLICITUD', 'ID_SOLICITUD', 'CASCADE'),
    ('FK_AMBITO_USUARIO',      'USUARIO_AMBITO',       'ID_USUARIO',             'USUARIO',   'ID_USUARIO',   'NO ACTION'),
    ('FK_PP_UA_COMPANIA',      'USUARIO_AMBITO',       'COMPANIA',               'COMPANIA',  'COMPANIA',     'NO ACTION');

DECLARE @esquema SYSNAME = N'FEBECA';
DECLARE @fk SYSNAME, @tabla SYSNAME, @col SYSNAME, @ref_tabla SYSNAME, @ref_col SYSNAME, @on_delete NVARCHAR(20), @sql NVARCHAR(MAX);

DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT fk, tabla, col, ref_tabla, ref_col, on_delete FROM @fks;
OPEN c;
FETCH NEXT FROM c INTO @fk, @tabla, @col, @ref_tabla, @ref_col, @on_delete;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Solo toca la FK si hoy apunta fuera del esquema de la empresa.
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = @fk
          AND OBJECT_SCHEMA_NAME(parent_object_id) = @esquema
          AND OBJECT_SCHEMA_NAME(referenced_object_id) <> @esquema
    )
    BEGIN
        SET @sql = N'ALTER TABLE ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@tabla) + N' DROP CONSTRAINT ' + QUOTENAME(@fk) + N';';
        EXEC sp_executesql @sql;
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = @fk AND OBJECT_SCHEMA_NAME(parent_object_id) = @esquema)
    BEGIN
        SET @sql = N'ALTER TABLE ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@tabla)
                 + N' WITH CHECK ADD CONSTRAINT ' + QUOTENAME(@fk)
                 + N' FOREIGN KEY (' + QUOTENAME(@col) + N')'
                 + N' REFERENCES ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@ref_tabla) + N' (' + QUOTENAME(@ref_col) + N')'
                 + N' ON DELETE ' + @on_delete + N';';
        EXEC sp_executesql @sql;
    END;

    FETCH NEXT FROM c INTO @fk, @tabla, @col, @ref_tabla, @ref_col, @on_delete;
END;
CLOSE c;
DEALLOCATE c;

COMMIT TRANSACTION;
GO

-- Verificación: todas las referencias deben quedar en FEBECA.
SELECT fk.name AS fk,
       OBJECT_SCHEMA_NAME(fk.parent_object_id) + '.' + OBJECT_NAME(fk.parent_object_id) AS tabla,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) + '.' + OBJECT_NAME(fk.referenced_object_id) AS referencia,
       fk.delete_referential_action_desc AS on_delete
FROM sys.foreign_keys fk
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = 'FEBECA'
ORDER BY tabla, fk;
GO
