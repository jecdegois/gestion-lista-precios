-- ========================================================================================================
-- PASO 2 - Tarea 4: Stored Procedure - Confirmar/Denegar Cancelación
-- Script: sp_04_decidir_cancelacion.sql
-- Objetivo: Aprobador confirma o deniega cancelación solicitada
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

USE SOFTLANDQA;
GO

-- Verificar si el SP existe y eliminarlo (para recreación)
IF OBJECT_ID('PORTAL_PRECIOS.sp_decidir_cancelacion', 'P') IS NOT NULL
    DROP PROCEDURE PORTAL_PRECIOS.sp_decidir_cancelacion;
GO

-- ========================================================================================================
-- Stored Procedure: sp_decidir_cancelacion
-- ========================================================================================================

/**
 * DESCRIPCIÓN:
 * Procedimiento que implementa la decisión del aprobador sobre cancelación solicitada.
 * 
 * DOS CASOS:
 * 
 * CASO 1: @ACCION = 'CONFIRMAR'
 *   - Validar que CANCELACION_SOLICITADA = 'S'
 *   - CANCELACION_CONFIRMADA = 'S'
 *   - FECHA_CANCELACION = GETDATE()
 *   - USUARIO_DECIDE_CANCELACION = aprobador
 *   - ESTADO = 'CANCELADA'
 *   - Auditoría: ACCION='CANCELACION_CONFIRMADA'
 * 
 * CASO 2: @ACCION = 'DENEGAR'
 *   - Validar que CANCELACION_SOLICITADA = 'S'
 *   - CANCELACION_SOLICITADA = 'N' (o dejar como está)
 *   - Continúa procesamiento normal
 *   - Auditoría: ACCION='CANCELACION_DENEGADA'
 * 
 * COBERTURA:
 * - HU-12: Cancelación confirmada/denegada
 * - RF-32: Auditoría de decisión
 * - RNF-05: Auditoría completa
 */

