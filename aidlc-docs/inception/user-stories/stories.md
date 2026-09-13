# Historias de Usuario — Interfaz Web de Gestión de Listas de Precio

## Convenciones
- **Personas:** P-01 Solicitante, P-02 Aprobador y P-03 Auditor/Administrador, definidas en `personas.md`.
- **Estados funcionales:** Borrador, Pendiente de aprobación, Aprobada, Ejecutando, Ejecutada, Con errores, Rechazada y Error de ejecución. “Con errores” identifica una ejecución parcial con registros aplicados y rechazados; “Error de ejecución” identifica una ejecución que no pudo completarse tras la recuperación permitida.
- **Trazabilidad:** Cada historia indica los requisitos que cubre. Los requisitos no funcionales se aplican sin sustituir validaciones server-side, control de ámbito ni segregación de funciones.
- **Criterios:** Cada criterio es verificable en pruebas funcionales, de seguridad o de integración según corresponda.

## Mapa de épicas

| Épica | Objetivo | Personas principales | Historias |
|---|---|---|---|
| E-01 Gestión global por lista | Preparar y simular cambios proporcionales por lista. | P-01 | HU-01 a HU-03 |
| E-02 Carga masiva Excel | Validar y preparar solicitudes masivas desde plantilla oficial. | P-01 | HU-04 a HU-06 |
| E-03 Gestión individual | Preparar cambios específicos por artículo, lista y factor. | P-01 | HU-07 a HU-08 |
| E-04 Control de cambios | Enviar, cancelar, revisar, aprobar o rechazar solicitudes con segregación. | P-01, P-02 | HU-09 a HU-12 |
| E-05 Ejecución y recuperación | Ejecutar después de aprobar, registrar resultados y controlar reintentos o reprocesos. | P-02, P-01 | HU-13 a HU-15 |
| E-06 Auditoría y consulta | Consultar evidencia y resultados dentro de ámbitos autorizados. | P-01, P-02, P-03 | HU-16 a HU-17 |

---

# E-01 — Gestión global por lista

## HU-01 — Crear borrador de cambio global
**Como** Solicitante, **quiero** seleccionar una lista existente de mi compañía autorizada y definir un factor multiplicador válido, **para** preparar un cambio global de precios sin afectar producción.

**Personas:** P-01  
**Trazabilidad:** RF-02 a RF-05, RF-17, RNF-04 a RNF-06, RNF-10, RNF-12.

### Criterios de aceptación
1. **Dado** un Solicitante autenticado con compañía y rol autorizados, **cuando** abre el formulario global, **entonces** puede consultar listas existentes de su compañía y la interfaz valida la lista contra los maestros Softland.
2. **Dado** un factor ingresado, **cuando** es menor o igual a cero, **entonces** la interfaz impide guardar o simular y muestra un mensaje funcional.
3. **Dado** un factor válido, **cuando** es igual a `1.00`, **entonces** se identifica que no genera variación de precio; **cuando** está entre cero y uno, se identifica como rebaja; y **cuando** es mayor que uno y menor o igual a dos, se identifica como aumento proporcional.
4. **Dado** un intento de usar una lista inexistente o no vigente en Softland, **cuando** la solicitud llega al backend, **entonces** el backend la rechaza aunque la interfaz haya sido manipulada.
5. **Dado** un borrador válido, **cuando** se guarda, **entonces** queda en estado Borrador y conserva actor, fecha/hora, ámbito y parámetros funcionales.

## HU-02 — Simular impacto global obligatorio
**Como** Solicitante, **quiero** simular el impacto de un cambio global antes de enviarlo, **para** detectar inconsistencias y conocer los precios propuestos.

**Personas:** P-01  
**Trazabilidad:** RF-06 a RF-08, RF-32, RF-34, RNF-09 a RNF-12.

