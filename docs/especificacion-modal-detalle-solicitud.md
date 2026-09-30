# Especificación — Modal de Detalle de Solicitud (Factor %, validación y terminología)

## Objetivo

Ajustar la lógica, validaciones e interfaz del modal de "Detalle de solicitud" para:

1. Dejar explícito que el campo de factor es un valor porcentual (**Factor %**).
2. Impedir el ingreso de porcentajes negativos.
3. Mantener el estado **En proceso** el tiempo suficiente para que usuarios y auditores lo constaten.
4. Eliminar terminología técnica de base de datos (`procedimiento`, `Stored Procedure`, `SP`) de los textos visibles al usuario final.

## 1. Etiquetado de campos (Factor %)

Todas las etiquetas y encabezados que antes decían "Factor" ahora usan **"Factor %"** para el valor capturado por el usuario, distinguiéndolo del **"Factor aplicado"** (el multiplicador resultante que persiste Softland).

| Ubicación | Antes | Ahora |
|---|---|---|
| Formulario "Gestión Global" | Factor | Factor % |
| Formulario "Descuento por Artículo" (manual) | Factor | Factor % |
| Formulario "Actualización Masiva de Precios" (grupo de artículos) | Factor | Factor % |
| Columna de `TablaPrevisualizacion` (previsualización y modal) | Factor ingresado | Factor % |
| Columna de "Artículos agregados a esta solicitud" | Factor ingresado | Factor % |
| Encabezado de plantilla Excel descargable | Factor | Factor % |
| Encabezado de CSV/Excel de auditoría exportado | Factor_Ingresado | Factor_Porcentaje |

La columna **"Factor aplicado"** (multiplicador, ej. `1.10`) se conserva sin cambios junto a "Factor %" en todas las tablas, para que el usuario vea tanto el valor que ingresó como el resultado calculado.

## 2. Validación de valores (porcentajes negativos)

- El campo de captura usa `min="0"` (antes `min="-99"`), bloqueando el spinner del `<input type="number">` en valores negativos.
- La función central `convertirPorcentajeAFactor` fue modificada para clasificar explícitamente un valor negativo como inválido, distinto de un error de formato:

```javascript
function convertirPorcentajeAFactor(valor) {
  const crudo = String(valor == null ? "" : valor).trim().replace(",", ".");
  const porcentaje = parseFloat(crudo);
  const formatoValido = crudo !== "" && !isNaN(porcentaje) && /^-?\d+(\.\d+)?$/.test(crudo);
  const esNegativo = formatoValido && porcentaje < 0;
  const factor = formatoValido ? 1 + (porcentaje / 100) : null;
  const dentroDeRango = formatoValido && !esNegativo && factor > 0 && factor <= 2;
  return {
    valido: dentroDeRango,
    porcentaje: porcentaje,
    factor: factor,
    causa: !formatoValido
      ? "Formato de Factor % inválido / valor no numérico."
      : esNegativo
        ? "El Factor % no admite valores negativos. Ingrese un porcentaje entre 0 y 100."
        : "El Factor % debe estar entre 0 y 100 (multiplicador resultante mayor que 0 y menor o igual a 2).",
  };
}
```

- El mensaje de alerta se muestra en rojo junto al campo, con ícono de advertencia, tanto en captura manual como al detectar una fila negativa dentro de una carga por plantilla Excel (el lote completo queda bloqueado, igual que otros errores de fila).
- Los datos de ejemplo y la solicitud semilla se revisaron para no contener ningún Factor % negativo (se sustituyó `-1` por `0` y `-5` por `5` en los datasets de demostración).

### Mensaje de error en pantalla

```
Factor %  [   -5   ]
[!] El Factor % no admite valores negativos. Ingrese un porcentaje entre 0 y 100.
```

## 3. Tiempo de permanencia del estado "En Proceso"

- El worker simulado que representa el procesamiento en segundo plano pasó de **6.5 segundos** a **15 segundos** (`setTimeout(..., 15000)`), tiempo suficiente para que el usuario navegue, consulte el listado y regrese antes de ver la transición a un estado terminal.
- Se agregó una barra de progreso indeterminada (`.progress-track` + `.progress-fill.progress-indeterminate`) dentro del banner "La solicitud se está procesando en segundo plano", para reforzar visualmente que la tarea sigue activa mientras el usuario permanece en el detalle.
- La transición de estado sigue siendo asíncrona y no bloqueante: el cambio de `PENDIENTE` a `EN_PROCESO` ocurre de inmediato al aprobar (esto es correcto y deseado, según el requerimiento original de no bloquear al aprobador), pero la permanencia en `EN_PROCESO` antes de alcanzar un estado terminal ya no es casi instantánea.

## 4. Terminología en la interfaz

| Contexto | Antes (técnico) | Ahora (negocio) |
|---|---|---|
| Banner de detalle en proceso | "El procedimiento está ejecutándose en segundo plano" | "La solicitud se está procesando en segundo plano" |
| Identificador de ejecución | "ID de ejecución: #SP-20260824-1234" | "ID de procesamiento: #PROC-20260824-1234" |
| Tarjeta de resultado final | "ID de Proceso (SP)" | "ID de procesamiento" |
| Evento de auditoría (encolado) | — | "Ejecución autorizada y encolada" |
| Evento de auditoría (finalización) | "Ejecución del Stored Procedure finalizada" | "Procesamiento en segundo plano finalizado" |
| Toast al aprobar | "el SP se ejecuta en segundo plano" | "la solicitud se procesa en segundo plano" |
| Toast al finalizar | "Ejecución #SP-... finalizada" | "El procesamiento #PROC-... finalizó" |
| Generador de identificador | `nuevoIdProcesoSP()` retorna `"#SP-" + fecha + rand` | retorna `"#PROC-" + fecha + rand` |

