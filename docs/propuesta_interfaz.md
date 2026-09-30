------------------------------Propuesta interfaz--------------------------

Actúa como un Desarrollador Full-Stack Senior especializado en Python (FastAPI) y React (TypeScript) con shadcn/ui. Necesito que generes la arquitectura de código, scripts SQL y componentes principales para una aplicación web de gestión masiva de precios en MS SQL Server.

---

### 1. TECNOLOGÍAS
**Frontend:** React (TypeScript), Tailwind CSS, shadcn/ui (UI Components: Select, Table, Dialog, Alert, Badge), Lucide React.
**Backend:** Python 3.11+ con FastAPI, SQLAlchemy/pyodbc, Pydantic v2, Tenacity (para retries exponenciales en fallos de BD).
**Base de Datos:** MS SQL Server.

---

### 2. ROLES Y FLUJO MAKER-CHECKER
OPERADOR: Carga las solicitudes de cambios filtrando por catálogos. No impacta tablas de producción directamente.
APROBADOR: Revisa solicitudes pendientes, visualiza el detalle/diff y aprueba o rechaza. Al aprobar, ejecuta la transacción SQL real.

---

### 3. ESTRUCTURA DE AUDITORÍA Y TABLAS AUXILIARES SQL

Genera el script DDL SQL para:

1. **Tabla dbo.SOLICITUDES_CAMBIO:**
   - Id_Solicitud (INT, PK)
   - Tipo_Proceso (VARCHAR - 'FACTOR_PRECIO', 'MAYOREOD_MASIVO', 'UDF_FACTOR_ARTICULO')
   - Payload_JSON (NVARCHAR(MAX) - Guarda los filtros y datos parametrizados)
   - Estado (VARCHAR - 'PENDIENTE', 'APROBADO', 'RECHAZADO')
   - Usuario_Creador (VARCHAR)
   - Fecha_Creacion (DATETIME2)

2. **Tabla dbo.LOG_AUDITORIA:**
   - Debe registrar **eventos independientes** para la Creación por el Operador y la Aprobación/Rechazo por el Aprobador:
   - Id_Log (INT, PK)
   - Id_Solicitud (INT, FK nullable)
   - Evento (VARCHAR - 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA', 'ERROR_TRANSACCION')
   - Usuario (VARCHAR)
   - Rol (VARCHAR)
   - Fecha_Hora (DATETIME2)
   - Detalle_JSON (NVARCHAR(MAX))

---

### 4. ENDPOINTS DE LECTURA (CATÁLOGOS EN BACKEND)

Crea endpoints GET en FastAPI para alimentar los selectores dinamicos del Frontend desde la BD:
/api/catalogos/niveles-precio: Consulta Nivel_Precio desde SCHEMA.NIVEL_PRECIO.
/api/catalogos/versiones: Consulta versiones activas/disponibles desde SCHEMA.VERSION_NIVEL.
/api/catalogos/grupos-articulos: Consulta los grupos de artículos agrupados desde SCHEMA.Articulos.

---

### 5. ESPECIFICACIÓN DE PROCESOS Y FORMULARIOS (FRONTEND & BACKEND)

#### Proceso #1: Actualización de Factores de Precio
**Filtros/Campos en Formulario:** 
  - Selector 1: NIVEL_PRECIO (obtenido de SCHEMA.NIVEL_PRECIO).
  - Selector 2: VERSION (correspondiente, obtenido de SCHEMA.VERSION_NIVEL).
  - Campo Numérico: Nuevo_Porcentaje.
**Acción Backend al Aprobar:** Transacción explícita que actualiza SCHEMA.Version_Nivel (campo U_PORCENTAJE_LISTA) y dbo.GESTON_LISTAS_PRECIO (campo FACTOR).

#### Proceso #2: Actualización Masiva de Precios (Lista Principal MAYOREOD)
**Filtros/Campos en Formulario:**
  - Selector Único: Grupo de Artículos (obtenido de SCHEMA.Articulos).
  - **Requisito UI obligatorio:** Mostrar un aviso destacado (Badge / Alert de shadcn) que indique explícitamente: "Atención: Esta actualización afectará directamente a la Lista Base (MAYOREOD) para la versión actualmente APROBADA".
**Acción Backend al Aprobar:** Transacción UPDATE masiva sobre SCHEMA.ARTICULO_PRECIO filtrando por el Grupo de Artículos seleccionado, Nivel_Precio = 'MayoreoD', validando que la versión vinculada esté en estado 'Aprobado' en SCHEMA.VERSION_NIVEL.

#### Proceso #3: Actualización de UDF "FACTOR_LISTA_ARCITULO"
**Filtros/Campos en Formulario:**
  - Selector 1: NIVEL_PRECIO (Lista).
  - Selector 2: VERSION.
  - Selector 3: Grupo de Artículos (para filtrar el universo de artículos a impactar).
  - Campo Numérico: Nuevo_Factor.
**Acción Backend al Aprobar:** Transacción con MERGE SQL sobre SCHEMA.FACTOR_LISTA_ARCITULO AS Target que inserta o actualiza la relación para los artículos pertenecientes al Grupo de Artículos seleccionado.

---

### 6. MANEJO DE TRANSACCIONES Y REINTENTOS (BACKEND)
Aplica decoradores de tenacity (@retry) en las funciones de ejecución SQL para reintentar hasta 3 veces con Exponential Backoff en caso de bloqueos temporales de SQL Server.
Cada aprobación ejecuta la lógica dentro de un BEGIN TRANSACTION / COMMIT. Si ocurre una falla irrecuperable, realiza ROLLBACK y registra el error en dbo.LOG_AUDITORIA con el evento 'ERROR_TRANSACCION'.

---

### 7. ENTREGABLES REQUERIDOS
1. Scripts SQL DDL para SOLICITUDES_CAMBIO y LOG_AUDITORIA.
2. Código del Backend en FastAPI (Rutas de Catálogos, Rutas de Solicitudes/Aprobaciones, y lógica de retries con SQLAlchemy/pyodbc).
3. Código Frontend en React (TypeScript) estructurado con componentes shadcn/ui para cada formulario, la bandeja de aprobaciones y la vista del Log de Auditoría.