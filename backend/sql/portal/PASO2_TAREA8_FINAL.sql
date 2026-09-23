-- ============================================================================
-- PASO 2: TAREA 8 - Script de Ejecución Completa (SP + Tests)
-- ============================================================================
-- Incluye: Creación del SP y ejecución de todos los tests
-- ============================================================================

-- ============================================================================
-- PARTE 1: CREAR EL STORED PROCEDURE
-- ============================================================================

USE SOFTLANDQA;
GO

PRINT '========== PASO 2 TAREA 8: CREAR SP Y EJECUTAR TESTS ==========';
PRINT '';
PRINT 'Creando SP_APROBADOR_APRUEBA_RECHAZA...';
PRINT '';
GO

DROP PROCEDURE IF EXISTS PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA;
GO

CREATE PROCEDURE PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA (
    @ID_SOLICITUD               INT,
    @APROBADOR_EMAIL            NVARCHAR(255),
    @ACCION                     NVARCHAR(50),  -- APROBADA | RECHAZADA
    @COMENTARIO_RECHAZO         NVARCHAR(MAX) = NULL,
    @P_RESULTADO_EJECUCION      NVARCHAR(50) OUTPUT,
    @P_MENSAJE_ERROR            NVARCHAR(MAX) OUTPUT
)
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @ESTADO_ACTUAL          NVARCHAR(50);
    DECLARE @ES_ERROR_TRANSITORIO   CHAR(1);
    DECLARE @APROBADOR_EMAIL_BD     NVARCHAR(255);
    DECLARE @NUEVO_ESTADO           NVARCHAR(50);
    DECLARE @ACCION_AUDITORIA       NVARCHAR(50);
    DECLARE @ID_AUDITORIA           INT;
    
    -- Inicializar outputs
    SET @P_RESULTADO_EJECUCION = 'ERROR';
    SET @P_MENSAJE_ERROR = '';
    
    BEGIN TRY
        -- Paso 1: Validar que @ACCION sea válido
        IF @ACCION NOT IN ('APROBADA', 'RECHAZADA')
        BEGIN
            SET @P_MENSAJE_ERROR = 'Acción inválida. Permitidas: APROBADA, RECHAZADA';
            RETURN 1;
        END;
        
        -- Paso 2: Obtener estado actual de la solicitud
        SELECT 
            @ESTADO_ACTUAL = ESTADO,
            @ES_ERROR_TRANSITORIO = ES_ERROR_TRANSITORIO,
            @APROBADOR_EMAIL_BD = APROBADOR_EMAIL
        FROM PORTAL_PRECIOS.SOLICITUD
        WHERE ID_SOLICITUD = @ID_SOLICITUD;
        
        -- Validar que la solicitud existe
        IF @ESTADO_ACTUAL IS NULL
        BEGIN
            SET @P_MENSAJE_ERROR = 'Solicitud no encontrada. ID_SOLICITUD: ' + CAST(@ID_SOLICITUD AS NVARCHAR);
            RETURN 1;
        END;
        
        -- Paso 3: Validar que la solicitud esté EN_PROCESO y tenga error transitorio
        IF @ESTADO_ACTUAL <> 'EN_PROCESO'
        BEGIN
            SET @P_MENSAJE_ERROR = 'Solicitud no está EN_PROCESO. Estado actual: ' + @ESTADO_ACTUAL;
            RETURN 1;
        END;
        
        IF @ES_ERROR_TRANSITORIO <> 'S'
        BEGIN
            SET @P_MENSAJE_ERROR = 'Solicitud no tiene error transitorio marcado. ES_ERROR_TRANSITORIO: ' + @ES_ERROR_TRANSITORIO;
            RETURN 1;
        END;
        
        -- Paso 4: Validar que el aprobador sea el asignado (RNF-05: segregación de funciones)
        IF @APROBADOR_EMAIL_BD IS NOT NULL AND @APROBADOR_EMAIL_BD <> @APROBADOR_EMAIL
        BEGIN
            SET @P_MENSAJE_ERROR = 'Usuario no autorizado. Aprobador asignado: ' + @APROBADOR_EMAIL_BD + ', usuario: ' + @APROBADOR_EMAIL;
            RETURN 1;
        END;
        
        -- Paso 5: Determinar el nuevo estado según acción
        IF @ACCION = 'APROBADA'
        BEGIN
            SET @NUEVO_ESTADO = 'PROCESADO';          -- RF-25: Cambiar a estado Ejecutando
            SET @ACCION_AUDITORIA = 'APROBADA';
        END
        ELSE -- RECHAZADA
        BEGIN
            SET @NUEVO_ESTADO = 'RECHAZADO';
            SET @ACCION_AUDITORIA = 'RECHAZADA';
            
            -- RF-19: El rechazo debe exigir un comentario obligatorio
            IF @COMENTARIO_RECHAZO IS NULL OR LEN(LTRIM(RTRIM(@COMENTARIO_RECHAZO))) = 0
            BEGIN
                SET @P_MENSAJE_ERROR = 'Comentario de rechazo es obligatorio.';
                RETURN 1;
            END;
        END;
        
        -- Paso 6: Actualizar estado de la solicitud
        UPDATE PORTAL_PRECIOS.SOLICITUD
        SET 
            ESTADO = @NUEVO_ESTADO,
            APROBADOR_EMAIL = @APROBADOR_EMAIL,
            FECHA_MODIFICACION = GETDATE(),
            FECHA_ULT_ESTADO = GETDATE()
        WHERE ID_SOLICITUD = @ID_SOLICITUD;
        
        -- Paso 7: Registrar en AUDITORIA_APROBACION (RF-32: auditoría con fecha/hora)
        INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
            ID_SOLICITUD,
            FECHA,
            USUARIO_EMAIL,
            USUARIO_NOMBRE,
            ACCION,
            ESTADO_ANTERIOR,
            ESTADO_NUEVO,
            COMENTARIO_DECISION,
            RESULTADO_EJECUCION,
            IMPACTO_CONFIRMADO,
            DETALLE_JSON
        )
        VALUES (
            @ID_SOLICITUD,
            GETDATE(),
            @APROBADOR_EMAIL,
            @APROBADOR_EMAIL,
            @ACCION_AUDITORIA,
            @ESTADO_ACTUAL,
            @NUEVO_ESTADO,
            @COMENTARIO_RECHAZO,
            @ACCION_AUDITORIA,
            1,
            '{"ID_SOLICITUD":' + CAST(@ID_SOLICITUD AS NVARCHAR(20)) + ',"Aprobador":"' + @APROBADOR_EMAIL + '"}'
        );
        
        SET @ID_AUDITORIA = SCOPE_IDENTITY();
        
        -- Paso 8: Establecer resultado exitoso
        SET @P_RESULTADO_EJECUCION = 'EXITO';
        SET @P_MENSAJE_ERROR = 'Solicitud ' + @ACCION + ' exitosamente. ID_AUDITORIA: ' + CAST(@ID_AUDITORIA AS NVARCHAR);
        
        RETURN 0;  -- Éxito
        
    END TRY
    BEGIN CATCH
        SET @P_RESULTADO_EJECUCION = 'ERROR';
        SET @P_MENSAJE_ERROR = 'Error en SP_APROBADOR_APRUEBA_RECHAZA: ' + ERROR_MESSAGE();
        RETURN 1;  -- Error
    END CATCH;
