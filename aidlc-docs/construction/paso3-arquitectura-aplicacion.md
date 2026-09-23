# PASO 3: Arquitectura de Aplicación - Frontend + API REST

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** CONSTRUCTION - Diseño de Aplicación  
**Objetivo:** Definir componentes, límites, dependencias, contratos backend e integración corporativa  
**Fecha:** 2026-09-18  

---

## 1. Visión General de Arquitectura

### Niveles de la Solución

```
┌─────────────────────────────────────────────────────────────────┐
│ PWA React Frontend (app-web)                                    │
│ ├── Solicitudes (Crear, Editar, Simular, Enviar)               │
│ ├── Aprobación (Bandeja, Modal, Decisión)                      │
│ ├── Auditoría (Consulta, Historial)                            │
│ └── Componentes Reutilizables                                  │
│     ├── Combobox (DDL con búsqueda)                            │
│     ├── ResponsiveDataTable (Tablas genéricas)                 │
│     ├── TablaImpactoGestionGlobal                              │
│     ├── TablaImpactoActualizacionMasiva                        │
│     └── TablaImpactoDescuentoManual                            │
└─────────────────────────────────────────────────────────────────┘
                         ↓ API REST HTTP
┌─────────────────────────────────────────────────────────────────┐
│ Backend API REST (backend/api)                                  │
│ ├── Solicitud CRUD (GET, POST, PUT)                            │
│ ├── Simulación (Cálculo de impacto)                            │
│ ├── Validación (Plantilla Excel, Factor, Rango)                │
│ ├── Integración Softland (Precios, Listas, Cálculo)            │
│ └── Authorización (Token Validation, Role-Based Access)        │
└─────────────────────────────────────────────────────────────────┘
                         ↓ SQL / EXEC SP
┌─────────────────────────────────────────────────────────────────┐
│ Database Layer (SOFTLANDQA.PORTAL_PRECIOS)                     │
│ ├── SOLICITUD (cabecera solicitud)                             │
│ ├── SOLICITUD_DETALLE (líneas con factor aplicado)             │
│ ├── Stored Procedures (Aprobación, Reintentos, Ejecución)      │
│ └── Softland Integration Points (SPs cálculo, precios)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes de Frontend

### 2.1 Componentes Reutilizables Existentes

#### Combobox.tsx
**Propósito:** DDL con búsqueda y filtrado  
**Ubicación:** `app-web/src/components/Combobox.tsx`

**Características:**
- Búsqueda por texto (normaliza acentos)
- Posicionamiento dinámico (fixed positioning)
- Cierre global on click-outside
- Soporte para opciones deshabilitadas
- Integración con control de ámbito (badge "Sin acceso")

**Uso en PASO 3:**
- **Seleccionar Lista:** Combobox carga listas autorizadas de Softland
- **Seleccionar Compañía:** Combobox carga compañías del usuario
- **Seleccionar Artículo:** Combobox carga SKUs con búsqueda por código/nombre

**Interface:**
```typescript
export interface ComboOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// Props
id: string;
value: string;
onChange: (opt: ComboOption) => void;
options: ComboOption[];
placeholder?: string;
disabled?: boolean;
```

---

#### ResponsiveDataTable.tsx (Componente Genérico)
**Propósito:** Tabla genérica reutilizable con paginación, scroll responsive, slots  
**Ubicación:** `app-web/src/components/newComponents/ResponsiveDataTable.tsx`

**Características:**
- Columnas genéricas (definidas por padre)
- Estados: loading, error, empty
- Paginación: página, límite, total
- Scroll responsive (max-height por breakpoint)
- Slots para celdas complejas
- Redirección on click opcional (`redirectOnRowClick`)
- Carga incremental (infinite scroll)
- Mobile-first (tarjetas en móvil, tabla en desktop)

**Uso en PASO 3:**
- **Impacto Gestión Global:** TablaImpactoGestionGlobal (reutiliza ResponsiveDataTable)
- **Impacto Actualización Masiva:** TablaImpactoActualizacionMasiva
- **Impacto Descuento Manual:** TablaImpactoDescuentoManual
- **Mis Solicitudes (Listado):** Tabla con solicitudes del usuario
- **Bandeja de Aprobación:** Tabla con solicitudes PENDIENTE

**Interface:**
```typescript
export interface TableColumn<Row> {
  key: string;
  header: string;
  headerClass?: string;
  cellClass?: string;
  align?: 'left' | 'center' | 'right';
  value?: (row: Row) => string | number | null | undefined;
}

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Props (principales)
rows: Row[];
columns: TableColumn<Row>[];
loading?: boolean;
error?: boolean;
meta?: PageMeta;
page: number;
limit: number;
redirectOnRowClick?: boolean;
getRowDestination?: (row: Row) => string;
rowClassName?: (row: Row) => string;
```

---

#### Tablas Especializadas Existentes

**TablaImpactoGestionGlobal.tsx**
- Muestra: Código, Descripción, Precio Actual, Factor, Precio Sugerido, Validación
- Usa ResponsiveDataTable como base
- Paginación local de 200 filas
- Puede ser llamada desde Frontend (simular) o desde Aprobación (revisar)

**TablaImpactoActualizacionMasiva.tsx**
- Muestra: Código, Descripción, Precio Actual, Factor, Precio Sugerido, Validación
- Idéntica a Gestión Global pero con contexto de carga Excel
- Paginación local de 200 filas

**TablaImpactoDescuentoManual.tsx**
- Muestra: Código, Lista, Factor %, Precio Actual, Precio Sugerido
- Usada en Descuento por Artículo
- Paginación local

**TablaHallazgosMargen.tsx**
- Muestra hallazgos de margen: Código, Descripción, Causa, Precio Mín, Precio Sim
- Paginación local de 200 filas

---

### 2.2 Nuevos Componentes a Crear en PASO 3

#### Formularios de Solicitud

**FormularioGestionGlobal.tsx**
- Seleccionar compañía (Combobox)
- Seleccionar lista (Combobox, con validación Softland)
- Ingresar factor (validación: > 0 y <= 2)
- Botones: Simular, Guardar Borrador, Limpiar
- Estados: Nuevo, Editando, Simulado
- Validaciones client-side

**FormularioActualizacionMasiva.tsx**
- Seleccionar compañía (Combobox)
- Upload de archivo Excel (botón + preview)
- Validación de estructura en cliente
- Botones: Simular, Guardar Borrador, Descargar Plantilla
- Error display por fila

**FormularioDescuentoManual.tsx**
- Seleccionar compañía (Combobox)
- Seleccionar artículo (Combobox con búsqueda)
- Seleccionar lista (Combobox)
- Ingresar factor (validación)
- Tabla de artículos capturados (TablaArticulosCapturaManual)
- Botones: Agregar, Simular, Guardar
- Acciones: Eliminar fila

---

#### Modales y Paneles

**RevisionModal.tsx**
- Muestra detalles de solicitud (SOLICITUD_PRECIO_DETALLE)
- TablaResultadoModal (derivado de ResponsiveDataTable)
- Resumen de validaciones/hallazgos
- Botones: Aprobar, Rechazar (con comentario), Cancelar
- Estados: Cargando, Error, Datos

**ConfirmacionEnvio.tsx**
- Modal de confirmación antes de enviar a aprobación
- Resumen: Compañía, Lista, Factor, Artículos impactados
- Botones: Enviar, Cancelar

**ConfirmacionAprobacion.tsx**
- Modal de confirmación de aprobación
- Muestra: Código solicitud, Solicitante, Cambios
- Botón: Aprobar
- Campo: Comentario (si rechaza)

---

### 2.3 Estructura de Carpetas - Frontend

```
app-web/
├── src/
│   ├── components/
│   │   ├── Combobox.tsx (existente, reutilizar)
│   │   ├── Tablas.tsx (existente)
│   │   ├── newComponents/
│   │   │   ├── ResponsiveDataTable.tsx (existente, base para todas las tablas)
│   │   │   ├── TablaImpactoGestionGlobal.tsx (existente)
│   │   │   ├── TablaImpactoActualizacionMasiva.tsx (existente)
│   │   │   ├── TablaImpactoDescuentoManual.tsx (existente)
│   │   │   ├── TablaArticulosCapturaManual.tsx (existente)
│   │   │   └── TablaResultadoModal.tsx (existente)
│   │   ├── FormularioGestionGlobal.tsx (CREAR)
│   │   ├── FormularioActualizacionMasiva.tsx (CREAR)
│   │   ├── FormularioDescuentoManual.tsx (CREAR)
│   │   ├── RevisionModal.tsx (CREAR)
│   │   ├── ConfirmacionEnvio.tsx (CREAR)
│   │   └── ConfirmacionAprobacion.tsx (CREAR)
│   ├── pages/
│   │   ├── solicitudes/
│   │   │   ├── nueva-global.tsx (CREAR)
│   │   │   ├── nueva-masiva.tsx (CREAR)
│   │   │   ├── nueva-individual.tsx (CREAR)
│   │   │   ├── mis-solicitudes.tsx (CREAR)
│   │   │   └── [id]/detalle.tsx (CREAR)
│   │   ├── aprobacion/
│   │   │   ├── bandeja.tsx (CREAR)
│   │   │   └── [id]/revisar.tsx (CREAR)
│   │   └── auditoria/
│   │       └── historial.tsx (CREAR)
│   ├── hooks/
│   │   ├── useSolicitud.ts (CREAR)
│   │   ├── useSimulacion.ts (CREAR)
│   │   ├── useAprobacion.ts (CREAR)
│   │   └── useListasArticulos.ts (CREAR)
│   └── lib/
│       ├── api-client.ts (CREAR)
│       ├── validation.ts (CREAR)
│       └── format.ts (existente)
```

---

## 3. Componentes de Backend API

### 3.1 Estructura de Endpoints REST

```
POST   /api/v1/solicitudes                    # Crear solicitud (borrador)
GET    /api/v1/solicitudes                    # Listar solicitudes del usuario
GET    /api/v1/solicitudes/:id                # Obtener detalle de solicitud
PUT    /api/v1/solicitudes/:id                # Actualizar solicitud (si está en BORRADOR)
POST   /api/v1/solicitudes/:id/enviar         # Enviar a aprobación
POST   /api/v1/solicitudes/:id/cancelar       # Solicitar cancelación

