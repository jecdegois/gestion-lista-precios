# Cuestionario de Verificación de Requerimientos — Interfaz Web de Gestión de Listas de Precio

## Propósito

Este cuestionario define los requisitos de la nueva interfaz web de Gestión de Listas de Precio. La lógica de negocio crítica, persistencia y aplicación final de precios pertenecen a Stored Procedures (SPs) ya definidos o en desarrollo avanzado.

La interfaz y su backend **no ejecutarán inserciones ni actualizaciones directas sobre tablas productivas**. El backend solo podrá ejecutar el SP autorizado para una solicitud, y únicamente después de que un usuario con rol **Aprobador** la apruebe formalmente.

El alcance funcional comprende tres procesos independientes:

1. **Gestión por Lista de Precios:** cambio global porcentual o por monto fijo, con vista previa de precio actual frente a precio sugerido.
2. **Actualización Masiva de Precios:** carga mediante plantilla oficial Excel/CSV, validación de estructura y datos, y resumen del impacto previo al envío.
3. **Gestión por Artículo, Lista y Factor:** asignación de factor multiplicador para un artículo y lista destino, con cálculo visible de `Precio Final = Precio Base × Factor`.

## Instrucciones

Responde cada pregunta sustituyendo el valor posterior a `[Answer]:` por la letra de tu decisión. Si ninguna opción representa la necesidad, selecciona **X) Otro** y agrega la explicación luego de la letra.

Este cuestionario no solicita ni contiene propuestas de consultas, queries o modificaciones directas a tablas productivas.

## Pregunta 1 — Alcance de la primera versión
¿Cuáles procesos deben estar disponibles en la primera liberación de la interfaz?

A) Los tres: gestión por lista, actualización masiva y gestión por artículo/lista/factor.

B) Gestión por lista y gestión por artículo/lista/factor; la carga masiva se incorpora en una liberación posterior.

C) Solo gestión por artículo/lista/factor como piloto funcional.

X) Otro (describa el alcance después de `[Answer]:`).

[Answer]: A

## Pregunta 2 — Tipo de cambio global por lista
¿Qué modalidades de ajuste debe admitir la gestión por lista de precios?

A) Porcentaje y monto fijo, con el usuario seleccionando explícitamente la modalidad.

B) Solo porcentaje.

C) Solo monto fijo.

X) Otro (describa las modalidades después de `[Answer]:`).

[Answer]: x, La variación del precio base se determina mediante un factor parametrizado (v) donde 1.00 no genera ningún cambio, un valor entre 1 y 2 aplica un aumento proporcional y un valor entre 0 y 1 aplica una rebaja, quedando prohibidos valores menores o iguales a 0 por generar precios finales nulos o negativos.

## Pregunta 3 — Vista previa del impacto por lista
¿Qué debe ocurrir antes de que el Solicitante pueda enviar una gestión por lista a aprobación?

A) Debe visualizar una vista previa con precio actual, valor de ajuste, precio sugerido y cantidad de artículos impactados.

B) Debe visualizar solo el total de artículos y el valor de ajuste solicitado.

C) La vista previa es opcional y el Solicitante puede enviar la solicitud sin simular.

X) Otro (describa la regla después de `[Answer]:`).

[Answer]: X Antes de que el Solicitante pueda enviar una gestión por lista a aprobación, el sistema debe cumplir estrictamente con los siguientes requisitos previos:
Simulación Obligatoria: La generación de la vista previa es un paso obligatorio e ineludible; el sistema no permitirá habilitar el botón ni la acción de "Enviar a Aprobación" sin haber ejecutado la simulación previa.
Visualización y Verificación de Impacto: El Solicitante debe visualizar obligatoriamente una vista previa detallada que contenga:
Precio Actual del artículo.
Valor de Ajuste aplicado (ya sea en porcentaje % o Factor Multiplicador).
Precio Sugerido / Nuevo Precio resultante del cálculo.
Cantidad Total de Artículos Impactados por la modificación.
Control de Errores y Validaciones: La vista previa no debe presentar errores de inconsistencia técnica (como precios resultantes \le 0 o versiones inactivas); de detectarse alguna anomalía, la solicitud quedará bloqueada hasta que los parámetros sean corregidos.