### Criterios de aceptación
1. **Dado** un borrador global con factor válido, **cuando** solicito la simulación, **entonces** se muestran precio actual, factor aplicado, precio sugerido y cantidad total de artículos impactados.
2. **Dado** una simulación con precio sugerido no positivo, lista inactiva u otra inconsistencia funcional, **cuando** termina, **entonces** la solicitud queda bloqueada para envío y se muestran las advertencias permitidas.
3. **Dado** una simulación exitosa, **cuando** se guarda su resultado, **entonces** se vincula a la solicitud mediante un identificador correlacionable y queda disponible como evidencia histórica.
4. **Dado** un borrador sin simulación válida vigente, **cuando** el Solicitante intenta enviarlo a aprobación, **entonces** la operación es rechazada.

## HU-03 — Enviar cambio global a aprobación
**Como** Solicitante, **quiero** enviar un cambio global simulado a aprobación, **para** que un Aprobador autorizado determine si puede ejecutarse.

**Personas:** P-01  
**Trazabilidad:** RF-17, RF-18, RF-24, RF-32 a RF-34, RNF-04 a RNF-06, RNF-09.

### Criterios de aceptación
1. **Dado** un borrador global con simulación válida, **cuando** el Solicitante lo envía, **entonces** cambia a Pendiente de aprobación y registra usuario, fecha/hora, simulación y ámbito.
2. **Dado** una solicitud Pendiente de aprobación, **cuando** el Solicitante intenta modificar los parámetros, **entonces** el sistema rechaza la edición.
3. **Dado** una solicitud Pendiente de aprobación, **cuando** el Solicitante pide cancelación con comentario, **entonces** la solicitud queda pendiente de confirmación por un Aprobador o Administrador autorizado y se conserva toda la evidencia previa.
4. **Dado** cualquier solicitud global, **cuando** no existe una aprobación válida, **entonces** no existe una acción disponible para ejecutar cambios productivos.

---

# E-02 — Carga masiva Excel

## HU-04 — Obtener plantilla oficial y cargar Excel
**Como** Solicitante, **quiero** descargar la plantilla oficial y cargar un archivo `.xlsx`, **para** preparar una actualización masiva con una estructura controlada.

**Personas:** P-01  
**Trazabilidad:** RF-09, RF-10, RF-17, RF-32, RNF-04 a RNF-06, RNF-10.

### Criterios de aceptación
1. **Dado** un Solicitante autorizado, **cuando** solicita la plantilla, **entonces** obtiene la versión oficial permitida para su ámbito.
2. **Dado** un archivo cargado, **cuando** no tiene extensión `.xlsx`, excede los límites definidos o no corresponde a la estructura de plantilla, **entonces** se rechaza antes de crear una solicitud apta para aprobación.
3. **Dado** un archivo válido en estructura, **cuando** se inicia su validación, **entonces** se registra una solicitud en Borrador con el usuario, el ámbito y la referencia correlacionable del archivo, sin exponer contenido sensible.
4. **Dado** una carga, **cuando** el backend recibe el archivo, **entonces** vuelve a validar tipo, tamaño, estructura y autorización; la interfaz no es el único control.

## HU-05 — Validar carga masiva y mostrar errores
**Como** Solicitante, **quiero** conocer en pantalla los errores por fila de una carga inválida, **para** corregir el archivo completo antes de enviarlo.

**Personas:** P-01  
**Trazabilidad:** RF-10, RF-11, RF-32, RNF-10, RNF-11.

### Criterios de aceptación
1. **Dado** un archivo `.xlsx` cargado, **cuando** se validan campos obligatorios, formatos numéricos y reglas funcionales, **entonces** cada fila inválida queda identificada con su número, columna, código y mensaje funcional.
2. **Dado** al menos una fila inválida, **cuando** finaliza la validación, **entonces** la carga completa se rechaza para envío a aprobación.
3. **Dado** una carga rechazada, **cuando** el Solicitante consulta el detalle, **entonces** visualiza los errores en pantalla con filtros y opción de copiar, sin necesidad de descargar un archivo adicional.
4. **Dado** una validación exitosa, **cuando** no hay filas inválidas, **entonces** se habilita el resumen de impacto previo al envío.

## HU-06 — Revisar impacto y enviar carga válida
**Como** Solicitante, **quiero** revisar el impacto de una carga válida y enviarla a aprobación, **para** someter el cambio masivo al control requerido.

**Personas:** P-01  
**Trazabilidad:** RF-12, RF-17, RF-18, RF-24, RF-32 a RF-34, RNF-04 a RNF-06, RNF-09.

