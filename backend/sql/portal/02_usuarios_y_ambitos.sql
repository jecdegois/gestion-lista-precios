/* ============================================================================
   MV26020 — Gestión y Cálculo de Listas de Precio
   PORTAL (aplicativo web) · Script 02 — Usuarios y ámbitos

   Objetos:
     USUARIO           — identidades del portal provenientes del SSO/IdP.
     USUARIO_AMBITO     — ámbito único por usuario: rol por compañía y,
                          opcionalmente, restricción por lista de precio.
     FN_USUARIO_EN_AMBITO — función de autorización usada por los SP y la app.
     V_USUARIO_AMBITO     — vista de consulta del ámbito efectivo.

   SIMPLIFICACIÓN (respecto de la versión anterior):
   USUARIO_ROL_COMPANIA y USUARIO_LISTA_PRECIO se consolidan en una sola
   tabla USUARIO_AMBITO. El rol se define en la fila con LISTA NULL (ámbito de
   compañía); si además se necesita restringir a listas específicas, se
   agregan filas con el mismo ROL y LISTA distinta de NULL. Esto evita
   mantener dos tablas para un solo concepto (a qué puede operar un usuario)
   y reduce los JOIN de autorización de dos a uno.

   Convención de ámbito de listas: si un usuario NO tiene ninguna fila con
   LISTA no nula para una compañía, se entienden autorizadas TODAS las listas
   activas de esa compañía. Si tiene al menos una, el ámbito de esa compañía
   queda restringido exactamente a las listas registradas.

   Reglas implementadas:
     - RNF-04: se valida existencia, identidad, rol y ámbito antes de operar.
     - RNF-05: OPERADOR y APROBADOR son roles separados; la autoaprobación se
       bloquea con el CHECK de segregación de funciones en 04 (no requiere
       tablas adicionales).
     - RNF-06 / RF-02 / RF-03: el ámbito se define por compañía y, cuando se
       requiere, por lista de precio.
     - RF-35: no se almacenan contraseñas ni secretos. La autenticación es
       responsabilidad del IdP corporativo; aquí solo vive la autorización.

   Idempotente: crea lo que falta y actualiza (ALTER) tablas de versiones
   previas del DDL.
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
   2.2 USUARIO_AMBITO — rol por compañía + restricción opcional por lista.
       LISTA = NULL  -> fila de ROL efectivo del usuario en esa compañía.
       LISTA <> NULL -> restringe ese rol a una lista específica (si existe al
                        menos una fila así para la compañía, el ámbito deja de
                        ser "todas las listas").
   ============================================================================ */
IF OBJECT_ID(N'[PORTAL_PRECIOS].[USUARIO_AMBITO]', N'U') IS NULL
BEGIN
    CREATE TABLE [PORTAL_PRECIOS].[USUARIO_AMBITO]
    (
        [ID_AMBITO]        INT IDENTITY(1,1) NOT NULL,
        [ID_USUARIO]       INT          NOT NULL,
        [COMPANIA]         VARCHAR(20)  NOT NULL,
        [ROL]              VARCHAR(15)  NOT NULL,      -- OPERADOR | APROBADOR | AUDITOR
        [LISTA]            VARCHAR(30)  NULL,          -- NULL = todas las listas de la compañía
        [ACTIVO]           CHAR(1)      NOT NULL CONSTRAINT [DF_UA_ACTIVO] DEFAULT ('S'),
        [FECHA_ASIGNACION] DATETIME     NOT NULL CONSTRAINT [DF_UA_FASIG]  DEFAULT (GETDATE()),
        [ASIGNADO_POR]     VARCHAR(120) NULL,
        CONSTRAINT [PK_PP_USUARIO_AMBITO] PRIMARY KEY CLUSTERED ([ID_AMBITO]),
        CONSTRAINT [FK_PP_UA_USUARIO] FOREIGN KEY ([ID_USUARIO])
            REFERENCES [PORTAL_PRECIOS].[USUARIO] ([ID_USUARIO]),
        CONSTRAINT [FK_PP_UA_COMPANIA] FOREIGN KEY ([COMPANIA])
            REFERENCES [PORTAL_PRECIOS].[COMPANIA] ([COMPANIA]),
        CONSTRAINT [FK_PP_UA_LISTA] FOREIGN KEY ([COMPANIA],[LISTA])
            REFERENCES [PORTAL_PRECIOS].[LISTA_PRECIO] ([COMPANIA],[LISTA]),
        CONSTRAINT [CK_PP_UA_ROL] CHECK ([ROL] IN ('OPERADOR','APROBADOR','AUDITOR')),
        CONSTRAINT [CK_PP_UA_ACTIVO] CHECK ([ACTIVO] IN ('S','N')),
        CONSTRAINT [UQ_PP_UA] UNIQUE ([ID_USUARIO],[COMPANIA],[ROL],[LISTA])
    );

    CREATE INDEX [IX_PP_UA_COMPANIA_ROL]
        ON [PORTAL_PRECIOS].[USUARIO_AMBITO] ([COMPANIA],[ROL],[ACTIVO])
        INCLUDE ([ID_USUARIO],[LISTA]);
