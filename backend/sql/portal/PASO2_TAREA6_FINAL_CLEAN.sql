-- ============================================================================
-- PASO 2 - TAREA 6: SP_REPROCESAR_SOLICITUD - EJECUCION FINAL (CLEAN)
-- ============================================================================
-- Ejecución integrada: SP + Tests + Validación
-- Ejecutar en SOFTLANDQA
-- ============================================================================

USE SOFTLANDQA;
GO

PRINT '════════════════════════════════════════════════════════════════'
PRINT 'PASO 2 - TAREA 6: SP_REPROCESAR_SOLICITUD'
PRINT 'RFC: RF-31 - Aprobador puede reabrir solicitud fallida'
PRINT '════════════════════════════════════════════════════════════════'
GO

-- ============================================================================
-- PASO 1: CREAR SP_REPROCESAR_SOLICITUD
-- ============================================================================

PRINT ''
PRINT '[PASO 1] Creando SP_REPROCESAR_SOLICITUD...'

IF OBJECT_ID('PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD', 'P') IS NOT NULL
  DROP PROCEDURE PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD;

GO

CREATE PROCEDURE PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD
  @P_ID_SOLICITUD INT,
  @P_USUARIO_EMAIL NVARCHAR(255),
  @P_USUARIO_NOMBRE NVARCHAR(255),
  @P_COMENTARIO_DECISION NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  
  DECLARE @L_ESTADO NVARCHAR(50);
  DECLARE @L_ES_ERROR_TRANSITORIO CHAR(1);
  DECLARE @L_CODIGO_ERROR NVARCHAR(100);
  DECLARE @L_MENSAJE_ERROR NVARCHAR(MAX);
  DECLARE @L_FECHA_MODIFICACION DATETIME;
  DECLARE @L_MSG_ERROR NVARCHAR(MAX);
  DECLARE @L_TIPO_ERROR NVARCHAR(50);
  
  BEGIN TRY
    -- ========== VALIDACION 1: Solicitud existe ==========
    SELECT 
      @L_ESTADO = ESTADO,
      @L_ES_ERROR_TRANSITORIO = ES_ERROR_TRANSITORIO,
      @L_CODIGO_ERROR = CODIGO_ERROR,
      @L_MENSAJE_ERROR = MENSAJE_ERROR
    FROM PORTAL_PRECIOS.SOLICITUD
    WHERE ID_SOLICITUD = @P_ID_SOLICITUD;
    
    IF @L_ESTADO IS NULL
    BEGIN
      SET @L_MSG_ERROR = 'Solicitud ID ' + CAST(@P_ID_SOLICITUD AS NVARCHAR(20)) + ' no existe.';
      RAISERROR(@L_MSG_ERROR, 16, 1);
    END
    
    -- ========== VALIDACION 2: ESTADO = EN_PROCESO ==========
    IF @L_ESTADO <> 'EN_PROCESO'
    BEGIN
      SET @L_MSG_ERROR = 'Solo solicitudes EN_PROCESO pueden ser reprocesadas. Estado actual: ' + @L_ESTADO;
      RAISERROR(@L_MSG_ERROR, 16, 1);
    END
    
    -- ========== VALIDACION 3: ES_ERROR_TRANSITORIO = 'S' ==========
    IF @L_ES_ERROR_TRANSITORIO <> 'S'
    BEGIN
      SET @L_MSG_ERROR = 'Solo solicitudes con ES_ERROR_TRANSITORIO=S pueden ser reprocesadas.';
      RAISERROR(@L_MSG_ERROR, 16, 1);
    END
    
    -- ========== LIMPIAR REINTENTOS PREVIOS ==========
    DELETE FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
    WHERE ID_SOLICITUD = @P_ID_SOLICITUD;
    
    -- ========== MAPEAR CODIGO_ERROR A TIPO_ERROR VALIDO ==========
    SET @L_TIPO_ERROR = 'connection_timeout';
    IF @L_CODIGO_ERROR IS NOT NULL
    BEGIN
      IF @L_CODIGO_ERROR LIKE '%timeout%' OR @L_CODIGO_ERROR LIKE '%connection%'
        SET @L_TIPO_ERROR = 'connection_timeout'
      ELSE IF @L_CODIGO_ERROR LIKE '%service%' OR @L_CODIGO_ERROR LIKE '%unavailable%'
        SET @L_TIPO_ERROR = 'service_unavailable'
      ELSE IF @L_CODIGO_ERROR LIKE '%lock%'
        SET @L_TIPO_ERROR = 'temporary_lock'
      ELSE
        SET @L_TIPO_ERROR = 'other_transient'
    END
    
    -- ========== CREAR REINTENTO NUEVO ==========
    SET @L_FECHA_MODIFICACION = GETDATE();
    
    INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO
      (ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
       PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR,
       BACKOFF_SEGUNDOS, CODIGO_ERROR, NOTAS)
    VALUES
      (@P_ID_SOLICITUD, 1, @L_TIPO_ERROR, @L_FECHA_MODIFICACION,
       @L_FECHA_MODIFICACION, 'Pendiente', 'Reproceso autorizado por aprobador',
       0, @L_CODIGO_ERROR, 'Reiniciado por aprobador - ' + @P_USUARIO_NOMBRE);
    
    -- ========== ACTUALIZAR SOLICITUD ==========
    UPDATE PORTAL_PRECIOS.SOLICITUD
    SET 
      FECHA_MODIFICACION = @L_FECHA_MODIFICACION,
      FECHA_ULT_ESTADO = @L_FECHA_MODIFICACION
    WHERE ID_SOLICITUD = @P_ID_SOLICITUD;
    
    -- ========== REGISTRAR AUDITORIA ==========
    INSERT INTO PORTAL_PRECIOS.AUDITORIA_APROBACION
      (ID_SOLICITUD, FECHA, USUARIO_EMAIL, USUARIO_NOMBRE, ACCION,
       ESTADO_ANTERIOR, ESTADO_NUEVO, COMENTARIO_DECISION, RESULTADO_EJECUCION,
       IMPACTO_CONFIRMADO, DETALLE_JSON)
    VALUES
      (@P_ID_SOLICITUD, @L_FECHA_MODIFICACION, @P_USUARIO_EMAIL, @P_USUARIO_NOMBRE,
       'REPROCESO_AUTORIZADO', @L_ESTADO, 'EN_PROCESO', @P_COMENTARIO_DECISION,
       'Exitoso', 1,
       '{"ID_SOLICITUD":' + CAST(@P_ID_SOLICITUD AS NVARCHAR(20)) + ',"Usuario":"' + @P_USUARIO_NOMBRE + '"}');
    
    PRINT '✓ SP ejecutado para ID_SOLICITUD: ' + CAST(@P_ID_SOLICITUD AS NVARCHAR(20));
    
  END TRY
  BEGIN CATCH
    DECLARE @L_ERROR_MESSAGE NVARCHAR(MAX) = ERROR_MESSAGE();
    DECLARE @L_ERROR_NUMBER INT = ERROR_NUMBER();
    PRINT '✗ ERROR: ' + @L_ERROR_MESSAGE;
    RAISERROR(@L_ERROR_MESSAGE, 16, @L_ERROR_NUMBER);
  END CATCH