### Criterios de aceptación
1. **Dado** una carga sin errores de validación, **cuando** el Solicitante revisa el resumen, **entonces** visualiza la cantidad de registros que se procesarían y el impacto funcional disponible.
2. **Dado** una carga válida revisada, **cuando** se envía a aprobación, **entonces** cambia a Pendiente de aprobación y conserva la evidencia de validación y resumen.
3. **Dado** una carga pendiente, **cuando** el Solicitante intenta reemplazar el archivo o editar registros, **entonces** el sistema rechaza la modificación.
4. **Dado** una carga pendiente, **cuando** el Solicitante solicita su cancelación con comentario, **entonces** se aplica el flujo de confirmación autorizado y se mantiene la evidencia.

---

# E-03 — Gestión individual por artículo, lista y factor

## HU-07 — Preparar cambio individual con cálculo en tiempo real
**Como** Solicitante, **quiero** seleccionar un artículo, una lista y un factor aplicable, **para** visualizar el precio final antes de solicitar un cambio individual.

**Personas:** P-01  
**Trazabilidad:** RF-02, RF-03, RF-13 a RF-16, RF-17, RNF-04 a RNF-06, RNF-10 a RNF-12.

### Criterios de aceptación
1. **Dado** un Solicitante autenticado con compañía y rol autorizados, **cuando** busca un artículo o SKU, **entonces** obtiene artículos y listas disponibles en los maestros Softland de su compañía.
2. **Dado** un artículo y lista válidos, **cuando** se ingresa un factor numérico, **entonces** se muestra en tiempo real `Precio Final = Precio Base × Factor` junto con artículo/SKU, precio base, factor y advertencias.
3. **Dado** un factor no numérico, menor o igual a cero o fuera del rango resuelto por compañía, lista y categoría, **cuando** se valida, **entonces** se bloquea el envío y se explica el motivo funcional.
4. **Dado** varias reglas de rango aplicables, **cuando** el backend resuelve la autorización, **entonces** aplica la precedencia de negocio configurada y devuelve a la interfaz el resultado permitido sin revelar reglas técnicas sensibles.

## HU-08 — Enviar cambio individual a aprobación
**Como** Solicitante, **quiero** enviar un cambio individual validado a aprobación, **para** que solo se aplique después de una autorización independiente.

**Personas:** P-01  
**Trazabilidad:** RF-16 a RF-18, RF-22 a RF-24, RF-32 a RF-34, RNF-04 a RNF-06, RNF-08 a RNF-10.

### Criterios de aceptación
1. **Dado** un cambio individual válido, **cuando** el Solicitante lo envía, **entonces** cambia a Pendiente de aprobación y conserva los datos calculados y advertencias resueltas.
2. **Dado** una solicitud individual pendiente, **cuando** el Solicitante intenta editarla, **entonces** debe crear un nuevo borrador o solicitar cancelación conforme al flujo autorizado.
3. **Dado** un cambio individual, **cuando** no tiene aprobación válida, **entonces** el backend no permite actualizar la tabla operativa o de gestión.
4. **Dado** una solicitud individual aprobada, **cuando** la ejecución se inicia, **entonces** el backend aplica únicamente la actualización directa autorizada, con validación de ámbito, segregación y auditoría.

---

# E-04 — Control de cambios

## HU-09 — Consultar y revisar solicitudes pendientes
**Como** Aprobador, **quiero** acceder a una bandeja de solicitudes pendientes de mi ámbito, **para** revisar el impacto antes de emitir una decisión.

**Personas:** P-02  
**Trazabilidad:** RF-02, RF-03, RF-17, RF-20, RF-33, RF-34, RNF-04 a RNF-06, RNF-09, RNF-10.

### Criterios de aceptación
1. **Dado** un Aprobador autenticado, **cuando** abre su bandeja, **entonces** solo visualiza solicitudes Pendientes de aprobación dentro de su ámbito.
2. **Dado** una solicitud pendiente visible, **cuando** consulta su detalle, **entonces** visualiza proceso, compañía, registros impactados, impacto estimado, simulación o validación y modalidad de ejecución.
3. **Dado** una solicitud creada por el mismo Aprobador, **cuando** intenta revisarla para aprobarla, **entonces** el sistema bloquea la autoaprobación tanto en interfaz como en backend.
4. **Dado** una solicitud fuera del ámbito, **cuando** se intenta consultar por identificador, **entonces** el backend deniega el acceso sin exponer información no autorizada.

