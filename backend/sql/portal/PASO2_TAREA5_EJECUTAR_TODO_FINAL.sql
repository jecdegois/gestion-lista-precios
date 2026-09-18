-- ========================================================================================================
-- TAREA 5: PROCESAR REINTENTOS - EJECUCIÓN FINAL COMPLETA
-- Script: PASO2_TAREA5_EJECUTAR_TODO_FINAL.sql
-- Versión: Final (SP v2 sin cursor, bucle TOP 1)
-- ========================================================================================================

USE SOFTLANDQA;
GO

PRINT '';
PRINT '╔════════════════════════════════════════════════════════════════════════════════════════════════╗';
PRINT '║                   TAREA 5: PROCESAR REINTENTOS - EJECUCIÓN FINAL                              ║';
PRINT '╚════════════════════════════════════════════════════════════════════════════════════════════════╝';
PRINT '';

-- ========================================================================================================
-- SECCIÓN 1: CREAR STORED PROCEDURE (v2 - SIN CURSOR)
-- ========================================================================================================

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT 'SECCIÓN 1: CREAR SP_PROCESAR_REINTENTOS (v2)';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT '';

IF OBJECT_ID('PORTAL_PRECIOS.sp_procesar_reintentos', 'P') IS NOT NULL
    DROP PROCEDURE PORTAL_PRECIOS.sp_procesar_reintentos;
GO

