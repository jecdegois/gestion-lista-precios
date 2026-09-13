# Personas — Interfaz Web de Gestión de Listas de Precio

## Propósito
Representar los roles humanos de la primera liberación y delimitar objetivos, permisos, restricciones, evidencia disponible y riesgos de abuso. La solución incorpora únicamente las tres personas aprobadas durante la planificación.

## P-01 — Solicitante de cambios de precio

| Aspecto | Definición |
|---|---|
| Objetivo | Preparar cambios correctos de precio, validar su impacto y enviarlos a aprobación sin ejecutar cambios productivos. |
| Contexto | Usuario funcional autorizado para uno o más ámbitos de compañía, lista o categoría. |
| Necesidades principales | Crear borradores, simular impacto, cargar y corregir archivos Excel, calcular cambios individuales, consultar sus solicitudes y solicitar cancelaciones. |
| Permisos | Crear y editar borradores; simular; validar; enviar a aprobación; consultar sus propias solicitudes; solicitar la cancelación de una solicitud pendiente. |
| Restricciones | No aprueba sus propias solicitudes, no ejecuta cambios productivos y no opera fuera de sus ámbitos autorizados. Una solicitud pendiente no es editable ni puede reemplazarse el archivo asociado. |
| Evidencia disponible | Simulación o validación, solicitud, comentario de cancelación, decisión sobre la cancelación y resultado final de sus solicitudes. |
| Escenarios de abuso a bloquear | Manipular identificadores, ámbito, factor o archivo desde el cliente; intentar ejecutar sin aprobación; modificar una solicitud pendiente; consultar solicitudes de otros usuarios. |

## P-02 — Aprobador de cambios de precio

| Aspecto | Definición |
|---|---|
| Objetivo | Proteger la integridad de los precios revisando solicitudes pendientes y autorizando solo cambios válidos dentro de su ámbito. |
| Contexto | Responsable de control de cambios con una bandeja de solicitudes pendientes. |
| Necesidades principales | Revisar impacto, validar modalidad de ejecución, aprobar o rechazar con contexto, resolver solicitudes de cancelación y consultar resultados. |
| Permisos | Consultar solicitudes pendientes de sus ámbitos; abrir detalle; aprobar; rechazar con comentario obligatorio; confirmar o denegar cancelaciones; consultar trazabilidad y resultados. |
| Restricciones | No aprueba solicitudes creadas por sí mismo; no altera la simulación, validación o evidencia original; no opera fuera de su ámbito; no autoriza un reproceso sin registrar motivo. |
| Evidencia disponible | Identidad del aprobador, fecha y hora, decisión, comentario de rechazo, decisión de cancelación, identificador de ejecución, intentos y resultado. |
| Escenarios de abuso a bloquear | Autoaprobación; aprobación mediante modificación del identificador de solicitud; aprobación fuera de ámbito; iniciar ejecuciones repetidas; reprocesar sin autorización explícita. |

## P-03 — Auditor/Administrador de consulta

| Aspecto | Definición |
|---|---|
| Objetivo | Verificar el cumplimiento del flujo y reconstruir el historial de una solicitud sin modificar datos operativos ni históricos. |
| Contexto | Rol de consulta autorizado por ámbito; no representa administración de parámetros, soporte técnico ni operación de reprocesos en esta liberación. |
| Necesidades principales | Consultar solicitudes, simulaciones, validaciones, decisiones, resultados, totales, errores funcionales y correlaciones permitidas. |
| Permisos | Acceso de solo lectura al historial completo dentro de los ámbitos asignados. |
| Restricciones | No crea, edita, cancela, aprueba, rechaza ni ejecuta solicitudes. No visualiza secretos, credenciales, datos de conexión, tokens, trazas internas ni diagnósticos técnicos sensibles. |
| Evidencia disponible | Trazabilidad completa de transiciones y resultados de cada solicitud visible, incluida la referencia correlacionable de solicitud y ejecución. |
| Escenarios de abuso a bloquear | Escalamiento de privilegios desde consulta a operación; descarga o visualización de datos fuera de ámbito; alteración o eliminación de evidencia histórica. |

## Matriz de interacción

| Capacidad | Solicitante | Aprobador | Auditor/Administrador |
|---|:---:|:---:|:---:|
| Crear y editar borrador | Sí | No | No |
| Ejecutar simulación o validación previa | Sí | Consulta | Consulta |
| Enviar a aprobación | Sí | No | No |
| Solicitar cancelación de pendiente | Sí | Revisa y decide | Consulta |
| Revisar solicitud pendiente | Consulta propia | Sí | Consulta |
| Aprobar o rechazar | No | Sí, excepto propia | No |
| Confirmar o denegar cancelación | No | Sí, dentro de ámbito | No |
| Disparar ejecución productiva | No; ocurre tras aprobación válida | Autoriza; backend ejecuta | No |
| Autorizar reproceso individual excepcional | No | Sí, con motivo y dentro de ámbito | No |
| Consultar auditoría y resultado | Propias | Ámbito autorizado | Ámbito autorizado, solo lectura |

## Reglas transversales de persona
- La autenticación, autorización, control de ámbito y separación de funciones se validan en el backend para cada operación; ocultar controles en la interfaz no sustituye la validación server-side.
- Los datos de solicitud, simulación, validación y resultado se restringen por la compañía y el rol autorizado; las listas y categorías se validan como datos funcionales contra Softland y las reglas del proceso. Cualquier referencia por identificador se valida contra la compañía del actor para prevenir acceso indirecto no autorizado.
- Las entradas se validan en interfaz y backend: tipo, rango, formato, tamaño de archivo, estructura de plantilla y autorización aplicable.
- Los mensajes para usuarios y registros funcionales no exponen secretos, credenciales, tokens, datos de conexión, rutas internas, trazas ni detalles sensibles.
- La solicitud individual aprobada se ejecuta una sola vez automáticamente. Un reproceso posterior es excepcional, exige autorización explícita del Aprobador, motivo, nueva correlación y preservación de la ejecución original.
- Una solicitud con resultado parcial usa el estado **Con errores**, conserva totales de aplicados y rechazados, y permite consultar el detalle permitido sin iniciar una nueva ejecución automática.
- Todas las transiciones relevantes son auditables con actor, rol, fecha/hora, ámbito y correlación de solicitud y ejecución; la evidencia histórica es de solo lectura para los roles funcionales.

## Validación de contenido
- [x] Markdown validado sin diagramas Mermaid ni ASCII.
- [x] Roles, permisos y restricciones alineados con RF-02, RF-03, RF-17 a RF-35 y RNF-04 a RNF-10.
- [x] Escenarios de abuso alineados con control server-side, segregación de funciones, control de ámbito y comportamiento seguro ante errores.
- [x] No contiene secretos, credenciales, consultas SQL ni instrucciones de implementación.