## HU-10 — Aprobar solicitud y confirmar ejecución
**Como** Aprobador, **quiero** confirmar explícitamente una solicitud válida, **para** autorizar la única ejecución productiva permitida.

**Personas:** P-02  
**Trazabilidad:** RF-20 a RF-25, RF-27, RF-32 a RF-35, RNF-04 a RNF-10.

### Criterios de aceptación
1. **Dado** una solicitud pendiente y autorizada, **cuando** el Aprobador elige aprobar, **entonces** el sistema presenta un modal con proceso, compañía, registros impactados, impacto estimado y modalidad de ejecución.
2. **Dado** que el Aprobador confirma el modal, **cuando** cumple separación de funciones y ámbito, **entonces** se registra la aprobación y la solicitud cambia a Aprobada y después a Ejecutando antes de iniciar la operación.
3. **Dado** que la solicitud es global o masiva, **cuando** se ejecuta tras aprobar, **entonces** el backend invoca exclusivamente el Stored Procedure autorizado para la solicitud.
4. **Dado** que la solicitud es individual, **cuando** se ejecuta tras aprobar, **entonces** el backend aplica solamente la actualización directa autorizada y auditada.
5. **Dado** una aprobación ya procesada, **cuando** se recibe una nueva orden equivalente, **entonces** no se inicia una segunda ejecución automática.

## HU-11 — Rechazar solicitud con evidencia
**Como** Aprobador, **quiero** rechazar una solicitud con un comentario obligatorio, **para** comunicar la causa y preservar la evidencia para una corrección posterior.

**Personas:** P-02  
**Trazabilidad:** RF-19, RF-32 a RF-34, RNF-04 a RNF-06, RNF-10.

### Criterios de aceptación
1. **Dado** una solicitud pendiente dentro del ámbito del Aprobador, **cuando** elige rechazarla, **entonces** el sistema exige un comentario no vacío antes de confirmar.
2. **Dado** un rechazo confirmado, **cuando** se registra, **entonces** la solicitud pasa a Rechazada y conserva la simulación o validación original junto con actor, fecha/hora y comentario.
3. **Dado** una solicitud rechazada, **cuando** el Solicitante la consulta, **entonces** puede conocer la causa funcional sin acceder a detalles técnicos sensibles.

## HU-12 — Confirmar solicitud de cancelación
**Como** Aprobador, **quiero** confirmar o denegar una solicitud de cancelación de una solicitud pendiente, **para** asegurar que el retiro de un cambio conserve control y trazabilidad.

**Personas:** P-02, P-01  
**Trazabilidad:** RF-18, RF-32 a RF-34, RNF-04 a RNF-06, RNF-09, RNF-10.

### Criterios de aceptación
1. **Dado** una solicitud pendiente con una petición de cancelación, **cuando** un Aprobador del ámbito la revisa, **entonces** puede confirmarla o denegarla y debe registrar su decisión.
2. **Dado** una cancelación confirmada, **cuando** se completa, **entonces** la solicitud deja de estar disponible para aprobación o ejecución y se conserva toda su evidencia.
3. **Dado** una cancelación denegada, **cuando** se registra, **entonces** la solicitud conserva el estado Pendiente de aprobación y el Solicitante puede consultar la decisión.
4. **Dado** una petición de cancelación, **cuando** el solicitante no está autorizado o la solicitud no está pendiente, **entonces** el backend la rechaza.

---

# E-05 — Ejecución y recuperación controlada

## HU-13 — Consultar resultado de ejecución
**Como** Solicitante o Aprobador, **quiero** consultar el resultado correlacionado de una ejecución, **para** conocer qué registros fueron procesados y si se requiere seguimiento.

**Personas:** P-01, P-02  
**Trazabilidad:** RF-26 a RF-28, RF-33, RF-34, RNF-08 a RNF-10.

