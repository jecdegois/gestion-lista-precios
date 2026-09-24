/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 09 — SEQ_SOLICITUD por empresa

   El portal vive en la BASE [PORTAL_PRECIOS], con un esquema por empresa
   (FEBECA, BEVAL, SILLACA…). Cada esquema necesita su propio SEQ_SOLICITUD,
   que genera CODIGO_SOLICITUD (SOL-10541, …).

   START WITH 10541: continúa el correlativo de SOFTLANDQA.PORTAL_PRECIOS
   (último SOL-10540) para que los códigos nuevos no se confundan con los viejos.

   Idempotente. Ejecutar sobre la base PORTAL_PRECIOS.
   ============================================================================ */
USE [PORTAL_PRECIOS];
GO

IF SCHEMA_ID(N'FEBECA') IS NOT NULL AND OBJECT_ID(N'[FEBECA].[SEQ_SOLICITUD]', N'SO') IS NULL
    CREATE SEQUENCE [FEBECA].[SEQ_SOLICITUD] AS INT START WITH 10541 INCREMENT BY 1;
GO

-- BEVAL y SILLACA: descomentar cuando existan sus esquemas y tablas del portal.
-- IF SCHEMA_ID(N'BEVAL') IS NOT NULL AND OBJECT_ID(N'[BEVAL].[SEQ_SOLICITUD]', N'SO') IS NULL
--     CREATE SEQUENCE [BEVAL].[SEQ_SOLICITUD] AS INT START WITH 10541 INCREMENT BY 1;
-- GO
-- IF SCHEMA_ID(N'SILLACA') IS NOT NULL AND OBJECT_ID(N'[SILLACA].[SEQ_SOLICITUD]', N'SO') IS NULL
--     CREATE SEQUENCE [SILLACA].[SEQ_SOLICITUD] AS INT START WITH 10541 INCREMENT BY 1;
-- GO

-- Verificación
SELECT SCHEMA_NAME(schema_id) AS esquema, name, current_value
FROM sys.sequences
WHERE name = N'SEQ_SOLICITUD';
GO
