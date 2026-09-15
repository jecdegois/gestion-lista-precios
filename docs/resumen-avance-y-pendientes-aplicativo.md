# MV26020 — Resumen de avance y pendientes

## Propósito

Este resumen acompaña el diagrama `docs/flujo-funcional-aplicativo.drawio`. Distingue el comportamiento que está implementado en el repositorio del comportamiento diseñado que todavía debe consolidarse para una operación productiva segura.

## Flujo que representa el diagrama

1. El **Operador/Solicitante** ingresa al portal, selecciona uno de los procesos disponibles, consulta maestros, realiza una simulación o previsualización y envía la solicitud.
2. La aplicación registra la solicitud en estado `PENDIENTE`, conserva sus filas de simulación y agrega eventos de auditoría.
3. El **Aprobador** consulta la bandeja, abre el detalle y decide:
   - **Rechazar**, con motivo obligatorio; o
   - **Autorizar**, si la solicitud sigue pendiente, pertenece a la compañía visible y no fue creada por el mismo aprobador.
4. La autorización cambia el estado a `EN_PROCESO` y la interfaz permanece disponible. El portal actual hace polling de las solicitudes para mostrar la evolución.
5. En modo real habilitado, una tarea desacoplada dentro del proceso de Next.js invoca la UDF y/o el procedimiento almacenado configurado para la compañía; después persiste un resultado `PROCESADO`, `PROCESADO_CON_ERRORES` o `ERROR_EJECUCION`.
6. El Operador y el Aprobador pueden consultar la solicitud y la auditoría según las capacidades hoy implementadas.

## Avance confirmado

| Área | Estado | Evidencia en el repositorio |
|---|---|---|
| Portal full-stack | Implementado | `app-web` usa Next.js App Router, React, Tailwind, Server Actions y Route Handlers. |
| Identidad de demostración y consulta de usuario | Implementado parcialmente | `LoginScreen.tsx` permite usuarios demo y, fuera de demo, llama a `resolverIdentidad` en `actions.ts`. Aún no existe SSO/IdP real. |
| Procesos de solicitud | Implementado | `NuevaSolicitud.tsx` incluye: gestión global por factor, actualización de Lista Base/MAYOREOD, descuento por artículo/lista y carga masiva de margen. |
| Catálogo Softland y simulación | Implementado | `pricing-repository.ts` consulta niveles activos, artículos, precios, costos y margen; `actions.ts` valida y construye previsualizaciones. |
| Carga Excel | Implementado | `parsearExcel` admite `.xlsx`, valida estructura y devuelve errores funcionales por fila. |
| Maker-checker | Implementado parcialmente | `aprobarSolicitud` exige estado `PENDIENTE`, rol `APROBADOR` y bloquea autoaprobación; `rechazarSolicitud` exige motivo. |
| Persistencia de solicitudes y auditoría | Implementado | `portal-repository.ts` usa `PORTAL_PRECIOS` o almacenamiento en memoria para demo. El DDL documenta solicitud, detalle y eventos. |
| Ejecución posterior a la aprobación | Implementado parcialmente | El estado cambia a `EN_PROCESO`; en modo real `ejecutarProcesamientoReal` invoca los SP/UDF configurados. |
| Procesamiento no bloqueante de interfaz | Implementado parcialmente | La Server Action dispara el procesamiento sin esperarlo y `PortalApp.tsx` actualiza por polling. No hay worker independiente. |
| Multiempresa | Implementado parcialmente | `companies.ts` resuelve esquema y objetos SQL por compañía mediante `COMPANIES_CONFIG`. |
| Protección contra escritura accidental | Implementado | `READ_ONLY_MODE` es verdadero por defecto y `PORTAL_ONLY_MODE` permite bloquear escrituras sobre Softland. |
| Documentación de arquitectura y flujo | Implementado | Existen requisitos, historias, arquitectura de procesamiento asíncrono, diagrama propuesto previo y el nuevo diagrama de flujo actual. |

## Pendientes prioritarios para producción

### 1. Identidad, sesiones y autorización

- Integrar el **SSO/IdP corporativo** con token firmado, expiración y validación server-side en cada operación.
- Resolver compañía, rol y ámbitos desde la identidad autenticada; actualmente el inicio de sesión real recibe correo y compañía desde el cliente.
- Aplicar autorización por objeto: un Solicitante solo debe leer sus solicitudes; Aprobador y Auditor solo las que correspondan a sus ámbitos.
- Habilitar de manera formal el rol **Auditor/Administrador de solo lectura**, que hoy está definido en requisitos y DDL pero no como flujo completo de identidad/UI.
- Proteger o reemplazar los Route Handlers GET actuales, que exponen solicitudes o auditoría sin guardas de sesión u objeto.

### 2. Ejecución asíncrona durable