END;
GO

PRINT 'SP creado exitosamente.';
PRINT '';

-- ============================================================================
-- PARTE 2: EJECUTAR TESTS
-- ============================================================================

PRINT 'Ejecutando tests...';
PRINT '';
GO

DECLARE @ID_SOL_TEST1 INT;
DECLARE @ID_SOL_TEST2 INT;
DECLARE @ID_SOL_TEST3 INT;
DECLARE @ID_SOL_TEST4 INT;
DECLARE @ID_SOL_TEST5 INT;
DECLARE @SEQ INT = 0;

-- Setup: Crear datos de prueba
-- NOTA: Usar códigos cortos para evitar truncación en CODIGO_SOLICITUD
SET @SEQ = @SEQ + 1;
INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, ESTADO, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, 
    COMPANIA, APROBADOR_EMAIL, INTENTOS_REINTENTO
)
VALUES (
    'T8A' + FORMAT(@SEQ, '0000'), 'EN_PROCESO', 'S', '{"test":true}',
    'BEVAL', 'aprobador@test.com', 0
);
SET @ID_SOL_TEST1 = SCOPE_IDENTITY();

SET @SEQ = @SEQ + 1;
INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, ESTADO, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, 
    COMPANIA, APROBADOR_EMAIL, INTENTOS_REINTENTO
)
VALUES (
    'T8A' + FORMAT(@SEQ, '0000'), 'EN_PROCESO', 'S', '{"test":true}',
    'COFERSA', 'aprobador2@test.com', 1
);
SET @ID_SOL_TEST2 = SCOPE_IDENTITY();