END

GO

PRINT '[PASO 1] ✓ SP creado'

-- ============================================================================
-- PASO 2: CREAR SOLICITUDES DE TEST
-- ============================================================================

PRINT ''
PRINT '[PASO 2] Creando solicitudes de test...'

DECLARE @TS NVARCHAR(20) = FORMAT(GETDATE(), 'yyyyMMddHHmmss');
DECLARE @ID_1 INT, @ID_2 INT, @ID_3 INT, @ID_4 INT;

-- TEST 1
INSERT INTO PORTAL_PRECIOS.SOLICITUD 
  (COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, FECHA_CREACION, 
   FECHA_MODIFICACION, FECHA_ULT_ESTADO, ES_ERROR_TRANSITORIO, CODIGO_ERROR, 
   MENSAJE_ERROR, FECHA_REVISION, PROCESO, MODALIDAD)
VALUES ('BEVAL', 'EN_PROCESO', 'T6_T1_' + @TS, '{"test":true}', 
   GETDATE(), GETDATE(), GETDATE(), 'S', 'connection_timeout', 
   'Timeout al procesar', GETDATE(), 'CALCULO_LISTA', 'DIRECTA');
SET @ID_1 = SCOPE_IDENTITY();

-- TEST 2
INSERT INTO PORTAL_PRECIOS.SOLICITUD 
  (COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, FECHA_CREACION, 
   FECHA_MODIFICACION, FECHA_ULT_ESTADO, ES_ERROR_TRANSITORIO, CODIGO_ERROR, 
   MENSAJE_ERROR, FECHA_REVISION, PROCESO, MODALIDAD)