### Criterios de aceptación
1. **Dado** una ejecución finalizada, **cuando** un usuario autorizado consulta la solicitud, **entonces** visualiza identificador de ejecución, estado final, totales procesados, aceptados y rechazados, y detalle permitido de errores o rechazos.
2. **Dado** una ejecución con todos los registros aplicados, **cuando** finaliza, **entonces** la solicitud queda en Ejecutada.
3. **Dado** una ejecución parcial con registros aplicados y rechazados, **cuando** finaliza, **entonces** la solicitud queda en Con errores, conserva los totales y ofrece detalle consultable.
4. **Dado** una ejecución que no puede completarse, **cuando** finaliza, **entonces** la solicitud queda en Error de ejecución y conserva evidencia técnica permitida.
5. **Dado** un Solicitante, **cuando** consulta resultados, **entonces** solo accede a sus propias solicitudes; un Aprobador accede a las de su ámbito.

## HU-14 — Recuperar fallos transitorios sin duplicar cambios
**Como** Aprobador, **quiero** que el sistema recupere automáticamente fallos transitorios dentro de límites seguros, **para** evitar intervenciones manuales innecesarias sin producir cambios duplicados.

**Personas:** P-02; visibilidad para P-01  
**Trazabilidad:** RF-29 a RF-31, RF-32, RF-34, RNF-08 a RNF-10.

### Criterios de aceptación
1. **Dado** un fallo transitorio definido, **cuando** ocurre durante una ejecución autorizada, **entonces** el backend puede reintentar hasta tres veces y registra cada intento con el identificador correlacionable.
2. **Dado** un error funcional, de validación, autorización o configuración, **cuando** ocurre, **entonces** el backend no realiza reintentos automáticos.
3. **Dado** tres reintentos transitorios fallidos, **cuando** se alcanza el límite, **entonces** la solicitud queda en Error de ejecución y conserva evidencia técnica permitida.
4. **Dado** un reintento, **cuando** se recibe una señal o solicitud duplicada, **entonces** se preserva la garantía de una sola ejecución automática por aprobación.

## HU-15 — Autorizar reproceso excepcional de una solicitud individual
**Como** Aprobador, **quiero** autorizar explícitamente un reproceso excepcional de una solicitud individual, **para** resolver una ejecución fallida o corregida sin perder la trazabilidad ni permitir duplicados automáticos.

**Personas:** P-02; visibilidad para P-01 y P-03  
**Trazabilidad:** RF-23, RF-25 a RF-28, RF-32 a RF-34, RNF-05, RNF-08 a RNF-10.

### Criterios de aceptación
1. **Dado** una solicitud individual con Error de ejecución o resultado que requiere reproceso, **cuando** un Aprobador autorizado solicita reprocesarla, **entonces** debe confirmar explícitamente la acción y se registra su identidad, motivo y referencia a la ejecución original.
2. **Dado** un reproceso autorizado, **cuando** se inicia, **entonces** recibe un nuevo identificador correlacionable y no sobrescribe la evidencia de la ejecución original.
3. **Dado** una solicitud individual que ya tuvo una ejecución automática, **cuando** no existe una autorización explícita de reproceso, **entonces** el backend rechaza cualquier intento de segunda ejecución.
4. **Dado** un Aprobador fuera de ámbito o creador de la solicitud, **cuando** intenta autorizar el reproceso, **entonces** el backend lo deniega.

---

# E-06 — Auditoría y consulta

## HU-16 — Consultar historial y trazabilidad autorizada
**Como** Auditor/Administrador, **quiero** consultar el historial completo de solicitudes dentro de mis ámbitos, **para** verificar el cumplimiento del flujo sin alterar sus evidencias.

**Personas:** P-03  
**Trazabilidad:** RF-32 a RF-35, RNF-04 a RNF-06, RNF-09, RNF-10.

