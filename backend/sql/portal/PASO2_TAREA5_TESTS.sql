-- ========================================================================================================
-- TAREA 5: Procesar Reintentos - Tests
-- Script: PASO2_TAREA5_TESTS.sql
-- Objetivo: Crear y ejecutar 5 casos de prueba para sp_procesar_reintentos
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

USE SOFTLANDQA;
GO

PRINT '';
PRINT '========================================================================================================';
PRINT 'TAREA 5: PROCESAR REINTENTOS - TESTS';
PRINT '========================================================================================================';
PRINT '';

-- ========================================================================================================
-- PREPARAR AMBIENTE DE TESTING
-- ========================================================================================================

PRINT '[PREP] Limpiando datos de tests anteriores...';
GO

-- Limpiar datos de test (mantener estructura intacta)
DELETE FROM PORTAL_PRECIOS.AUDITORIA_APROBACION 
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%');

DELETE FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO 
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%');

DELETE FROM PORTAL_PRECIOS.SOLICITUD_DETALLE 
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%');

DELETE FROM PORTAL_PRECIOS.SOLICITUD 
WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_%';

PRINT '[✅] Datos de tests anteriores limpiados';
PRINT '';

-- ========================================================================================================
-- FUNCIÓN AUXILIAR: Crear Solicitud de Test
-- ========================================================================================================

PRINT '[PREP] Creando solicitudes de test...';
GO

DECLARE @v_id_solicitud_1 INT;
DECLARE @v_id_solicitud_2 INT;
DECLARE @v_id_solicitud_3 INT;
DECLARE @v_id_solicitud_4 INT;
DECLARE @v_id_solicitud_5 INT;
DECLARE @v_fecha_actual DATETIME = GETDATE();
DECLARE @v_compania_id INT;

-- Obtener COMPANIA_ID de FEBECA (usado en tests anteriores)
SELECT @v_compania_id = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_STEP2_001';

-- Si no existe, usar la primera compañía disponible
IF @v_compania_id IS NULL
    SELECT TOP 1 @v_compania_id = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD;

-- ========================================================================================================
-- TEST 1: REINTENTO EXITOSO EN INTENTO 1
-- ========================================================================================================

PRINT '[TEST 1] Reintento exitoso en intento 1...';
GO

DECLARE @v_id_sol_test1 INT;
DECLARE @v_compania_test1 INT;
DECLARE @v_fecha_test1 DATETIME = GETDATE();

-- Obtener compañía
SELECT TOP 1 @v_compania_test1 = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD;

-- Crear solicitud en estado EN_PROCESO
INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, IDP_COMPANIA, ESTADO, USUARIO_CREA, FECHA_CREA,
    USUARIO_MODIFICA, FECHA_MODIFICACION, FECHA_ENVIO, FECHA_ULT_ESTADO,
    APROBADOR_EMAIL, COMENTARIO_SOLICITANTE
)
VALUES (
    'TEST_TAREA5_001', @v_compania_test1, 'EN_PROCESO', 'test@test.com', @v_fecha_test1,
    'test@test.com', @v_fecha_test1, @v_fecha_test1, @v_fecha_test1,
    'aprobador@test.com', 'Test 1: Reintento exitoso'
);

SET @v_id_sol_test1 = @@IDENTITY;

-- Crear reintento LISTO PARA PROCESAR (pasado)
INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
    ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
    PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
)
VALUES (
    @v_id_sol_test1, 1, 'TIMEOUT', @v_fecha_test1,
    DATEADD(MINUTE, -10, @v_fecha_test1), NULL, NULL
);

PRINT '  [SETUP] ID_Solicitud=' + CAST(@v_id_sol_test1 AS VARCHAR(10)) + 
      ', INTENTO_NUMERO=1, PROXIMO_REINTENTO_PROGRAMADO=hace 10 minutos';
GO

