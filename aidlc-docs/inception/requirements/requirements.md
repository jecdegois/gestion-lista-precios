# Requisitos — Interfaz Web de Gestión de Listas de Precio

## 1. Análisis de intención

| Elemento | Definición |
|---|---|
| Solicitud | Construir una interfaz web interna para gestionar cambios de listas de precio mediante simulación, aprobación y ejecución controlada. |
| Tipo de iniciativa | Mejora brownfield sobre procesos Softland existentes. |
| Alcance | Múltiples módulos: interfaz React, backend de aplicación, integración con procedimientos almacenados, seguridad, auditoría y gobernanza de cambios. |
| Complejidad | Alta: impacta datos operativos, integra tres modalidades de cambio y exige segregación de funciones, trazabilidad y tolerancia a fallos. |
| Fuente de decisiones | `aidlc-docs/inception/requirements/requirement-verification-questions.md`. |

## 2. Objetivo

Proveer una aplicación web interna que permita a usuarios funcionales preparar, simular y someter cambios de precios a aprobación, asegurando que la ejecución se produzca únicamente después de la autorización formal y quede completamente trazada.

La primera liberación debe incluir gestión global por lista, carga masiva de precios y gestión individual por artículo/lista/factor.

## 3. Alcance funcional

### 3.1 Procesos incluidos

| ID | Requisito |
|---|---|
| RF-01 | El sistema debe ofrecer los tres procesos: gestión global por lista, actualización masiva por archivo Excel y gestión individual por artículo/lista/factor. |
| RF-02 | El sistema debe permitir gestionar solicitudes dentro de la compañía y los roles autorizados para el usuario. La lista objetivo y la categoría son datos funcionales de la solicitud y deben validarse contra los maestros y reglas de Softland. |
| RF-03 | El backend y la interfaz deben impedir operar fuera del ámbito de compañía y rol asignado a cada usuario; además deben validar la lista y categoría como datos funcionales de la solicitud. |

### 3.2 Gestión global por lista

| ID | Requisito |
|---|---|
| RF-04 | El Solicitante debe poder seleccionar la lista objetivo y definir un factor multiplicador `v`. |
| RF-05 | La regla de factor global será: `v = 1.00` no cambia el precio; `1 < v <= 2` aumenta el precio proporcionalmente; `0 < v < 1` disminuye el precio proporcionalmente. Valores menores o iguales a cero deben bloquearse. |
| RF-06 | Antes de enviar una gestión global a aprobación, el Solicitante debe ejecutar una simulación obligatoria. |
| RF-07 | La simulación debe mostrar, como mínimo, precio actual, factor aplicado, precio sugerido y cantidad total de artículos impactados. |
| RF-08 | La solicitud global debe bloquearse si la simulación detecta inconsistencias, incluidos precios sugeridos no positivos o versiones inactivas. |

### 3.3 Actualización masiva

| ID | Requisito |
|---|---|
| RF-09 | La interfaz debe permitir descargar una plantilla oficial y cargar archivos Excel `.xlsx`. |
| RF-10 | Antes de enviar una carga a aprobación, la interfaz debe validar la estructura de plantilla, campos obligatorios y formatos numéricos. |
| RF-11 | Si se detectan filas inválidas, la carga completa debe rechazarse y debe estar disponible un reporte por fila para su corrección. |
| RF-12 | Antes del envío a aprobación, el Solicitante debe visualizar un resumen del impacto de la carga válida. |

### 3.4 Gestión individual por artículo, lista y factor

| ID | Requisito |
|---|---|
| RF-13 | El Solicitante debe poder identificar un artículo/SKU, asociarlo a la lista correspondiente e indicar un factor multiplicador. |
| RF-14 | La interfaz debe calcular y mostrar en tiempo real el precio final con la fórmula `Precio Final = Precio Base × Factor`. |
| RF-15 | El factor individual debe ser numérico, mayor que cero y cumplir el rango de negocio aplicable. |
| RF-16 | La interfaz debe mostrar artículo/SKU, precio base, factor, precio final calculado y advertencias de validación antes del envío a aprobación. |

## 4. Flujo de control de cambios

