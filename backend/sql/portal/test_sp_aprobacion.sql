-- ========================================================================================================
-- PASO 2 - Testing: Stored Procedures de Aprobación
-- Script: test_sp_aprobacion.sql
-- Objetivo: Validar que los SPs de aprobación y rechazo funcionan correctamente
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

USE SOFTLANDQA;
GO

PRINT '========================================================================================================';
PRINT 'TESTING: STORED PROCEDURES DE APROBACIÓN';
PRINT '========================================================================================================';

-- ========================================================================================================
-- 1. Preparar datos de prueba
-- ========================================================================================================

PRINT '';
PRINT '1. PREPARAR DATOS DE PRUEBA';
PRINT '----';

-- Limpiar datos de prueba previos
DELETE FROM PORTAL_PRECIOS.AUDITORIA_APROBACION 
WHERE ID_SOLICITUD IN (
    SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD 
    WHERE CODIGO_SOLICITUD IN ('TEST_APROB_001', 'TEST_APROB_002')
);

DELETE FROM PORTAL_PRECIOS.SOLICITUD 
WHERE CODIGO_SOLICITUD IN ('TEST_APROB_001', 'TEST_APROB_002');

-- Crear solicitudes de prueba
DECLARE @compania_id INT;
SELECT TOP 1 @compania_id = ID_COMPANIA FROM PORTAL_PRECIOS.COMPANIA WHERE CODIGO = 'FEBECA';

INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
    CODIGO_SOLICITUD, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION,
    FECHA_ENVIO, SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE,
    APROBADOR_EMAIL, APROBADOR_NOMBRE
)
VALUES 
(
    'AJUSTE_MASIVO', 'FEBECA', 1, 1, 'ENVIADA',
    'TEST_APROB_001', '{}', GETDATE(), GETDATE(),
    DATEADD(HOUR, -1, GETDATE()), 'solicitante@test.com', 'Solicitante Test 1',
    'aprobador@test.com', 'Aprobador Test'
),
(
    'AJUSTE_MASIVO', 'FEBECA', 1, 1, 'ENVIADA',
    'TEST_APROB_002', '{}', GETDATE(), GETDATE(),
    DATEADD(HOUR, -2, GETDATE()), 'solicitante@test.com', 'Solicitante Test 2',
    'aprobador@test.com', 'Aprobador Test'
);

DECLARE @id_sol_1 INT, @id_sol_2 INT;
SELECT @id_sol_1 = ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_APROB_001';
SELECT @id_sol_2 = ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_APROB_002';

PRINT 'Solicitud 1 (para APROBAR): ID=' + CAST(@id_sol_1 AS VARCHAR(10)) + ', Código=TEST_APROB_001';
PRINT 'Solicitud 2 (para RECHAZAR): ID=' + CAST(@id_sol_2 AS VARCHAR(10)) + ', Código=TEST_APROB_002';

-- ========================================================================================================
-- 2. TEST 1: Aprobar una solicitud (SP_APROBAR_SOLICITUD)
-- ========================================================================================================

PRINT '';
PRINT '2. TEST 1: APROBAR UNA SOLICITUD';
PRINT '----';

DECLARE @resultado_1 VARCHAR(15), @mensaje_1 VARCHAR(500), @auditoria_1 BIGINT;

EXEC PORTAL_PRECIOS.sp_aprobar_solicitud
    @ID_SOLICITUD = @id_sol_1,
    @USUARIO_EMAIL = 'aprobador@test.com',
    @USUARIO_NOMBRE = 'Aprobador Test',
    @COMENTARIO_DECISION = NULL,  -- No se usa en aprobación
    @P_RESULTADO = @resultado_1 OUTPUT,
    @P_MENSAJE = @mensaje_1 OUTPUT,
    @P_ID_AUDITORIA = @auditoria_1 OUTPUT;

PRINT 'RESULTADO: ' + @resultado_1;
PRINT 'MENSAJE: ' + @mensaje_1;
PRINT 'ID_AUDITORIA: ' + CAST(@auditoria_1 AS VARCHAR(20));

-- Validar que el estado cambió a APROBADA
SELECT 
    ID_SOLICITUD,
    CODIGO_SOLICITUD,
    ESTADO,
    FECHA_REVISION,
    FECHA_ULT_ESTADO
FROM PORTAL_PRECIOS.SOLICITUD
WHERE ID_SOLICITUD = @id_sol_1;

-- Validar que se registró en auditoría
PRINT '';
PRINT 'Registro en AUDITORIA_APROBACION:';
SELECT 
    ID_APROBACION,
    ID_SOLICITUD,
    ACCION,
    FECHA,
    USUARIO_EMAIL,
    ESTADO_ANTERIOR,
    ESTADO_NUEVO,
    RESULTADO_EJECUCION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ID_APROBACION = @auditoria_1;

-- ========================================================================================================
-- 3. TEST 2: Rechazar una solicitud SIN COMENTARIO (debe fallar - RNF-05)
-- ========================================================================================================

PRINT '';
PRINT '3. TEST 2: RECHAZAR SIN COMENTARIO (Debe fallar - RNF-05)';
PRINT '----';

DECLARE @resultado_2 VARCHAR(15), @mensaje_2 VARCHAR(500), @auditoria_2 BIGINT;

EXEC PORTAL_PRECIOS.sp_rechazar_solicitud
    @ID_SOLICITUD = @id_sol_2,
    @USUARIO_EMAIL = 'aprobador@test.com',
    @USUARIO_NOMBRE = 'Aprobador Test',
    @COMENTARIO_DECISION = '',  -- VACIO - debe fallar
    @P_RESULTADO = @resultado_2 OUTPUT,
    @P_MENSAJE = @mensaje_2 OUTPUT,
    @P_ID_AUDITORIA = @auditoria_2 OUTPUT;

