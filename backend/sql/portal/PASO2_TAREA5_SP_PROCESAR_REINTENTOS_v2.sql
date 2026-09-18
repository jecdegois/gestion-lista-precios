-- ========================================================================================================
-- TAREA 5: SP_PROCESAR_REINTENTOS - VERSIÓN 2 (SIN CURSOR, CON BUCLE TOP 1)
-- Script: PASO2_TAREA5_SP_PROCESAR_REINTENTOS_v2.sql
-- Objetivo: Procesar reintentos con lógica más robusta
-- ========================================================================================================

USE SOFTLANDQA;
GO

PRINT '';
PRINT '════════════════════════════════════════════════════════════════════════════════════════════════';
PRINT 'CREANDO SP_PROCESAR_REINTENTOS (VERSIÓN 2 - SIN CURSOR)';
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

        -- BUCLE: Procesar reintentos de uno en uno
        WHILE @v_contador < @v_max_batch
        BEGIN
            -- Obtener el siguiente reintento a procesar (TOP 1)
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
            BEGIN
                PRINT '[✅] No hay más reintentos a procesar';
                BREAK;
            END

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
                
                PRINT '[DEBUG] Reintento ' + CAST(@v_contador AS VARCHAR(3)) + ': ID=' + CAST(@v_id_reintento AS VARCHAR(10)) + ', Intento=' + CAST(@v_intento_numero AS VARCHAR(1)) + ', Resultado=' + @v_resultado_simulado;
                
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
                    
                    INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
                        ID_SOLICITUD, FECHA, USUARIO_EMAIL, USUARIO_NOMBRE,
                        ACCION, ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO_DECISION, RESULTADO_EJECUCION
                    )
                    VALUES (
                        @v_id_solicitud, @v_fecha_actual, 'SISTEMA', 'BACKGROUND_JOB_REINTENTOS',
                        'REINTENTO_EXITOSO', 'EN_PROCESO', @v_nuevo_estado, 
                        'Éxito en intento ' + CAST(@v_intento_numero AS VARCHAR(1)) + '/3',
                        'EXITOSO'
                    );
                    
                    SET @P_EXITOSOS = @P_EXITOSOS + 1;
                    PRINT '  [✅] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → EXITOSO (intento ' + CAST(@v_intento_numero AS VARCHAR(1)) + ')';
                END
                ELSE
                BEGIN
                    -- Determinar si es error transitorio
                    IF @v_resultado_simulado IN ('TIMEOUT', 'DEADLOCK', 'CONNECTION_LOST')
                        SET @v_es_error_transitorio = 1;
                    ELSE
                        SET @v_es_error_transitorio = 0;
                    
                    -- Si es transitorio Y quedan intentos
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
                        
                        INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
                            ID_SOLICITUD, FECHA, USUARIO_EMAIL, USUARIO_NOMBRE,
                            ACCION, ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO_DECISION, RESULTADO_EJECUCION
                        )
                        VALUES (
                            @v_id_solicitud, @v_fecha_actual, 'SISTEMA', 'BACKGROUND_JOB_REINTENTOS',
                            'REINTENTO_PROGRAMADO', 'EN_PROCESO', 'EN_PROCESO',
                            'Intento ' + CAST(@v_intento_numero AS VARCHAR(1)) + '/3 falló (' + @v_resultado_simulado + '). Reintento ' + CAST(@v_intento_numero + 1 AS VARCHAR(1)) + ' en ' + CAST(@v_backoff_minutos AS VARCHAR(3)) + ' min',
                            'PENDIENTE'
                        );
                        
                        SET @P_PENDIENTES = @P_PENDIENTES + 1;
                        PRINT '  [⏳] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → Reprogramado (intento ' + CAST(@v_intento_numero + 1 AS VARCHAR(1)) + ' en ' + CAST(@v_backoff_minutos AS VARCHAR(3)) + ' min)';
                    END
                    -- Si es transitorio Y SIN reintentos restantes
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
                        
                        INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
                            ID_SOLICITUD, FECHA, USUARIO_EMAIL, USUARIO_NOMBRE,
                            ACCION, ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO_DECISION, RESULTADO_EJECUCION
                        )
                        VALUES (
                            @v_id_solicitud, @v_fecha_actual, 'SISTEMA', 'BACKGROUND_JOB_REINTENTOS',
                            'REINTENTO_AGOTADO', 'EN_PROCESO', @v_nuevo_estado,
                            'Reintentos agotados (3/3). Último error: ' + @v_resultado_simulado,
                            'FALLIDO'
                        );
                        
                        SET @P_FALLIDOS = @P_FALLIDOS + 1;
                        PRINT '  [❌] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → AGOTADO (3/3 intentos, error: ' + @v_resultado_simulado + ')';
                    END
                    -- Error no-retryeable
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
                        
                        INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
                            ID_SOLICITUD, FECHA, USUARIO_EMAIL, USUARIO_NOMBRE,
                            ACCION, ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO_DECISION, RESULTADO_EJECUCION
                        )
                        VALUES (
                            @v_id_solicitud, @v_fecha_actual, 'SISTEMA', 'BACKGROUND_JOB_REINTENTOS',
                            'REINTENTO_NO_VALIDO', 'EN_PROCESO', @v_nuevo_estado,
                            'Error no-retryeable: ' + @v_resultado_simulado,
                            'FALLIDO'
                        );
                        
                        SET @P_FALLIDOS = @P_FALLIDOS + 1;
                        PRINT '  [❌] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → NO-RETRYEABLE (error: ' + @v_resultado_simulado + ', sin reintento)';
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
                PRINT '  [⚠️] ID_Reintento=' + CAST(@v_id_reintento AS VARCHAR(10)) + ' → ERROR SP: ' + SUBSTRING(ERROR_MESSAGE(), 1, 80);
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

PRINT '[✅] SP_PROCESAR_REINTENTOS (v2) creado exitosamente';
PRINT '';
