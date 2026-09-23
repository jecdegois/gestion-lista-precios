-- ========================================================================================================
-- PASO 1 - Tarea 4: Validación de CHECK Constraints
-- Script: 07_validar_constraints.sql
-- Objetivo: Verificar que los constraints de negocio se aplican correctamente
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

-- Asumiendo que ya estamos en la base de datos SOFTLANDQA
-- PORTAL_PRECIOS es el esquema dentro de esa base de datos

PRINT '========================================================================================================';
PRINT 'TAREA 4: VALIDACIÓN DE CHECK CONSTRAINTS';
PRINT '========================================================================================================';

-- Usar nombre de compañía FEBECA directamente
DECLARE @compania_nombre VARCHAR(100) = 'FEBECA';

PRINT '';
PRINT 'Usando compañía: ' + @compania_nombre;

-- ========================================================================================================
-- 1. VERIFICAR CONSTRAINTS EXISTENTES EN SOLICITUD
-- ========================================================================================================

PRINT '';
PRINT '1. CONSTRAINTS EXISTENTES EN SOLICITUD';
PRINT '----';

SELECT 
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE,
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
WHERE TABLE_NAME = 'SOLICITUD'
  AND TABLE_SCHEMA = 'PORTAL_PRECIOS'
  AND CONSTRAINT_TYPE = 'CHECK'
ORDER BY CONSTRAINT_NAME;

-- ========================================================================================================
-- 2. PRUEBA: Validar CK_SOLICITUD_ERROR_TRANS (ES_ERROR_TRANSITORIO = 'S' o 'N')
-- ========================================================================================================

PRINT '';
PRINT '2. PRUEBA: CK_SOLICITUD_ERROR_TRANS - Solo permite ''S'' o ''N''';
PRINT '----';

-- Preparar: Limpiar intentos de prueba previos
DELETE FROM PORTAL_PRECIOS.SOLICITUD 
WHERE CODIGO_SOLICITUD IN ('TEST_ERR_INVALID', 'TEST_ERR_VALID');
GO

-- Intento INVÁLIDO: Insertar ES_ERROR_TRANSITORIO = 'X'
BEGIN TRY
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
        CODIGO_SOLICITUD, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION
    )
    VALUES (
        'AJUSTE_MASIVO', @compania_nombre, 1, 1, 'BORRADOR',
        'TEST_ERR_INVALID', 'X', '{}', GETDATE(), GETDATE()
    );
    PRINT 'RESULTADO: ❌ FALLIDO - Constraint NO bloqueó valor inválido ''X''';
END TRY
BEGIN CATCH
    PRINT 'RESULTADO: ✅ EXITOSO - Constraint bloqueó correctamente valor inválido ''X''';
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH
GO

-- Intento VÁLIDO: Insertar ES_ERROR_TRANSITORIO = 'S'
BEGIN TRY
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
        CODIGO_SOLICITUD, ES_ERROR_TRANSITORIO, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION
    )
    VALUES (
        'AJUSTE_MASIVO', @compania_nombre, 1, 1, 'BORRADOR',
        'TEST_ERR_VALID', 'S', '{}', GETDATE(), GETDATE()
    );
    PRINT 'RESULTADO: ✅ EXITOSO - Constraint permitió valor válido ''S''';
END TRY
BEGIN CATCH
    PRINT 'RESULTADO: ❌ FALLIDO - Constraint bloqueó valor válido ''S''';
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH
GO

-- ========================================================================================================
-- 3. PRUEBA: Validar CK_SOLICITUD_CANC_LOGICA 
--    (Si CANCELACION_CONFIRMADA = 'S', entonces CANCELACION_SOLICITADA debe ser 'S')
-- ========================================================================================================

PRINT '';
PRINT '3. PRUEBA: CK_SOLICITUD_CANC_LOGICA - Regla: Si CANCELACION_CONFIRMADA=''S'' entonces CANCELACION_SOLICITADA=''S''';
PRINT '----';

-- Limpiar
DELETE FROM PORTAL_PRECIOS.SOLICITUD 
WHERE CODIGO_SOLICITUD LIKE 'TEST_CANC_%';
GO

-- Intento INVÁLIDO: CANCELACION_CONFIRMADA = 'S' pero CANCELACION_SOLICITADA = 'N'
BEGIN TRY
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
        CODIGO_SOLICITUD, CANCELACION_SOLICITADA, CANCELACION_CONFIRMADA, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION
    )
    VALUES (
        'AJUSTE_MASIVO', @compania_nombre, 1, 1, 'BORRADOR',
        'TEST_CANC_INV', 'N', 'S', '{}', GETDATE(), GETDATE()
    );
    PRINT 'RESULTADO: ❌ FALLIDO - Constraint NO bloqueó estado ilógico (CONFIRMADA=''S'' sin SOLICITADA=''S'')';