- Sustituir la promesa desacoplada en el proceso Next.js por una **cola durable y un worker independiente**.
- Registrar una clave de idempotencia, correlación, intentos y bloqueo de trabajo para impedir dobles ejecuciones.
- Implementar reintentos limitados para fallos transitorios, con clasificación de error, timeout y backoff; el requisito establece máximo tres reintentos.
- Crear endpoints de comando y consulta autenticados, por ejemplo iniciar procesamiento y consultar una solicitud individual.

### 3. Integración y modelo de datos

- Alinear el código de `portal-repository.ts` con el DDL vigente de `backend/sql/portal/03_solicitudes.sql`. Se observaron diferencias de nombres, por ejemplo la aplicación usa `SOLICITUD`/`SOLICITUD_DETALLE`, `LISTA_PRECIO`, `SKU` e `IDP_OPERADOR`, mientras el DDL mostrado define `SOLICITUD_PRECIO`/`SOLICITUD_PRECIO_DETALLE`, `LISTA`, `ARTICULO` y no incorpora esas mismas columnas.
- Verificar el contrato de parámetros de los SP de gestión de precios. Para procesos de precio, la llamada actual ejecuta el SP con nivel, versión fija `1` y usuario; debe garantizarse que los factores y filas autorizados por la solicitud sean los que el SP procesa.
- Implementar almacenamiento real de archivos y reportes. La aplicación genera claves que parecen de S3, pero no se observó una integración que suba el archivo o el log.
- Confirmar el modo operativo y realizar pruebas manuales controladas con las credenciales y los objetos SQL Server autorizados.

### 4. Seguridad, operación y calidad

- Configurar cabeceras HTTP de seguridad, validación de sesión, CORS restrictivo, límites de carga y manejo global de errores.
- Estandarizar logs estructurados con correlación, centralización, retención, alertas y auditoría append-only protegida.
- Definir health checks, timeouts de dependencia, límites de concurrencia/capacidad y monitoreo del proceso asíncrono.
- Definir decisiones de recuperación: RTO/RPO, respaldo y restauración, estrategia de despliegue/rollback, pruebas de recuperación e incident response.
- Incorporar pruebas automatizadas convencionales y de propiedades para factores, redondeo, validación Excel, transiciones e idempotencia. El `package.json` no declara una herramienta de pruebas ni `fast-check` actualmente.
- Mantener dependencias actualizadas y añadir análisis de vulnerabilidades y SBOM en CI/CD.

## Riesgos a resolver antes de habilitar escrituras productivas

1. **Autorización insuficiente:** las rutas HTTP de lectura no realizan autenticación ni autorización por objeto; el control de ámbito en la aprobación no usa explícitamente la identidad y ámbitos reales del aprobador.
2. **Durabilidad:** el proceso asíncrono depende del mismo proceso de la aplicación Next.js; una reiniciada, escalado o fallo puede interrumpir una ejecución.
3. **Doble ejecución:** no existe una clave de idempotencia persistente ni un lock de worker para asegurar una sola ejecución efectiva por aprobación.
4. **Desalineación de esquema:** los nombres consumidos por el repositorio deben verificarse contra la versión desplegada del DDL antes de habilitar el modo real.
5. **Evidencia de archivos:** los nombres de archivo y claves de almacenamiento se registran, pero el repositorio no evidencia la persistencia real de los binarios ni de los logs asociados.

## Fuentes revisadas

- `docs/guion-presentacion-flujo-conceptual.md`
- `docs/arquitectura-procesamiento-asincrono-sp.md`
- `aidlc-docs/inception/requirements/requirements.md`
- `aidlc-docs/inception/user-stories/stories.md`
- `app-web/src/components/PortalApp.tsx`
- `app-web/src/components/NuevaSolicitud.tsx`
- `app-web/src/components/LoginScreen.tsx`
- `app-web/src/app/actions.ts`
- `app-web/src/server/companies.ts`
- `app-web/src/server/pricing-repository.ts`
- `app-web/src/server/portal-repository.ts`
- `backend/sql/portal/03_solicitudes.sql`

## Cumplimiento de extensiones habilitadas

| Extensión | Estado | Justificación |
|---|---|---|
| Security Baseline | Conforme como documentación de brechas | El diagrama y resumen no implementan recursos ni cambian comportamiento. Identifican explícitamente las brechas de autenticación, autorización, logging, cabeceras, evidencias y manejo de errores que deben resolverse antes de producción. |
| Resiliency Baseline | Conforme como documentación de brechas | El flujo distingue el mecanismo actual de la arquitectura durable objetivo y documenta cola, worker, idempotencia, reintentos, timeouts, observabilidad, RTO/RPO y recuperación como pendientes. |
| Property-Based Testing | N/A para los artefactos documentales | No se modificó lógica de negocio ni se generó código de pruebas. El resumen identifica las propiedades que requieren cobertura cuando se implemente la capa productiva. |