## Pregunta 4 — Plantilla de carga masiva
¿Qué formatos oficiales deberá aceptar la actualización masiva?

A) Excel `.xlsx` y CSV `.csv`, usando una plantilla oficial descargable desde la interfaz.

B) Solo Excel `.xlsx` mediante una plantilla oficial descargable.

C) Solo CSV `.csv` mediante una plantilla oficial descargable.

X) Otro (describa los formatos después de `[Answer]:`).

[Answer]: B

## Pregunta 5 — Validaciones previas de carga masiva
¿Qué validaciones deben bloquear el envío de una carga masiva a aprobación?

A) Estructura de plantilla inválida, campos obligatorios ausentes, formato numérico inválido, SKU inexistente, valores negativos y filas duplicadas dentro del archivo.

B) Solo estructura de plantilla, campos obligatorios y formato numérico.

C) Solo estructura de plantilla; las demás validaciones ocurren al aprobar.

X) Otro (describa las validaciones después de `[Answer]:`).

[Answer]: B

## Pregunta 6 — Tratamiento de filas inválidas en carga masiva
Cuando un archivo contiene filas inválidas, ¿cuál debe ser la política de la interfaz?

A) Rechazar el archivo completo y permitir descargar un reporte de errores por fila.

B) Permitir enviar únicamente las filas válidas y reportar las filas excluidas.

C) Permitir al Solicitante decidir, en cada carga, entre rechazar el archivo o excluir filas inválidas.

X) Otro (describa la política después de `[Answer]:`).

[Answer]: A

## Pregunta 7 — Gestión granular por factor
¿Qué validación debe aplicar la interfaz al factor multiplicador antes de calcular y enviar la solicitud?

A) Debe ser numérico, mayor que cero y dentro del rango configurado por las reglas de negocio; el precio final debe actualizarse visualmente en tiempo real.

B) Debe ser únicamente numérico; las reglas de rango se validan al aprobar.

C) No se valida en la interfaz; solo se visualiza el valor ingresado.

X) Otro (describa la validación después de `[Answer]:`).

[Answer]: A Debe ser numérico, mayor que cero y dentro del rango configurado por las reglas de negocio; el precio final debe actualizarse visualmente en tiempo real.
F = 1.00: Mantiene el precio sin modificaciones.
F > 1.00: Aplica un incremento (ej. 1.10 \rightarrow +10%).
0 < F < 1.00: Aplica una rebaja (ej. 0.90 \rightarrow -10%).
Al exigir en la interfaz que sea numérico y mayor a cero, se garantiza de entrada que jamás ingresen valores \le 0 (evitando precios nulos o negativos) y se elimina el riesgo de error humano por manejo de signos negativos (evitando confusiones tipo -0.15).

## Pregunta 8 — Datos requeridos en la simulación granular
¿Qué información debe mostrar la pantalla de artículo, lista y factor antes de enviar a aprobación?

A) Artículo/SKU, lista origen, lista destino, precio base, factor, precio final calculado y advertencias de validación disponibles.

B) Artículo/SKU, lista destino y factor; el cálculo final solo se muestra al aprobar.

C) Solo artículo/SKU y factor.

X) Otro (describa la información después de `[Answer]:`).

[Answer]: X Artículo/SKU, precio base, factor, precio final calculado y advertencias de validación disponibles.

## Pregunta 9 — Segregación de funciones
¿Cuál debe ser la política obligatoria entre los roles Solicitante y Aprobador?

A) El Solicitante crea, simula y envía; un Aprobador diferente revisa, aprueba o rechaza. El creador nunca puede autoaprobar su solicitud.