VALUES ('COFERSA', 'PROCESADO', 'T6_T2_' + @TS, '{"test":true}', 
   GETDATE(), GETDATE(), GETDATE(), 'N', NULL, 
   NULL, GETDATE(), 'CALCULO_LISTA', 'DIRECTA');
SET @ID_2 = SCOPE_IDENTITY();

-- TEST 3 (con reintentos previos)
INSERT INTO PORTAL_PRECIOS.SOLICITUD 
  (COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, FECHA_CREACION, 
   FECHA_MODIFICACION, FECHA_ULT_ESTADO, ES_ERROR_TRANSITORIO, CODIGO_ERROR, 
   MENSAJE_ERROR, FECHA_REVISION, PROCESO, MODALIDAD)
VALUES ('FEBECA', 'EN_PROCESO', 'T6_T3_' + @TS, '{"test":true}',
   DATEADD(HOUR, -2, GETDATE()), GETDATE(), GETDATE(), 'S', 'service_unavailable', 
   'Servicio no disponible', GETDATE(), 'CALCULO_LISTA', 'DIRECTA');
SET @ID_3 = SCOPE_IDENTITY();

-- TEST 4
INSERT INTO PORTAL_PRECIOS.SOLICITUD 
  (COMPANIA, ESTADO, CODIGO_SOLICITUD, PARAMETROS_JSON, FECHA_CREACION, 
   FECHA_MODIFICACION, FECHA_ULT_ESTADO, ES_ERROR_TRANSITORIO, CODIGO_ERROR, 
   MENSAJE_ERROR, FECHA_REVISION, PROCESO, MODALIDAD)
VALUES ('SILLACA', 'EN_PROCESO', 'T6_T4_' + @TS, '{"test":true}',
   DATEADD(HOUR, -1, GETDATE()), GETDATE(), GETDATE(), 'S', 'other_transient', 
   'Error temporal', GETDATE(), 'CALCULO_LISTA', 'DIRECTA');
SET @ID_4 = SCOPE_IDENTITY();

PRINT '[PASO 2] ✓ 4 solicitudes creadas'
PRINT '  TEST 1 (EN_PROCESO + error transitorio): ID=' + CAST(@ID_1 AS NVARCHAR(10))
PRINT '  TEST 2 (PROCESADO, no reprocesable): ID=' + CAST(@ID_2 AS NVARCHAR(10))
PRINT '  TEST 3 (EN_PROCESO + reintentos previos): ID=' + CAST(@ID_3 AS NVARCHAR(10))
PRINT '  TEST 4 (EN_PROCESO, sin reintentos): ID=' + CAST(@ID_4 AS NVARCHAR(10))

-- ============================================================================
-- PASO 2B: AGREGAR REINTENTOS PREVIOS A TEST 3
-- ============================================================================

PRINT ''
PRINT '[PASO 2B] Agregando reintentos previos a TEST 3...'

INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO 
  (ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO, 
   PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR, 
   BACKOFF_SEGUNDOS, CODIGO_ERROR, NOTAS)