END
GO

/* ============================================================================
   2.3 FN_USUARIO_EN_AMBITO — autorización efectiva de un usuario.
       Devuelve 1 cuando el usuario está activo, tiene el rol requerido activo
       en la compañía (fila con LISTA NULL o con LISTA específica) y, si se
       evalúa una lista, esa lista pertenece a su ámbito.
       @rol   NULL = cualquier rol activo en la compañía.
       @lista NULL = no se evalúa la restricción por lista.
   ============================================================================ */
CREATE OR ALTER FUNCTION [PORTAL_PRECIOS].[FN_USUARIO_EN_AMBITO]
(
    @email    VARCHAR(120),
    @compania VARCHAR(20),
    @lista    VARCHAR(30) = NULL,
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

    IF NOT EXISTS (
        SELECT 1
          FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
         WHERE ua.[ID_USUARIO] = @id_usuario
           AND ua.[COMPANIA]   = @compania
           AND ua.[ACTIVO]     = 'S'
           AND (@rol IS NULL OR ua.[ROL] = @rol)
    )
        RETURN 0;

    IF @lista IS NOT NULL
    BEGIN
        -- Si el usuario tiene al menos una restricción de lista en la
        -- compañía, la lista evaluada debe estar entre las autorizadas.
        IF EXISTS (
            SELECT 1 FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
             WHERE ua.[ID_USUARIO] = @id_usuario
               AND ua.[COMPANIA]   = @compania
               AND ua.[ACTIVO]     = 'S'
               AND ua.[LISTA] IS NOT NULL
        )
        AND NOT EXISTS (
            SELECT 1 FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
             WHERE ua.[ID_USUARIO] = @id_usuario
               AND ua.[COMPANIA]   = @compania
               AND ua.[LISTA]      = @lista
               AND ua.[ACTIVO]     = 'S'
        )
            RETURN 0;

        -- La lista debe existir y estar activa en la compañía.
        IF NOT EXISTS (
            SELECT 1 FROM [PORTAL_PRECIOS].[LISTA_PRECIO] lp
             WHERE lp.[COMPANIA] = @compania
               AND lp.[LISTA]    = @lista
               AND lp.[ACTIVO]   = 'S'
        )
            RETURN 0;
    END

    RETURN 1;
END
GO

/* ============================================================================
   2.4 V_USUARIO_AMBITO — ámbito efectivo por usuario, compañía y lista.
       Resuelve la convención "sin restricción de lista = todas las listas".
   ============================================================================ */
CREATE OR ALTER VIEW [PORTAL_PRECIOS].[V_USUARIO_AMBITO]
AS
    SELECT u.[ID_USUARIO],
           u.[EMAIL],
           u.[NOMBRE],
           ua.[COMPANIA],
           c.[NOMBRE] AS [COMPANIA_NOMBRE],
           ua.[ROL],
           lp.[LISTA],
           lp.[ES_LISTA_BASE],
           CASE WHEN ua.[LISTA] IS NULL THEN 'TODAS' ELSE 'RESTRINGIDO' END AS [TIPO_AMBITO_LISTA]
      FROM [PORTAL_PRECIOS].[USUARIO] u
     INNER JOIN [PORTAL_PRECIOS].[USUARIO_AMBITO] ua
             ON ua.[ID_USUARIO] = u.[ID_USUARIO] AND ua.[ACTIVO] = 'S' AND ua.[LISTA] IS NULL
     INNER JOIN [PORTAL_PRECIOS].[COMPANIA] c
             ON c.[COMPANIA] = ua.[COMPANIA]
     INNER JOIN [PORTAL_PRECIOS].[LISTA_PRECIO] lp
             ON lp.[COMPANIA] = ua.[COMPANIA] AND lp.[ACTIVO] = 'S'
     WHERE u.[ACTIVO] = 'S'
       AND (
             -- Sin ninguna restricción de lista para esa compañía: todas autorizadas.
             NOT EXISTS (
                    SELECT 1 FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] x
                     WHERE x.[ID_USUARIO] = u.[ID_USUARIO]
                       AND x.[COMPANIA]   = ua.[COMPANIA]
                       AND x.[ACTIVO]     = 'S'
                       AND x.[LISTA] IS NOT NULL
                )
             -- Con restricciones declaradas: solo las listas explícitamente asignadas.
             OR EXISTS (
                    SELECT 1 FROM [PORTAL_PRECIOS].[USUARIO_AMBITO] x
                     WHERE x.[ID_USUARIO] = u.[ID_USUARIO]
                       AND x.[COMPANIA]   = ua.[COMPANIA]
                       AND x.[ACTIVO]     = 'S'
                       AND x.[LISTA]      = lp.[LISTA]
                )
           );
GO

PRINT 'PORTAL 02 — Usuarios y ámbitos verificados/creados.';
GO