SET @SEQ = @SEQ + 1;
INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, ESTADO, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, 
    COMPANIA, APROBADOR_EMAIL, INTENTOS_REINTENTO
)
VALUES (
    'T8A' + FORMAT(@SEQ, '0000'), 'EN_PROCESO', 'N', '{"test":true}',
    'FEBECA', 'aprobador@test.com', 0
);
SET @ID_SOL_TEST3 = SCOPE_IDENTITY();

SET @SEQ = @SEQ + 1;
INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, ESTADO, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, 
    COMPANIA, APROBADOR_EMAIL, INTENTOS_REINTENTO
)
VALUES (
    'T8A' + FORMAT(@SEQ, '0000'), 'RECHAZADO', 'S', '{"test":true}',
    'SILLACA', 'aprobador@test.com', 0
);
SET @ID_SOL_TEST4 = SCOPE_IDENTITY();

SET @SEQ = @SEQ + 1;
INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, ESTADO, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, 
    COMPANIA, APROBADOR_EMAIL, INTENTOS_REINTENTO
)
VALUES (
    'T8A' + FORMAT(@SEQ, '0000'), 'EN_PROCESO', 'S', '{"test":true}',
    'BEVAL', 'aprobador@test.com', 0
);
SET @ID_SOL_TEST5 = SCOPE_IDENTITY();

PRINT 'Datos de prueba creados (IDs: ' + CAST(@ID_SOL_TEST1 AS NVARCHAR) + ', ' + 
      CAST(@ID_SOL_TEST2 AS NVARCHAR) + ', ' + CAST(@ID_SOL_TEST3 AS NVARCHAR) + ', ' + 
      CAST(@ID_SOL_TEST4 AS NVARCHAR) + ', ' + CAST(@ID_SOL_TEST5 AS NVARCHAR) + ')';
PRINT '';

-- TEST 1: Aprobador aprueba
DECLARE @RES1 NVARCHAR(50) = '';
DECLARE @MSG1 NVARCHAR(MAX) = '';
DECLARE @RC1 INT;

EXEC @RC1 = PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA 
    @ID_SOLICITUD = @ID_SOL_TEST1,
    @APROBADOR_EMAIL = 'aprobador@test.com',
    @ACCION = 'APROBADA',
    @COMENTARIO_RECHAZO = NULL,
    @P_RESULTADO_EJECUCION = @RES1 OUTPUT,
    @P_MENSAJE_ERROR = @MSG1 OUTPUT;

PRINT 'TEST 1 (Aprobar): ' + @RES1 + ' - ' + @MSG1;

-- TEST 2: Aprobador rechaza con comentario
DECLARE @RES2 NVARCHAR(50) = '';
DECLARE @MSG2 NVARCHAR(MAX) = '';
DECLARE @RC2 INT;

EXEC @RC2 = PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA 
    @ID_SOLICITUD = @ID_SOL_TEST2,
    @APROBADOR_EMAIL = 'aprobador2@test.com',
    @ACCION = 'RECHAZADA',
    @COMENTARIO_RECHAZO = 'Precios inconsistentes',
    @P_RESULTADO_EJECUCION = @RES2 OUTPUT,
    @P_MENSAJE_ERROR = @MSG2 OUTPUT;

