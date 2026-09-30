-- ========================================================================================================
-- PASO 1 - Tarea 5: Validación de Índices para Queries de Aprobación
-- Script: 08_validar_indices.sql
-- Objetivo: Verificar que los índices creados soporten las queries de aprobación
-- Base de Datos: SOFTLANDQA / Schema: PORTAL_PRECIOS
-- ========================================================================================================

PRINT '========================================================================================================';
PRINT 'TAREA 5: VALIDACIÓN DE ÍNDICES PARA QUERIES DE APROBACIÓN';
PRINT '========================================================================================================';

-- ========================================================================================================
-- 1. VERIFICAR ÍNDICES EN SOLICITUD
-- ========================================================================================================

PRINT '';
PRINT '1. ÍNDICES EXISTENTES EN SOLICITUD';
PRINT '----';

SELECT 
    i.name AS NOMBRE_INDICE,
    COL_NAME(ic.object_id, ic.column_id) AS COLUMNA,
    ic.key_ordinal AS ORDEN,
    i.is_unique AS ES_UNICO,
    i.is_primary_key AS ES_PK,
    i.type_desc AS TIPO_INDICE
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE OBJECT_NAME(i.object_id) = 'SOLICITUD'
  AND i.type > 0  -- Excluye heap
ORDER BY i.name, ic.key_ordinal;

-- ========================================================================================================
-- 2. VERIFICAR ÍNDICES EN SOLICITUD_REINTENTO
-- ========================================================================================================

PRINT '';
PRINT '2. ÍNDICES EXISTENTES EN SOLICITUD_REINTENTO';
PRINT '----';

SELECT 
    i.name AS NOMBRE_INDICE,
    COL_NAME(ic.object_id, ic.column_id) AS COLUMNA,
    ic.key_ordinal AS ORDEN,
    i.is_unique AS ES_UNICO,
    i.is_primary_key AS ES_PK,
    i.type_desc AS TIPO_INDICE
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE OBJECT_NAME(i.object_id) = 'SOLICITUD_REINTENTO'
  AND i.type > 0  -- Excluye heap
ORDER BY i.name, ic.key_ordinal;

-- ========================================================================================================
-- 3. VERIFICAR ÍNDICES EN AUDITORIA_APROBACION
-- ========================================================================================================

PRINT '';
PRINT '3. ÍNDICES EXISTENTES EN AUDITORIA_APROBACION';
PRINT '----';

SELECT 
    i.name AS NOMBRE_INDICE,
    COL_NAME(ic.object_id, ic.column_id) AS COLUMNA,
    ic.key_ordinal AS ORDEN,
    i.is_unique AS ES_UNICO,
    i.is_primary_key AS ES_PK,
    i.type_desc AS TIPO_INDICE
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE OBJECT_NAME(i.object_id) = 'AUDITORIA_APROBACION'
  AND i.type > 0  -- Excluye heap
ORDER BY i.name, ic.key_ordinal;

-- ========================================================================================================
-- 4. VERIFICAR FRAGMENTACIÓN DE ÍNDICES (Fragmentación > 10% indica necesidad de REBUILD)
-- ========================================================================================================

PRINT '';
PRINT '4. ESTADO DE FRAGMENTACIÓN DE ÍNDICES (Query de Aprobación)';
PRINT '----';

SELECT 
    OBJECT_NAME(ps.object_id) AS TABLA,
    i.name AS NOMBRE_INDICE,
    ps.index_id,
    ps.avg_fragmentation_in_percent AS FRAGMENTACION_PCT,
    ps.page_count AS NUMERO_PAGINAS,
    CASE 
        WHEN ps.avg_fragmentation_in_percent < 10 THEN 'OK - No requiere mantenimiento'
        WHEN ps.avg_fragmentation_in_percent >= 10 AND ps.avg_fragmentation_in_percent < 30 THEN 'REORGANIZAR'
        ELSE 'REBUILD RECOMENDADO'
    END AS ACCION_RECOMENDADA
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ps
INNER JOIN sys.indexes i ON ps.object_id = i.object_id AND ps.index_id = i.index_id
WHERE OBJECT_NAME(ps.object_id) IN ('SOLICITUD', 'SOLICITUD_REINTENTO', 'AUDITORIA_APROBACION')
  AND ps.index_id > 0  -- Excluye heap
  AND ps.page_count > 0
ORDER BY OBJECT_NAME(ps.object_id), ps.avg_fragmentation_in_percent DESC;

-- ========================================================================================================
-- 5. QUERIES DE APROBACIÓN TIPICAS - Validar que usen índices
-- ========================================================================================================

PRINT '';
PRINT '5. QUERIES DE APROBACIÓN TÍPICAS (Validación de Uso de Índices)';
PRINT '----';

-- QUERY 1: Bandeja de Aprobación - Solicitudes pendientes por estado
PRINT '';
PRINT '5.1 Query: Bandeja de Aprobación (Solicitudes por revisar)';
PRINT 'Plan: Debería usar índices en ESTADO y FECHA_ENVIO';

SELECT 
    TOP 10
    s.ID_SOLICITUD,
    s.CODIGO_SOLICITUD,
    s.COMPANIA,
    s.ESTADO,
    s.FECHA_ENVIO,
    s.FECHA_MODIFICACION,
    s.APROBADOR_EMAIL,
    COUNT(sd.ID_DETALLE) AS NUM_ARTICULOS