B) El Solicitante puede autoaprobar cambios de bajo impacto, dejando evidencia en auditoría.

C) El Aprobador crea y aprueba las solicitudes; el Solicitante solo consulta.

X) Otro (describa la política después de `[Answer]:`).

[Answer]: A

## Pregunta 10 — Estados de una solicitud
¿Cuál es el ciclo de estados mínimo para cada solicitud de cambio?

A) Borrador, Pendiente de aprobación, Aprobada, Ejecutando, Ejecutada, Rechazada y Error de ejecución.

B) Pendiente, Aprobada y Rechazada.

C) Borrador, Pendiente, Aprobada, Rechazada y Cancelada.

X) Otro (describa los estados después de `[Answer]:`).

[Answer]: A

## Pregunta 11 — Cambios a una solicitud pendiente
¿Qué puede hacer un Solicitante con una solicitud que ya está pendiente de aprobación?

A) No puede modificarla; debe cancelarla o crear una nueva para conservar la evidencia del impacto simulado.

B) Puede editarla hasta que un Aprobador la abra para revisión.

C) Puede editarla en cualquier momento; el Aprobador verá siempre la última versión.

X) Otro (describa la política después de `[Answer]:`).

[Answer]: A

## Pregunta 12 — Rechazo de solicitudes
¿Qué debe exigir la interfaz cuando el Aprobador rechaza una solicitud?

A) Comentario obligatorio con el motivo y conservación del detalle de la simulación original.

B) Comentario opcional y cambio inmediato a estado Rechazada.

C) Selección obligatoria de un motivo predefinido, sin comentario libre.

X) Otro (describa la regla después de `[Answer]:`).

[Answer]: A

## Pregunta 13 — Aprobación y ejecución exclusiva por SP
¿Cuál debe ser el comportamiento al confirmar una aprobación?

A) Registrar la aprobación y ejecutar únicamente el Stored Procedure asociado a la solicitud; no se permiten operaciones directas a tablas productivas desde la aplicación.

B) Registrar la aprobación y enviar la solicitud a un equipo técnico que ejecutará el cambio manualmente.

C) Registrar la aprobación y permitir que el backend aplique directamente el cambio en las tablas productivas.

X) Otro (describa el comportamiento después de `[Answer]:`).

[Answer]: X Para cargas masivas y gestiones globales, el backend ejecutará exclusivamente el Stored Procedure autorizado después de la aprobación. Para registros individuales autorizados, el backend de la aplicación podrá aplicar la actualización directa en tablas operativas, manteniendo validaciones, auditoría completa y segregación Solicitante/Aprobador.

## Pregunta 14 — Confirmación de aprobación
¿Qué confirmación debe solicitarse antes de que el Aprobador dispare la ejecución autorizada?

A) Modal de confirmación que resuma proceso, compañía, registros impactados, impacto estimado y advertencia de que se ejecutará el SP autorizado.

B) Botón de aprobar sin confirmación adicional.

C) Confirmación por correo electrónico posterior; la interfaz solo marca la solicitud como aprobada.

X) Otro (describa la confirmación después de `[Answer]:`).

[Answer]: A

## Pregunta 15 — Resultado de ejecución
¿Qué debe mostrar la interfaz luego de ejecutar el SP autorizado?

A) Estado final, identificador de ejecución, resumen de registros procesados/aceptados/rechazados y detalle de errores o rechazos disponible para consulta.

B) Solo un mensaje genérico de éxito o error.

C) El resultado se consulta únicamente por personal técnico fuera de la interfaz.

X) Otro (describa el resultado después de `[Answer]:`).

[Answer]: X 

Al aprobar una solicitud, su estado cambia a En Ejecución. Para cargas masivas y gestiones globales, el backend ejecuta el Stored Procedure autorizado. Para actualizaciones individuales, el backend aplica directamente la actualización autorizada sobre la tabla operativa o de gestión correspondiente, con la misma validación, auditoría, control de ámbito y segregación Solicitante/Aprobador.

