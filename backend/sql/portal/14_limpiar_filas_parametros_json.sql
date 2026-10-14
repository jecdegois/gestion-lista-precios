/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 14 — Quitar `filas` de PARAMETROS_JSON

   Hasta ahora cada solicitud guardaba en PARAMETROS_JSON una copia completa de
   sus filas (varios MB por solicitud), además de SOLICITUD_DETALLE. Eso hacía
   lenta la bandeja. La aplicación ya solo guarda esa copia en los BORRADORES
   (para retomarlos); este script la quita de las solicitudes ya enviadas.

   No toca BORRADORES ni SOLICITUD_DETALLE.
   Idempotente y transaccional por esquema. Ejecutar sobre PORTAL_PRECIOS.
   ============================================================================ */
USE [PORTAL_PRECIOS];
GO

SET XACT_ABORT ON;
GO

DECLARE cur_esquemas CURSOR LOCAL FAST_FORWARD FOR
    SELECT name
    FROM sys.schemas
    -- Solo esquemas de empresa (tienen la tabla SOLICITUD)
    WHERE OBJECT_ID(QUOTENAME(name) + '.[SOLICITUD]', 'U') IS NOT NULL;

DECLARE @esquema SYSNAME;
DECLARE @sql     NVARCHAR(MAX);
DECLARE @filas   INT;

OPEN cur_esquemas;
FETCH NEXT FROM cur_esquemas INTO @esquema;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'UPDATE ' + QUOTENAME(@esquema) + N'.[SOLICITUD]
                    SET PARAMETROS_JSON = JSON_MODIFY(PARAMETROS_JSON, ''$.filas'', NULL)
                  WHERE ESTADO <> ''BORRADOR''
                    AND ISJSON(PARAMETROS_JSON) = 1
                    AND JSON_QUERY(PARAMETROS_JSON, ''$.filas'') IS NOT NULL;
                 SET @n = @@ROWCOUNT;';

    BEGIN TRANSACTION;
    EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @filas OUTPUT;
    COMMIT TRANSACTION;
    PRINT @esquema + ': ' + CAST(@filas AS VARCHAR(10)) + ' solicitud(es) limpiadas';

    FETCH NEXT FROM cur_esquemas INTO @esquema;
END;

CLOSE cur_esquemas;
DEALLOCATE cur_esquemas;
GO