### 4.1 Roles

| Rol | Capacidades | Restricciones |
|---|---|---|
| Solicitante | Crear borradores, simular, corregir y enviar solicitudes a aprobación; consultar sus solicitudes e historial permitido. | No puede aprobar sus propias solicitudes ni ejecutar cambios productivos. |
| Aprobador | Consultar solicitudes pendientes dentro de su ámbito, revisar el impacto, aprobar o rechazar y consultar trazabilidad. | No puede aprobar una solicitud que haya creado. |
| Auditor/Administrador | Consultar en solo lectura el historial completo dentro de su autorización. | No altera solicitudes ni resultados históricos. |

### 4.2 Estados y transiciones

| ID | Requisito |
|---|---|
| RF-17 | Cada solicitud debe manejar los estados Borrador, Pendiente de aprobación, Aprobada, Ejecutando, Ejecutada, Rechazada y Error de ejecución. |
| RF-18 | Una solicitud pendiente no puede modificarse; el Solicitante debe cancelarla o crear una nueva solicitud para conservar la evidencia de la simulación original. |
| RF-19 | El rechazo debe exigir un comentario obligatorio y conservar el detalle de la simulación original. |
| RF-20 | Antes de aprobar, el Aprobador debe confirmar mediante un modal que muestre proceso, compañía, registros impactados, impacto estimado y la modalidad de ejecución aplicable. |

## 5. Ejecución y gobernanza de datos

### 5.1 Política híbrida aprobada

| ID | Requisito |
|---|---|
| RF-21 | Para cargas masivas y gestiones globales, después de la aprobación el backend debe ejecutar exclusivamente el Stored Procedure autorizado para la solicitud. |
| RF-22 | Para actualizaciones individuales autorizadas, el backend puede aplicar la actualización directa sobre la tabla operativa o de gestión correspondiente. |
| RF-23 | Toda actualización individual directa debe ejecutarse únicamente después de la aprobación, validando el ámbito del usuario, la segregación de funciones y las reglas aplicables. |
| RF-24 | La interfaz no debe ofrecer mecanismos que permitan ejecutar cambios productivos antes de una aprobación válida. |
| RF-25 | Al aprobar una solicitud, esta debe pasar al estado Ejecutando antes de iniciar la ejecución. |
| RF-26 | Al finalizar, la solicitud debe quedar en Completado/Ejecutada, Con errores o Fallido/Error de ejecución, según el resultado registrado. |

### 5.2 Resultado y recuperación

| ID | Requisito |
|---|---|
| RF-27 | El resultado de ejecución debe incluir identificador de ejecución, estado final, totales procesados, aceptados y rechazados, y detalle consultable de errores o rechazos. |
| RF-28 | El resultado debe conservarse en el detalle de la solicitud como evidencia de trazabilidad. |
| RF-29 | Ante errores transitorios definidos —por ejemplo, bloqueo temporal, interrupción breve de conectividad, saturación temporal o indisponibilidad momentánea de infraestructura— el backend debe reintentar hasta tres veces. |
| RF-30 | Después del tercer intento fallido, la solicitud debe pasar a Error de ejecución y conservar la evidencia técnica permitida. |
| RF-31 | No se deben reintentar automáticamente errores funcionales, de validación, autorización o configuración. |

## 6. Auditoría y trazabilidad

| ID | Requisito |
|---|---|
| RF-32 | La bitácora debe registrar creación, edición o cancelación, validación, envío a aprobación, apertura por el Aprobador, aprobación o rechazo, usuario, rol, fecha/hora, ejecución y resultado final. |
| RF-33 | Los Solicitantes deben consultar únicamente sus propias solicitudes; los Aprobadores, las de su ámbito; y los Auditores/Administradores, el historial de solo lectura autorizado. |
| RF-34 | La auditoría debe conservar el impacto simulado, la decisión del Aprobador, el comentario de rechazo cuando exista y el resultado de ejecución. |
| RF-35 | Pantallas, respuestas y bitácoras no deben exponer contraseñas, secretos, credenciales, datos de conexión ni información técnica sensible. |

## 7. Seguridad y control de acceso