### Criterios de aceptación
1. **Dado** un Auditor/Administrador autenticado, **cuando** consulta el historial, **entonces** solo visualiza solicitudes dentro de sus ámbitos autorizados y no recibe controles de modificación.
2. **Dado** una solicitud visible, **cuando** abre su detalle, **entonces** puede consultar creación, edición o cancelación, validación, envío, apertura por Aprobador, aprobación o rechazo, ejecución, resultado, actores y fechas/horas.
3. **Dado** un historial consultado, **cuando** contiene una simulación, una decisión, un rechazo o un resultado, **entonces** el detalle preserva la evidencia asociada y los totales funcionales.
4. **Dado** un dato sensible, **cuando** se muestra una pantalla, respuesta o bitácora, **entonces** no se exponen contraseñas, secretos, credenciales, datos de conexión ni diagnósticos técnicos restringidos.

## HU-17 — Mantener una bitácora de cambios confiable
**Como** Auditor/Administrador, **quiero** que toda transición relevante quede registrada de forma correlacionable, **para** reconstruir quién hizo qué y cuándo ante una revisión.

**Personas:** P-03; beneficiarios P-01 y P-02  
**Trazabilidad:** RF-27, RF-28, RF-32 a RF-35, RNF-08 a RNF-10.

### Criterios de aceptación
1. **Dado** una creación, edición, cancelación, validación, envío, revisión, aprobación, rechazo, ejecución, reintento o reproceso, **cuando** se confirma, **entonces** se registra actor, rol, fecha/hora, transición, ámbito y correlación con la solicitud y ejecución.
2. **Dado** un usuario funcional, **cuando** intenta alterar una evidencia histórica de auditoría, **entonces** el sistema deniega la acción.
3. **Dado** un error o acceso denegado, **cuando** se registra para observabilidad, **entonces** el registro evita secretos, credenciales, datos de conexión y detalles técnicos expuestos al usuario.
4. **Dado** una solicitud y su ejecución, **cuando** se consultan en distintos componentes, **entonces** comparten identificadores correlacionables para permitir seguimiento.

---

# Cobertura y calidad de historias

## Matriz de trazabilidad reforzada

### Requisitos funcionales
| Requisito | Historias | Evidencia funcional esperada |
|---|---|---|
| RF-01 a RF-03 — Procesos y ámbitos | HU-01, HU-04, HU-07 a HU-10, HU-12, HU-13, HU-16 | El rol solo visualiza y opera procesos, solicitudes y datos pertenecientes a su ámbito autorizado. |
| RF-04 a RF-08 — Gestión global y simulación | HU-01 a HU-03 | Borrador, factor válido, simulación obligatoria, impacto persistido y bloqueo por inconsistencia. |
| RF-09 a RF-12 — Carga masiva Excel | HU-04 a HU-06 | Plantilla `.xlsx`, validación estructural y por fila, rechazo integral, detalle en pantalla y resumen previo. |
| RF-13 a RF-16 — Gestión individual | HU-07 y HU-08 | Artículo/lista autorizados, cálculo en tiempo real, factor dentro de rango y solicitud pendiente. |
| RF-17 a RF-20 — Estados y decisión | HU-03, HU-06, HU-08 a HU-12 | Transiciones auditables, solicitud pendiente inmutable, cancelación decidida, rechazo comentado y modal de confirmación. |
| RF-21 a RF-25 — Ejecución autorizada | HU-08, HU-10, HU-14 y HU-15 | Global/masivo usan el SP autorizado; individual usa actualización directa autorizada; inicio en Ejecutando; no hay ejecución previa a aprobación. |
| RF-26 a RF-31 — Resultado y recuperación | HU-13 a HU-15 | Ejecutada para éxito total, Con errores para parcial, Error de ejecución al agotar reintentos, sin reintentar errores no transitorios. |
| RF-32 a RF-35 — Auditoría y protección | HU-01 a HU-17, especialmente HU-16 y HU-17 | Actor, rol, tiempo, transición, ámbito, correlación y evidencia histórica sin exposición de datos sensibles. |

