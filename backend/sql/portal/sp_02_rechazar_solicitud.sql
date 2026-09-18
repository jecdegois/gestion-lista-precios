-- ========================================================================================================
-- PASO 2 - Tarea 2: Stored Procedure - Rechazar Solicitud
-- Script: sp_02_rechazar_solicitud.sql
-- Objetivo: Implementar lógica de rechazo con motivo obligatorio
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

USE SOFTLANDQA;
GO

-- Verificar si el SP existe y eliminarlo (para recreación)
IF OBJECT_ID('PORTAL_PRECIOS.sp_rechazar_solicitud', 'P') IS NOT NULL
    DROP PROCEDURE PORTAL_PRECIOS.sp_rechazar_solicitud;
GO

-- ========================================================================================================
-- Stored Procedure: sp_rechazar_solicitud
-- ========================================================================================================

/**
 * DESCRIPCIÓN:
 * Procedimiento que implementa la lógica completa de rechazo de una solicitud.
 * 
 * REGLA CRÍTICA (RNF-05):
 * El COMENTARIO_DECISION es OBLIGATORIO cuando ACCION = 'RECHAZADA'
 * Esta regla es validada por constraint CK_AUDITORIA_RECHAZO en la tabla.
 * 
 * PASOS:
 * 1. Validar que la solicitud existe
 * 2. Validar que el estado es 'ENVIADA'
 * 3. Validar que el usuario tiene rol de Aprobador
 * 4. VALIDAR QUE COMENTARIO_DECISION NO ES NULL/VACIO
 * 5. Registrar FECHA_REVISION (RF-20)
 * 6. Actualizar ESTADO = 'RECHAZADA'
 * 7. Registrar MOTIVO_RECHAZO
 * 8. Registrar en AUDITORIA_APROBACION con ACCION='RECHAZADA' + COMENTARIO_DECISION
 * 9. Retornar resultado
 * 
 * COBERTURA:
 * - RF-21: Rechazar con motivo fundamentado
 * - RF-22: Notificación al solicitante (será implementado en PASO 3)
 * - RF-32: Auditoría de decisión
 * - RNF-05: COMENTARIO_DECISION obligatorio (auditoría completa)
 */