-- ========================================================================================================
-- TEST 2: REINTENTO FALLA, PROGRAMA SIGUIENTE
-- ========================================================================================================

PRINT '[TEST 2] Reintento falla, programa siguiente...';
GO

DECLARE @v_id_sol_test2 INT;
DECLARE @v_compania_test2 INT;
DECLARE @v_fecha_test2 DATETIME = GETDATE();

SELECT TOP 1 @v_compania_test2 = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD;

INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, IDP_COMPANIA, ESTADO, USUARIO_CREA, FECHA_CREA,
    USUARIO_MODIFICA, FECHA_MODIFICACION, FECHA_ENVIO, FECHA_ULT_ESTADO,
    APROBADOR_EMAIL, COMENTARIO_SOLICITANTE
)
VALUES (
    'TEST_TAREA5_002', @v_compania_test2, 'EN_PROCESO', 'test@test.com', @v_fecha_test2,
    'test@test.com', @v_fecha_test2, @v_fecha_test2, @v_fecha_test2,
    'aprobador@test.com', 'Test 2: Falla transitoria, programa siguiente'
);

SET @v_id_sol_test2 = @@IDENTITY;

INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
    ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
    PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
)
VALUES (
    @v_id_sol_test2, 1, 'DEADLOCK', @v_fecha_test2,
    DATEADD(MINUTE, -5, @v_fecha_test2), NULL, NULL
);

PRINT '  [SETUP] ID_Solicitud=' + CAST(@v_id_sol_test2 AS VARCHAR(10)) + 
      ', INTENTO_NUMERO=1, PROXIMO_REINTENTO_PROGRAMADO=hace 5 minutos';
GO

-- ========================================================================================================
-- TEST 3: AGOTA 3 REINTENTOS, MARCA PERMANENTE
-- ========================================================================================================

PRINT '[TEST 3] Agota 3 reintentos, marca permanente...';
GO

DECLARE @v_id_sol_test3 INT;
DECLARE @v_compania_test3 INT;
DECLARE @v_fecha_test3 DATETIME = GETDATE();

SELECT TOP 1 @v_compania_test3 = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD;

INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, IDP_COMPANIA, ESTADO, USUARIO_CREA, FECHA_CREA,
    USUARIO_MODIFICA, FECHA_MODIFICACION, FECHA_ENVIO, FECHA_ULT_ESTADO,
    APROBADOR_EMAIL, COMENTARIO_SOLICITANTE
)
VALUES (
    'TEST_TAREA5_003', @v_compania_test3, 'EN_PROCESO', 'test@test.com', @v_fecha_test3,
    'test@test.com', @v_fecha_test3, @v_fecha_test3, @v_fecha_test3,
    'aprobador@test.com', 'Test 3: Agota reintentos'
);

SET @v_id_sol_test3 = @@IDENTITY;

INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
    ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
    PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
)
VALUES (
    @v_id_sol_test3, 3, 'CONNECTION_LOST', @v_fecha_test3,
    DATEADD(MINUTE, -1, @v_fecha_test3), NULL, NULL
);

PRINT '  [SETUP] ID_Solicitud=' + CAST(@v_id_sol_test3 AS VARCHAR(10)) + 
      ', INTENTO_NUMERO=3, PROXIMO_REINTENTO_PROGRAMADO=hace 1 minuto';
GO

-- ========================================================================================================
-- TEST 4: ERROR NO-RETRYEABLE, NO REINTENTAR
-- ========================================================================================================

PRINT '[TEST 4] Error no-retryeable, no reintentar...';
GO

DECLARE @v_id_sol_test4 INT;
DECLARE @v_compania_test4 INT;
DECLARE @v_fecha_test4 DATETIME = GETDATE();

SELECT TOP 1 @v_compania_test4 = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD;

