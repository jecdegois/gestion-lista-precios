# Guía de presentación — Flujo conceptual de Cálculo de Listas de Precio

## Objetivo

Validar con el usuario el flujo propuesto para solicitar, aprobar y dar seguimiento a cambios de listas de precio. El mockup es conceptual: muestra el comportamiento esperado, pero todavía utiliza datos de ejemplo y no está conectado a las fuentes oficiales.

**Duración sugerida:** 30 minutos.

## Material

- Mockup: `Product-Definition/mockups/gestion-masiva-precios.html`
- Plantilla de carga masiva, descargable desde el mockup.

## Recorrido de la presentación

### 1. Introducción

**Decir:**

> Revisaremos el flujo conceptual de cálculo de listas de precio para confirmar que las pantallas, datos y controles representan su operación. El objetivo de hoy es recoger validaciones y ajustes antes de la construcción funcional.

**Mostrar:** navegación principal, identidad activa y los roles Operador/Aprobador.

**Validar:**

- ¿Los roles y responsabilidades son correctos?
- ¿Quiénes deben solicitar, aprobar y solamente consultar?

### 2. Nueva solicitud

**Mostrar:** las tres modalidades disponibles.

| Modalidad | Uso |
|---|---|
| Gestión Global | Ajuste porcentual de una lista de precio. |
| Actualización Masiva de Precios | Ajuste de la Lista Base por grupo de artículos. |
| Descuento por Artículo | Cambio puntual por artículo, manual o mediante plantilla. |

**Decir:**

> El Operador registra una solicitud; no aplica el cambio directamente. El Aprobador revisa la información antes de permitir el procesamiento.

**Validar:**

- ¿Estas tres modalidades cubren los casos de uso?
- ¿Hace falta otra modalidad o filtro?

### 3. Factor % y validaciones

**Mostrar:** el campo **Factor %**, el factor aplicado y la tabla de previsualización.

**Decir:**

> El usuario ingresa un porcentaje y el sistema calcula el factor aplicado. Los valores negativos no están permitidos; la interfaz muestra una alerta y bloquea el envío cuando el valor es inválido.

**Acción sugerida:** ingresar temporalmente `-5` para mostrar la alerta.

**Validar:**

- ¿La regla de no permitir valores negativos aplica a todos los procesos?
- ¿El rango permitido de 0 a 100 es correcto?
- ¿Qué reglas deben generar un hallazgo o impedir el envío?

### 4. Plantilla y previsualización

**Mostrar:** la descarga de la plantilla y la tabla de artículos cargados.

**Decir:**

> La plantilla permite preparar cambios masivos. Antes de enviarla, la interfaz valida códigos de artículo, listas autorizadas, Factor % y reglas de negocio. El usuario puede revisar el precio actual, el porcentaje, el factor aplicado y el precio propuesto.

**Validar:**

- ¿La plantilla tiene las columnas necesarias?
- ¿Cuál es el máximo de filas que se debe permitir?
- ¿Un error debe bloquear toda la solicitud o solo la fila afectada?

### 5. Envío y consulta del Operador

**Mostrar:** el envío a aprobación y la vista **Mis solicitudes enviadas**.

**Decir:**

> Al enviar, la solicitud queda pendiente de aprobación. El Operador puede abrir el detalle de sus propias solicitudes en modo consulta y dar seguimiento a su estado, pero no puede aprobar ni rechazar su propio cambio.

**Validar:**

- ¿El Operador debe poder cancelar una solicitud pendiente?
- ¿Qué información necesita consultar mientras espera una decisión?

### 6. Revisión del Aprobador

**Acción:** cambiar al perfil Aprobador y abrir la Bandeja de Aprobación.

**Mostrar:** detalle de la solicitud, resumen, tabla de artículos, hallazgos y botones de decisión.

**Decir:**

> El Aprobador revisa la solicitud dentro de su ámbito y puede rechazarla con un motivo o enviarla a procesamiento. La interfaz evita que una persona apruebe su propia solicitud.

**Validar:**

- ¿La información es suficiente para autorizar un cambio?
- ¿Qué justificación, evidencia o motivo de rechazo debe ser obligatorio?

### 7. Procesamiento y resultado

**Acción:** procesar una solicitud aprobada y abrir **Consultar avance**.

**Decir:**

> Al aprobar, la solicitud pasa a **En proceso**. La persona puede cerrar el detalle o navegar libremente: el cambio continúa en segundo plano. Al finalizar, se muestra el resultado, las filas exitosas, las filas con error y el identificador de procesamiento.

**Mostrar:** banner de En proceso, estado final, detalle de resultado y opciones de evidencia.

**Validar:**

- ¿El mensaje de estado es claro?
- ¿Se requiere notificación al finalizar?
- ¿Cómo se debe tratar una solicitud con errores parciales?

### 8. Auditoría

**Mostrar:** la vista Auditoría.

**Decir:**

> La auditoría permite consultar quién creó, revisó o procesó una solicitud y cuándo ocurrió cada evento. La información se presenta en lenguaje de negocio y sin datos técnicos sensibles.

**Validar:**

- ¿Se necesitan filtros por fecha, usuario, compañía, solicitud o estado?
- ¿Quiénes deben tener acceso a esta vista?

## Cierre

**Decir:**

> Con los comentarios de hoy ajustaremos el mockup y consolidaremos las reglas funcionales. Los puntos que requieran definición adicional se documentarán como pendientes para validación antes de avanzar a la construcción.

## Minuta rápida

Registrar durante la reunión:

| Tema | Acuerdo o pendiente | Responsable |
|---|---|---|
| Roles y ámbitos |  |  |
| Factor % y validaciones |  |  |
| Plantilla y carga masiva |  |  |
| Reglas de aprobación |  |  |
| Procesamiento y notificaciones |  |  |
| Auditoría y reportes |  |  |