Los términos `Stored Procedure` y `SP` solo permanecen en **comentarios internos de código** (no visibles en la interfaz) y en la documentación de arquitectura técnica dirigida al equipo de desarrollo, donde su uso es apropiado.

## 5. Modal de detalle y vista general

Se mantiene sin cambios la disposición general del modal para la modalidad "Actualización automatizada autorizada" / por plantilla:

- Banner de estado (`Pendiente`, `En proceso`, `Procesada`, etc.).
- Tarjetas de resumen: **Filas evaluadas**, **Con hallazgo**, **Modalidad**, **Ejecución**.
- Tabla de artículos (`TablaPrevisualizacion`) con columnas: Fila Excel, Código Artículo, Lista de Precio, Descripción, Precio Actual, **Factor %**, Factor aplicado, Precio Propuesto, Margen Est., Validación.
- El usuario puede cerrar el modal (botón "Continuar trabajando" / X) o navegar a otro módulo sin interrumpir el procesamiento en curso.

## 6. Mockup de UI (representación en texto ASCII)

### Paso 1 — Aprobador revisa y procesa la solicitud

```
+--------------------------------------------------------------------------+
| Detalle de solicitud - SOL-10448      [Actualizacion Masiva de Precios]  |
|                                        [Pendiente de aprobacion]      X  |
| Solicitante: Juan Perez - Compania: BEVAL - Enviado: 2026-08-13 09:05    |
+--------------------------------------------------------------------------+
| Filas evaluadas: 3   Con hallazgo: 0   Modalidad: Captura manual         |
| Ejecucion: Actualizacion automatizada autorizada                        |
|                                                                            |
| Fila | Codigo  | Lista       | Descripcion    | Precio  | Factor % | ...|
|  1   | ART-231 | Lista Base  | Refrigeradora  | 10,000  |   10     | ...|
|  2   | ART-455 | Lista Base  | Microondas     |  4,200  |   10     | ...|
|  3   | ART-104 | Lista Base  | Cafetera       |  6,200  |   10     | ...|
|                                                                            |
| [ Motivo de rechazo * ______________________ ]                          |
|                                    [ Rechazar ]  [ Procesar Solicitud ]  |
+--------------------------------------------------------------------------+
```

### Paso 2 — Transición inmediata a "En proceso" y liberación de la UI

Al presionar **Procesar Solicitud**, el modal se cierra de inmediato y el listado muestra:

```
+--------------------------------------------------------------------------+
| Bandeja de aprobacion                                                     |
+--------------------------------------------------------------------------+
| ID         Proceso                       Compania  Estado                |
| SOL-10448  Actualizacion Masiva Precios  BEVAL     En proceso            |
|                                             [ Consultar avance ]          |
+--------------------------------------------------------------------------+
```

El usuario puede navegar a "Nueva Solicitud", "Auditoría" o cambiar de identidad sin interrumpir el procesamiento.

### Paso 3 — Consulta de avance mientras sigue "En proceso" (duración perceptible)

```
+--------------------------------------------------------------------------+
| Detalle de solicitud - SOL-10448                       [En proceso]   X  |
+--------------------------------------------------------------------------+
| La solicitud se esta procesando en segundo plano                        |
| ID de procesamiento: #PROC-20260824-4821                                 |
| Puede cerrar este detalle, navegar o salir del sistema. La solicitud     |
| cambiara automaticamente a Procesada, Procesada con errores o Error de   |
| ejecucion al finalizar.                                                   |
| [######......................] (barra de progreso indeterminada)        |
| Ultima consulta: 24/08/2026 10:15:32                                      |
|                                                                            |
|                                    [ Continuar trabajando ]              |
+--------------------------------------------------------------------------+
```

Este estado se mantiene visible por ~15 segundos simulados antes de resolverse, dando tiempo perceptible para auditar la transición.

### Paso 4 — Resultado final consultable

```
+--------------------------------------------------------------------------+
| Detalle de solicitud - SOL-10448                        [Procesado]   X |
+--------------------------------------------------------------------------+
| Resultado final del procesamiento   [ OK - Ejecutado completo (3 de 3) ]|
| ID de procesamiento: #PROC-20260824-4821   Autorizado por: Maria Rodriguez|
| Filas exitosas: 3        Filas con error: 0                             |
|                                                                            |
| [ Descargar Log (CSV) ]   [ Exportar errores (Excel) ]                  |
+--------------------------------------------------------------------------+
```

### Auditoría — evento con resultado amigable

```
Fecha/Hora           Usuario           Evento                          Resultado
24/08/2026 10:15:10  Maria Rodriguez   Ejecucion autorizada y encolada  -
24/08/2026 10:15:25  Maria Rodriguez   Procesamiento en segundo plano   OK - Ejecutado
                                       finalizado                       completo (3 de 3)
```

## Trazabilidad

Esta especificación corresponde a un ajuste de UX/validación sobre el flujo ya documentado en `docs/arquitectura-procesamiento-asincrono-sp.md` (procesamiento asíncrono no bloqueante) y no modifica los contratos de API, estados funcionales ni las reglas de segregación Solicitante/Aprobador allí descritos.
