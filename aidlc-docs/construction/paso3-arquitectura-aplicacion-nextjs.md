# PASO 3: Arquitectura Full-Stack Next.js - Gestión de Solicitudes + Simulación

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** CONSTRUCTION - Frontend + Backend (Full-Stack Next.js)  
**Objetivo:** Extender aplicación Next.js con formularios de solicitud, simulación de impacto, y API routes para CRUD y validación  
**Fecha:** 2026-09-18  
**Stack:** Next.js 14, React 18, TypeScript, SQL Server (mssql driver)

---

## 1. Visión General - Arquitectura Full-Stack Next.js

```
┌──────────────────────────────────────────────────────────────────┐
│                    NEXT.JS APP (app-web)                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND (React + Tailwind)                                     │
│  ├── Páginas: /solicitudes/nueva-global, nueva-masiva, etc.      │
│  ├── Componentes Reutilizables:                                  │
│  │   ├── Combobox (DDL con búsqueda)                             │
│  │   ├── ResponsiveDataTable (tablas genéricas)                  │
│  │   ├── TablaImpacto* (Gestión Global, Masiva, Individual)      │
│  │   └── Modales (Confirmación, Revisión)                        │
│  └── Hooks: useSolicitud, useSimulacion, useValidacion           │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BACKEND (Next.js Route Handlers + Server Actions)               │
│  ├── API Routes: /api/v1/solicitudes/*, /api/v1/simulacion/      │
│  ├── Server Actions: createSolicitud, enviarSolicitud, etc.      │
│  └── Repository Layer: src/server/                               │
│      ├── solicitud-repository.ts (CRUD solicitud)                │
│      ├── simulacion-repository.ts (Cálculo impacto)              │
│      ├── validacion.ts (Validaciones cliente + servidor)         │
│      └── softland-integration.ts (Consultas Softland)            │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DATA LAYER (SQL Server Connection)                              │
│  ├── PORTAL_PRECIOS (Solicitud, Auditoría)                       │
│  ├── {ESQUEMA_EMPRESA} (Datos operativos Softland)               │
│  └── mssql driver nativo                                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura de Carpetas

```
app-web/
├── src/
│   ├── app/
│   │   ├── layout.tsx (raíz)
│   │   ├── page.tsx (dashboard)
│   │   ├── (auth)/
│   │   │   └── login.tsx
│   │   ├── solicitudes/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx (mis-solicitudes - listado)
│   │   │   ├── nueva-global.tsx (CREAR)
│   │   │   ├── nueva-masiva.tsx (CREAR)
│   │   │   ├── nueva-individual.tsx (CREAR)
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx (detalle solicitud) (CREAR)
│   │   │   │   └── revisar.tsx (aprobador) (CREAR)
│   │   ├── aprobacion/
│   │   │   ├── page.tsx (bandeja aprobación) (CREAR)
│   │   │   └── [id]/
│   │   │       └── revisar.tsx (modal de revisión) (CREAR)
│   │   ├── auditoria/
│   │   │   └── page.tsx (historial - existente, extender)
│   │   └── api/
│   │       └── v1/ (CREAR)
│   │           ├── solicitudes/
│   │           │   ├── route.ts (GET listar, POST crear)
│   │           │   └── [id]/
│   │           │       ├── route.ts (GET detalle, PUT actualizar)
│   │           │       ├── enviar/route.ts (POST enviar aprobación)
│   │           │       └── cancelar/route.ts (POST cancelar)
│   │           ├── simulacion/
│   │           │   ├── gestion-global/route.ts (POST simular global)
│   │           │   ├── gestion-masiva/route.ts (POST simular masiva)
│   │           │   └── gestion-individual/route.ts (POST simular individual)
│   │           ├── validacion/
│   │           │   ├── excel/route.ts (POST validar estructura Excel)
│   │           │   └── factor/route.ts (POST validar factor)
│   │           └── recursos/
│   │               ├── listas/route.ts (GET listas autorizadas)
│   │               ├── articulos/route.ts (GET búsqueda articulos)
│   │               └── plantilla/route.ts (GET/POST plantilla Excel)
│   │
│   ├── components/
│   │   ├── Combobox.tsx (existente, reutilizar)
│   │   ├── Tablas.tsx (existente)
│   │   ├── newComponents/
│   │   │   ├── ResponsiveDataTable.tsx (existente, base)
│   │   │   ├── TablaImpactoGestionGlobal.tsx (existente, extender)
│   │   │   ├── TablaImpactoActualizacionMasiva.tsx (existente, extender)
│   │   │   ├── TablaImpactoDescuentoManual.tsx (existente, extender)
│   │   │   └── TablaResultadoModal.tsx (existente, extender)
│   │   ├── FormularioGestionGlobal.tsx (CREAR)
│   │   ├── FormularioActualizacionMasiva.tsx (CREAR)
│   │   ├── FormularioDescuentoManual.tsx (CREAR)
│   │   ├── RevisionModal.tsx (CREAR)
│   │   ├── ConfirmacionEnvio.tsx (CREAR)
│   │   └── ConfirmacionAprobacion.tsx (CREAR)
│   │
│   ├── server/
│   │   ├── db.ts (existente - conexión SQL Server)
│   │   ├── portal-repository.ts (existente - base)
│   │   ├── solicitud-repository.ts (CREAR)
│   │   │   ├── crearSolicitud(tipo, params)
│   │   │   ├── obtenerSolicitud(id)
│   │   │   ├── listarSolicitudosPorUsuario(email)
│   │   │   ├── actualizarSolicitud(id, data)
│   │   │   └── enviarSolicitudAprobacion(id, usuario)
│   │   ├── simulacion-repository.ts (CREAR)
│   │   │   ├── simularGestionGlobal(compania, lista, factor, offset)
│   │   │   ├── simularActualizacionMasiva(compania, excel, offset)
│   │   │   └── simularDescuentoIndividual(compania, sku, lista, factor)
│   │   ├── validacion-server.ts (CREAR)
│   │   │   ├── validarFactor(factor)
│   │   │   ├── validarExcel(buffer)
│   │   │   ├── validarLista(compania, listaCodigo)
│   │   │   └── validarArticulo(compania, sku)
│   │   └── softland-integration.ts (CREAR)
│   │       ├── obtenerListas(compania)
│   │       ├── buscarArticulos(compania, busqueda)
│   │       ├── ejecutarSimulacionGlobal(SP params)
│   │       └── ejecutarSimulacionMasiva(SP params)
│   │
│   ├── hooks/
│   │   ├── useSolicitud.ts (CREAR)
│   │   ├── useSimulacion.ts (CREAR)
│   │   ├── useValidacion.ts (CREAR)
│   │   └── useRecursos.ts (CREAR)
│   │
│   └── lib/
│       ├── api-client.ts (CREAR - fetch wrapper)
│       ├── validation-client.ts (CREAR - validaciones cliente)
│       ├── format.ts (existente)
│       └── types.ts (existente, extender)
│
└── public/
    └── plantillas/
        └── solicitud-precios-template.xlsx (CREAR)