| ID | Requisito |
|---|---|
| RNF-01 | La aplicación debe integrarse con SSO o IdP corporativo y operar en la red corporativa o VPN. |
| RNF-02 | La integración desde el portal interno debe usar un endpoint de autenticación protegido por una credencial de aplicación administrada como secreto; no debe enviarse por parámetros de URL ni almacenarse en el navegador. |
| RNF-03 | El portal interno debe entregar la identidad del usuario a la aplicación mediante un mecanismo firmado o tokenizado de corta duración, validado por el backend. |
| RNF-04 | La aplicación debe validar la existencia del usuario, su identidad, roles y ámbitos antes de conceder acceso. |
| RNF-05 | Los roles Solicitante y Aprobador deben estar separados y el backend debe impedir la autoaprobación. |
| RNF-06 | El control de ámbito por compañía y rol debe aplicarse tanto en la interfaz como en el backend. Las listas y categorías de las solicitudes deben validarse contra Softland y las reglas funcionales, pero no forman parte del ámbito de autorización del usuario. |
| RNF-07 | La aplicación debe implementar las restricciones de la línea base de seguridad para solución productiva. |

## 8. Resiliencia, observabilidad y calidad

| ID | Requisito |
|---|---|
| RNF-08 | La aplicación debe aplicar la línea base de resiliencia: control de estados, reintentos limitados, recuperación controlada, registro de errores y prevención de ejecuciones duplicadas. |
| RNF-09 | Las ejecuciones deben ser observables mediante identificadores correlacionables entre la solicitud, la aprobación y el resultado. |
| RNF-10 | La interfaz debe mostrar mensajes funcionales claros, sin exponer información sensible ni detalles técnicos innecesarios. |
| RNF-11 | Deben desarrollarse pruebas basadas en propiedades para cálculos deterministas de precio, validaciones de factor y validaciones de archivos, complementadas con pruebas convencionales. |
| RNF-12 | Deben comprobarse los límites y transiciones de factor: `v <= 0` inválido, `0 < v < 1` rebaja, `v = 1` sin cambio y `1 < v <= 2` aumento. |

## 9. Restricciones y fuera de alcance

- No se incluyen propuestas de queries ni de estructura SQL en este documento.
- La lógica pesada de cálculo y los SPs masivos/globales son responsabilidad de la capa de base de datos ya definida.
- El uso de actualización directa está limitado a actualizaciones individuales autorizadas y no sustituye los SPs requeridos para cargas masivas ni gestiones globales.
- El modelo exacto de tablas de solicitud, auditoría y ejecución queda sujeto a los artefactos técnicos existentes; la interfaz solo requiere los contratos de operación acordados.

## 10. Criterios de aceptación de la primera liberación

La liberación será aceptable en QA cuando exista evidencia de que:

1. Los tres procesos ejecutan simulación y validaciones previas.
2. Se impide que un Solicitante apruebe su propia solicitud.
3. Las solicitudes conservan la trazabilidad completa de creación, revisión, aprobación/rechazo y ejecución.
4. Las cargas masivas y gestiones globales aprobadas ejecutan únicamente el SP autorizado y muestran un resultado verificable.
5. Las actualizaciones individuales aprobadas se aplican únicamente desde el backend autorizado, con validación, auditoría, ámbito y resultado verificable.
6. Los reintentos se limitan a tres ante fallos transitorios permitidos y no se repiten errores funcionales.
7. No se exponen secretos ni credenciales en la interfaz, bitácoras o respuestas.

## 11. Decisiones pendientes de diseño

- Definir el mecanismo corporativo concreto de SSO/IdP, emisión de token/URL firmada y restricciones de iframe.
- Definir los contratos de backend que consumirá la interfaz para simulación, solicitud, aprobación, ejecución y resultado.
- Confirmar la plantilla Excel oficial, sus campos obligatorios y el formato del reporte de errores por fila.
- Precisar el rango configurable por compañía/lista para el factor individual cuando difiera del rango global `(0, 2]`.
- Definir la idempotencia de actualizaciones individuales para impedir que una aprobación se ejecute dos veces.