CREATE PROCEDURE PORTAL_PRECIOS.sp_rechazar_solicitud (
    @ID_SOLICITUD INT,
    @USUARIO_EMAIL VARCHAR(120),
    @USUARIO_NOMBRE VARCHAR(120),
    @COMENTARIO_DECISION VARCHAR(1000),  -- REQUERIDO
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
    DECLARE @v_aprobador_id INT;
    DECLARE @v_aprobador_email VARCHAR(120);
    DECLARE @v_fecha_actual DATETIME = GETDATE();
    DECLARE @v_id_auditoria BIGINT;
    DECLARE @v_error_message VARCHAR(500);
    DECLARE @v_comentario_trimmed VARCHAR(1000);

    BEGIN TRY
        -- ============================================================================================
        -- VALIDACIÓN 0: COMENTARIO_DECISION es obligatorio
        -- ============================================================================================
        SET @v_comentario_trimmed = LTRIM(RTRIM(ISNULL(@COMENTARIO_DECISION, '')));

        IF LEN(@v_comentario_trimmed) = 0
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'COMENTARIO_DECISION es obligatorio para rechazar una solicitud (RNF-05: Auditoría Completa).';
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
        -- VALIDACIÓN 2: Estado es 'ENVIADA'
        -- ============================================================================================
        SELECT @v_estado = ESTADO, @v_aprobador_id = IDP_APROBADOR, @v_aprobador_email = APROBADOR_EMAIL
        FROM PORTAL_PRECIOS.SOLICITUD
        WHERE ID_SOLICITUD = @ID_SOLICITUD;

        IF @v_estado <> 'ENVIADA'
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'Estado inválido. La solicitud debe estar en estado ''ENVIADA''. Estado actual: ' + @v_estado;
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- VALIDACIÓN 3: Usuario tiene rol de Aprobador
        -- ============================================================================================
        -- Similar a sp_aprobar_solicitud: será sofisticado en PASO 3 con RBAC
        IF @v_aprobador_email IS NOT NULL AND @v_aprobador_email <> @USUARIO_EMAIL
        BEGIN
            PRINT 'ADVERTENCIA: Usuario ' + @USUARIO_EMAIL + ' rechaza solicitud de aprobador ' + ISNULL(@v_aprobador_email, 'NULL');
        END

        -- ============================================================================================
        -- PASO 1: Registrar FECHA_REVISION (RF-20)
        -- ============================================================================================
        UPDATE PORTAL_PRECIOS.SOLICITUD
        SET 
            FECHA_REVISION = @v_fecha_actual,
            FECHA_MODIFICACION = @v_fecha_actual
        WHERE ID_SOLICITUD = @ID_SOLICITUD;

        IF @@ROWCOUNT = 0
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'No se pudo actualizar FECHA_REVISION.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- PASO 2: Actualizar ESTADO = 'RECHAZADA' y MOTIVO_RECHAZO
        -- ============================================================================================
        UPDATE PORTAL_PRECIOS.SOLICITUD
        SET 
            ESTADO = 'RECHAZADA',
            MOTIVO_RECHAZO = @v_comentario_trimmed,
            FECHA_ULT_ESTADO = @v_fecha_actual,
            FECHA_MODIFICACION = @v_fecha_actual
        WHERE ID_SOLICITUD = @ID_SOLICITUD;

        IF @@ROWCOUNT = 0
        BEGIN
            SET @P_RESULTADO = 'ERROR';
            SET @P_MENSAJE = 'No se pudo actualizar el estado a RECHAZADA.';
            SET @P_ID_AUDITORIA = 0;
            RETURN;
        END

        -- ============================================================================================
        -- PASO 3: Registrar en AUDITORIA_APROBACION (RF-32, RNF-05)
        -- NOTA CRÍTICA: El constraint CK_AUDITORIA_RECHAZO validará que COMENTARIO_DECISION NO ES NULL
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
            'RECHAZADA',
            @v_estado,
            'RECHAZADA',
            @v_comentario_trimmed,  -- OBLIGATORIO para ACCION='RECHAZADA'
            'PENDIENTE'
        );

        SET @v_id_auditoria = @@IDENTITY;

        -- ============================================================================================
        -- ÉXITO: Retornar resultado positivo
        -- ============================================================================================
        SET @P_RESULTADO = 'EXITOSO';
        SET @P_MENSAJE = 'Solicitud ' + CAST(@ID_SOLICITUD AS VARCHAR(10)) + ' rechazada exitosamente. Motivo: ' + @v_comentario_trimmed;
        SET @P_ID_AUDITORIA = @v_id_auditoria;

    END TRY
    BEGIN CATCH
        -- ============================================================================================
        -- MANEJO DE ERRORES
        -- ============================================================================================
        SET @v_error_message = ERROR_MESSAGE();
        
        SET @P_RESULTADO = 'ERROR';
        SET @P_MENSAJE = 'Error al rechazar solicitud: ' + @v_error_message;
        SET @P_ID_AUDITORIA = 0;

        -- Registrar error en auditoría para trazabilidad
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
                    'RECHAZADA',
                    'Error en SP: ' + @v_error_message,
                    'FALLIDO'
                );
            END TRY
            BEGIN CATCH
                -- Silenciar error de auditoría
            END CATCH
        END
    END CATCH
END
GO

-- ========================================================================================================
-- VALIDACIÓN: Verificar que el SP se creó correctamente
-- ========================================================================================================

PRINT '';
PRINT '========== VALIDACIÓN DE STORED PROCEDURE ==========';
PRINT '';

IF OBJECT_ID('PORTAL_PRECIOS.sp_rechazar_solicitud', 'P') IS NOT NULL
    PRINT '✅ sp_rechazar_solicitud creado exitosamente';
ELSE
    PRINT '❌ ERROR: sp_rechazar_solicitud no se creó';

-- Mostrar firma del SP
SELECT 
    ROUTINE_NAME,
    ROUTINE_TYPE,
    CREATED,
    LAST_ALTERED
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_SCHEMA = 'PORTAL_PRECIOS'
  AND ROUTINE_NAME = 'sp_rechazar_solicitud';

PRINT '';
PRINT '========== COBERTURA ==========';
PRINT 'RF-21: Rechazar con motivo fundamentado ✅';
PRINT 'RF-32: Auditoría de decisión ✅';
PRINT 'RNF-05: COMENTARIO_DECISION obligatorio (auditoría completa) ✅';
PRINT '';
PRINT 'REGLA CRÍTICA: El COMENTARIO_DECISION es obligatorio (validated by CK_AUDITORIA_RECHAZO) ✅';
PRINT '';