```

---

## 3. Componentes y Páginas a Crear

### 3.1 Formularios (Componentes)

#### FormularioGestionGlobal.tsx
```typescript
// Props
{
  onSubmit: (data: GestionGlobalParams) => Promise<void>;
  isLoading?: boolean;
  initialData?: Partial<GestionGlobalParams>;
}

// Estados internos
- compania: Combobox (GET /api/v1/recursos/companias)
- lista: Combobox (GET /api/v1/recursos/listas?compania=X)
- factor: number input (validación: 0 < factor <= 2)
- estado: "nuevo" | "simulado" | "enviado"

// Acciones
- Click "Simular": POST /api/v1/simulacion/gestion-global
- Click "Enviar": POST /api/v1/solicitudes/:id/enviar
```

#### FormularioActualizacionMasiva.tsx
```typescript
// Props
{
  onSubmit: (data: ActualizacionMasivaParams) => Promise<void>;
  isLoading?: boolean;
}

// Estados
- compania: Combobox
- archivo: file input
- validacion: { valido: boolean; filas: FilaExcel[] }

// Acciones
- Descargar plantilla: GET /api/v1/recursos/plantilla
- Validar Excel: POST /api/v1/validacion/excel
- Simular: POST /api/v1/simulacion/gestion-masiva
```

#### FormularioDescuentoManual.tsx
```typescript
// Props
{
  onSubmit: (data: DescuentoManualParams) => Promise<void>;
}

