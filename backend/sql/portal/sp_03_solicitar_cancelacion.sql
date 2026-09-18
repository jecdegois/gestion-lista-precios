-- ========================================================================================================
-- PASO 2 - Tarea 3: Stored Procedure - Solicitar Cancelación
-- Script: sp_03_solicitar_cancelacion.sql
-- Objetivo: Permite solicitante o aprobador solicitar cancelación de una solicitud
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

USE SOFTLANDQA;
GO

-- Verificar si el SP existe y eliminarlo (para recreación)
IF OBJECT_ID('PORTAL_PRECIOS.sp_solicitar_cancelacion', 'P') IS NOT NULL
    DROP PROCEDURE PORTAL_PRECIOS.sp_solicitar_cancelacion;
GO

-- ========================================================================================================
-- Stored Procedure: sp_solicitar_cancelacion
-- ========================================================================================================

/**
 * DESCRIPCIÓN:
 * Procedimiento que implementa la solicitud de cancelación de una solicitud.
 * 
 * PASOS:
 * 1. Validar que la solicitud existe
 * 2. Validar que el estado es 'ENVIADA' o 'EN_PROCESO'
 * 3. Validar que no hay cancelación previa en curso
 * 4. Actualizar CANCELACION_SOLICITADA = 'S'
 * 5. Registrar FECHA_SOLICITUD_CANCELACION
 * 6. Registrar USUARIO_SOLICITA_CANCELACION
 * 7. Registrar en AUDITORIA_APROBACION (ACCION='CANCELACION_SOLICITADA')
 * 8. Retornar resultado
 * 
 * COBERTURA:
 * - HU-12: Cancelación solicitada
 * - RF-32: Auditoría de decisión
 * - RNF-05: Auditoría completa
 */

CREATE PROCEDURE PORTAL_PRECIOS.sp_solicitar_cancelacion (
    @ID_SOLICITUD INT,
    @USUARIO_EMAIL VARCHAR(120),
    @USUARIO_NOMBRE VARCHAR(120),
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

    BEGIN TRY
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
        -- VALIDACIÓN 2: Estado es 'ENVIADA' o 'EN_PROCESO'
        -- ============================================================================================
        SELECT @v_estado = ESTADO, @v_cancelacion_solicitada = CANCELACION_SOLICITADA
        FROM PORTAL_PRECIOS.SOLICITUD
        WHERE ID_SOLICITUD = @ID_SOLICITUD;

        IF @v_estado NOT IN ('ENVIADA', 'EN_PROCESO')
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'La solicitud no puede ser cancelada en estado ''' + @v_estado + '''. Solo se permite en ENVIADA o EN_PROCESO.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- VALIDACIÓN 3: No hay cancelación previa en curso
        -- ============================================================================================
        IF @v_cancelacion_solicitada = 'S'
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'Ya existe una solicitud de cancelación en curso para esta solicitud.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- PASO 1: Actualizar CANCELACION_SOLICITADA = 'S'
        -- ============================================================================================
        UPDATE PORTAL_PRECIOS.SOLICITUD
        SET 
            CANCELACION_SOLICITADA = 'S',
            FECHA_SOLICITUD_CANCELACION = @v_fecha_actual,
            USUARIO_SOLICITA_CANCELACION = @USUARIO_EMAIL,
            FECHA_MODIFICACION = @v_fecha_actual
        WHERE ID_SOLICITUD = @ID_SOLICITUD;

        IF @@ROWCOUNT = 0
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'No se pudo actualizar CANCELACION_SOLICITADA.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- PASO 2: Registrar en AUDITORIA_APROBACION (HU-12, RNF-05)
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
            'CANCELACION_SOLICITADA',
            @v_estado,
            @v_estado,  -- El estado no cambia hasta que se confirme
            'Usuario solicitó cancelación de la solicitud',
            'PENDIENTE'
        );

        SET @v_id_auditoria = @@IDENTITY;

        -- ============================================================================================
        -- ÉXITO: Retornar resultado positivo
        -- ============================================================================================
        SET @P_RESULTADO = 'EXITOSO';
        SET @P_MENSAJE = 'Solicitud de cancelación registrada. Pendiente de confirmación por aprobador.';
        SET @P_ID_AUDITORIA = @v_id_auditoria;

    END TRY
    BEGIN CATCH
        -- ============================================================================================
        -- MANEJO DE ERRORES
        -- ============================================================================================
        SET @v_error_message = ERROR_MESSAGE();
        
        SET @P_RESULTADO = 'ERROR';
        SET @P_MENSAJE = 'Error al solicitar cancelación: ' + @v_error_message;
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
PRINT '✅ sp_solicitar_cancelacion creado exitosamente';
PRINT '';
PRINT 'Cobertura:';
PRINT '  - HU-12: Cancelación solicitada ✅';
PRINT '  - RF-32: Auditoría de decisión ✅';
PRINT '  - RNF-05: Auditoría completa ✅';
PRINT '';