POST   /api/v1/simulacion/gestion-global      # Simular gestión global (pagos de 200)
POST   /api/v1/simulacion/gestion-masiva      # Simular actualización masiva
POST   /api/v1/simulacion/gestion-individual  # Simular gestión individual

GET    /api/v1/recursos/listas                # Obtener listas autorizadas (Combobox)
GET    /api/v1/recursos/articulos             # Obtener artículos (búsqueda, Combobox)
GET    /api/v1/recursos/plantilla             # Descargar plantilla Excel

POST   /api/v1/validacion/excel               # Validar estructura Excel
POST   /api/v1/validacion/factor              # Validar factor (range, formato)

GET    /api/v1/aprobacion/bandeja             # Listar solicitudes pendientes
GET    /api/v1/aprobacion/:id/detalles        # Obtener detalles para aprobación
```

---

### 3.2 Autenticación y Autorización

**Flujo de Token (OAuth2 / SSO):**
1. Frontend obtiene token al login (a través de SSO corporativo)
2. Backend valida token en cada request (middleware)
3. Backend extrae usuario, roles, compañía, ámbito
4. Backend valida autorización (rol + compañía + lista)

**Roles Implementados (PASO 2):**
- `SOLICITANTE`: Crear solicitudes
- `APROBADOR`: Aprobar/Rechazar
- `OPERADOR`: Ejecutar solicitudes aprobadas
- `AUDITOR`: Consultar historial

**Validación de Ámbito (Authorization):**
```
if user.compania != solicitud.compania:
  return 403 Forbidden