// Estados
- compania: Combobox
- articulos: [] (tabla de captura manual)
  - sku: Combobox (GET /api/v1/recursos/articulos?compania=X&busqueda=)
  - lista: Combobox
  - factor: number input

// Acciones
- Agregar fila: push({sku, lista, factor})
- Eliminar fila: splice()
- Simular: POST /api/v1/simulacion/gestion-individual
```

---

### 3.2 Páginas a Crear

#### /solicitudes/page.tsx (Mis Solicitudes)
```typescript
// Componentes
- Header con filtros (estado, tipo proceso)
- ResponsiveDataTable con solicitudes del usuario
- Paginación local (20 filas)
- Click en fila → /solicitudes/:id

// Endpoint
GET /api/v1/solicitudes (user context)
```

#### /solicitudes/nueva-global.tsx
```typescript
// Flujo
1. FormularioGestionGlobal
   - Selecciona compañía, lista, factor
   - Click "Simular" → carga TablaImpactoGestionGlobal (200 filas, infinite scroll)
2. Resumen validaciones
3. Click "Enviar Aprobación" → ConfirmacionEnvio modal
4. Redirige a /solicitudes/:id (estado PENDIENTE)

// Server Action
- createSolicitud() → POST /api/v1/solicitudes
- simulateGlobal() → POST /api/v1/simulacion/gestion-global
- submitForApproval() → POST /api/v1/solicitudes/:id/enviar
```

#### /solicitudes/nueva-masiva.tsx
```typescript
// Similar a nueva-global pero con:
- FormularioActualizacionMasiva (upload Excel)
- POST /api/v1/validacion/excel
- POST /api/v1/simulacion/gestion-masiva
```

#### /solicitudes/nueva-individual.tsx
```typescript
// Similar pero con:
- FormularioDescuentoManual
- Captura manual multi-artículo
- POST /api/v1/simulacion/gestion-individual (por cada artículo)
```

#### /solicitudes/[id]/page.tsx
```typescript
// Mostrar detalles de solicitud
- Encabezado: Código, Estado, Solicitante, Aprobador
- TablaResultadoModal (SOLICITUD_DETALLE)
- Historial de auditoría

// Endpoint
GET /api/v1/solicitudes/:id
```

#### /aprobacion/page.tsx (Bandeja Aprobación)
```typescript
// Listar solicitudes EN_PROCESO (SP_APROBADOR_APRUEBA_RECHAZA)
- ResponsiveDataTable con filtros
- Click fila → /aprobacion/:id/revisar

// Endpoint
GET /api/v1/aprobacion/bandeja (user context)
```

#### /aprobacion/[id]/revisar.tsx
```typescript
// Modal de revisión (nueva página con modal overlay)
- TablaResultadoModal (detalle)
- Resumen validaciones
- Botones: Aprobar, Rechazar

// Server Actions
- aprobarSolicitud() → POST /api/v1/solicitudes/:id/aprobar
- rechazarSolicitud() → POST /api/v1/solicitudes/:id/rechazar
```

---

## 4. API Routes (Next.js Route Handlers)

### 4.1 Rutas de Solicitud

```typescript
// GET /api/v1/solicitudes
// Listar solicitudes del usuario autenticado
Response:
{
  solicitudes: Solicitud[];
  total: number;
  page: number;
  limit: number;
}

// POST /api/v1/solicitudes
// Crear nueva solicitud en BORRADOR
Body: {
  tipo_proceso: "FACTOR_PRECIO" | "MAYOREOD_MASIVO" | ...;
  compania: string;
  parametros: {...};
}
Response: { id_solicitud: number; estado: "BORRADOR" }

// GET /api/v1/solicitudes/:id
// Obtener detalles de solicitud
Response: Solicitud (con SOLICITUD_DETALLE y AUDITORIA)