INSERT INTO PORTAL_PRECIOS.SOLICITUD (
    CODIGO_SOLICITUD, IDP_COMPANIA, ESTADO, USUARIO_CREA, FECHA_CREA,
    USUARIO_MODIFICA, FECHA_MODIFICACION, FECHA_ENVIO, FECHA_ULT_ESTADO,
    APROBADOR_EMAIL, COMENTARIO_SOLICITANTE
)
VALUES (
    'TEST_TAREA5_004', @v_compania_test4, 'EN_PROCESO', 'test@test.com', @v_fecha_test4,
    'test@test.com', @v_fecha_test4, @v_fecha_test4, @v_fecha_test4,
    'aprobador@test.com', 'Test 4: Error no-retryeable'
);

SET @v_id_sol_test4 = @@IDENTITY;

INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
    ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
    PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
)
VALUES (
    @v_id_sol_test4, 1, 'VALIDATION_ERROR', @v_fecha_test4,
    DATEADD(MINUTE, -2, @v_fecha_test4), NULL, NULL
);

PRINT '  [SETUP] ID_Solicitud=' + CAST(@v_id_sol_test4 AS VARCHAR(10)) + 
      ', INTENTO_NUMERO=1, TIPO_ERROR=VALIDATION_ERROR (no-retryeable)';
GO

-- ========================================================================================================
-- TEST 5: PROCESAR BATCH (10 REINTENTOS: 3 LISTOS, 2 FUTUROS, 5 PROCESADOS)
-- ========================================================================================================

PRINT '[TEST 5] Procesar batch (10 reintentos)...';
GO

DECLARE @v_i INT = 0;
DECLARE @v_id_sol_batch INT;
DECLARE @v_compania_batch INT;
DECLARE @v_fecha_batch DATETIME = GETDATE();

SELECT TOP 1 @v_compania_batch = IDP_COMPANIA FROM PORTAL_PRECIOS.SOLICITUD;

-- Crear 10 solicitudes de batch
WHILE @v_i < 10
BEGIN
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        CODIGO_SOLICITUD, IDP_COMPANIA, ESTADO, USUARIO_CREA, FECHA_CREA,
        USUARIO_MODIFICA, FECHA_MODIFICACION, FECHA_ENVIO, FECHA_ULT_ESTADO,
        APROBADOR_EMAIL, COMENTARIO_SOLICITANTE
    )
    VALUES (
        'TEST_TAREA5_BATCH_' + RIGHT('000' + CAST(@v_i AS VARCHAR(3)), 3),
        @v_compania_batch, 'EN_PROCESO', 'test@test.com', @v_fecha_batch,
        'test@test.com', @v_fecha_batch, @v_fecha_batch, @v_fecha_batch,
        'aprobador@test.com', 'Test 5 Batch: Item ' + CAST(@v_i AS VARCHAR(2))
    );

    SET @v_id_sol_batch = @@IDENTITY;

    -- 3 primeros LISTOS (pasado)
    IF @v_i < 3
    BEGIN
        INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
            ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
            PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
        )
        VALUES (
            @v_id_sol_batch, 1, 'TIMEOUT', @v_fecha_batch,
            DATEADD(MINUTE, -10, @v_fecha_batch), NULL, NULL
        );
    END
    -- 2 siguientes FUTUROS (futuro)
    ELSE IF @v_i < 5
    BEGIN
        INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
            ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
            PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
        )
        VALUES (
            @v_id_sol_batch, 1, 'DEADLOCK', @v_fecha_batch,
            DATEADD(MINUTE, 60, @v_fecha_batch), NULL, NULL  -- Futuro
        );
    END
    -- 5 últimos PROCESADOS (con resultado)
    ELSE
    BEGIN
        INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
            ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO,
            PROXIMO_REINTENTO_PROGRAMADO, RESULTADO_REINTENTO, MENSAJE_ERROR_TECNICO
        )
        VALUES (
            @v_id_sol_batch, 1, 'TIMEOUT', @v_fecha_batch,
            DATEADD(MINUTE, -100, @v_fecha_batch), 'EXITOSO', 'Ya procesado'
        );
    END

    SET @v_i = @v_i + 1;