CREATE PROCEDURE PORTAL_PRECIOS.sp_procesar_reintentos (
    @P_MAX_REINTENTOS INT = 3,
    @P_TIMEOUT_SEGUNDOS INT = 300,
    @P_REINTENTOS_PROCESADOS INT OUTPUT,
    @P_EXITOSOS INT OUTPUT,
    @P_PENDIENTES INT OUTPUT,
    @P_FALLIDOS INT OUTPUT
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @v_fecha_actual DATETIME = GETDATE();
    DECLARE @v_id_reintento BIGINT;
    DECLARE @v_id_solicitud INT;
    DECLARE @v_intento_numero INT;
    DECLARE @v_tipo_error VARCHAR(40);
    DECLARE @v_proximo_reintento DATETIME;
    DECLARE @v_resultado_simulado VARCHAR(20);
    DECLARE @v_error_aleatorio FLOAT;
    DECLARE @v_es_error_transitorio BIT;
    DECLARE @v_backoff_minutos INT;
    DECLARE @v_nuevo_estado VARCHAR(25);
    DECLARE @v_contador INT = 0;
    DECLARE @v_max_batch INT = 1000;
    
    SET @P_REINTENTOS_PROCESADOS = 0;
    SET @P_EXITOSOS = 0;
    SET @P_PENDIENTES = 0;
    SET @P_FALLIDOS = 0;

    BEGIN TRY
        PRINT '[' + CONVERT(VARCHAR(23), @v_fecha_actual, 121) + '] Iniciando procesamiento de reintentos...';

        -- BUCLE: Procesar reintentos de uno en uno (TOP 1)
        WHILE @v_contador < @v_max_batch
        BEGIN
            -- Obtener el siguiente reintento a procesar
            SELECT TOP 1
                @v_id_reintento = ID_REINTENTO,
                @v_id_solicitud = ID_SOLICITUD,
                @v_intento_numero = INTENTO_NUMERO,
                @v_tipo_error = TIPO_ERROR,
                @v_proximo_reintento = PROXIMO_REINTENTO_PROGRAMADO
            FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
            WHERE 
                PROXIMO_REINTENTO_PROGRAMADO <= @v_fecha_actual
                AND RESULTADO_REINTENTO IS NULL
                AND INTENTO_NUMERO < @P_MAX_REINTENTOS
            ORDER BY PROXIMO_REINTENTO_PROGRAMADO ASC;

            -- Si no hay más reintentos, salir del bucle
            IF @@ROWCOUNT = 0
                BREAK;

            SET @v_contador = @v_contador + 1;
            
            BEGIN TRY
                -- Simular resultado del reintento
                SET @v_error_aleatorio = RAND();
                
                IF @v_error_aleatorio < 0.30
                    SET @v_resultado_simulado = 'EXITOSO'
                ELSE IF @v_error_aleatorio < 0.50
                    SET @v_resultado_simulado = 'TIMEOUT'
                ELSE IF @v_error_aleatorio < 0.70
                    SET @v_resultado_simulado = 'DEADLOCK'
                ELSE IF @v_error_aleatorio < 0.85
                    SET @v_resultado_simulado = 'CONNECTION_LOST'
                ELSE
                    SET @v_resultado_simulado = 'VALIDATION_ERROR';
                
                IF @v_resultado_simulado = 'EXITOSO'
                BEGIN
                    SET @v_nuevo_estado = 'PROCESADO';
                    
                    UPDATE PORTAL_PRECIOS.SOLICITUD_REINTENTO
                    SET 
                        RESULTADO_REINTENTO = 'EXITOSO',
                        MENSAJE_ERROR = 'Ejecución exitosa en intento ' + CAST(@v_intento_numero AS VARCHAR(1))
                    WHERE ID_REINTENTO = @v_id_reintento;
                    
                    UPDATE PORTAL_PRECIOS.SOLICITUD
                    SET 
                        ESTADO = @v_nuevo_estado,
                        FECHA_ULT_ESTADO = @v_fecha_actual,
                        FECHA_FIN_EJECUCION = @v_fecha_actual,
                        FECHA_MODIFICACION = @v_fecha_actual
                    WHERE ID_SOLICITUD = @v_id_solicitud;
                    
                    SET @P_EXITOSOS = @P_EXITOSOS + 1;
                    PRINT '  [✅] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → EXITOSO';
                END
                ELSE
                BEGIN
                    IF @v_resultado_simulado IN ('TIMEOUT', 'DEADLOCK', 'CONNECTION_LOST')
                        SET @v_es_error_transitorio = 1;
                    ELSE
                        SET @v_es_error_transitorio = 0;
                    
                    IF @v_es_error_transitorio = 1 AND @v_intento_numero < @P_MAX_REINTENTOS
                    BEGIN
                        IF @v_intento_numero = 1
                            SET @v_backoff_minutos = 5
                        ELSE IF @v_intento_numero = 2
                            SET @v_backoff_minutos = 15
                        ELSE
                            SET @v_backoff_minutos = 60;
                        
                        SET @v_proximo_reintento = DATEADD(MINUTE, @v_backoff_minutos, @v_fecha_actual);
                        
                        UPDATE PORTAL_PRECIOS.SOLICITUD_REINTENTO
                        SET 
                            INTENTO_NUMERO = @v_intento_numero + 1,
                            PROXIMO_REINTENTO_PROGRAMADO = @v_proximo_reintento,
                            RESULTADO_REINTENTO = NULL,
                            FECHA_INTENTO = @v_fecha_actual,
                            MENSAJE_ERROR = 'Error transitorio: ' + @v_resultado_simulado + '. Próximo en ' + CAST(@v_backoff_minutos AS VARCHAR(3)) + ' min'
                        WHERE ID_REINTENTO = @v_id_reintento;
                        
                        SET @P_PENDIENTES = @P_PENDIENTES + 1;
                        PRINT '  [⏳] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → Reprogramado';
                    END
                    ELSE IF @v_es_error_transitorio = 1 AND @v_intento_numero >= @P_MAX_REINTENTOS
                    BEGIN
                        SET @v_nuevo_estado = 'ERROR_EJECUCION';
                        
                        UPDATE PORTAL_PRECIOS.SOLICITUD_REINTENTO
                        SET 
                            RESULTADO_REINTENTO = 'FALLIDO',
                            MENSAJE_ERROR = 'Reintentos agotados (3/3). Última falla: ' + @v_resultado_simulado
                        WHERE ID_REINTENTO = @v_id_reintento;
                        
                        UPDATE PORTAL_PRECIOS.SOLICITUD
                        SET 
                            ESTADO = @v_nuevo_estado,
                            FECHA_ULT_ESTADO = @v_fecha_actual,
                            FECHA_FIN_EJECUCION = @v_fecha_actual,
                            FECHA_MODIFICACION = @v_fecha_actual,
                            ES_ERROR_TRANSITORIO = 'S',
                            CODIGO_ERROR = 'REINTENTO_AGOTADO_' + @v_resultado_simulado,
                            MENSAJE_ERROR = 'No se pudo procesar después de 3 intentos. Error: ' + @v_resultado_simulado
                        WHERE ID_SOLICITUD = @v_id_solicitud;
                        
                        SET @P_FALLIDOS = @P_FALLIDOS + 1;
                        PRINT '  [❌] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → AGOTADO';
                    END
                    ELSE
                    BEGIN
                        SET @v_nuevo_estado = 'PROCESADO_CON_ERRORES';
                        
                        UPDATE PORTAL_PRECIOS.SOLICITUD_REINTENTO
                        SET 
                            RESULTADO_REINTENTO = 'FALLIDO',
                            MENSAJE_ERROR = 'Error no-retryeable: ' + @v_resultado_simulado
                        WHERE ID_REINTENTO = @v_id_reintento;
                        
                        UPDATE PORTAL_PRECIOS.SOLICITUD
                        SET 
                            ESTADO = @v_nuevo_estado,
                            FECHA_ULT_ESTADO = @v_fecha_actual,
                            FECHA_FIN_EJECUCION = @v_fecha_actual,
                            FECHA_MODIFICACION = @v_fecha_actual,
                            ES_ERROR_TRANSITORIO = 'N',
                            CODIGO_ERROR = 'ERROR_NO_RETRYEABLE_' + @v_resultado_simulado,
                            MENSAJE_ERROR = 'Error funcional no recuperable: ' + @v_resultado_simulado
                        WHERE ID_SOLICITUD = @v_id_solicitud;
                        
                        SET @P_FALLIDOS = @P_FALLIDOS + 1;
                        PRINT '  [❌] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → NO-RETRYEABLE';
                    END
                END
            END TRY
            BEGIN CATCH
                UPDATE PORTAL_PRECIOS.SOLICITUD_REINTENTO
                SET 
                    RESULTADO_REINTENTO = 'FALLIDO',
                    MENSAJE_ERROR = 'Error: ' + SUBSTRING(ERROR_MESSAGE(), 1, 500)
                WHERE ID_REINTENTO = @v_id_reintento;
                SET @P_FALLIDOS = @P_FALLIDOS + 1;
                PRINT '  [⚠️] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → ERROR';
            END CATCH
        END

        SET @P_REINTENTOS_PROCESADOS = @P_EXITOSOS + @P_PENDIENTES + @P_FALLIDOS;

        PRINT '';
        PRINT '╔════════════════════════════════════════════════════════════════╗';
        PRINT '║ RESUMEN DE PROCESAMIENTO                                       ║';
        PRINT '║ ─────────────────────────────────────────────────────────────── ║';
        PRINT '║ Reintentos Procesados: ' + REPLICATE(' ', 33 - LEN(CAST(@P_REINTENTOS_PROCESADOS AS VARCHAR(10)))) + CAST(@P_REINTENTOS_PROCESADOS AS VARCHAR(10)) + ' ║';
        PRINT '║ Exitosos:              ' + REPLICATE(' ', 33 - LEN(CAST(@P_EXITOSOS AS VARCHAR(10)))) + CAST(@P_EXITOSOS AS VARCHAR(10)) + ' ║';
        PRINT '║ Pendientes:            ' + REPLICATE(' ', 33 - LEN(CAST(@P_PENDIENTES AS VARCHAR(10)))) + CAST(@P_PENDIENTES AS VARCHAR(10)) + ' ║';
        PRINT '║ Fallidos:              ' + REPLICATE(' ', 33 - LEN(CAST(@P_FALLIDOS AS VARCHAR(10)))) + CAST(@P_FALLIDOS AS VARCHAR(10)) + ' ║';
        PRINT '╚════════════════════════════════════════════════════════════════╝';

    END TRY
    BEGIN CATCH
        PRINT '[❌ ERROR] ' + ERROR_MESSAGE();
        THROW;
    END CATCH
END
GO

PRINT '[✅] SP_PROCESAR_REINTENTOS creado (versión 2 - sin cursor)';
PRINT '';

-- ========================================================================================================
-- SECCIÓN 2: LIMPIAR Y PREPARAR DATOS DE TEST
-- ========================================================================================================

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT 'SECCIÓN 2: PREPARAR DATOS DE TEST';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT '';

DELETE FROM PORTAL_PRECIOS.AUDITORIA_APROBACION 
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%');

DELETE FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO 
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%');

DELETE FROM PORTAL_PRECIOS.SOLICITUD 
WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%';

PRINT '[✅] Datos anteriores limpiados';

DECLARE @v_id_sol_001 INT;
DECLARE @v_id_sol_002 INT;
DECLARE @v_id_sol_003 INT;
DECLARE @v_id_sol_004 INT;

-- TEST 1
INSERT INTO PORTAL_PRECIOS.SOLICITUD (PROCESO, MODALIDAD, COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, APROBADOR_EMAIL, APROBADOR_NOMBRE)
VALUES ('FACTOR_PRECIO', 'manual', 'FEBECA', 'EN_PROCESO', 'TEST_TAREA5_001', '{}', 'test@test.com', 'Test 1', 'aprobador@test.com', 'Aprobador');
SET @v_id_sol_001 = SCOPE_IDENTITY();
INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO, PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO)
VALUES (@v_id_sol_001, 1, 'connection_timeout', GETDATE(), DATEADD(MINUTE, -10, GETDATE()), NULL);

