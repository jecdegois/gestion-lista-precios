/* ============================================================================
   MV26020 - DDL FACTOR_ARTICULO_LISTA

   Especificacion asociada:
     docs/especificacion-factor-articulo-lista.md

   Ejecucion por compania: cambiar SCHEMA_EMPRESA por el esquema Softland
   correspondiente antes de ejecutar en cada compania.

   IMPORTANTE: FACTOR usa DECIMAL(12,4) para conservar multiplicadores como
   1.0740. DECIMAL(12,2) redondearia 1.074 a 1.07 y perderia informacion.
   ============================================================================ */

:setvar DB_SOFTLAND "SOFTLANDQA"
:setvar SCHEMA_EMPRESA "FEBECA"
GO

USE [$(DB_SOFTLAND)];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'[$(SCHEMA_EMPRESA)].[FACTOR_ARTICULO_LISTA]', N'U') IS NULL
BEGIN
    CREATE TABLE [$(SCHEMA_EMPRESA)].[FACTOR_ARTICULO_LISTA]
    (
        [ID_FACTOR_ARTICULO_LISTA] BIGINT IDENTITY(1,1) NOT NULL,
        [NIVEL_PRECIO_BASE]       VARCHAR(50) NOT NULL,
        [NIVEL_PRECIO]            VARCHAR(50) NOT NULL,
        [VERSION]                 INT NOT NULL,
        [ARTICULO]                VARCHAR(20) NOT NULL,
        [FACTOR]                  DECIMAL(12,4) NOT NULL,
        [FECHA_INICIO]            DATE NOT NULL CONSTRAINT [DF_FAL_FECHA_INICIO] DEFAULT (CONVERT(date, '19000101')),
        [FECHA_FIN]               DATE NOT NULL CONSTRAINT [DF_FAL_FECHA_FIN] DEFAULT (CONVERT(date, '99991231')),
        [ACTIVO]                  CHAR(1) NOT NULL CONSTRAINT [DF_FAL_ACTIVO] DEFAULT ('S'),
        [OBSERVACION]             VARCHAR(250) NULL,
        [FECHA_CREACION]          DATETIME NOT NULL CONSTRAINT [DF_FAL_FECHA_CREACION] DEFAULT (GETDATE()),
        [USUARIO_CREACION]        VARCHAR(50) NOT NULL CONSTRAINT [DF_FAL_USUARIO_CREACION] DEFAULT (SUSER_SNAME()),
        [FECHA_ULT_MODIF]         DATETIME NULL,
        [USUARIO_ULT_MODIF]       VARCHAR(50) NULL,
        [RecordDate]              DATETIME NOT NULL CONSTRAINT [DF_FAL_RECORDDATE] DEFAULT (GETDATE()),
        [RowPointer]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_FAL_ROWPOINTER] DEFAULT (NEWID()),
        [CreatedBy]               VARCHAR(50) NOT NULL CONSTRAINT [DF_FAL_CREATEDBY] DEFAULT (SUSER_SNAME()),
        [UpdatedBy]               VARCHAR(50) NOT NULL CONSTRAINT [DF_FAL_UPDATEDBY] DEFAULT (SUSER_SNAME()),
        [CreateDate]              DATETIME NOT NULL CONSTRAINT [DF_FAL_CREATEDATE] DEFAULT (GETDATE()),
        CONSTRAINT [PK_FAL] PRIMARY KEY CLUSTERED ([ID_FACTOR_ARTICULO_LISTA]),
        CONSTRAINT [CK_FAL_FACTOR] CHECK ([FACTOR] > 0 AND [FACTOR] <= 2),
        CONSTRAINT [CK_FAL_ACTIVO] CHECK ([ACTIVO] IN ('S','N')),
        CONSTRAINT [CK_FAL_FECHAS] CHECK ([FECHA_FIN] >= [FECHA_INICIO])
    );
END
GO

/* Versiones existentes de la tabla deben conservar los cuatro decimales del
   multiplicador acordado para el portal. */
IF EXISTS (
    SELECT 1
      FROM sys.columns C
      INNER JOIN sys.tables T ON T.object_id = C.object_id
      INNER JOIN sys.schemas S ON S.schema_id = T.schema_id
     WHERE S.name = N'$(SCHEMA_EMPRESA)'
       AND T.name = N'FACTOR_ARTICULO_LISTA'
       AND C.name = N'FACTOR'
       AND (C.precision <> 12 OR C.scale <> 4)
)
    ALTER TABLE [$(SCHEMA_EMPRESA)].[FACTOR_ARTICULO_LISTA]
        ALTER COLUMN [FACTOR] DECIMAL(12,4) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
      FROM sys.indexes
     WHERE name = N'UX_FAL_ACTIVO'
       AND object_id = OBJECT_ID(N'[$(SCHEMA_EMPRESA)].[FACTOR_ARTICULO_LISTA]')
)
    CREATE UNIQUE INDEX [UX_FAL_ACTIVO]
        ON [$(SCHEMA_EMPRESA)].[FACTOR_ARTICULO_LISTA]
           ([NIVEL_PRECIO], [VERSION], [ARTICULO], [ACTIVO])
        WHERE [ACTIVO] = 'S';
GO

PRINT 'FACTOR_ARTICULO_LISTA verificada para el esquema $(SCHEMA_EMPRESA).';
GO