### Requisitos no funcionales y extensiones
| Requisito o restricción | Historias | Criterio de control |
|---|---|---|
| RNF-01 a RNF-04 — Identidad corporativa y autorización | HU-01, HU-04, HU-07, HU-09, HU-10, HU-12, HU-15 y HU-16 | El backend valida identidad, token, rol, ámbito y autorización por solicitud en cada operación. |
| RNF-05 y RNF-06 — Segregación y control de ámbito | HU-01, HU-07, HU-09, HU-10, HU-12 y HU-15 | Autoaprobación, acceso por identificador y operaciones fuera de ámbito se deniegan server-side. |
| RNF-07 y SECURITY-05/08/11/13/15 | HU-01, HU-04, HU-05, HU-07 a HU-10, HU-12, HU-14 a HU-17 | Entradas verificadas en backend, abuso bloqueado, evidencia íntegra y errores seguros. |
| RNF-08 y RESILIENCY funcional | HU-10, HU-13 a HU-15 y HU-17 | Estados controlados, máximo tres reintentos transitorios, idempotencia, reproceso explícito y correlación. |
| RNF-09, SECURITY-03 y RESILIENCY-05 | HU-02, HU-10, HU-13 a HU-15 y HU-17 | Identificadores correlacionables entre solicitud, aprobación, intento y resultado; el detalle técnico se concreta en diseño. |
| RNF-10 y SECURITY-15 | HU-02, HU-05, HU-11, HU-13, HU-16 y HU-17 | Mensajes funcionales y bitácoras sin secretos, credenciales ni detalles internos. |
| RNF-11, RNF-12 y PBT-03/04/10 | HU-01, HU-02, HU-05, HU-07, HU-10, HU-14 y HU-15 | Invariantes de factor y cálculo, rechazo integral de Excel e idempotencia se probarán con PBT y ejemplos en etapas posteriores. |

## Restricciones transversales revisadas
1. **Autorización en profundidad:** toda operación de lectura o mutación valida identidad, rol, ámbito y autorización sobre la solicitud; la interfaz es una capa de experiencia, no un control de seguridad suficiente.
2. **Ejecución controlada:** ninguna solicitud ejecuta cambios productivos antes de una aprobación válida. Global y masivo invocan exclusivamente el SP autorizado; individual usa únicamente la actualización directa autorizada tras aprobación.
3. **Integridad de flujo:** una aprobación produce como máximo una ejecución automática. Las señales repetidas, reintentos y peticiones duplicadas no deben producir cambios adicionales. Un reproceso individual es una operación independiente, excepcional y explícitamente aprobada.
4. **Errores y estado:** éxito total termina en Ejecutada; resultado parcial termina en Con errores; agotamiento de recuperación o fallo no recuperable termina en Error de ejecución. Los errores funcionales, de autorización o configuración no se reintentan.
5. **Protección de datos:** archivos, entradas, parámetros, identificadores y filtros se validan en frontend y backend. Respuestas, auditoría y mensajes no revelan secretos ni diagnósticos sensibles.
6. **Trazabilidad confiable:** toda transición registra actor, rol, tiempo, ámbito, correlación y resultado. Los roles funcionales no pueden alterar la evidencia histórica.
7. **Pruebas futuras obligatorias:** el diseño funcional identificará propiedades; la construcción incluirá pruebas convencionales y PBT para invariantes de factor, cálculo de precios, validación de archivos e idempotencia, con generadores válidos, shrinking y semillas reproducibles.

## Evaluación INVEST
| Criterio | Resultado |
|---|---|
| Independiente | Las historias separan creación, validación, envío, aprobación, ejecución y consulta; comparten dependencias de dominio explícitas sin mezclar responsabilidades. |
| Negociable | Especifican resultado y restricciones; no prescriben tecnologías, consultas SQL ni estructuras de datos. |
| Valiosa | Cada historia habilita una capacidad verificable para una persona o protege una regla de control de cambios. |
| Estimable | Los límites, roles, estados, reglas y criterios de aceptación están identificados. |
| Pequeña | Las historias se mantienen verticales por acción y rol; el desglose en unidades se realizará posteriormente. |
| Comprobable | Todos los ítems incluyen criterios de aceptación observables. |

## Cumplimiento de extensiones habilitadas