if user.role == "APROBADOR" and solicitud.aprobador_email != user.email:
  return 403 Forbidden

if user.role == "OPERADOR" and user.email == solicitud.aprobador_email:
  return 403 Forbidden (segregación de funciones)
```

---

### 3.3 Contratos de Datos

#### Solicitud (cabecera)
```json
{
  "id_solicitud": 123,
  "codigo_solicitud": "SOL-20260918-001",
  "compania": "SILLACA",
  "tipo_proceso": "FACTOR_PRECIO",
  "estado": "BORRADOR",
  "solicitante_email": "juan@intelix.com",
  "aprobador_email": "maria@intelix.com",
  "lista_precio": "MAYOREO",
  "parametros_json": {
    "factor": 1.15,
    "tipo_variacion": "AUMENTO"
  },
  "fecha_solicitud": "2026-09-18T10:30:00Z",
  "fecha_ultima_revision": null,
  "total_registros": 0,
  "exitosos": 0,
  "fallidos": 0
}
```

#### SolicitudDetalle (línea)
```json
{
  "id_detalle": 456,
  "id_solicitud": 123,
  "sku": "ART-001",
  "descripcion": "Artículo 001",
  "precio_actual": 100.00,
  "factor_aplicado": 1.15,
  "precio_simulado": 115.00,
  "estado_fila": "VALIDO",
  "mensaje_error": null
}
```

#### Resultado de Simulación
```json
{
  "total_articulos": 150,
  "filas_validas": 145,
  "filas_con_hallazgo": 5,
  "filas_error": 0,
  "offset": 0,
  "hasMore": true,
  "nextOffset": 200,
  "filas": [
    {
      "fila": 1,
      "codigo": "ART-001",
      "descripcion": "Artículo 001",
      "precio_actual": 100.00,
      "factor": 1.15,
      "precio_sugerido": 115.00,
      "cantidad": 10,
      "validacion": {
        "valido": true,
        "estadoRedondeo": "OK",
        "causa": null
      }
    }
  ]
}
```

---

## 4. Integración con Softland

### 4.1 Puntos de Integración

| Operación | SP Softland | Entrada | Salida |
|-----------|-------------|---------|--------|
| Obtener listas autorizadas | `SP_OBTENER_LISTAS` | Compañía, Usuario | Lista de listas vigentes |
| Obtener artículos | `SP_BUSCAR_ARTICULOS` | Código/Nombre, Compañía | SKU, Descripción, Precio Actual |
| Simular Gestión Global | `SP_CALCULAR_GESTION_GLOBAL` | Compañía, Lista, Factor | FilaPrecio[] (paginado 200) |
| Simular Gestión Masiva | `SP_CALCULAR_GESTION_MASIVA` | Compañía, Archivo Excel | FilaPrecio[] (paginado 200) |
| Simular Descuento Individual | `SP_CALCULAR_DESCUENTO` | Compañía, SKU, Lista, Factor | FilaPrecio |
| Ejecutar Solicitud | `SP_EJECUTAR_SOLICITUD_APROBADA` | ID_SOLICITUD, Usuario | Resultado de ejecución |

### 4.2 Modo de Integración

**Opción 1: SQL Server Connector (Fase inicial)**
- Backend conecta directamente a SOFTLANDQA
- Ejecuta SPs con parámetros
- Valida datos en BD antes de responder al Frontend

**Opción 2: API Wrapper (Fase futura)**
- Softland expone endpoints REST
- Backend API consume esos endpoints
- Reduce acoplamiento

**Selección para PASO 3:** Opción 1 (SQL Server Connector)

---

## 5. Flujos de Usuario

### 5.1 Flujo Gestión Global

```
Usuario (Solicitante)
  ↓