Al finalizar, se registra el estado final, ID de ejecución, totales procesados, aceptados y rechazados, y el detalle de errores; la solicitud pasa a Completado, Con errores o Fallido.


## Pregunta 16 — Reintentos ante fallos técnicos
Ante un fallo técnico temporal durante la ejecución autorizada, ¿qué comportamiento debe adoptar la aplicación?

A) Reintentar automáticamente un número limitado de veces solo ante errores transitorios definidos; si falla, dejar estado Error de ejecución y registrar la evidencia.

B) Reintentar indefinidamente hasta obtener una respuesta exitosa.

C) No reintentar; el Aprobador debe ejecutar de nuevo manualmente.

X) Otro (describa la política después de `[Answer]:`).

[Answer]: A, con 3 intentos cuando algunas de estas condiciones se cumplan:
Bloqueo momentáneo en SQL Server por otra transacción (deadlock o timeout de bloqueo).
Corte breve de conectividad entre backend y base de datos.
Saturación temporal de recursos o límite momentáneo de conexiones.
Servicio de autenticación, red o infraestructura no disponible durante unos segundos.

## Pregunta 17 — Auditoría mínima obligatoria
¿Qué eventos deben quedar trazados para cada solicitud?

A) Creación, edición/cancelación, validación, envío a aprobación, apertura por Aprobador, aprobación o rechazo, identidad/rol/fecha/hora, ejecución del SP y resultado final.

B) Solo creación, aprobación/rechazo y resultado final.

C) Solo aprobación y resultado final.

X) Otro (describa los eventos después de `[Answer]:`).

[Answer]: A

## Pregunta 18 — Consulta de auditoría y trazabilidad
¿Quién puede consultar la bitácora y el detalle histórico de las solicitudes?

A) Solicitantes consultan sus propias solicitudes; Aprobadores consultan todas las solicitudes de su ámbito; auditores/administradores tienen acceso de solo lectura a todo el historial.

B) Solo Aprobadores y administradores pueden consultar cualquier historial.

C) Todos los usuarios autenticados pueden consultar todo el historial.

X) Otro (describa los permisos después de `[Answer]:`).

[Answer]: A

## Pregunta 19 — Autenticación y control de acceso
¿Qué mecanismo de acceso debe utilizar la aplicación interna?

A) SSO o proveedor de identidad corporativo, con asignación de roles Solicitante y Aprobador por grupos corporativos y acceso limitado a red corporativa/VPN.

B) Amazon Cognito con grupos Solicitante y Aprobador, y acceso limitado a red corporativa/VPN.

C) Usuario y contraseña propios de la aplicación.

X) Otro (describa el mecanismo después de `[Answer]:`).

[Answer]: A, tomando en cuenta:

 la implementación de un endpoint de autenticación para la integración desde el portal interno. El flujo operará bajo el siguiente esquema:
Consumo y Seguridad: El portal interno consumirá este endpoint enviando una API_KEY en las cabeceras (o parámetros) para identificar y validar que la aplicación solicitante es segura y autorizada.
Identificación de Usuario: Se enviará el correo electrónico del usuario para validar su existencia en nuestra base de datos, emulando el comportamiento de un flujo de inicio de sesión único (SSO).
Respuestas del Servidor:
Si el usuario existe: El endpoint retornará una URL firmada o tokenizada. Esta URL permitirá abrir nuestra aplicación dentro de un iframe en el portal interno, manteniendo al usuario ya autenticado de forma transparente.
Si el usuario no existe: El endpoint devolverá un código de estado o respuesta estandarizada de error (ej. 404 Not Found o un JSON de control) indicando que el usuario no está registrado en el sistema.

## Pregunta 20 — Permisos de datos por compañía
¿Cómo se restringirá el acceso a compañías, listas o categorías de precio?

A) Los roles incluirán ámbitos asignados por compañía y, cuando aplique, por lista o categoría; la interfaz y backend deben impedir operar fuera de ese ámbito.