CREATE PROCEDURE PORTAL_PRECIOS.sp_decidir_cancelacion (
    @ID_SOLICITUD INT,
    @USUARIO_EMAIL VARCHAR(120),
    @USUARIO_NOMBRE VARCHAR(120),
    @ACCION VARCHAR(30),  -- 'CONFIRMAR' o 'DENEGAR'
    @COMENTARIO_DECISION VARCHAR(1000) = NULL,
    --
    @P_RESULTADO VARCHAR(15) OUTPUT,
    @P_MENSAJE VARCHAR(500) OUTPUT,
    @P_ID_AUDITORIA BIGINT OUTPUT
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @v_estado VARCHAR(25);
    DECLARE @v_cancelacion_solicitada CHAR(1);
    DECLARE @v_fecha_actual DATETIME = GETDATE();
    DECLARE @v_id_auditoria BIGINT;
    DECLARE @v_error_message VARCHAR(500);
    DECLARE @v_accion_auditoria VARCHAR(30);

    BEGIN TRY
        -- ============================================================================================
        -- VALIDACIÓN 0: @ACCION es válida
        -- ============================================================================================
        SET @ACCION = UPPER(LTRIM(RTRIM(ISNULL(@ACCION, ''))));
        
        IF @ACCION NOT IN ('CONFIRMAR', 'DENEGAR')
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'ACCION debe ser ''CONFIRMAR'' o ''DENEGAR''. Recibido: ''' + @ACCION + '''.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- VALIDACIÓN 1: Solicitud existe
        -- ============================================================================================
        IF NOT EXISTS (SELECT 1 FROM PORTAL_PRECIOS.SOLICITUD WHERE ID_SOLICITUD = @ID_SOLICITUD)
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'Solicitud ' + CAST(@ID_SOLICITUD AS VARCHAR(10)) + ' no existe.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- VALIDACIÓN 2: CANCELACION_SOLICITADA = 'S' (hay una solicitud en curso)
        -- ============================================================================================
        SELECT @v_estado = ESTADO, @v_cancelacion_solicitada = CANCELACION_SOLICITADA
        FROM PORTAL_PRECIOS.SOLICITUD
        WHERE ID_SOLICITUD = @ID_SOLICITUD;

        IF @v_cancelacion_solicitada <> 'S'
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'No hay solicitud de cancelación en curso para esta solicitud.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- LÓGICA CONDICIONAL: CONFIRMAR vs DENEGAR
        -- ============================================================================================
        IF @ACCION = 'CONFIRMAR'
        BEGIN
            -- ========================================================================================
            -- CASO 1: CONFIRMAR CANCELACIÓN
            -- ========================================================================================
            UPDATE PORTAL_PRECIOS.SOLICITUD
            SET 
                CANCELACION_CONFIRMADA = 'S',
                FECHA_CANCELACION = @v_fecha_actual,
                USUARIO_DECIDE_CANCELACION = @USUARIO_EMAIL,
                ESTADO = 'CANCELADA',
                FECHA_ULT_ESTADO = @v_fecha_actual,
                FECHA_MODIFICACION = @v_fecha_actual
            WHERE ID_SOLICITUD = @ID_SOLICITUD;

            SET @v_accion_auditoria = 'CANCELACION_CONFIRMADA';
            SET @P_MENSAJE = 'Cancelación confirmada. Solicitud ha sido cancelada.';
        END
        ELSE IF @ACCION = 'DENEGAR'
        BEGIN
            -- ========================================================================================
            -- CASO 2: DENEGAR CANCELACIÓN
            -- ========================================================================================
            UPDATE PORTAL_PRECIOS.SOLICITUD
            SET 
                CANCELACION_SOLICITADA = 'N',
                FECHA_MODIFICACION = @v_fecha_actual
            WHERE ID_SOLICITUD = @ID_SOLICITUD;

            SET @v_accion_auditoria = 'CANCELACION_DENEGADA';
            SET @P_MENSAJE = 'Cancelación denegada. Solicitud continúa en procesamiento.';
        END

        IF @@ROWCOUNT = 0
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'No se pudo actualizar la decisión de cancelación.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- PASO FINAL: Registrar en AUDITORIA_APROBACION (HU-12, RF-32, RNF-05)
        -- ============================================================================================
        INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
            ID_SOLICITUD,
            FECHA,
            USUARIO_EMAIL,
            USUARIO_NOMBRE,
            ACCION,
            ESTADO_ANTERIOR,
            ESTADO_NUEVO,
            COMENTARIO_DECISION,
            RESULTADO_EJECUCION
        )
        VALUES (
            @ID_SOLICITUD,
            @v_fecha_actual,
            @USUARIO_EMAIL,
            @USUARIO_NOMBRE,
            @v_accion_auditoria,
            @v_estado,
            CASE WHEN @ACCION = 'CONFIRMAR' THEN 'CANCELADA' ELSE @v_estado END,
            @COMENTARIO_DECISION,
            'EXITOSO'
        );

        SET @v_id_auditoria = @@IDENTITY;

        -- ============================================================================================
        -- ÉXITO: Retornar resultado positivo
        -- ============================================================================================
        SET @P_RESULTADO = 'EXITOSO';
        SET @P_ID_AUDITORIA = @v_id_auditoria;

    END TRY
    BEGIN CATCH
        -- ============================================================================================
        -- MANEJO DE ERRORES
        -- ============================================================================================
        SET @v_error_message = ERROR_MESSAGE();
        
        SET @P_RESULTADO = 'ERROR';
        SET @P_MENSAJE = 'Error al decidir cancelación: ' + @v_error_message;
        SET @P_ID_AUDITORIA = 0;

        -- Registrar error en auditoría
        IF @ID_SOLICITUD > 0
        BEGIN
            BEGIN TRY
                INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION (
                    ID_SOLICITUD,
                    FECHA,
                    USUARIO_EMAIL,
                    USUARIO_NOMBRE,
                    ACCION,
                    COMENTARIO_DECISION,
                    RESULTADO_EJECUCION
                )
                VALUES (
                    @ID_SOLICITUD,
                    GETDATE(),
                    @USUARIO_EMAIL,
                    @USUARIO_NOMBRE,
                    'CANCELACION_SOLICITADA',
                    'Error en SP: ' + @v_error_message,
                    'FALLIDO'
                );
            END TRY
            BEGIN CATCH
            END CATCH
        END
    END CATCH
END
GO

PRINT '';
PRINT '✅ sp_decidir_cancelacion creado exitosamente';
PRINT '';
PRINT 'Cobertura:';
PRINT '  - HU-12: Cancelación confirmada/denegada ✅';
PRINT '  - RF-32: Auditoría de decisión ✅';
PRINT '  - RNF-05: Auditoría completa ✅';
PRINT '';
PRINT 'Casos soportados:';
PRINT '  1. ACCION=''CONFIRMAR'': ESTADO→CANCELADA, CANCELACION_CONFIRMADA=''S'' ✅';
PRINT '  2. ACCION=''DENEGAR'': Continúa procesamiento, CANCELACION_SOLICITADA=''N'' ✅';
PRINT '';
