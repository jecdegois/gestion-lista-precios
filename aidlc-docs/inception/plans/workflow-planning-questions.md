# Preguntas de Planificación del Flujo — Resiliencia y Operación

Estas decisiones pertenecen al usuario y no se asumirán automáticamente. Sus respuestas permitirán cerrar la planificación y orientar el diseño, la infraestructura, el despliegue y la operación de la solución.

## Pregunta 1 — Objetivos de recuperación y estrategia de desastre
¿Qué objetivo de recuperación debe aplicar a la solución de gestión de listas de precio?

A) RPO y RTO de horas; estrategia Backup & Restore.

B) RPO y RTO de decenas de minutos; estrategia Pilot Light.

C) RPO y RTO de minutos; estrategia Warm Standby.

D) RPO cercano a tiempo real y RTO mínimo; estrategia Active/Active multi-sitio.

E) Despliegue en una sola región con tolerancia multi-zona; no se requiere recuperación ante pérdida total de región.

X) Otra opción (describir RPO, RTO y estrategia después de la etiqueta de respuesta).

[Answer]: 

## Pregunta 2 — Gestión de cambios productivos
¿Cómo se deben gobernar los despliegues productivos de la aplicación?

A) Usar el proceso organizacional existente; indicar la herramienta o proceso, por ejemplo CAB, ServiceNow o Jira Change.

B) No existe un proceso formal; definir posteriormente un proceso ligero con registro de cambio, aprobación y nota de rollback.

C) La aplicación está exenta de un proceso formal; describir la justificación.

X) Otra opción (describir el proceso después de la etiqueta de respuesta).

[Answer]: 

## Pregunta 3 — Herramienta de CI/CD
¿Qué enfoque de automatización de despliegue debe seguir la solución?

A) Usar una canalización existente; indicar la herramienta, por ejemplo GitHub Actions, GitLab CI, Jenkins o AWS CodePipeline.

B) No existe una canalización; definirla en el diseño NFR según el runtime e IaC aprobados.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: 

## Pregunta 4 — Mecanismo de rollback de despliegue
¿Cómo se debe revertir un despliegue de aplicación fallido?

A) Redesplegar la versión anterior versionada de artefacto e infraestructura.

B) Volver al entorno anterior mediante blue/green.

C) Reversión automática de canary por degradación de métricas o salud.

D) Requiere rollback consciente de base de datos; documentar reversión de migraciones o datos.

E) Usar el procedimiento organizacional existente; indicar la referencia.

X) Otra opción (describir el mecanismo después de la etiqueta de respuesta).

[Answer]: 

## Pregunta 5 — Estrategia de despliegue
¿Qué estrategia de despliegue se acepta para este perfil de riesgo?

A) Directo o in-place.

B) Rolling.

C) Blue/green.

D) Canary.

X) Otra opción (describir la estrategia después de la etiqueta de respuesta).

[Answer]: 

## Pregunta 6 — Topología regional
¿Qué topología debe usar la solución productiva?

A) Una región con tolerancia multi-zona.

B) Multi-región activa-pasiva.

C) Multi-región activa-activa.

X) Otra opción (describir la topología después de la etiqueta de respuesta).

[Answer]: 

## Pregunta 7 — Proceso de respuesta a incidentes
¿Cómo se deben atender incidentes productivos de esta solución?

A) Usar el proceso organizacional existente; indicar la referencia, por ejemplo on-call, PagerDuty o runbooks internos.

B) No existe un proceso formal; definir posteriormente un proceso ligero de respuesta a incidentes y corrección de errores.

X) Otra opción (describir el proceso después de la etiqueta de respuesta).

[Answer]: 

## Validación de contenido
- [x] Preguntas alineadas con RESILIENCY-02, RESILIENCY-03, RESILIENCY-04, RESILIENCY-08 y RESILIENCY-15.
- [x] Todas las preguntas incluyen opciones significativas, opción final X y etiqueta `[Answer]:`.
- [x] Markdown validado sin diagramas Mermaid ni ASCII.
- [x] No contiene secretos, credenciales, consultas SQL ni decisiones asumidas.