END

PRINT '  [SETUP] 10 solicitudes batch creadas (3 listos + 2 futuros + 5 procesados)';
PRINT '';
GO

-- ========================================================================================================
-- EJECUTAR SP_PROCESAR_REINTENTOS
-- ========================================================================================================

PRINT '========================================================================================================';
PRINT 'EJECUTANDO SP_PROCESAR_REINTENTOS';
PRINT '========================================================================================================';
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

PRINT 'Resultado Final:';
PRINT '  @P_REINTENTOS_PROCESADOS=' + CAST(@P_REINTENTOS_PROCESADOS AS VARCHAR(10));
PRINT '  @P_EXITOSOS=' + CAST(@P_EXITOSOS AS VARCHAR(10));
PRINT '  @P_PENDIENTES=' + CAST(@P_PENDIENTES AS VARCHAR(10));
PRINT '  @P_FALLIDOS=' + CAST(@P_FALLIDOS AS VARCHAR(10));
PRINT '';

-- ========================================================================================================
-- VALIDAR RESULTADOS DE TESTS
-- ========================================================================================================

PRINT '';
PRINT '========================================================================================================';
PRINT 'VALIDACIÓN DE RESULTADOS';
PRINT '========================================================================================================';
PRINT '';

-- TEST 1: Reintento exitoso
PRINT '[TEST 1] Validación: Reintento exitoso en intento 1';
DECLARE @t1_estado VARCHAR(25);
DECLARE @t1_resultado VARCHAR(20);
DECLARE @t1_auditoria INT;