// PUT /api/v1/solicitudes/:id
// Actualizar solicitud (solo si BORRADOR)
Body: { parametros: {...} }

// POST /api/v1/solicitudes/:id/enviar
// Enviar a aprobación (BORRADOR → PENDIENTE)
Response: { estado: "PENDIENTE" }

// POST /api/v1/solicitudes/:id/cancelar
// Solicitar cancelación
Response: { cancelacion_solicitada: "S" }
```

### 4.2 Rutas de Simulación

```typescript
// POST /api/v1/simulacion/gestion-global
Body: {
  compania: string;
  lista: string;
  factor: number;
  offset: number;      // Para pagination
  limit: number;       // Default 200
}
Response: {
  filas: FilaPrecio[];
  total: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number;
}

// POST /api/v1/simulacion/gestion-masiva
Body: {
  compania: string;
  excel_data: FilaExcel[];
  offset?: number;
}
Response: { filas: FilaPrecio[]; ... }

// POST /api/v1/simulacion/gestion-individual
Body: {
  compania: string;
  sku: string;
  lista: string;
  factor: number;
}
Response: { fila: FilaPrecio }
```

### 4.3 Rutas de Validación

```typescript
// POST /api/v1/validacion/excel
Body: { archivo: File (base64) }
Response: {
  valido: boolean;
  filas: FilaExcel[];
  errores?: { fila: number; causa: string }[];
}

// POST /api/v1/validacion/factor
Body: { factor: number }
Response: { valido: boolean; causa?: string }
```

### 4.4 Rutas de Recursos

```typescript
// GET /api/v1/recursos/listas?compania=SILLACA
Response: [{ value: "MAYOREO", label: "Mayoreo" }, ...]

// GET /api/v1/recursos/articulos?compania=SILLACA&busqueda=ART-
Response: [{ value: "ART-001", label: "ART-001 - Artículo 001" }, ...]

// GET /api/v1/recursos/plantilla
Response: Archivo Excel descargable
```

### 4.5 Rutas de Aprobación

```typescript
// GET /api/v1/aprobacion/bandeja
Response: [solicitud EN_PROCESO, ...]

// GET /api/v1/aprobacion/:id/detalles
Response: {
  solicitud: Solicitud;
  detalles: SOLICITUD_DETALLE[];
  auditoria: AUDITORIA_APROBACION[];
}

// POST /api/v1/solicitudes/:id/aprobar
Body: {}
Response: { estado: "PROCESADO" }

// POST /api/v1/solicitudes/:id/rechazar
Body: { comentario_rechazo: string }
Response: { estado: "RECHAZADA" }
```

---

## 5. Server-Side Logic (Repository Layer)

### 5.1 solicitud-repository.ts

```typescript
export async function crearSolicitud(
  compania: string,
  tipoProc: string,
  params: Record<string, any>,
  userEmail: string
): Promise<{ id: number; codigo: string }> {
  // INSERT SOLICITUD
  // Return ID, CODIGO
}

export async function obtenerSolicitud(id: number): Promise<Solicitud> {
  // SELECT SOLICITUD + DETALLE + AUDITORIA
}

export async function actualizarSolicitud(id: number, params: any): Promise<void> {
  // UPDATE (solo si BORRADOR)
  // Actualizar PARAMETROS_JSON
}

export async function enviarSolicitudAprobacion(id: number, email: string): Promise<void> {
  // UPDATE ESTADO = PENDIENTE, FECHA_SOLICITUD = GETDATE()
  // INSERT AUDITORIA_APROBACION
}
```

### 5.2 simulacion-repository.ts

```typescript
export async function simularGestionGlobal(
  compania: string,
  lista: string,
  factor: number,
  offset: number = 0,
  limit: number = 200
): Promise<{ filas: FilaPrecio[]; total: number; hasMore: boolean; nextOffset?: number }> {
  // Llamar SP_CALCULAR_GESTION_GLOBAL
  // Con paginación: offset, limit
  // Retornar filas + metadata
}