END TRY
BEGIN CATCH
    PRINT 'RESULTADO: ✅ EXITOSO - Constraint bloqueó correctamente estado ilógico';
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH
GO

-- Intento VÁLIDO: CANCELACION_CONFIRMADA = 'S' y CANCELACION_SOLICITADA = 'S'
BEGIN TRY
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
        CODIGO_SOLICITUD, CANCELACION_SOLICITADA, CANCELACION_CONFIRMADA, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION
    )
    VALUES (
        'AJUSTE_MASIVO', @compania_nombre, 1, 1, 'BORRADOR',
        'TEST_CANC_VAL', 'S', 'S', '{}', GETDATE(), GETDATE()
    );
    PRINT 'RESULTADO: ✅ EXITOSO - Constraint permitió estado lógico (CONFIRMADA=''S'' y SOLICITADA=''S'')';
END TRY
BEGIN CATCH
    PRINT 'RESULTADO: ❌ FALLIDO - Constraint bloqueó estado válido';
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH
GO

-- ========================================================================================================
-- 4. PRUEBA: Validar CK_SOLICITUD_FECHAS_EJEC
--    (Si FECHA_FIN_EJECUCION está poblada, FECHA_INICIO_EJECUCION debe estarlo)
-- ========================================================================================================

PRINT '';
PRINT '4. PRUEBA: CK_SOLICITUD_FECHAS_EJEC - Regla: Si FECHA_FIN_EJECUCION existe, FECHA_INICIO_EJECUCION debe existir';
PRINT '----';

-- Limpiar
DELETE FROM PORTAL_PRECIOS.SOLICITUD 
WHERE CODIGO_SOLICITUD LIKE 'TEST_FECH_%';
GO

-- Intento INVÁLIDO: FECHA_FIN_EJECUCION sin FECHA_INICIO_EJECUCION
BEGIN TRY
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
        CODIGO_SOLICITUD, FECHA_INICIO_EJECUCION, FECHA_FIN_EJECUCION, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION
    )
    VALUES (
        'AJUSTE_MASIVO', @compania_nombre, 1, 1, 'BORRADOR',
        'TEST_FECH_INV', NULL, GETDATE(), '{}', GETDATE(), GETDATE()
    );
    PRINT 'RESULTADO: ❌ FALLIDO - Constraint NO bloqueó FECHA_FIN sin FECHA_INICIO';
END TRY
BEGIN CATCH
    PRINT 'RESULTADO: ✅ EXITOSO - Constraint bloqueó correctamente FECHA_FIN sin FECHA_INICIO';
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH
GO

-- Intento VÁLIDO: FECHA_INICIO_EJECUCION y FECHA_FIN_EJECUCION ambas pobladas
BEGIN TRY
    INSERT INTO PORTAL_PRECIOS.SOLICITUD (
        TIPO_PROCESO, COMPANIA, LISTA_PRECIO, IDP_OPERADOR, ESTADO,
        CODIGO_SOLICITUD, FECHA_INICIO_EJECUCION, FECHA_FIN_EJECUCION, PARAMETROS_JSON, FECHA_CREACION, FECHA_MODIFICACION
    )
    VALUES (
        'AJUSTE_MASIVO', @compania_nombre, 1, 1, 'BORRADOR',
        'TEST_FECH_VAL', GETDATE(), GETDATE(), '{}', GETDATE(), GETDATE()
    );
    PRINT 'RESULTADO: ✅ EXITOSO - Constraint permitió FECHA_INICIO y FECHA_FIN ambas pobladas';
END TRY
BEGIN CATCH
    PRINT 'RESULTADO: ❌ FALLIDO - Constraint bloqueó fechas válidas';
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH
GO

-- ========================================================================================================
-- 5. PRUEBA: Validar CK_REINTENTO_INTENTO
--    (INTENTO_NUMERO debe estar entre 1 y 3)
-- ========================================================================================================

PRINT '';
PRINT '5. PRUEBA: CK_REINTENTO_INTENTO - INTENTO_NUMERO debe estar entre 1 y 3';
PRINT '----';

-- Obtener un ID_SOLICITUD válido para las pruebas
DECLARE @test_solicitud_id INT;
SELECT TOP 1 @test_solicitud_id = ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD WHERE CODIGO_SOLICITUD = 'TEST_ERR_VALID';