-- TEST 2
INSERT INTO PORTAL_PRECIOS.SOLICITUD (PROCESO, MODALIDAD, COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, APROBADOR_EMAIL, APROBADOR_NOMBRE)
VALUES ('FACTOR_PRECIO', 'manual', 'FEBECA', 'EN_PROCESO', 'TEST_TAREA5_002', '{}', 'test@test.com', 'Test 2', 'aprobador@test.com', 'Aprobador');
SET @v_id_sol_002 = SCOPE_IDENTITY();
INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO, PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO)
VALUES (@v_id_sol_002, 1, 'temporary_lock', GETDATE(), DATEADD(MINUTE, -5, GETDATE()), NULL);

-- TEST 3
INSERT INTO PORTAL_PRECIOS.SOLICITUD (PROCESO, MODALIDAD, COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, APROBADOR_EMAIL, APROBADOR_NOMBRE)
VALUES ('FACTOR_PRECIO', 'manual', 'FEBECA', 'EN_PROCESO', 'TEST_TAREA5_003', '{}', 'test@test.com', 'Test 3', 'aprobador@test.com', 'Aprobador');
SET @v_id_sol_003 = SCOPE_IDENTITY();
INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO, PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO)
VALUES (@v_id_sol_003, 3, 'service_unavailable', GETDATE(), DATEADD(MINUTE, -1, GETDATE()), NULL);