B) Todo Solicitante o Aprobador puede operar sobre todas las compañías y listas.

C) La restricción se aplica solo visualmente en la interfaz; el backend no valida ámbitos.

X) Otro (describa el alcance después de `[Answer]:`).

[Answer]: A

## Pregunta 21 — Manejo de información sensible
¿Qué debe evitarse en pantallas, respuestas y auditorías de la interfaz?

A) Exponer contraseñas, credenciales, datos de conexión, secretos o información técnica sensible; los registros deben contener solo datos funcionales y referencias de ejecución permitidas.

B) Registrar credenciales técnicas cifradas dentro de la auditoría para facilitar soporte.

C) Mostrar toda la información técnica al Solicitante para que pueda diagnosticar fallos.

X) Otro (describa la regla después de `[Answer]:`).

[Answer]: A

## Pregunta 22 — Arquitectura y gobernanza de persistencia
¿Cuál es la restricción de arquitectura que debe validarse en todos los flujos de la nueva interfaz?

A) La aplicación prepara, valida, registra y autoriza solicitudes; solo ejecuta el SP autorizado tras aprobación. No genera operaciones directas de inserción, actualización o eliminación sobre tablas productivas.

B) La aplicación usa SPs para cambios masivos, pero puede realizar modificaciones directas para cambios individuales.

C) La aplicación puede modificar tablas productivas directamente si el usuario tiene rol Aprobador.

X) Otro (describa la restricción después de `[Answer]:`).

[Answer]: B

## Pregunta 23 — Criterios de aceptación de la interfaz
¿Qué evidencia mínima debe existir para aceptar la primera liberación en QA?

A) Los tres procesos ejecutan simulación y validaciones; se valida la segregación Solicitante/Aprobador; las solicitudes dejan trazabilidad completa; y una aprobación dispara exclusivamente el SP autorizado con resultado verificable.

B) Las pantallas cargan y permiten crear solicitudes, sin validar todavía el flujo de aprobación ni la ejecución del SP.

C) Solo se valida la ejecución del SP; la interfaz se certifica visualmente después.

X) Otro (describa el criterio después de `[Answer]:`).

[Answer]: X

Los tres procesos deben ejecutar simulación y validaciones; se debe verificar la segregación Solicitante/Aprobador y la trazabilidad completa. Tras la aprobación, las cargas masivas y las gestiones globales deben ejecutar exclusivamente el SP autorizado con resultado verificable. Las actualizaciones individuales deben aplicar únicamente la actualización directa autorizada por el backend, con validación, auditoría, control de ámbito y resultado verificable.

## Pregunta 24 — Extensión de seguridad
¿Deben aplicarse las reglas de la extensión de seguridad como restricciones obligatorias para la interfaz y backend?

A) Sí — aplicar las reglas de seguridad como restricciones bloqueantes para una solución productiva.

B) No — omitir la extensión de seguridad para un prototipo o prueba experimental.

X) Otro (describa la decisión después de `[Answer]:`).

[Answer]: A

## Pregunta 25 — Extensión de resiliencia
¿Debe aplicarse la línea base de resiliencia al diseño de la interfaz y backend?

A) Sí — aplicar prácticas de tolerancia a fallos, observabilidad y recuperación.

B) No — omitir la línea base de resiliencia para priorizar una solución experimental.

X) Otro (describa la decisión después de `[Answer]:`).

[Answer]: A

## Pregunta 26 — Pruebas basadas en propiedades
¿Deben aplicarse pruebas basadas en propiedades a los cálculos y validaciones deterministas de la interfaz?

A) Sí — aplicarlas a transformaciones de precios, validaciones de archivos y reglas de factor.

B) Parcial — aplicarlas solo a las funciones puras de cálculo y validación.

C) No — usar únicamente pruebas convencionales.

X) Otro (describa la decisión después de `[Answer]:`).

[Answer]: A