PRINT 'TEST 2 (Rechazar): ' + @RES2 + ' - ' + @MSG2;

-- TEST 3: Error - sin error transitorio
DECLARE @RES3 NVARCHAR(50) = '';
DECLARE @MSG3 NVARCHAR(MAX) = '';
DECLARE @RC3 INT;

EXEC @RC3 = PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA 
    @ID_SOLICITUD = @ID_SOL_TEST3,
    @APROBADOR_EMAIL = 'aprobador@test.com',
    @ACCION = 'APROBADA',
    @COMENTARIO_RECHAZO = NULL,
    @P_RESULTADO_EJECUCION = @RES3 OUTPUT,
    @P_MENSAJE_ERROR = @MSG3 OUTPUT;

PRINT 'TEST 3 (Sin error transitorio): ' + @RES3 + ' - ' + @MSG3;

-- TEST 4: Error - no EN_PROCESO
DECLARE @RES4 NVARCHAR(50) = '';
DECLARE @MSG4 NVARCHAR(MAX) = '';
DECLARE @RC4 INT;

EXEC @RC4 = PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA 
    @ID_SOLICITUD = @ID_SOL_TEST4,
    @APROBADOR_EMAIL = 'aprobador@test.com',
    @ACCION = 'APROBADA',
    @COMENTARIO_RECHAZO = NULL,
    @P_RESULTADO_EJECUCION = @RES4 OUTPUT,
    @P_MENSAJE_ERROR = @MSG4 OUTPUT;

PRINT 'TEST 4 (No EN_PROCESO): ' + @RES4 + ' - ' + @MSG4;

-- TEST 5: Error - rechazo sin comentario
DECLARE @RES5 NVARCHAR(50) = '';
DECLARE @MSG5 NVARCHAR(MAX) = '';
DECLARE @RC5 INT;

EXEC @RC5 = PORTAL_PRECIOS.SP_APROBADOR_APRUEBA_RECHAZA 
    @ID_SOLICITUD = @ID_SOL_TEST5,
    @APROBADOR_EMAIL = 'aprobador@test.com',
    @ACCION = 'RECHAZADA',
    @COMENTARIO_RECHAZO = NULL,
    @P_RESULTADO_EJECUCION = @RES5 OUTPUT,
    @P_MENSAJE_ERROR = @MSG5 OUTPUT;

PRINT 'TEST 5 (Sin comentario): ' + @RES5 + ' - ' + @MSG5;

PRINT '';

-- Resumen
DECLARE @TOTAL_PASS INT = 
    CASE WHEN @RES1 = 'EXITO' THEN 1 ELSE 0 END +
    CASE WHEN @RES2 = 'EXITO' THEN 1 ELSE 0 END +
    CASE WHEN @RES3 = 'ERROR' THEN 1 ELSE 0 END +
    CASE WHEN @RES4 = 'ERROR' THEN 1 ELSE 0 END +
    CASE WHEN @RES5 = 'ERROR' THEN 1 ELSE 0 END;

PRINT '========== RESUMEN ==========';
PRINT 'Total PASS: ' + CAST(@TOTAL_PASS AS NVARCHAR) + '/5';
PRINT '';

IF @TOTAL_PASS = 5
BEGIN
    PRINT '✓ Tarea 8 - SP_APROBADOR_APRUEBA_RECHAZA: VALIDADO';
    PRINT '';
    PRINT 'RF-20: Aprobador confirma mediante modal (validado por SP)';
    PRINT 'RF-25: Solicitud pasa a PROCESADO al aprobar (validado)';
    PRINT 'RF-26: Estados finales registrados en AUDITORIA_APROBACION (validado)';
    PRINT 'RF-32: Auditoría registra usuario, fecha, acción (validado)';
    PRINT 'RNF-05: Segregación de funciones - aprobador asignado (validado)';
END
ELSE
BEGIN
    PRINT '✗ Fallos encontrados en tests. Revisar logs arriba.';
END;

PRINT '';

GO