### Security Baseline
| Regla | Estado | Aplicación en historias |
|---|---|---|
| SECURITY-01 a SECURITY-03 | N/A en esta fase | Cifrado y configuración de logging centralizado se definirán en diseño e infraestructura; se preservan restricciones de no exponer datos sensibles. |
| SECURITY-04 | N/A en esta fase | Los encabezados HTTP se definirán en diseño de la aplicación web. |
| SECURITY-05 | Conforme | Validación de factores, archivos y solicitudes en interfaz y backend: HU-01, HU-04, HU-05, HU-07 y HU-08. |
| SECURITY-06 a SECURITY-07 | N/A en esta fase | IAM y red se definirán en infraestructura. |
| SECURITY-08 | Conforme | Autenticación, control server-side de ámbito, autorización por objeto y anti-autoaprobación: HU-01, HU-07, HU-09, HU-10, HU-12 y HU-15. |
| SECURITY-09 a SECURITY-10 | N/A en esta fase | Hardening y cadena de suministro se definirán en diseño, IaC y CI/CD. |
| SECURITY-11 | Conforme | Casos de abuso cubiertos: manipulación de ámbitos, autoaprobación, duplicados y reprocesos: HU-01, HU-09, HU-10, HU-14 y HU-15. |
| SECURITY-12 | N/A en esta fase | SSO/IdP y sesión se concretarán en diseño; RNF-01 a RNF-04 quedan trazados. |
| SECURITY-13 | Conforme | Cambios críticos auditables: HU-10, HU-15 y HU-17. |
| SECURITY-14 | N/A en esta fase | Alertas y retención se definirán en NFR e infraestructura. |
| SECURITY-15 | Conforme | Errores funcionales seguros y sin exposición de detalles: HU-02, HU-05, HU-13, HU-14, HU-16 y HU-17. |

### Resiliency Baseline
| Regla | Estado | Aplicación en historias |
|---|---|---|
| RESILIENCY-01 a RESILIENCY-04 | N/A en esta fase | Criticidad, RTO/RPO, cambios, CI/CD, despliegue y rollback se definirán en requisitos NFR e infraestructura. |
| RESILIENCY-05 a RESILIENCY-07 | N/A en esta fase | Observabilidad técnica, health checks y alarmas se definirán en diseño e infraestructura; se requiere correlación funcional en HU-02, HU-13, HU-14 y HU-17. |
| RESILIENCY-08 | N/A en esta fase | La topología de alta disponibilidad se definirá en infraestructura. |
| RESILIENCY-09 a RESILIENCY-13 | N/A en esta fase | Continuidad, recuperación de datos y capacidad se definirán en etapas especializadas. |
| RESILIENCY-14 | N/A en esta fase | Pruebas de resiliencia se definirán en Build and Test. |
| RESILIENCY-15 | N/A en esta fase | Proceso de incidentes se definirá en Operaciones. |
| Control funcional de resiliencia | Conforme | Límite de tres reintentos transitorios, sin reintentos funcionales, correlación e idempotencia: HU-10, HU-13 a HU-15 y HU-17. |

### Property-Based Testing
| Regla | Estado | Aplicación en historias |
|---|---|---|
| PBT-01 | N/A en esta fase | La identificación formal de propiedades será parte de Diseño Funcional. |
| PBT-02 | N/A en esta fase | No se definieron operaciones inversas en esta fase. |
| PBT-03 | Conforme | Las historias preservan invariantes de factor, límites y cálculo: HU-01, HU-02 y HU-07. |
| PBT-04 | Conforme | La garantía de una única ejecución automática y el reproceso explícito requieren pruebas de idempotencia: HU-10, HU-14 y HU-15. |
| PBT-05 a PBT-09 | N/A en esta fase | Oráculos, pruebas stateful, generadores, reproducibilidad y framework se definirán en diseño funcional, NFR y generación de código. |
| PBT-10 | Conforme | Criterios verificables identifican escenarios críticos que deberán tener pruebas convencionales junto a PBT: HU-01, HU-05, HU-10, HU-13 a HU-15. |

## Validación de contenido
- [x] Markdown validado sin diagramas Mermaid ni ASCII.
- [x] Las 17 historias tienen persona, valor, criterios de aceptación y trazabilidad.
- [x] No incluye consultas SQL, secretos, credenciales, estructuras de tablas ni tareas de implementación.
- [x] La política híbrida se preserva: SP autorizado para global/masivo y actualización directa autorizada solo para individual tras aprobación.
- [x] Los resultados parciales preservan RF-26: estado Con errores, con totales y detalle consultable.