export async function simularActualizacionMasiva(
  compania: string,
  excelData: FilaExcel[],
  offset?: number
): Promise<{ filas: FilaPrecio[]; ... }> {
  // Llamar SP_CALCULAR_GESTION_MASIVA con datos Excel
  // Paginar si necesario
}

export async function simularDescuentoIndividual(
  compania: string,
  sku: string,
  lista: string,
  factor: number
): Promise<FilaPrecio> {
  // Llamar SP_CALCULAR_DESCUENTO
  // Retornar una fila
}
```

### 5.3 validacion-server.ts

```typescript
export function validarFactor(factor: number): { valido: boolean; causa?: string } {
  if (factor <= 0) return { valido: false, causa: "Factor debe ser mayor a 0" };
  if (factor > 2) return { valido: false, causa: "Factor debe ser menor o igual a 2" };
  return { valido: true };
}

export async function validarExcel(
  buffer: Buffer
): Promise<{ valido: boolean; filas: FilaExcel[]; errores?: any[] }> {
  // Usar openpyxl o xlsx para parsear
  // Validar estructura, campos, tipos
  // Retornar filas o errores
}

export async function validarLista(compania: string, codigo: string): Promise<boolean> {
  // Verificar lista existe en Softland
}

export async function validarArticulo(compania: string, sku: string): Promise<boolean> {
  // Verificar artículo existe en Softland
}
```

### 5.4 softland-integration.ts

```typescript
export async function obtenerListas(compania: string): Promise<ComboOption[]> {
  // Consultar Softland: listas activas
  // SELECT NIVEL_PRECIO, DESCRIPCION FROM VERSION_NIVEL WHERE ESTADO='A'
  // Retornar opciones Combobox
}

export async function buscarArticulos(
  compania: string,
  busqueda: string
): Promise<ComboOption[]> {
  // SELECT ARTICULO, DESCRIPCION FROM ARTICULO 
  // WHERE DESCRIPCION LIKE %busqueda%
}

