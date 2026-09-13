USE [SOFTLANDQA]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* ============================================================================
   TABLA DEFINIDA POR EL USUARIO (UDF real de Softland):
   [COFER].[U_FACTOR_REDUCCION_MARGEN]
   ----------------------------------------------------------------------------
   Fuente ÚNICA de excepciones del factor de reducción de margen por artículo,
   consumida por [COFER].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO] (Regla de
   Mayoreo). Reemplaza la tabla teórica previa UDT_FACTOR_REDUCCION_ARTICULO.

   Contrato de columnas (según el modelo real):
     - U_CODIGO   VARCHAR(260)  Código de artículo Softland (equivale a ARTICULO).
     - U_DESCRIP  VARCHAR(260)  Descripción del artículo. Junto con U_CODIGO
                                forma la clave primaria compuesta.
     - U_FACTOR_REDUCCION DECIMAL(18,2) NULL
                                PORCENTAJE explícito de reducción (10.00 = 10%,
                                10.50 = 10.5%). NO es una fracción normalizada.
                                El SP lo divide entre 100.0 al calcular.
     - U_ACTIVO   VARCHAR(1)    'S' = excepción vigente; cualquier otro valor la
                                inhabilita. La UDF no maneja fechas de vigencia.
     - Campos de auditoría estándar Softland (NoteExistsFlag, RecordDate,
       RowPointer, CreatedBy, UpdatedBy, CreateDate).

   Entorno MULTIEMPRESA: este objeto existe por compañía en su propia base de
   datos Softland. La aplicación conecta dinámicamente al catálogo de la
   compañía activa; el esquema [COFER] es la referencia y se replica por
   compañía cambiando el catálogo/esquema destino.
   ============================================================================ */
IF OBJECT_ID(N'[COFER].[U_FACTOR_REDUCCION_MARGEN]', N'U') IS NULL
BEGIN
    CREATE TABLE [COFER].[U_FACTOR_REDUCCION_MARGEN]
    (
        [U_CODIGO] VARCHAR(260) NOT NULL,
        [U_DESCRIP] VARCHAR(260) NOT NULL,
        [U_FACTOR_REDUCCION] DECIMAL(18,2) NULL,          -- PORCENTAJE explícito: 10.00 = 10%
        [U_ACTIVO] VARCHAR(1) NOT NULL,
        [NoteExistsFlag] TINYINT NOT NULL,
        [RecordDate] DATETIME NOT NULL,
        [RowPointer] UNIQUEIDENTIFIER NOT NULL,
        [CreatedBy] VARCHAR(30) NOT NULL,
        [UpdatedBy] VARCHAR(30) NOT NULL,
        [CreateDate] DATETIME NOT NULL,
        CONSTRAINT [PK_U_FACTOR_REDUCCION_MARGEN] PRIMARY KEY CLUSTERED
        (
            [U_CODIGO] ASC,
            [U_DESCRIP] ASC
        )
        WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF,
              ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON,
              OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY];
END
GO

/* Índice de apoyo para la búsqueda del factor activo por artículo. El SP usa
   OUTER APPLY TOP 1 sobre U_CODIGO + U_ACTIVO = 'S'. */
IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE [name] = N'IX_UFRM_CODIGO_ACTIVO'
      AND [object_id] = OBJECT_ID(N'[COFER].[U_FACTOR_REDUCCION_MARGEN]')
)
BEGIN
    CREATE INDEX [IX_UFRM_CODIGO_ACTIVO]
    ON [COFER].[U_FACTOR_REDUCCION_MARGEN] ([U_CODIGO], [U_ACTIVO])
    INCLUDE ([U_FACTOR_REDUCCION]);
END
GO

/* Ejemplos de carga (opcionales). Se guarda el PORCENTAJE explícito; para
   10% se registra 10.00 y para 10.5% se registra 10.50 (la aplicación NO
   almacena aquí la fracción normalizada 0.1000):
INSERT INTO [COFER].[U_FACTOR_REDUCCION_MARGEN]
    (U_CODIGO, U_DESCRIP, U_FACTOR_REDUCCION, U_ACTIVO,
     NoteExistsFlag, RecordDate, RowPointer, CreatedBy, UpdatedBy, CreateDate)
VALUES
    ('ART-231', 'Refrigeradora 14 pies', 15.00, 'S', 0, GETDATE(), NEWID(), 'SD', 'SD', GETDATE()),
    ('ART-455', 'Microondas 1.2 CF',      5.00, 'S', 0, GETDATE(), NEWID(), 'SD', 'SD', GETDATE());
*/