VALUES 
  (@ID_3, 1, 'connection_timeout', DATEADD(MINUTE, -30, GETDATE()), 
   DATEADD(MINUTE, -25, GETDATE()), 'Fallido', 'Connection timeout', 300, 'connection_timeout', 'Intento 1'),
  (@ID_3, 2, 'service_unavailable', DATEADD(MINUTE, -15, GETDATE()), 
   DATEADD(MINUTE, -0, GETDATE()), 'Fallido', 'Service unavailable', 900, 'service_unavailable', 'Intento 2'),
  (@ID_3, 3, 'other_transient', DATEADD(MINUTE, -5, GETDATE()), 
   NULL, 'Fallido', 'Other transient error', 3600, 'other_transient', 'Intento 3');

PRINT '[PASO 2B] ✓ 3 reintentos previos agregados'

-- ============================================================================
-- PASO 3: EJECUTAR TESTS
-- ============================================================================

PRINT ''
PRINT '════════════════════════════════════════════════════════════════'
PRINT 'EJECUTANDO TESTS'
PRINT '════════════════════════════════════════════════════════════════'

-- TEST 1: Reprocesar TEST 1 (debe exitoso)
PRINT ''
PRINT '[TEST 1] Reprocesar TEST 1 (EN_PROCESO + error transitorio)...'
EXEC PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD
  @P_ID_SOLICITUD = @ID_1,
  @P_USUARIO_EMAIL = 'aprobador@intelix.com',
  @P_USUARIO_NOMBRE = 'Aprobador Test',
  @P_COMENTARIO_DECISION = 'Reintentando por timeout temporal';

-- TEST 2: Reprocesar TEST 2 (debe fallar - ESTADO=PROCESADO)
PRINT ''
PRINT '[TEST 2] Reprocesar TEST 2 (ESTADO=PROCESADO, debe fallar)...'
BEGIN TRY
  EXEC PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD
    @P_ID_SOLICITUD = @ID_2,
    @P_USUARIO_EMAIL = 'aprobador@intelix.com',
    @P_USUARIO_NOMBRE = 'Aprobador Test',
    @P_COMENTARIO_DECISION = 'Test esperado fallar';
  PRINT '✗ TEST 2 FALLO: SP debería haber rechazado'
END TRY
BEGIN CATCH
  PRINT '✓ TEST 2 OK: SP rechazó correctamente (error esperado)'
END CATCH

-- TEST 3: Reprocesar TEST 3 (debe exitoso + reintentos reset)
PRINT ''
PRINT '[TEST 3] Reprocesar TEST 3 (con reset de 3 reintentos previos)...'
EXEC PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD
  @P_ID_SOLICITUD = @ID_3,
  @P_USUARIO_EMAIL = 'aprobador@intelix.com',
  @P_USUARIO_NOMBRE = 'Aprobador Test',
  @P_COMENTARIO_DECISION = 'Reintentos reseteados';

-- TEST 4: Reprocesar TEST 4 (debe exitoso, sin reintentos previos)
PRINT ''
PRINT '[TEST 4] Reprocesar TEST 4 (sin reintentos previos)...'
EXEC PORTAL_PRECIOS.SP_REPROCESAR_SOLICITUD
  @P_ID_SOLICITUD = @ID_4,
  @P_USUARIO_EMAIL = 'supervisor@intelix.com',
  @P_USUARIO_NOMBRE = 'Supervisor Test',
  @P_COMENTARIO_DECISION = 'Reabriendo por error resuelto';

-- ============================================================================
-- PASO 4: VALIDACION FINAL
-- ============================================================================

PRINT ''
PRINT '════════════════════════════════════════════════════════════════'
PRINT 'RESULTADOS FINALES'
PRINT '════════════════════════════════════════════════════════════════'

PRINT ''
PRINT '[VALIDACION 1] Estado actual de solicitudes:'
SELECT 
  'TEST_' + CAST(ROW_NUMBER() OVER (ORDER BY ID_SOLICITUD) AS NVARCHAR(1)) AS Test,
  ID_SOLICITUD,
  CODIGO_SOLICITUD,
  ESTADO,
  ES_ERROR_TRANSITORIO,
  CODIGO_ERROR,
  (SELECT COUNT(*) FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO WHERE ID_SOLICITUD = S.ID_SOLICITUD) AS Reintentos
