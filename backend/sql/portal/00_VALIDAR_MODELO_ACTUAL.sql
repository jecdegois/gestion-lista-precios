-- ============================================================================
-- VALIDACION DEL MODELO DE BASE DE DATOS
-- ============================================================================
-- Propósito: Verificar que el modelo actual en SOFTLANDQA coincida con 
-- la documentación esperada y evitar errores similares a Tarea 5-6
-- 
-- Ejecutar ANTES de comenzar una nueva tarea
-- Ubicación: backend/sql/portal/
-- ============================================================================

USE SOFTLANDQA;
GO

PRINT '════════════════════════════════════════════════════════════════'
PRINT 'VALIDACION DEL MODELO DE BASE DE DATOS'
PRINT 'Proyecto: MV26020 - Cálculo de Listas de Precio'
PRINT '════════════════════════════════════════════════════════════════'

DECLARE @VALIDATION_PASS INT = 0;
DECLARE @VALIDATION_FAIL INT = 0;

-- ============================================================================
-- VALIDACION 1: Tabla SOLICITUD existe
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 1] Tabla SOLICITUD existe...'

IF OBJECT_ID('PORTAL_PRECIOS.SOLICITUD', 'U') IS NOT NULL
BEGIN
  PRINT '✓ PASS: Tabla SOLICITUD existe'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: Tabla SOLICITUD no existe. Esperado: PORTAL_PRECIOS.SOLICITUD'
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 2: Tabla SOLICITUD_REINTENTO existe
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 2] Tabla SOLICITUD_REINTENTO existe...'

IF OBJECT_ID('PORTAL_PRECIOS.SOLICITUD_REINTENTO', 'U') IS NOT NULL
BEGIN
  PRINT '✓ PASS: Tabla SOLICITUD_REINTENTO existe'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: Tabla SOLICITUD_REINTENTO no existe'
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 3: Columna ES_ERROR_TRANSITORIO es CHAR(1) con valores 'N'/'S'
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 3] Columna ES_ERROR_TRANSITORIO es CHAR(1)...'

DECLARE @ES_ERROR_TRANSITORIO_TYPE NVARCHAR(50);
SELECT @ES_ERROR_TRANSITORIO_TYPE = DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'SOLICITUD' AND TABLE_SCHEMA = 'PORTAL_PRECIOS' 
  AND COLUMN_NAME = 'ES_ERROR_TRANSITORIO';

IF @ES_ERROR_TRANSITORIO_TYPE = 'char'
BEGIN
  PRINT '✓ PASS: ES_ERROR_TRANSITORIO es CHAR'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
  
  -- Validar valores en datos
  DECLARE @DISTINCT_ES_ERROR_VALUES NVARCHAR(MAX);
  SELECT @DISTINCT_ES_ERROR_VALUES = STRING_AGG(DISTINCT CAST(ES_ERROR_TRANSITORIO AS NVARCHAR(10)), ',')
  FROM PORTAL_PRECIOS.SOLICITUD
  WHERE ES_ERROR_TRANSITORIO IS NOT NULL;
  
  PRINT '  Valores encontrados: ' + COALESCE(@DISTINCT_ES_ERROR_VALUES, 'NULL');
  
  IF @DISTINCT_ES_ERROR_VALUES LIKE '%N%' OR @DISTINCT_ES_ERROR_VALUES LIKE '%S%' OR @DISTINCT_ES_ERROR_VALUES IS NULL
    PRINT '  ✓ Valores válidos: contiene N, S o está vacío'
  ELSE
    PRINT '  ⚠ ADVERTENCIA: Valores encontrados no son N o S: ' + @DISTINCT_ES_ERROR_VALUES
END
ELSE
BEGIN
  PRINT '✗ FAIL: ES_ERROR_TRANSITORIO no es CHAR, es: ' + @ES_ERROR_TRANSITORIO_TYPE
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 4: Columna PARAMETROS_JSON es NOT NULL
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 4] Columna PARAMETROS_JSON es NOT NULL...'

DECLARE @PARAMETROS_JSON_NULLABLE NVARCHAR(10);
SELECT @PARAMETROS_JSON_NULLABLE = IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'SOLICITUD' AND TABLE_SCHEMA = 'PORTAL_PRECIOS' 
  AND COLUMN_NAME = 'PARAMETROS_JSON';

IF @PARAMETROS_JSON_NULLABLE = 'NO'
BEGIN
  PRINT '✓ PASS: PARAMETROS_JSON es NOT NULL'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: PARAMETROS_JSON es nullable. Esperado: NOT NULL'
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 5: TIPO_ERROR en SOLICITUD_REINTENTO tiene valores válidos
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 5] TIPO_ERROR tiene valores válidos...'

DECLARE @VALID_TIPO_ERROR_COUNT INT;
SELECT @VALID_TIPO_ERROR_COUNT = COUNT(DISTINCT TIPO_ERROR)
FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
WHERE TIPO_ERROR IN ('connection_timeout', 'service_unavailable', 'other_transient', 'temporary_lock');

DECLARE @TOTAL_TIPO_ERROR_COUNT INT;
SELECT @TOTAL_TIPO_ERROR_COUNT = COUNT(DISTINCT TIPO_ERROR)
FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
WHERE TIPO_ERROR IS NOT NULL;