1. Abre página /solicitudes/nueva-global
  ↓
2. FormularioGestionGlobal
   - Selecciona compañía (Combobox → API /listas)
   - Selecciona lista (Combobox → API /listas filtradas)
   - Ingresa factor (validación 0 < factor <= 2)
   - Click "Simular"
  ↓
3. Backend POST /api/v1/simulacion/gestion-global
   - Valida: Compañía, Lista vigente en Softland
   - Ejecuta SP_CALCULAR_GESTION_GLOBAL (pagos de 200)
   - Retorna FilaPrecio[], hasMore, nextOffset
  ↓
4. Frontend muestra TablaImpactoGestionGlobal
   - Carga 200 filas
   - Scroll → carga siguiente 200 (infinite scroll)
   - Resumen de validaciones
   - Click "Enviar a Aprobación"
  ↓
5. ConfirmacionEnvio (Modal)
   - Resumen: Compañía, Lista, Factor, 150 artículos
   - Click "Confirmar Envío"
  ↓
6. Backend POST /api/v1/solicitudes/:id/enviar
   - Cambia ESTADO = "PENDIENTE"
   - Registra en AUDITORIA_SOLICITUD
   - Notifica a Aprobador (email o banner)
  ↓
7. Redirige a /solicitudes/:id/detalle (estado PENDIENTE)
```

---

### 5.2 Flujo Aprobación

```
Usuario (Aprobador)
  ↓
1. Abre página /aprobacion/bandeja
   - Llama GET /api/v1/aprobacion/bandeja (su email)
   - Retorna solicitudes EN_PROCESO con ES_ERROR_TRANSITORIO='S'
  ↓