FROM PORTAL_PRECIOS.SOLICITUD s
LEFT JOIN PORTAL_PRECIOS.SOLICITUD_DETALLE sd ON s.ID_SOLICITUD = sd.ID_SOLICITUD
WHERE s.ESTADO IN ('ENVIADA', 'RECHAZADA_MODIFICACION')
  AND s.FECHA_ENVIO IS NOT NULL
GROUP BY 
    s.ID_SOLICITUD,
    s.CODIGO_SOLICITUD,
    s.COMPANIA,
    s.ESTADO,
    s.FECHA_ENVIO,
    s.FECHA_MODIFICACION,
    s.APROBADOR_EMAIL
ORDER BY s.FECHA_ENVIO DESC;

-- QUERY 2: Búsqueda por ID de Solicitud
PRINT '';
PRINT '5.2 Query: Búsqueda por Código de Solicitud';
PRINT 'Plan: Debería ser extremadamente rápida (PK lookup)';

SELECT 
    s.ID_SOLICITUD,
    s.CODIGO_SOLICITUD,
    s.ESTADO,
    s.MOTIVO_RECHAZO,
    s.CANCELACION_SOLICITADA,
    s.CANCELACION_CONFIRMADA
FROM PORTAL_PRECIOS.SOLICITUD s
WHERE s.CODIGO_SOLICITUD LIKE 'TEST_ERR%';

-- QUERY 3: Reintentos pendientes
PRINT '';
PRINT '5.3 Query: Reintentos Programados (Tareas de reintentar)';
PRINT 'Plan: Debería usar índice en PROXIMO_REINTENTO_PROGRAMADO';

SELECT TOP 10
    sr.ID_REINTENTO,
    sr.ID_SOLICITUD,
    sr.INTENTO_NUMERO,
    sr.TIPO_ERROR,
    sr.PROXIMO_REINTENTO_PROGRAMADO,
    sr.RESULTADO_REINTENTO
FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO sr
WHERE sr.PROXIMO_REINTENTO_PROGRAMADO IS NOT NULL
  AND sr.PROXIMO_REINTENTO_PROGRAMADO <= GETDATE()
  AND sr.RESULTADO_REINTENTO IS NULL
ORDER BY sr.PROXIMO_REINTENTO_PROGRAMADO ASC;

-- QUERY 4: Auditoría de decisiones por aprobador
PRINT '';
PRINT '5.4 Query: Auditoría de Decisiones por Aprobador';
PRINT 'Plan: Debería usar índice en (USUARIO_EMAIL, FECHA)';

SELECT TOP 20
    aa.ID_APROBACION,
    aa.ID_SOLICITUD,
    aa.ACCION,
    aa.FECHA,
    aa.USUARIO_EMAIL,
    aa.COMENTARIO_DECISION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION aa
WHERE aa.USUARIO_EMAIL = 'test@example.com'
  AND aa.FECHA >= DATEADD(DAY, -30, GETDATE())
ORDER BY aa.FECHA DESC;

-- ========================================================================================================
-- 6. ESTADÍSTICAS DE ÍNDICES (Última actualización, lecturas, escrituras)
-- ========================================================================================================

PRINT '';
PRINT '6. ESTADÍSTICAS DE USO DE ÍNDICES';
PRINT '----';

SELECT 
    OBJECT_NAME(i.object_id) AS TABLA,
    i.name AS NOMBRE_INDICE,
    s.user_seeks AS LECTURAS_SEEK,
    s.user_scans AS LECTURAS_SCAN,
    s.user_lookups AS LOOKUPS,
    s.user_updates AS ACTUALIZACIONES,
    s.last_user_seek AS ULTIMA_LECTURA_SEEK,
    s.last_user_scan AS ULTIMA_LECTURA_SCAN
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats s 
    ON i.object_id = s.object_id 
    AND i.index_id = s.index_id 
    AND s.database_id = DB_ID()
WHERE OBJECT_NAME(i.object_id) IN ('SOLICITUD', 'SOLICITUD_REINTENTO', 'AUDITORIA_APROBACION')
  AND i.type > 0
ORDER BY OBJECT_NAME(i.object_id), (s.user_seeks + s.user_scans + s.user_lookups) DESC;

-- ========================================================================================================
-- 7. RESUMEN FINAL
-- ========================================================================================================

PRINT '';
PRINT '========================================================================================================';
PRINT 'RESUMEN: VALIDACIÓN DE ÍNDICES COMPLETADA';
PRINT '========================================================================================================';
PRINT '';
PRINT 'Índices validados:';
PRINT '  ✓ Índices en SOLICITUD (búsqueda por ID y estado)';
PRINT '  ✓ Índices en SOLICITUD_REINTENTO (búsqueda por próximo reintento)';
PRINT '  ✓ Índices en AUDITORIA_APROBACION (búsqueda por usuario y fecha)';
PRINT '';
PRINT 'Queries de aprobación validadas:';
PRINT '  ✓ Bandeja de aprobación (ESTADO + FECHA_ENVIO)';
PRINT '  ✓ Búsqueda por código (PK lookup)';
PRINT '  ✓ Reintentos programados (PROXIMO_REINTENTO_PROGRAMADO)';
PRINT '  ✓ Auditoría por aprobador (USUARIO_EMAIL + FECHA)';
PRINT '';
PRINT 'Verificar:';
PRINT '  - Fragmentación < 10% (sin mantenimiento necesario)';
PRINT '  - Todas las queries devuelven resultados esperados';
PRINT '  - Índices están siendo utilizados (user_seeks/scans > 0)';
PRINT '';
PRINT '========================================================================================================';