export async function ejecutarSPCalculoGlobal(
  compania: string,
  lista: string,
  factor: number,
  offset: number
): Promise<FilaPrecio[]> {
  // EXEC SP_CALCULAR_GESTION_GLOBAL @lista, @factor, @offset, @limit
  // Retornar dataset
}
```

---

## 6. Client-Side Hooks

### 6.1 useSolicitud.ts

```typescript
export function useSolicitud(id?: number) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const obtener = useCallback(async (solicitudId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/solicitudes/${solicitudId}`);
      setSolicitud(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const crear = useCallback(async (data: CreateSolicitudParams) => {
    // POST /api/v1/solicitudes
  }, []);

  const enviar = useCallback(async (solicitudId: number) => {
    // POST /api/v1/solicitudes/:id/enviar
  }, []);

  return { solicitud, loading, error, obtener, crear, enviar };
}
```

### 6.2 useSimulacion.ts

```typescript
export function useSimulacion() {
  const [filas, setFilas] = useState<FilaPrecio[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const simularGlobal = useCallback(
    async (compania: string, lista: string, factor: number, offset: number = 0) => {
      setLoading(true);
      const res = await fetch("/api/v1/simulacion/gestion-global", {
        method: "POST",
        body: JSON.stringify({ compania, lista, factor, offset }),
      });
      const data = await res.json();
      setFilas((prev) => (offset === 0 ? data.filas : [...prev, ...data.filas]));
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
      setLoading(false);
    },
    []
  );

  return { filas, hasMore, nextOffset, loading, simularGlobal };
}
```

---

## 7. Componentes Reutilizables a Extender

### Existentes (Reutilizar tal cual)
✅ Combobox.tsx  
✅ ResponsiveDataTable.tsx  
✅ TablaImpactoGestionGlobal.tsx  
✅ TablaImpactoActualizacionMasiva.tsx  
✅ TablaImpactoDescuentoManual.tsx  

### Nuevos Componentes
- FormularioGestionGlobal.tsx
- FormularioActualizacionMasiva.tsx
- FormularioDescuentoManual.tsx
- RevisionModal.tsx
- ConfirmacionEnvio.tsx
- ConfirmacionAprobacion.tsx

---

## 8. Flujos de Usuario (Actualizado para Next.js)

### Flujo Gestión Global

```
1. Usuario abre /solicitudes/nueva-global
2. FormularioGestionGlobal
   - Selecciona compañía (Combobox, GET /api/v1/recursos/listas)
   - Selecciona lista (Combobox)
   - Ingresa factor (validación client-side)
   - Click "Simular"
3. useSimulacion().simularGlobal()
   - POST /api/v1/simulacion/gestion-global (offset=0, limit=200)
4. Página muestra TablaImpactoGestionGlobal
   - Carga 200 filas iniciales
   - Scroll → carga 200 más (infinite scroll)
   - ResumenValidaciones
5. Click "Enviar Aprobación"
   - ConfirmacionEnvio modal
   - useSolicitud().enviar()
   - POST /api/v1/solicitudes/:id/enviar
6. Redirige a /solicitudes/:id (PENDIENTE)
```

### Flujo Aprobación

```
1. Aprobador abre /aprobacion
2. GET /api/v1/aprobacion/bandeja
3. ResponsiveDataTable con solicitudes EN_PROCESO
4. Click fila → /aprobacion/:id/revisar
5. GET /api/v1/aprobacion/:id/detalles
6. RevisionModal
   - TablaResultadoModal
   - Botones: Aprobar, Rechazar
7. Si Rechazar:
   - ConfirmacionAprobacion modal (comentario obligatorio)
   - POST /api/v1/solicitudes/:id/rechazar
8. Si Aprobar:
   - POST /api/v1/solicitudes/:id/aprobar
   - Redirige a /aprobacion
```

---

## 9. Integración con PASO 2 (SPs Existentes)

| SP PASO 2 | Usado en | Cuándo |
|-----------|----------|--------|
| SP_APROBADOR_APRUEBA_RECHAZA | API POST /api/v1/solicitudes/:id/aprobar | Aprobador aprueba/rechaza |
| SP_PROCESAR_REINTENTOS | Job (background) | Después de ejecución |
| SP_REPROCESAR_SOLICITUD | API POST /api/v1/solicitudes/:id/reprocesar | Aprobador autoriza reproceso |
| FN_OBTENER_BANDEJA_APROBACION | API GET /api/v1/aprobacion/bandeja | Listar pendientes |

---

## 10. Tecnologías y Dependencias

### Ya Incluidas (package.json existente)
✅ Next.js 14  
✅ React 18  
✅ TypeScript  
✅ Tailwind CSS  
✅ mssql (SQL Server driver)  
✅ xlsx (Excel parsing)  

### Por Verificar
- [ ] openpyxl (si usar en Python) o xlsx nativo
- [ ] React Query o SWR (para estado de datos) — opcional
- [ ] Zod/yup (validación de esquemas) — opcional

---

## 11. Estructura de Tareas PASO 3 (Revisada)

### Tarea 1: Diseño de Arquitectura ✅ COMPLETADA (este documento)

### Tarea 2: Generación de Unidades
- Descomponer en 4-5 unidades
- Definir dependencias
- Timeline por unidad

### Tarea 3: Diseño Funcional por Unidad
- Reglas de negocio
- Estados y transiciones
- Casos de uso

### Tarea 4: NFR Requirements por Unidad
- Performance (response time)
- Seguridad (SSO, autorización)
- Auditoría (logging)

### Tarea 5: Infrastructure Design + Despliegue
- Next.js deployment options (Vercel, Heroku, On-Prem)
- Configuración de variables de entorno
- Estrategia de CI/CD

### Tarea 6: Generación de Código por Unidad
- Implementar componentes
- Implementar rutas API
- Implementar repository functions
- Tests unitarios y de integración

---

## 12. Checklist de Completitud

**Tarea 1: Arquitectura**
- ✅ Diagrama full-stack Next.js
- ✅ Estructura de carpetas
- ✅ Componentes a crear
- ✅ API Routes definidas
- ✅ Repository layer especificado
- ✅ Hooks cliente definidos
- ✅ Flujos de usuario documentados
- ✅ Integración PASO 2 identificada

---

**Documento Listo para Aprobación**

