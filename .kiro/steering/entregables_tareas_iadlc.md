# Insumo de Tareas y Planificación de Desarrollo (IA-DLC - Kiro)

> **Proyecto:** IV26004 - Aplicación para la Inspección de Inmuebles (AppInspecciones) [cite: 0] 
> **Origen:** Hoja `Entregable_tareas_` del Plan de Trabajo [cite: 0]  
> **Metodología:** IA-DLC con **Kiro**  
> **Uso:** Archivo de dirección (*steering file*) para guiar la planificación de sprints, estimaciones de horas y generación de código del backend/frontend.

---

## 1. Contexto de Planificación e Implementación

Este documento complementa la estimación de infraestructura incorporando el **plan detallado de tareas y entregables por módulo** [cite: 0]. Incluye los tiempos estimados sugeridos por el equipo de desarrollo y las recomendaciones arquitectónicas (como el uso sugerido de AWS AppSync y AWS Amplify para la estrategia offline-first) [cite: 0].

---

## 2. Resumen de Horas Estimadas por Desarrollo por Módulo

A continuación se consolidan las tareas que cuentan con estimaciones específicas y sugerencias del equipo de desarrollo [cite: 0]:

| Módulo / Entregable Padre | Tarea / Descripción | Sugerencia Técnica de Desarrollo | Horas Estimadas |
| :--- | :--- | :--- | :---: |
| **Módulo Autenticación y Control de Acceso** | Desarrollar Lambda CRUD gestión usuarios (Admin API) [cite: 0] | Implementación vía AdminCreateUser de Cognito / PostgreSQL [cite: 0]. | **1h 30m** [cite: 0] |
| **Módulo Autenticación y Control de Acceso** | Implementación autorización basada en roles (4 roles) [cite: 0] | Middleware por rol, decoradores server-side y validación de claims JWT [cite: 0]. | **1h 30m** [cite: 0] |
| **Módulo Autenticación y Control de Acceso** | Desarrollo frontend login y gestión de sesiones offline [cite: 0] | React PWA, integración con Cognito Hosted UI y almacenamiento de tokens [cite: 0]. | **2h** [cite: 0] |
| **Módulo Autenticación y Control de Acceso** | Configuración vistas restringidas por nivel de responsabilidad [cite: 0] | Route guards en frontend React según claims de usuario [cite: 0]. | **2h** [cite: 0] |
| **Módulo Administración Datos Maestros** | Desarrollo frontend web para administración datos maestros [cite: 0] | Componentes UI para ABM de tablas maestras e inmuebles [cite: 0]. | **8h - 16h** [cite: 0] |
| **Planificación y Asistente Interactivo** | Desarrollo sistema Tokens de Trabajo exclusivos por inspector [cite: 0] | Lógica de generación y validación de tokens de inspección asignados [cite: 0]. | **8h** [cite: 0] |
| **Planificación y Asistente Interactivo** | Implementación frontend asistente interactivo de planificación [cite: 0] | Interfaz de asignación y cronograma interactivo [cite: 0]. | **6h** [cite: 0] |
| **Aplicación Móvil/PWA Offline-first** | Desarrollo frontend React PWA con arquitectura offline-first [cite: 0] | *Evaluación AppSync vs Lambda Sync:* Uso de AWS AppSync / Amplify para sincronización automática, resolución de conflictos y GraphQL [cite: 0]. | **5h** [cite: 0] |
| **Aplicación Móvil/PWA Offline-first** | Registro hallazgos escala P/R/B/N con evidencia fotográfica [cite: 0] | Formulario dinámico PWA y captura/almacenamiento local de fotos [cite: 0]. | **6h** [cite: 0] |
| **Módulo Gestión Planes de Acción** | Desarrollo asignación responsables y fechas de cierre [cite: 0] | Backend de asignación de tareas derivadas de incidencias [cite: 0]. | **5h** [cite: 0] |
| **Módulo Gestión Planes de Acción** | Implementación frontend gestión y monitoreo planes de acción [cite: 0] | Vistas de seguimiento de estado (Sin iniciar -> En progreso -> Completada) [cite: 0]. | **5h** [cite: 0] |
| **Módulo Dashboards y Analítica** | Desarrollo visualizaciones y métricas tiempo real [cite: 0] | Gráficos y dashboards agregados por rol [cite: 0]. | **8h** [cite: 0] |
| **Módulo Dashboards y Analítica** | Generación reportes PDF y Excel por criticidad [cite: 0] | Exportación compilada de hallazgos e inspecciones [cite: 0]. | **3h** [cite: 0] |

