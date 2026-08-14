# Plan de Generación de Historias de Usuario

## Propósito
Definir el método aprobado para convertir los requisitos de la Interfaz Web de Gestión de Listas de Precio en personas e historias de usuario verificables. Este plan no incluye tareas de implementación, cronogramas ni decisiones técnicas de construcción.

## Insumos
- `aidlc-docs/inception/requirements/requirements.md`
- `aidlc-docs/inception/requirements/requirement-verification-questions.md`
- `aidlc-docs/inception/plans/user-stories-assessment.md`

## Método propuesto
Se propone un enfoque híbrido de **épicas por dominio + recorridos por rol**:

1. Épicas por dominio para mantener trazabilidad funcional: gestión global, carga masiva, gestión individual, aprobación y ejecución, auditoría y consulta.
2. Recorridos por rol para evidenciar separación de responsabilidades: Solicitante, Aprobador y Auditor/Administrador.
3. Historias verticales y pequeñas que incluyan reglas, excepciones y criterios de aceptación observables.
4. Criterios de aceptación en formato Dado/Cuando/Entonces cuando aporte claridad; reglas y validaciones precisas cuando el formato sea más adecuado.

## Alternativas de desglose evaluadas
| Enfoque | Beneficio | Riesgo o limitación | Decisión propuesta |
|---|---|---|---|
| Recorrido de usuario | Expone claramente la experiencia de cada rol. | Puede dispersar reglas compartidas entre varios recorridos. | Se usa como segunda dimensión. |
| Funcionalidad | Agrupa capacidades visibles de forma simple. | Puede ocultar segregación entre actores. | No se usa como estructura principal. |
| Persona | Facilita la lectura por responsabilidad. | Duplica historias cuando una capacidad cubre varios roles. | Se usa para mapeo y revisión. |
| Dominio | Mantiene coherencia con los tres procesos y la gobernanza de cambios. | Requiere un mapeo adicional a los recorridos. | Se usa como estructura principal mediante épicas. |
| Épicas jerárquicas | Simplifica navegación y trazabilidad de requisitos. | Puede producir historias demasiado grandes si no se controla. | Se combina con historias verticales INVEST. |

## Entregables obligatorios de la generación posterior
- [] Crear `aidlc-docs/inception/user-stories/personas.md` con arquetipos, objetivos, responsabilidades, permisos y límites.
- [x] Crear `aidlc-docs/inception/user-stories/stories.md` con épicas e historias de usuario.
- [x] Asociar cada historia con una o más personas relevantes.
- [x] Incluir criterios de aceptación verificables para cada historia.
- [x] Verificar que cada historia cumpla INVEST: independiente, negociable, valiosa, estimable, pequeña y comprobable.
- [] Trazar historias con requisitos funcionales y no funcionales aplicables.
- [] Incorporar restricciones de seguridad, resiliencia y pruebas basadas en propiedades cuando afecten la experiencia o los criterios de aceptación.

## Secuencia de generación propuesta
- [x] Revisar las respuestas de las preguntas de planificación y confirmar que no existan ambigüedades.
- [x] Definir las personas aprobadas y su matriz de interacción.
- [x] Definir las épicas y el mapa de recorridos por rol.
- [x] Redactar historias de gestión global por lista.
- [x] Redactar historias de carga masiva Excel.
- [x] Redactar historias de gestión individual por artículo, lista y factor.
- [x] Redactar historias de aprobación, rechazo, ejecución y recuperación controlada.
- [x] Redactar historias de consulta, auditoría, trazabilidad y control de ámbitos.
- [x] Verificar cobertura de requisitos, INVEST y criterios de aceptación.
- [x] Generar `personas.md` y `stories.md`.
- [x] Solicitar revisión y aprobación explícita de las historias generadas.

## Preguntas de planificación

## Pregunta 1 — Granularidad de historias
¿Cuál nivel de granularidad debe aplicarse a las historias para la primera liberación?

A) Historias pequeñas y verticales, separando creación, simulación, envío, revisión y ejecución cuando tengan validaciones o roles distintos.

B) Historias medianas por proceso completo, agrupando varias acciones del mismo rol en una sola historia.

C) Historias amplias por épica, para detallar posteriormente durante el diseño.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: A

## Pregunta 2 — Personas y operación de soporte
Además de Solicitante, Aprobador y Auditor/Administrador de solo lectura, ¿debe representarse una persona adicional para soporte operativo o administración funcional?