SELECT @t1_estado = ESTADO FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_001';
SELECT @t1_resultado = RESULTADO_REINTENTO FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO 
    WHERE ID_SOLICITUD = (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_001');
SELECT @t1_auditoria = COUNT(*) FROM PORTAL_PRECIOS.AUDITORIA_APROBACION 
    WHERE ID_SOLICITUD = (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_001')
    AND ACCION = 'REINTENTO_EXITOSO';

IF @t1_estado = 'PROCESADO' AND @t1_resultado = 'EXITOSO' AND @t1_auditoria > 0
    PRINT '  ✅ EXITOSO: Estado=PROCESADO, Resultado=EXITOSO, Auditoría registrada'
ELSE
    PRINT '  ❌ FALLÓ: Estado=' + ISNULL(@t1_estado, 'NULL') + ', Resultado=' + ISNULL(@t1_resultado, 'NULL') + 
          ', Auditoría=' + CAST(ISNULL(@t1_auditoria, 0) AS VARCHAR(3));

-- TEST 2: Falla y programa siguiente
PRINT '[TEST 2] Validación: Falla transitoria, programa siguiente';
DECLARE @t2_intento INT;
DECLARE @t2_proximo DATETIME;
DECLARE @t2_resultado2 VARCHAR(20);

SELECT @t2_intento = INTENTO_NUMERO, @t2_proximo = PROXIMO_REINTENTO_PROGRAMADO, @t2_resultado2 = RESULTADO_REINTENTO
FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
WHERE ID_SOLICITUD = (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_002');

IF @t2_intento = 2 AND @t2_resultado2 IS NULL AND @t2_proximo > GETDATE()
    PRINT '  ✅ EXITOSO: IntentNumber=2, Resultado=NULL (aún pendiente), ProximoReintento en futuro'
ELSE
    PRINT '  ❌ FALLÓ: IntentNumber=' + CAST(ISNULL(@t2_intento, 0) AS VARCHAR(2)) + 
          ', Resultado=' + ISNULL(@t2_resultado2, 'NULL');

-- TEST 3: Agota reintentos
PRINT '[TEST 3] Validación: Agota 3 reintentos';
DECLARE @t3_estado3 VARCHAR(25);
DECLARE @t3_resultado3 VARCHAR(20);
DECLARE @t3_codigo_error VARCHAR(50);

SELECT @t3_estado3 = ESTADO FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_003';
SELECT @t3_resultado3 = RESULTADO_REINTENTO FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO 
    WHERE ID_SOLICITUD = (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_003');
SELECT @t3_codigo_error = CODIGO_ERROR FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_003';

IF @t3_estado3 = 'ERROR_EJECUCION' AND @t3_resultado3 = 'FALLIDO' AND @t3_codigo_error LIKE 'REINTENTO_AGOTADO_%'
    PRINT '  ✅ EXITOSO: Estado=ERROR_EJECUCION, Resultado=FALLIDO, Código=REINTENTO_AGOTADO_*'
ELSE
    PRINT '  ❌ FALLÓ: Estado=' + ISNULL(@t3_estado3, 'NULL') + ', Resultado=' + ISNULL(@t3_resultado3, 'NULL') + 
          ', Código=' + ISNULL(@t3_codigo_error, 'NULL');

-- TEST 4: Error no-retryeable
PRINT '[TEST 4] Validación: Error no-retryeable, no reintentar';
DECLARE @t4_estado4 VARCHAR(25);
DECLARE @t4_resultado4 VARCHAR(20);
DECLARE @t4_intento4 INT;

SELECT @t4_estado4 = ESTADO FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_004';
SELECT @t4_resultado4 = RESULTADO_REINTENTO, @t4_intento4 = INTENTO_NUMERO FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO 
    WHERE ID_SOLICITUD = (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_TAREA5_004');

IF @t4_estado4 = 'PROCESADO_CON_ERRORES' AND @t4_resultado4 = 'FALLIDO' AND @t4_intento4 = 1
    PRINT '  ✅ EXITOSO: Estado=PROCESADO_CON_ERRORES, Resultado=FALLIDO, IntentNumber=1 (sin incremento)'
ELSE
    PRINT '  ❌ FALLÓ: Estado=' + ISNULL(@t4_estado4, 'NULL') + ', Resultado=' + ISNULL(@t4_resultado4, 'NULL') + 
          ', IntentNumber=' + CAST(ISNULL(@t4_intento4, 0) AS VARCHAR(2));

-- TEST 5: Batch
PRINT '[TEST 5] Validación: Procesar batch (3 listos, 2 futuros, 5 procesados)';
DECLARE @t5_listos INT;
DECLARE @t5_futuros INT;
DECLARE @t5_procesados INT;

SELECT @t5_listos = COUNT(*) FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO sr
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_BATCH_%')
AND sr.RESULTADO_REINTENTO IS NOT NULL OR sr.RESULTADO_REINTENTO = 'EXITOSO';

SELECT @t5_futuros = COUNT(*) FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO sr
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_BATCH_%')
AND sr.PROXIMO_REINTENTO_PROGRAMADO > GETDATE() AND sr.RESULTADO_REINTENTO IS NULL;

SELECT @t5_procesados = COUNT(*) FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO sr
WHERE ID_SOLICITUD IN (SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD LIKE 'TEST_TAREA5_BATCH_%')
AND sr.RESULTADO_REINTENTO IS NOT NULL;

IF @t5_listos >= 3 AND @t5_futuros >= 2 AND @t5_procesados >= 5
    PRINT '  ✅ EXITOSO: Batch procesado correctamente (listos processed, futuros no touched, ya procesados intactos)'
ELSE
    PRINT '  ❌ FALLÓ: Listos=' + CAST(@t5_listos AS VARCHAR(2)) + ', Futuros=' + CAST(@t5_futuros AS VARCHAR(2)) + 
          ', Procesados=' + CAST(@t5_procesados AS VARCHAR(2));

PRINT '';
PRINT '========================================================================================================';
PRINT '✅ TESTS COMPLETADOS';
PRINT '========================================================================================================';
