/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 10 — Registro de la empresa en su esquema

   FEBECA.SOLICITUD.COMPANIA tiene FK (FK_PP_SOL_COMPANIA) a FEBECA.COMPANIA,
   que en la base PORTAL_PRECIOS está vacía. Sin esta fila ninguna solicitud
   se puede insertar. Valores copiados de SOFTLANDQA.PORTAL_PRECIOS.COMPANIA.

   Idempotente. Ejecutar sobre la base PORTAL_PRECIOS.
   ============================================================================ */
USE [PORTAL_PRECIOS];
GO

IF NOT EXISTS (SELECT 1 FROM [FEBECA].[COMPANIA] WHERE [COMPANIA] = 'FEBECA')
    INSERT INTO [FEBECA].[COMPANIA] ([COMPANIA], [NOMBRE], [ESQUEMA_SOFTLAND], [ACTIVO])
    VALUES ('FEBECA', 'FEBECA C.A.', 'FEBECA', 'S');
GO

-- Verificación
SELECT * FROM [FEBECA].[COMPANIA];
GO