-- TEST 4
INSERT INTO PORTAL_PRECIOS.SOLICITUD (PROCESO, MODALIDAD, COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, APROBADOR_EMAIL, APROBADOR_NOMBRE)
VALUES ('FACTOR_PRECIO', 'manual', 'FEBECA', 'EN_PROCESO', 'TEST_TAREA5_004', '{}', 'test@test.com', 'Test 4', 'aprobador@test.com', 'Aprobador');
SET @v_id_sol_004 = SCOPE_IDENTITY();
INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO, PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO)
VALUES (@v_id_sol_004, 1, 'other_transient', GETDATE(), DATEADD(MINUTE, -2, GETDATE()), NULL);

PRINT '[✅] 4 solicitudes y reintentos creados';
PRINT '';

-- ========================================================================================================
-- SECCIÓN 3: EJECUTAR SP
-- ========================================================================================================

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT 'SECCIÓN 3: EJECUTAR SP_PROCESAR_REINTENTOS';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT '';

DECLARE @P_REINTENTOS_PROCESADOS INT;
DECLARE @P_EXITOSOS INT;
DECLARE @P_PENDIENTES INT;
DECLARE @P_FALLIDOS INT;

EXEC PORTAL_PRECIOS.sp_procesar_reintentos
    @P_MAX_REINTENTOS = 3,
    @P_TIMEOUT_SEGUNDOS = 300,
    @P_REINTENTOS_PROCESADOS = @P_REINTENTOS_PROCESADOS OUTPUT,
    @P_EXITOSOS = @P_EXITOSOS OUTPUT,
    @P_PENDIENTES = @P_PENDIENTES OUTPUT,
    @P_FALLIDOS = @P_FALLIDOS OUTPUT;

-- ========================================================================================================
-- SECCIÓN 4: VALIDAR REQUISITOS
-- ========================================================================================================

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT 'SECCIÓN 4: VALIDAR REQUISITOS (RF-29, RF-30, RNF-06)';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT '';

PRINT '[RF-29] Reintentos automáticos ante errores transitorios:';
SELECT 'Registros en AUDITORIA_APROBACION' AS Validación, 
       COUNT(*) AS Cantidad
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION 
WHERE ID_SOLICITUD IN (@v_id_sol_001, @v_id_sol_002, @v_id_sol_003, @v_id_sol_004);

PRINT '';
PRINT '[RF-30] Límite de 3 intentos y estado final:';
SELECT ESTADO, COUNT(*) AS Cantidad
FROM PORTAL_PRECIOS.SOLICITUD
WHERE ID_SOLICITUD IN (@v_id_sol_001, @v_id_sol_002, @v_id_sol_003, @v_id_sol_004)
GROUP BY ESTADO;

PRINT '';
PRINT '[RNF-06] Auditoría con USUARIO=SISTEMA:';
SELECT COUNT(*) AS RegistrosSISTEMA
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ID_SOLICITUD IN (@v_id_sol_001, @v_id_sol_002, @v_id_sol_003, @v_id_sol_004)
AND USUARIO_EMAIL = 'SISTEMA';

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT '✅ TAREA 5: EJECUCIÓN COMPLETA - VERIFICA LOS RESULTADOS ARRIBA';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT '';