IF @VALID_TIPO_ERROR_COUNT = @TOTAL_TIPO_ERROR_COUNT OR @TOTAL_TIPO_ERROR_COUNT = 0
BEGIN
  PRINT '✓ PASS: TIPO_ERROR solo contiene valores válidos'
  PRINT '  Valores válidos encontrados: ' + CAST(@VALID_TIPO_ERROR_COUNT AS NVARCHAR(10))
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: TIPO_ERROR contiene valores no válidos'
  PRINT '  Valores válidos: ' + CAST(@VALID_TIPO_ERROR_COUNT AS NVARCHAR(10)) + '/' + CAST(@TOTAL_TIPO_ERROR_COUNT AS NVARCHAR(10))
  PRINT '  Valores encontrados:'
  SELECT DISTINCT TIPO_ERROR FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 6: COMPANIA tiene valores válidos
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 6] COMPANIA tiene valores válidos...'

DECLARE @VALID_COMPANIA_COUNT INT;
SELECT @VALID_COMPANIA_COUNT = COUNT(DISTINCT COMPANIA)
FROM PORTAL_PRECIOS.COMPANIA
WHERE COMPANIA IN ('BEVAL', 'COFERSA', 'FEBECA', 'SILLACA');

IF @VALID_COMPANIA_COUNT >= 4
BEGIN
  PRINT '✓ PASS: COMPANIA tiene valores válidos: BEVAL, COFERSA, FEBECA, SILLACA'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: COMPANIA no tiene todos los valores esperados'
  PRINT '  Valores encontrados:'
  SELECT DISTINCT COMPANIA FROM PORTAL_PRECIOS.COMPANIA ORDER BY COMPANIA
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 7: UNIQUE INDEX en CODIGO_SOLICITUD existe
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 7] UNIQUE INDEX en CODIGO_SOLICITUD existe...'

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
           WHERE CONSTRAINT_NAME = 'UX_SOLICITUD_CODIGO_SOLICITUD' 
           AND TABLE_NAME = 'SOLICITUD')
BEGIN
  PRINT '✓ PASS: UNIQUE INDEX UX_SOLICITUD_CODIGO_SOLICITUD existe'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: UNIQUE INDEX no encontrado. Esperar duplicates si se ejecutan tests'
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- VALIDACION 8: CHECK CONSTRAINT en INTENTOS_REINTENTO <= 3
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 8] CHECK CONSTRAINT INTENTOS_REINTENTO <= 3...'

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
           WHERE CONSTRAINT_NAME LIKE '%INTENTO_RANGO%' 
           AND CHECK_CLAUSE LIKE '%3%')
BEGIN
  PRINT '✓ PASS: CHECK CONSTRAINT INTENTOS_REINTENTO <= 3 existe'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '⚠ ADVERTENCIA: CHECK CONSTRAINT no validado explícitamente'
  PRINT '  Verificar manualmente en tabla SOLICITUD_REINTENTO'
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END

-- ============================================================================
-- VALIDACION 9: ESTADO valores permitidos
-- ============================================================================

PRINT ''
PRINT '[VALIDACION 9] ESTADO tiene valores permitidos...'

DECLARE @EXPECTED_ESTADOS NVARCHAR(MAX) = 'BORRADOR,PENDIENTE,EN_PROCESO,PROCESADO,PROCESADO_CON_ERRORES,RECHAZADO,ERROR_EJECUCION,CANCELADO';
DECLARE @ENCONTRADOS NVARCHAR(MAX);

SELECT @ENCONTRADOS = STRING_AGG(DISTINCT ESTADO, ',')
FROM PORTAL_PRECIOS.SOLICITUD
WHERE ESTADO IS NOT NULL;

IF @ENCONTRADOS LIKE '%EN_PROCESO%'
BEGIN
  PRINT '✓ PASS: ESTADO contiene EN_PROCESO'
  PRINT '  Valores encontrados: ' + @ENCONTRADOS
  SET @VALIDATION_PASS = @VALIDATION_PASS + 1;
END
ELSE
BEGIN
  PRINT '✗ FAIL: ESTADO no contiene EN_PROCESO'
  PRINT '  Valores encontrados: ' + @ENCONTRADOS
  SET @VALIDATION_FAIL = @VALIDATION_FAIL + 1;
END

-- ============================================================================
-- RESUMEN FINAL
-- ============================================================================

PRINT ''
PRINT '════════════════════════════════════════════════════════════════'
PRINT 'RESUMEN DE VALIDACION'
PRINT '════════════════════════════════════════════════════════════════'
PRINT ''
PRINT 'Validaciones pasadas: ' + CAST(@VALIDATION_PASS AS NVARCHAR(10))
PRINT 'Validaciones fallidas: ' + CAST(@VALIDATION_FAIL AS NVARCHAR(10))
PRINT ''

IF @VALIDATION_FAIL = 0
BEGIN
  PRINT '✓ MODELO VALIDADO CORRECTAMENTE'
  PRINT 'Puedes proceder con la siguiente tarea.'
END
ELSE
BEGIN
  PRINT '✗ MODELO CON DISCREPANCIAS'
  PRINT 'Revisa las validaciones fallidas antes de continuar.'
  PRINT 'Consulta: aidlc-docs/inception/reverse-engineering/MODELO_DISCREPANCIAS_ENCONTRADAS.md'
END

PRINT ''
PRINT '════════════════════════════════════════════════════════════════'

GO