A) No; los tres roles definidos son suficientes para esta liberación.

B) Sí; incluir Administrador Funcional con capacidad de administrar ámbitos y parámetros, sin aprobar solicitudes.

C) Sí; incluir Soporte Técnico, limitado a consultar diagnósticos permitidos y reintentar operaciones autorizadas según procedimiento.

D) Sí; incluir tanto Administrador Funcional como Soporte Técnico, con responsabilidades separadas.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: A

## Pregunta 3 — Cancelación de solicitudes pendientes
Cuando una solicitud se encuentre Pendiente de aprobación, ¿qué comportamiento debe documentarse para el Solicitante?

A) Puede cancelarla con comentario obligatorio; permanece en auditoría y no puede reactivarse.

B) Puede solicitar la cancelación, pero un Aprobador o Administrador debe confirmarla.

C) No puede cancelarla; solo puede crear una nueva solicitud y la pendiente debe ser resuelta por el Aprobador.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: B

## Pregunta 4 — Reporte de errores de carga Excel
¿Cómo debe entregarse al Solicitante el detalle por fila cuando una carga Excel sea rechazada por validaciones?

A) Descargar un archivo Excel de errores con la fila original, columna, código y mensaje de validación.

B) Mostrar el detalle únicamente en pantalla, con filtros y opción de copiar.

C) Mostrar un resumen en pantalla y habilitar la descarga de un archivo Excel de errores.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: B

## Pregunta 5 — Rango de factor individual
¿Cómo se define el rango permitido del factor para una actualización individual?

A) Aplicar siempre el rango global: mayor que cero y menor o igual que dos.

B) Aplicar un rango configurable por compañía y lista, validado por el backend y reflejado en la interfaz.

C) Aplicar un rango configurable por categoría, validado por el backend y reflejado en la interfaz.

D) Aplicar una combinación por compañía, lista y categoría, con precedencia definida por negocio.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: D

## Pregunta 6 — Prevención de ejecución duplicada individual
¿Qué garantía funcional debe recibir el usuario si una actualización individual aprobada se reintenta o se recibe dos veces?

A) La misma solicitud solo puede ejecutarse una vez; cualquier reintento reutiliza el resultado de la ejecución original o continúa de forma segura.

B) El sistema detecta duplicados por combinación de solicitud, artículo y lista durante una ventana temporal definida.

C) El sistema permite una nueva ejecución únicamente si un Aprobador la autoriza explícitamente como reproceso.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: C

## Pregunta 7 — Alcance de consulta de Auditor/Administrador
¿Qué nivel de información puede consultar el rol Auditor/Administrador dentro de sus ámbitos autorizados?

A) Historial completo, simulación, decisión, resultado, totales y errores funcionales, excluyendo secretos y diagnósticos sensibles.

B) Solo historial y estados generales, sin detalles de simulación ni errores.

C) Historial completo y, adicionalmente, trazas técnicas detalladas para investigación operativa.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: A

## Pregunta 8 — Resultado de una ejecución con errores parciales
Cuando un proceso global o masivo autorizado termine con registros rechazados y registros aplicados, ¿cuál debe ser el comportamiento funcional?

A) Estado Con errores, con totales de aplicados/rechazados, detalle descargable o consultable y sin ejecución automática adicional.

B) Estado Fallido y reversión completa de todos los registros procesados.

C) Estado Ejecutada, mostrando advertencias de los registros rechazados.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: X, estado ejecutada con errores

## Pregunta 9 — Métrica de éxito funcional
¿Cuál será el principal criterio de éxito observable para la primera liberación, además de los criterios de aceptación ya definidos?

A) Cero ejecuciones no autorizadas y trazabilidad completa de todas las solicitudes procesadas.

B) Reducción del tiempo operativo de preparación y aprobación de cambios de precio.

C) Reducción de errores de carga y correcciones manuales mediante simulación y validaciones.

D) Combinar A, B y C, definiendo métricas cuantificables durante la planificación posterior.

X) Otra opción (describir la alternativa después de la etiqueta de respuesta).

[Answer]: D

## Validación de contenido
- [x] Markdown validado sin diagramas Mermaid ni ASCII.
- [x] Todas las preguntas incluyen opciones significativas, opción final X y etiqueta `[Answer]:`.
- [x] Las preguntas se limitan a decisiones que afectan personas, recorridos, criterios de aceptación o límites funcionales.
- [x] No contiene tareas de implementación, cronogramas, consultas SQL, secretos ni credenciales.
