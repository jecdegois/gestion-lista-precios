/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 02 — Usuarios y ámbitos

   Objetos:
     USUARIO             — identidades del portal provenientes del SSO/IdP.
     USUARIO_AMBITO      — rol activo de un usuario por compañía.
     FN_USUARIO_EN_AMBITO — función de autorización por usuario, compañía y rol.
     V_USUARIO_AMBITO    — vista del ámbito activo por usuario y compañía.

   El ámbito de autorización NO incluye la lista de precios. La lista es un
   dato funcional de cada solicitud y se valida directamente contra los
   maestros Softland de la compañía correspondiente.

   Reglas implementadas:
     - RNF-04: se valida existencia, identidad, rol y compañía antes de operar.
     - RNF-05: OPERADOR y APROBADOR son roles separados; la autoaprobación se
       bloquea con el CHECK de segregación de funciones en 04.
     - RNF-06 / RF-02 / RF-03: el ámbito se define por compañía y rol.
     - RF-35: no se almacenan contraseñas ni secretos. La autenticación es
       responsabilidad del IdP corporativo; aquí solo vive la autorización.

   Idempotente: crea lo que falta y migra tablas de versiones previas del DDL.
   ============================================================================ */

:setvar DB_PORTAL "SOFTLANDQA"
GO

