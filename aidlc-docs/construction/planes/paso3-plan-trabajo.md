# PASO 3: Full-Stack Next.js - Solicitudes + Simulación - Plan de Trabajo

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** CONSTRUCTION - Extensión Next.js Full-Stack  
**Objetivo:** Extender aplicación Next.js existente con formularios de solicitud, simulación de impacto, y API routes para CRUD, validación e integración Softland  
**Fecha Inicio:** 2026-09-18  
**Stack:** Next.js 14, React 18, TypeScript, SQL Server (mssql driver)  
**Ubicación:** app-web/ (un único proyecto, no backend separado)  

---

## 📋 Tareas de PASO 3 (6 Tareas Principales)

### Tarea 1: Diseño de Arquitectura de Aplicación
**Objetivo:** Definir componentes, límites, dependencias, contratos backend e integración corporativa

**Descripción:**
- Definir arquitectura general: Frontend PWA, Backend API REST, Integración Softland
- Identificar componentes principales:
  - **Frontend:** PWA React con 3 flujos (Global, Masivo, Individual)
  - **Backend API:** REST endpoints para Solicitud, Simulación, Aprobación
  - **Integración Softland:** Consultar precios, listas vigentes, ejecutar SP cálculo
  - **Seguridad:** SSO/IdP, validación tokens, autorización por ámbito
- Definir contratos API (GET/POST/PUT endpoints)
- Definir modelo de autorización (roles, ámbitos, segregación)
- Definir flujos de estado (Borrador → Pendiente → Aprobado → Ejecutando → Ejecutado)
- Crear diagrama de componentes y relaciones

**Output:**
- Documento: `paso3-arquitectura-aplicacion.md`
- Diagrama de componentes (Mermaid)
- Contratos API preliminares
- Modelo de autorización

**Status:** ⏳ Por hacer

---

### Tarea 2: Generación de Unidades de Trabajo
**Objetivo:** Descomponer PASO 3 en unidades independientes/secuenciables

**Descripción:**
- Identificar unidades de trabajo:
  - **Unidad 3.1:** Backend API + Core (Solicitud CRUD, Validaciones)
  - **Unidad 3.2:** Simulación (Cálculo de impacto global, masivo, individual)
  - **Unidad 3.3:** Frontend PWA (Formularios, Solicitudes)
  - **Unidad 3.4:** Integración Softland (Cargar listas, artículos, precios)
  - **Unidad 3.5:** Upload de Excel + Validación (Plantilla, parseo, validaciones)
- Definir dependencias entre unidades
- Definir orden de construcción (secuencial o paralelo)
- Estimar horas por unidad

**Output:**
- Documento: `paso3-unidades-de-trabajo.md`
- Matriz de dependencias
- Timeline estimado

**Status:** ⏳ Por hacer

---

### Tarea 3: Diseño Funcional por Unidad
**Objetivo:** Especificar reglas de negocio, transiciones de estado, validaciones

**Descripción:**
- Para cada unidad (3.1 a 3.5):
  - Especificar reglas de factor (rango, límites, validaciones)
  - Especificar flujos de decisión (validación global vs. masiva vs. individual)
  - Especificar transiciones de estado (Borrador → Pendiente → ...)
  - Especificar casos de uso y bordes del comportamiento
  - Especificar validaciones server-side obligatorias

**Output:**
- Documentos: `paso3-unidad-3.1-diseño-funcional.md`, etc. (uno por unidad)

**Status:** ⏳ Por hacer

---

### Tarea 4: NFR Requirements por Unidad
**Objetivo:** Identificar requisitos no funcionales que aplican

**Descripción:**
- Para cada unidad:
  - Identificar SLO/SLA (response time, availability)
  - Identificar requisitos de seguridad (SSO, token validation, autorización)
  - Identificar requisitos de auditoría (logging, correlación)
  - Identificar requisitos de resiliencia (retry, timeout, circuit breaker)
  - Identificar requisitos de performance (carga masiva, consultas)

**Output:**
- Documentos: `paso3-unidad-3.X-nfr-requirements.md` (uno por unidad)

**Status:** ⏳ Por hacer

---

### Tarea 5: NFR Design + Infraestructura por Unidad
**Objetivo:** Cómo se implementan los NFR: patrones, librerías, configuraciones

**Descripción:**
- Para cada unidad:
  - Seleccionar patrones de resiliencia (retry, timeout, circuit breaker)
  - Seleccionar librerías (auth, logging, validation)
  - Configurar observabilidad (CloudWatch, logging estructurado)
  - Definir hosting (Lambda, EC2, etc.)
  - Definir almacenamiento (S3 para Excel, RDS para datos)
  - Definir despliegue (CI/CD, versionado)

**Output:**
- Documentos: `paso3-unidad-3.X-nfr-design.md` (uno por unidad)

**Status:** ⏳ Por hacer

---

### Tarea 6: Generación de Código por Unidad
**Objetivo:** Implementar las unidades según diseños aprobados

**Descripción:**
- Para cada unidad (en orden de dependencia):
  - Crear estructura de carpetas (backend, frontend)
  - Implementar código según diseño funcional
  - Crear tests unitarios
  - Crear tests de integración
  - Validar contra criterios de aceptación

**Output:**
- Código fuente:
  - Backend: `backend/api/` (Python/Node.js)
  - Frontend: `app-web/src/` (React)
- Tests:
  - Backend: `backend/tests/`
  - Frontend: `app-web/tests/`

**Status:** ⏳ Por hacer

---

## 📊 Tabla de Tareas

| Tarea | Descripción | Horas Est. | Prioridad | Status |
|-------|------------|-----------|-----------|--------|
| 1. Arquitectura | Diseño de componentes, contratos, autorización | 4h | CRÍTICA | ⏳ |
| 2. Unidades | Descomposición en 5 unidades independientes | 3h | CRÍTICA | ⏳ |
| 3. Diseño Funcional | Reglas, estados, validaciones por unidad | 8h | CRÍTICA | ⏳ |
| 4. NFR Requirements | SLO, seguridad, auditoría, resiliencia | 6h | ALTA | ⏳ |
| 5. NFR Design | Patrones, librerías, infraestructura | 6h | ALTA | ⏳ |
| 6. Generación de Código | Implementar todas las unidades | 30h | CRÍTICA | ⏳ |
| **Testing + Ajustes** | Pruebas unitarias, integración, funcionales | 10h | CRÍTICA | ⏳ |
| **TOTAL** | | **67h** | | |

---

## 🎯 Próximos Pasos Inmediatos

1. **Tarea 1:** Crear documento de arquitectura
2. **Tarea 2:** Descomponer en unidades
3. **Tareas 3-5:** Diseño funcional, NFR, Infraestructura
4. **Tarea 6:** Generación de código unidad por unidad
5. **Testing:** Validar todas las unidades integradas

---

## 📝 Notas Importantes

- **Dependencia Crítica:** La estructura de PASO 3 depende de los contratos Softland (SPs de precio actual, lista vigencia, cálculo)
- **Lenguaje Backend:** Será decidido en Tarea 1 basándose en disponibilidad de equipo y herramientas corporativas
- **Plantilla Excel:** Debe estar disponible antes de Tarea 6 (para validación de estructura)
- **SSO/IdP:** Debe estar configurado antes de deploy (para autenticación)

---

**PASO 3: Listo para comenzar Diseño de Aplicación (Tarea 1)**