---

## 3. Lista Completa de Entregables del Proyecto

### 3.1. Incepción, Análisis y Arquitectura
1. **Incepción:** Kick-off formal, alcance MVP, diseño preliminar AWS Serverless offline-first y documentación [cite: 0].
2. **Análisis y Diseño:** Requerimientos por rol, modelo de datos jerárquico (País $\rightarrow$ Ciudad $\rightarrow$ Inmueble $\rightarrow$ Módulo $\rightarrow$ Nivel $\rightarrow$ Zona $\rightarrow$ Área), wireframes y contratos API [cite: 0].
3. **Arquitectura:** Diseño de backend Serverless, frontend PWA offline-first, estrategia de sincronización e integración de seguridad/RBAC [cite: 0].

### 3.2. Infraestructura y Bases de Datos
1. **Base de Datos:** Esquemas PostgreSQL RDS para maestros, usuarios, jerarquías físicas e índices de optimización [cite: 0].
2. **Infraestructura AWS & Google Admin:** Dominio corporativo, registros CNAME/TXT, verificación Amazon SES (salida de sandbox) [cite: 0], OAuth Consent Screen en GCP (Google Workspace Provider) [cite: 0], certificados ACM, Cognito Hosted UI [cite: 0] y despliegue SAM [cite: 0].

### 3.3. Desarrollo Funcional por Módulos
1. **Módulo Autenticación (4 Roles):** Triggers Pre-Token Generation y Post-Confirmation [cite: 0], API Gateway Authorizer [cite: 0], flujo OAuth2 PKCE [cite: 0], políticas de contraseñas y vistas restringidas [cite: 0].
2. **Módulo Datos Maestros:** CRUD inmuebles, memoria descriptiva, repositorio multi-documento y portal web de administración [cite: 0].
3. **Módulo Planificación & Asistente:** Asistente de eventos de inspección, jerarquías físicas y Tokens de Trabajo por inspector [cite: 0].
4. **App Móvil / PWA Offline-First:** Formulario PWA React, hallazgos escala P/R/B/N, captura GPS/timestamp, almacenamiento local IndexedDB/AppSync [cite: 0] y transcripción con AWS Transcribe (v1.1) [cite: 0].
5. **Módulo Sincronización Bidireccional:** Sincronización idempotente offline-first, detección de conectividad y carga masiva [cite: 0].
6. **Módulo Planes de Acción:** Transformación de incidencias críticas en planes de remediación, asignación y seguimiento de estados [cite: 0].
7. **Dashboards y Analítica:** Dashboards de cobertura técnica, métricas en tiempo real y exportación PDF/Excel [cite: 0].

### 3.4. Pruebas, Certificación y Despliegue
1. **Pruebas Integrales:** Unitarias, funcionales offline/sync y seguridad/pentest básico [cite: 0].
2. **Certificación y Despliegue:** Documentación técnica completa, auditoría de carga, despliegue automatizado vía AWS SAM y acta de cierre [cite: 0].

---

## 4. Cómo utilizar este Insumo en Kiro (IA-DLC)

### Ubicación del Archivo
Guarda este contenido en tu repositorio local en:
```text
.kiro/steering/entregables_tareas.md
```

### Prompt de Ejemplo para Kiro (Generación de Código por Tarea)
Para desarrollar cualquiera de los módulos anteriores manteniendo el contexto de tiempo y alcance, puedes ejecutar en Kiro:

> `@entregables_tareas.md @infraestructura_estimacion_iadlc.md`  
> *"Genera el código frontend/backend para la tarea 'Desarrollo sistema Tokens de Trabajo exclusivos por inspector'. Asegúrate de incluir el handler Lambda en Python 3.11, la consulta a RDS PostgreSQL y los contratos API estructurados según las reglas del proyecto."*