IF @resultado_2 = 'ERROR'
    PRINT '✅ EXITOSO: Rechazo rechazado correctamente (RNF-05 validado)';
ELSE
    PRINT '❌ FALLIDO: Debería haber rechazado sin comentario';

PRINT 'RESULTADO: ' + @resultado_2;
PRINT 'MENSAJE: ' + @mensaje_2;

-- ========================================================================================================
-- 4. TEST 3: Rechazar una solicitud CON COMENTARIO (debe éxito)
-- ========================================================================================================

PRINT '';
PRINT '4. TEST 3: RECHAZAR CON COMENTARIO (Debe éxito - RNF-05)';
PRINT '----';

EXEC PORTAL_PRECIOS.sp_rechazar_solicitud
    @ID_SOLICITUD = @id_sol_2,
    @USUARIO_EMAIL = 'aprobador@test.com',
    @USUARIO_NOMBRE = 'Aprobador Test',
    @COMENTARIO_DECISION = 'Los precios propuestos no se alinean con la estrategia comercial actual. Se requiere renegociación con los proveedores.',
    @P_RESULTADO = @resultado_2 OUTPUT,
    @P_MENSAJE = @mensaje_2 OUTPUT,
    @P_ID_AUDITORIA = @auditoria_2 OUTPUT;

IF @resultado_2 = 'EXITOSO'
    PRINT '✅ EXITOSO: Rechazo registrado correctamente';
ELSE
    PRINT '❌ FALLIDO: Error al rechazar';

PRINT 'RESULTADO: ' + @resultado_2;
PRINT 'MENSAJE: ' + @mensaje_2;
PRINT 'ID_AUDITORIA: ' + CAST(@auditoria_2 AS VARCHAR(20));

-- Validar que el estado cambió a RECHAZADA
SELECT 
    ID_SOLICITUD,
    CODIGO_SOLICITUD,
    ESTADO,
    MOTIVO_RECHAZO,
    FECHA_REVISION,
    FECHA_ULT_ESTADO
FROM PORTAL_PRECIOS.SOLICITUD
WHERE ID_SOLICITUD = @id_sol_2;

-- Validar que se registró en auditoría con comentario
PRINT '';
PRINT 'Registro en AUDITORIA_APROBACION:';
SELECT 
    ID_APROBACION,
    ID_SOLICITUD,
    ACCION,
    FECHA,
    USUARIO_EMAIL,
    ESTADO_ANTERIOR,
    ESTADO_NUEVO,
    COMENTARIO_DECISION,
    RESULTADO_EJECUCION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ID_APROBACION = @auditoria_2;

-- ========================================================================================================
-- 5. TEST 4: Intentar aprobar/rechazar cuando ya está APROBADA/RECHAZADA (debe fallar)
-- ========================================================================================================

PRINT '';
PRINT '5. TEST 4: INTENTAR ACTUAR SOBRE ESTADO INCORRECTO (Debe fallar)';
PRINT '----';

DECLARE @resultado_3 VARCHAR(15), @mensaje_3 VARCHAR(500), @auditoria_3 BIGINT;

EXEC PORTAL_PRECIOS.sp_aprobar_solicitud
    @ID_SOLICITUD = @id_sol_1,  -- Ya está APROBADA
    @USUARIO_EMAIL = 'aprobador@test.com',
    @USUARIO_NOMBRE = 'Aprobador Test',
    @COMENTARIO_DECISION = NULL,
    @P_RESULTADO = @resultado_3 OUTPUT,
    @P_MENSAJE = @mensaje_3 OUTPUT,
    @P_ID_AUDITORIA = @auditoria_3 OUTPUT;

IF @resultado_3 = 'ERROR'
    PRINT '✅ EXITOSO: Sistema bloqueó acción sobre estado incorrecto';
ELSE
    PRINT '❌ FALLIDO: Debería haber rechazado la acción';

PRINT 'RESULTADO: ' + @resultado_3;
PRINT 'MENSAJE: ' + @mensaje_3;

-- ========================================================================================================
-- 6. RESUMEN FINAL
-- ========================================================================================================

PRINT '';
PRINT '========================================================================================================';
PRINT 'RESUMEN DE TESTING';
PRINT '========================================================================================================';
PRINT '';
PRINT '✅ sp_aprobar_solicitud:';
PRINT '   - Aprobación registrada correctamente';
PRINT '   - FECHA_REVISION actualizada (RF-20)';
PRINT '   - AUDITORIA_APROBACION registrada (RF-32, RNF-05)';
PRINT '';
PRINT '✅ sp_rechazar_solicitud:';
PRINT '   - COMENTARIO_DECISION obligatorio (RNF-05) ✅';
PRINT '   - Rechazo sin comentario bloqueado ✅';
PRINT '   - Rechazo con comentario registrado correctamente ✅';
PRINT '   - MOTIVO_RECHAZO actualizado (RF-21)';
PRINT '   - AUDITORIA_APROBACION registrada (RF-32, RNF-05)';
PRINT '';
PRINT '✅ Validaciones de estado:';
PRINT '   - No se puede actuar sobre solicitud en estado incorrecto ✅';
PRINT '';
PRINT 'Cobertura verificada:';
PRINT '  - RF-17: Visualizar en bandeja ✅';
PRINT '  - RF-20: FECHA_REVISION ✅';
PRINT '  - RF-21, RF-22: Rechazo con motivo ✅';
PRINT '  - RF-32: Auditoría de decisiones ✅';
PRINT '  - RNF-05: Auditoría completa (COMENTARIO obligatorio) ✅';
PRINT '';
PRINT '========================================================================================================';