2. Tabla con solicitudes pendientes (ResponsiveDataTable)
   - Código, Compañía, Solicitante, Estado, Fecha
   - Click en fila → /aprobacion/:id/revisar
  ↓
3. RevisionModal
   - Obtiene GET /api/v1/aprobacion/:id/detalles
   - Muestra TablaResultadoModal (SOLICITUD_DETALLE)
   - Resumen de validaciones
   - Botones: Aprobar, Rechazar
  ↓
4. Si Rechazar:
   - ConfirmacionAprobacion (Modal)
   - Campo obligatorio: Comentario
   - Backend POST /api/v1/solicitudes/:id/rechazar
     - Ejecuta SP_APROBADOR_APRUEBA_RECHAZA (ACCION='RECHAZADA')
     - Cambia ESTADO = "RECHAZADA"
     - Registra en AUDITORIA_APROBACION
   ↓
5. Si Aprobar:
   - Backend POST /api/v1/solicitudes/:id/aprobar
     - Ejecuta SP_APROBADOR_APRUEBA_RECHAZA (ACCION='APROBADA')
     - Cambia ESTADO = "PROCESADO"
     - Registra en AUDITORIA_APROBACION
   ↓
6. Redirige a /aprobacion/bandeja (se refresca)
```

---

## 6. Decisiones Técnicas Clave

### 6.1 Framework Backend
**Opciones:** Python (Flask/FastAPI) vs Node.js (Express/NestJS)
**Recomendación:** Python (FastAPI) por:
- Alineación con data science en Softland
- Type hints nativos (mejor IDE support)
- Mejor documentación automática (Swagger)
- Mejor soporte para DB SQL Server

### 6.2 Lenguaje Backend
**Propuesta:** Python 3.11+
**Decisión Pendiente:** Necesita confirmación de equipo

### 6.3 Validación Excel
**Librería:** `openpyxl` (Python) o `xlsx` (Node.js)
**Flujo:**
1. Frontend valida: extensión `.xlsx`, tamaño < 10MB
2. Backend valida: estructura, campos obligatorios, tipos de datos
3. Backend parsea y valida reglas de negocio (factor rango, etc.)

### 6.4 Paginación de Simulación
**Tamaño de Página:** 200 registros
**Estrategia:** Infinite scroll (ResponsiveDataTable soporta `hasMore`, `nextOffset`)
**Beneficio:** No bloquea UI, permite envío solo si todos los registros fueron revisados

---

## 7. Matriz de Trazabilidad (Requisitos → Componentes)

| Requisito | Componente Frontend | Endpoint Backend | SP PASO 2 |
|-----------|-------------------|-----------------|-----------|
| RF-02 (Gestión global) | FormularioGestionGlobal | POST /simulacion/gestion-global | - |
| RF-03 (Validación ámbito) | Combobox (disabled options) | Authorization middleware | - |
| RF-04 (Seleccionar lista) | FormularioGestionGlobal | GET /recursos/listas | - |
| RF-05 (Validar factor) | FormularioGestionGlobal | POST /validacion/factor | - |
| RF-06 (Simulación obligatoria) | TablaImpactoGestionGlobal | POST /simulacion/gestion-global | - |
| RF-07 (Mostrar impacto) | TablaImpactoGestionGlobal | POST /simulacion/gestion-global | - |
| RF-17 (Enviar a aprobación) | ConfirmacionEnvio | POST /solicitudes/:id/enviar | SP_APROBAR_SOLICITUD |
| RF-18 (No modificar PENDIENTE) | FormularioGestionGlobal (disabled) | Authorization | - |
| RF-32 (Aprobador revisa) | RevisionModal | GET /aprobacion/:id | SP_APROBADOR_APRUEBA_RECHAZA |
| RNF-05 (Segregación funciones) | ConfirmacionAprobacion | Authorization | SP_APROBADOR_APRUEBA_RECHAZA |

---

## 8. Estado de Completitud

**Tarea 1: Arquitectura de Aplicación**
- ✅ Visión general (niveles, componentes)
- ✅ Componentes frontend existentes (reutilizables)
- ✅ Nuevos componentes a crear
- ✅ Estructura de carpetas
- ✅ Endpoints REST definidos
- ✅ Integración con Softland
- ✅ Flujos de usuario
- ✅ Decisiones técnicas

**Próximo:** Tarea 2 - Generación de Unidades de Trabajo

---

**Documento Listo para Aprobación.**