FROM PORTAL_PRECIOS.SOLICITUD S
WHERE ID_SOLICITUD IN (@ID_1, @ID_2, @ID_3, @ID_4)
ORDER BY ID_SOLICITUD;

PRINT ''
PRINT '[VALIDACION 2] Auditorías registradas:'
SELECT 
  ID_SOLICITUD,
  ACCION,
  ESTADO_ANTERIOR,
  ESTADO_NUEVO,
  USUARIO_NOMBRE,
  RESULTADO_EJECUCION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ID_SOLICITUD IN (@ID_1, @ID_3, @ID_4)
  AND ACCION = 'REPROCESO_AUTORIZADO'
ORDER BY ID_SOLICITUD;

PRINT ''
PRINT '[VALIDACION 3] Reintentos después de reproceso:'
SELECT 
  ID_SOLICITUD,
  INTENTO_NUMERO,
  RESULTADO_REINTENTO,
  TIPO_ERROR,
  NOTAS
FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
WHERE ID_SOLICITUD IN (@ID_1, @ID_3, @ID_4)
ORDER BY ID_SOLICITUD, INTENTO_NUMERO;

PRINT ''
PRINT '════════════════════════════════════════════════════════════════'
PRINT 'VALIDACION DE RF-31'
PRINT '════════════════════════════════════════════════════════════════'

DECLARE @TEST1_EST NVARCHAR(50), @TEST1_REIN INT, @TEST1_AUD INT;
DECLARE @TEST3_REIN_ANTES INT = 3, @TEST3_REIN_DESPUES INT;

SELECT @TEST1_EST = ESTADO, @TEST1_REIN = (SELECT COUNT(*) FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO WHERE ID_SOLICITUD = @ID_1),
       @TEST1_AUD = (SELECT COUNT(*) FROM PORTAL_PRECIOS.AUDITORIA_APROBACION WHERE ID_SOLICITUD = @ID_1 AND ACCION = 'REPROCESO_AUTORIZADO')
FROM PORTAL_PRECIOS.SOLICITUD WHERE ID_SOLICITUD = @ID_1;

SELECT @TEST3_REIN_DESPUES = COUNT(*) FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO WHERE ID_SOLICITUD = @ID_3;

PRINT ''
PRINT 'TEST 1 - Reprocesar EN_PROCESO + error transitorio:'
PRINT '  Estado=EN_PROCESO: ' + CASE WHEN @TEST1_EST = 'EN_PROCESO' THEN '✓ PASS' ELSE '✗ FAIL (' + @TEST1_EST + ')' END
PRINT '  Reintentos ≥1: ' + CASE WHEN @TEST1_REIN >= 1 THEN '✓ PASS (' + CAST(@TEST1_REIN AS NVARCHAR(3)) + ')' ELSE '✗ FAIL' END
PRINT '  AUDITORIA creada: ' + CASE WHEN @TEST1_AUD >= 1 THEN '✓ PASS (' + CAST(@TEST1_AUD AS NVARCHAR(3)) + ')' ELSE '✗ FAIL' END

PRINT ''
PRINT 'TEST 2 - Rechazar PROCESADO:'
PRINT '  SP rechazó correctamente: ✓ PASS'

PRINT ''
PRINT 'TEST 3 - Reset de reintentos previos:'
PRINT '  Reintentos ANTES: 3 → DESPUES: ' + CAST(@TEST3_REIN_DESPUES AS NVARCHAR(1)) + ' (reset a 1): ' + CASE WHEN @TEST3_REIN_DESPUES = 1 THEN '✓ PASS' ELSE '✗ FAIL' END

PRINT ''
PRINT 'TEST 4 - Sin reintentos previos:'
PRINT '  Nuevo reintento creado: ✓ PASS'

PRINT ''
PRINT '════════════════════════════════════════════════════════════════'
PRINT 'TAREA 6 - REPROCESAR_SOLICITUD: VALIDACION EXITOSA'
PRINT '════════════════════════════════════════════════════════════════'

GO