IF @test_solicitud_id IS NOT NULL
BEGIN
    -- Limpiar
    DELETE FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO WHERE ID_SOLICITUD = @test_solicitud_id;

    -- Intento INVÁLIDO: INTENTO_NUMERO = 0
    BEGIN TRY
        INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
            ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, RESULTADO_REINTENTO, FECHA_INTENTO
        )
        VALUES (
            @test_solicitud_id, 0, 'connection_timeout', 'FALLIDO', GETDATE()
        );
        PRINT 'RESULTADO: ❌ FALLIDO - Constraint NO bloqueó INTENTO_NUMERO = 0';
    END TRY
    BEGIN CATCH
        PRINT 'RESULTADO: ✅ EXITOSO - Constraint bloqueó correctamente INTENTO_NUMERO = 0';
        PRINT 'Error: ' + ERROR_MESSAGE();
    END CATCH

    -- Intento INVÁLIDO: INTENTO_NUMERO = 4
    BEGIN TRY
        INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
            ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, RESULTADO_REINTENTO, FECHA_INTENTO
        )
        VALUES (
            @test_solicitud_id, 4, 'connection_timeout', 'FALLIDO', GETDATE()
        );
        PRINT 'RESULTADO: ❌ FALLIDO - Constraint NO bloqueó INTENTO_NUMERO = 4';
    END TRY
    BEGIN CATCH
        PRINT 'RESULTADO: ✅ EXITOSO - Constraint bloqueó correctamente INTENTO_NUMERO = 4';
        PRINT 'Error: ' + ERROR_MESSAGE();
    END CATCH

    -- Intento VÁLIDO: INTENTO_NUMERO = 2
    BEGIN TRY
        INSERT INTO PORTAL_PRECIOS.SOLICITUD_REINTENTO (
            ID_SOLICITUD, INTENTO_NUMERO, TIPO_ERROR, RESULTADO_REINTENTO, FECHA_INTENTO
        )
        VALUES (
            @test_solicitud_id, 2, 'connection_timeout', 'FALLIDO', GETDATE()
        );
        PRINT 'RESULTADO: ✅ EXITOSO - Constraint permitió INTENTO_NUMERO = 2';
    END TRY
    BEGIN CATCH
        PRINT 'RESULTADO: ❌ FALLIDO - Constraint bloqueó INTENTO_NUMERO válido';
        PRINT 'Error: ' + ERROR_MESSAGE();
    END CATCH
END
ELSE
BEGIN
    PRINT 'ADVERTENCIA: No se encontró registro de prueba. Saltando prueba de SOLICITUD_REINTENTO.';
END
GO

-- ========================================================================================================
-- 6. VERIFICAR CONSTRAINTS EN SOLICITUD_REINTENTO
-- ========================================================================================================

PRINT '';
PRINT '6. CONSTRAINTS EN SOLICITUD_REINTENTO';
PRINT '----';

SELECT 
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE,
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
WHERE TABLE_NAME = 'SOLICITUD_REINTENTO'
  AND TABLE_SCHEMA = 'PORTAL_PRECIOS'
  AND CONSTRAINT_TYPE = 'CHECK'
ORDER BY CONSTRAINT_NAME;

-- ========================================================================================================
-- 7. VERIFICAR CONSTRAINTS EN AUDITORIA_APROBACION
-- ========================================================================================================

PRINT '';
PRINT '7. CONSTRAINTS EN AUDITORIA_APROBACION';
PRINT '----';

SELECT 
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE,
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
WHERE TABLE_NAME = 'AUDITORIA_APROBACION'
  AND TABLE_SCHEMA = 'PORTAL_PRECIOS'
  AND CONSTRAINT_TYPE = 'CHECK'
ORDER BY CONSTRAINT_NAME;

-- ========================================================================================================
-- 8. RESUMEN FINAL
-- ========================================================================================================

PRINT '';
PRINT '========================================================================================================';
PRINT 'RESUMEN: VALIDACIÓN DE CONSTRAINTS COMPLETADA';
PRINT '========================================================================================================';
PRINT '';
PRINT 'Constraints validados:';
PRINT '  ✓ CK_SOLICITUD_ERROR_TRANS        - Solo permite ''S'' o ''N''';
PRINT '  ✓ CK_SOLICITUD_CANC_LOGICA        - Si CONFIRMADA=''S'', entonces SOLICITADA=''S''';
PRINT '  ✓ CK_SOLICITUD_FECHAS_EJEC        - Si FECHA_FIN existe, FECHA_INICIO debe existir';
PRINT '  ✓ CK_REINTENTO_INTENTO            - INTENTO_NUMERO entre 1 y 3';
PRINT '';
PRINT 'Si todos los resultados muestran ✅ EXITOSO, los constraints están funcionando correctamente.';
PRINT 'Si algún resultado muestra ❌ FALLIDO, hay un problema que debe ser investigado.';
PRINT '';
PRINT '========================================================================================================';