USE [$(DB_PORTAL)];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ============================================================================
   2.1 USUARIO — cuentas del portal (SSO corporativo).
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[USUARIO]
    (
        [ID_USUARIO]       INT IDENTITY(1,1) NOT NULL,
        [EMAIL]            VARCHAR(120) NOT NULL,
        [NOMBRE]           VARCHAR(120) NOT NULL,
        [IDP_SUBJECT]      VARCHAR(120) NULL,        -- 'sub' del IdP/Cognito (RNF-03)
        [COLOR]            VARCHAR(10)  NULL,        -- avatar (paridad mockup)
        [ACTIVO]           CHAR(1)      NOT NULL CONSTRAINT [DF_USUARIO_ACTIVO] DEFAULT ('S'),
        [FECHA_CREACION]   DATETIME     NOT NULL CONSTRAINT [DF_USUARIO_FCREA]  DEFAULT (GETDATE()),
        [FECHA_ULT_ACCESO] DATETIME     NULL,
        CONSTRAINT [PK_PP_USUARIO] PRIMARY KEY CLUSTERED ([ID_USUARIO]),
        CONSTRAINT [UQ_PP_USUARIO_EMAIL] UNIQUE ([EMAIL]),
        CONSTRAINT [CK_PP_USUARIO_ACTIVO] CHECK ([ACTIVO] IN ('S','N'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE name = N'UQ_PP_USUARIO_IDP_SUBJECT'
                  AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO]'))
    CREATE UNIQUE INDEX [UQ_PP_USUARIO_IDP_SUBJECT]
        ON [PORTAL_PRECIOS].[USUARIO] ([IDP_SUBJECT])
        WHERE [IDP_SUBJECT] IS NOT NULL;
GO

/* ============================================================================
   2.2 USUARIO_AMBITO — rol por compañía.
       La autorización no se restringe por lista de precios.
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
    (
        [ID_AMBITO]        INT IDENTITY(1,1) NOT NULL,
        [ID_USUARIO]       INT          NOT NULL,
        [COMPANIA]         VARCHAR(20)  NOT NULL,
        [ROL]              VARCHAR(15)  NOT NULL,      -- OPERADOR | APROBADOR | AUDITOR
        [ACTIVO]           CHAR(1)      NOT NULL CONSTRAINT [DF_UA_ACTIVO] DEFAULT ('S'),
        [FECHA_ASIGNACION] DATETIME     NOT NULL CONSTRAINT [DF_UA_FASIG]  DEFAULT (GETDATE()),
        [ASIGNADO_POR]     VARCHAR(120) NULL,
        CONSTRAINT [PK_PP_USUARIO_AMBITO] PRIMARY KEY CLUSTERED ([ID_AMBITO]),
        CONSTRAINT [FK_PP_UA_USUARIO] FOREIGN KEY ([ID_USUARIO])
            REFERENCES [PORTAL_PRECIOS].[USUARIO] ([ID_USUARIO]),
        CONSTRAINT [FK_PP_UA_COMPANIA] FOREIGN KEY ([COMPANIA])
            REFERENCES [PORTAL_PRECIOS].[COMPANIA] ([COMPANIA]),
        CONSTRAINT [CK_PP_UA_ROL] CHECK ([ROL] IN ('OPERADOR','APROBADOR','AUDITOR')),
        CONSTRAINT [CK_PP_UA_ACTIVO] CHECK ([ACTIVO] IN ('S','N')),
        CONSTRAINT [UQ_PP_UA] UNIQUE ([ID_USUARIO],[COMPANIA],[ROL])
    );

    CREATE INDEX [IX_PP_UA_COMPANIA_ROL]
        ON [PORTAL_PRECIOS].[USUARIO_AMBITO] ([COMPANIA],[ROL],[ACTIVO])
        INCLUDE ([ID_USUARIO]);
END
GO

/* ============================================================================
   2.2.1 Migración de instalaciones anteriores.
   Las filas que antes solo se diferenciaban por LISTA representan ahora el
   mismo permiso usuario-compañía-rol. Se conserva una fila por combinación y
   se mantiene ACTIVO = 'S' si alguna fila histórica estaba activa.
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', N'U') IS NOT NULL
   AND COL_LENGTH(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', 'LISTA') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.foreign_keys
                WHERE name = N'FK_PP_UA_LISTA'
                  AND parent_object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]'))
        ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
            DROP CONSTRAINT [FK_PP_UA_LISTA];

    IF EXISTS (SELECT 1 FROM sys.key_constraints
                WHERE name = N'UQ_PP_UA'
                  AND parent_object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]'))
        ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
            DROP CONSTRAINT [UQ_PP_UA];
    ELSE IF EXISTS (SELECT 1 FROM sys.indexes
                     WHERE name = N'UQ_PP_UA'
                       AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]'))
        DROP INDEX [UQ_PP_UA]
            ON [PORTAL_PRECIOS].[USUARIO_AMBITO];

    IF EXISTS (SELECT 1 FROM sys.indexes
                WHERE name = N'IX_PP_UA_COMPANIA_ROL'
                  AND object_id = OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]'))
        DROP INDEX [IX_PP_UA_COMPANIA_ROL]
            ON [PORTAL_PRECIOS].[USUARIO_AMBITO];

    ;WITH Ambitos AS
    (
        SELECT [ID_AMBITO],
               MIN([ID_AMBITO]) OVER (PARTITION BY [ID_USUARIO],[COMPANIA],[ROL]) AS [ID_CONSERVAR],
               MAX(CASE WHEN [ACTIVO] = 'S' THEN 1 ELSE 0 END)
                   OVER (PARTITION BY [ID_USUARIO],[COMPANIA],[ROL]) AS [TIENE_ACTIVO]
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
               ROW_NUMBER() OVER (
                   PARTITION BY [ID_USUARIO],[COMPANIA],[ROL]
                   ORDER BY [ID_AMBITO]
               ) AS [NUMERO]
          FROM [PORTAL_PRECIOS].[USUARIO_AMBITO]
    )
    DELETE ua
      FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
      INNER JOIN Duplicados d ON d.[ID_AMBITO] = ua.[ID_AMBITO]
     WHERE d.[NUMERO] > 1;

    ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
        DROP COLUMN [LISTA];

    ALTER TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
        ADD CONSTRAINT [UQ_PP_UA] UNIQUE ([ID_USUARIO],[COMPANIA],[ROL]);

    CREATE INDEX [IX_PP_UA_COMPANIA_ROL]
        ON [PORTAL_PRECIOS].[USUARIO_AMBITO] ([COMPANIA],[ROL],[ACTIVO])
        INCLUDE ([ID_USUARIO]);
END
GO

/* ============================================================================
   2.3 FN_USUARIO_EN_AMBITO — autorización por usuario, compañía y rol.
       @rol NULL = cualquier rol activo en la compañía.
   ============================================================================ */
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

/* ============================================================================
   2.4 V_USUARIO_AMBITO — ámbito activo por usuario, compañía y rol.
   ============================================================================ */
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

PRINT 'PORTAL 02 — Usuarios y ámbitos verificados/creados sin restricción por lista.';
GO
