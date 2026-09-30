# Especificación Visual UI/UX — Gestión Masiva de Precios (Maker-Checker)

> **Proyecto:** MV26020 — Automatización de Listas de Precio
> **Alcance de este documento:** Diseño visual de alta fidelidad para el módulo de Gestión Masiva de Precios integrado con Softland, bajo arquitectura Maker-Checker (Operador/Aprobador) con simulación previa (Diff) y ejecución asíncrona de Stored Procedure.
> **Estado:** Insumo de diseño (fase de Incepción, previo a Diseño de Aplicación formal). No sustituye `aidlc-docs/inception/requirements/requirements.md` ni `aidlc-docs/inception/user-stories/stories.md`.
> **Entregables asociados:**
> - Mockup interactivo: `Product-Definition/mockups/gestion-masiva-precios.html`
> - Diagrama de flujo de pantallas: `docs/flujo-pantallas-gestion-masiva-precios.drawio`

---

## 0. Nota de reconciliación terminológica

Este documento fue solicitado usando la nomenclatura operativa de Softland (Operador/Aprobador, `PENDIENTE/EN_PROCESO/APROBADO/RECHAZADO/ERROR`, `FACTOR_PRECIO/MAYOREOD_MASIVO/UDF_FACTOR_ARTICULO`), que proviene de `docs/propuesta_interfaz.md` y `docs/modelo_actual.md`. Los artefactos de gobierno IA-DLC (`requirements.md`, `stories.md`) usan una nomenclatura funcional más amplia. La tabla siguiente evita ambigüedad entre ambos mundos; el mockup y este documento usan la **columna izquierda** por fidelidad al pedido del usuario.

| Término de este documento (Softland/Maker-Checker) | Equivalente funcional en `requirements.md` / `stories.md` |
|---|---|
| Operador (Maker) | Solicitante (P-01) |
| Aprobador (Checker) | Aprobador (P-02) |
| `PENDIENTE` | Pendiente de aprobación |
| `EN_PROCESO` | Ejecutando |
| `APROBADO` | Ejecutada (éxito total) |
| `APROBADO_CON_ERRORES` | Con errores (éxito parcial, RF-26) |
| `RECHAZADO` | Rechazada (RF-19, motivo obligatorio) |
| `ERROR_EJECUCION` | Error de ejecución (RF-30, agotados los 3 reintentos — RF-29) |
| `FACTOR_PRECIO` | Gestión global por lista (RF-04 a RF-08) |
| `MAYOREOD_MASIVO` | Variante crítica de actualización masiva sobre lista base (RF-09 a RF-12, con control adicional) |
| `UDF_FACTOR_ARTICULO` | Gestión individual/por grupo con factor (RF-13 a RF-16) |
| `ID_PROCESO` / `ID_EJECUCION` | Identificador correlacionable de ejecución (RNF-09, RF-27) |

**Reglas que este diseño preserva sin excepción:** el Operador nunca ejecuta contra producción (RF-24); un Aprobador no puede aprobar su propia solicitud (RNF-05, HU-09.3); el rechazo exige comentario obligatorio (RF-19); la aprobación dispara como máximo una ejecución automática (RF-25, integridad de flujo); los reintentos transitorios están limitados a 3 y no aplican a errores funcionales (RF-29 a RF-31); ninguna pantalla expone secretos, credenciales ni detalles técnicos sensibles (RF-35, RNF-10).

---

## 1. Fundamentos visuales (Design Tokens)

Basado en shadcn/ui, estilo "New York" (esquinas moderadas, densidad media), tema claro con soporte de alto contraste para estados críticos.

### 1.1 Tipografía

| Rol | Fuente | Tamaño | Peso | Uso |
|---|---|---|---|---|
| Display | Inter | 24px / 1.2 | 600 | Título de pantalla ("Gestión Masiva de Precios") |
| H2 | Inter | 18px / 1.3 | 600 | Encabezado de sección/card ("Simulación y Diff") |
| H3 | Inter | 14px / 1.4 | 600 | Subtítulo de bloque, encabezado de tabla |
| Body | Inter | 14px / 1.5 | 400 | Texto de formularios, celdas de tabla |
| Small / Meta | Inter | 12px / 1.4 | 400–500 | Timestamps, ayudas, texto de badge |
| Mono | JetBrains Mono / ui-monospace | 12–13px | 400–500 | `ID_PROCESO`, payload JSON, SKU |

Jerarquía tipográfica de pantalla: **Display** (título de módulo) → **H2** (nombre de card/sección: "Nueva Solicitud", "Bandeja de Aprobación") → **H3** (subsecciones: "Filtros", "Resumen de impacto") → **Body** (contenido) → **Small** (metadatos, ayudas de campo).

### 1.2 Color y superficies (tokens shadcn)

```
--background: 0 0% 100%          --foreground: 240 10% 3.9%
--card: 0 0% 100%                --card-foreground: 240 10% 3.9%
--muted: 240 4.8% 95.9%          --muted-foreground: 240 3.8% 46.1%
--border: 240 5.9% 90%           --input: 240 5.9% 90%
--primary: 240 5.9% 10%          --primary-foreground: 0 0% 98%
--secondary: 240 4.8% 95.9%      --secondary-foreground: 240 5.9% 10%
--destructive: 0 84.2% 60.2%     --destructive-foreground: 0 0% 98%
--ring: 240 5.9% 10%             --radius: 0.5rem
```

### 1.3 Paleta semántica de estado (usada en badges, alerts, bordes de fila)

| Estado | Color base | Uso |
|---|---|---|
| `PENDIENTE` | Ámbar (`amber-500` / `#B45309` texto sobre `#FEF3C7`) | Badge outline, aún sin decisión |
| `EN_PROCESO` | Azul/violeta (`#4338CA` sobre `#E0E7FF`) con punto pulsante | Badge con animación, ejecución asíncrona en curso |
| `APROBADO` | Verde (`#15803D` sobre `#DCFCE7`) | Éxito total |
| `APROBADO_CON_ERRORES` | Naranja (`#C2410C` sobre `#FFEDD5`) | Éxito parcial, requiere revisión de detalle |
| `RECHAZADO` | Gris/rojo (`#B91C1C` sobre `#FEE2E2`, borde sólido) | Decisión negativa, con motivo |
| `ERROR_EJECUCION` | Rojo sólido (`#FFFFFF` sobre `#DC2626`) | Fallo no recuperado tras reintentos |
| Margen negativo / bajo costo | Rojo de alerta en celda (`#B91C1C` sobre `#FEE2E2`), nunca solo color: incluye ícono `AlertTriangle` | Regla de accesibilidad: no depender solo del color |

**Regla de accesibilidad transversal:** todo badge de estado combina color + texto + ícono (ej. `EN_PROCESO` usa un punto animado + texto, nunca un chip de color puro). Contraste mínimo AA (4.5:1) verificado en cada combinación texto/fondo anterior.

### 1.4 Espaciado y radios

- Grid base: 4px. Paddings de card: 16–24px. Gap entre campos de formulario: 16px.
- `--radius: 0.5rem` para inputs/botones/badges; cards y modales usan `0.75rem`.
- Tablas: alto de fila 44px (48px si la fila contiene badge + acción), padding horizontal de celda 12px.

---

## 2. Componentes shadcn/ui utilizados

| Componente | Dónde se usa |
|---|---|
| `Tabs` / `TabsList` / `TabsTrigger` | Selección de proceso en pantalla Operador (`FACTOR_PRECIO`, `MAYOREOD_MASIVO`, `UDF_FACTOR_ARTICULO`) |
| `Select` | Nivel de precio, versión, grupo de artículos, filtros de bandeja |
| `Input` / `Label` | Factor numérico, porcentaje, búsqueda |
| `Alert` / `AlertTitle` / `AlertDescription` (variant `destructive`) | Aviso crítico obligatorio de `MAYOREOD_MASIVO` |
| `AlertDialog` | Confirmación de aprobación con impacto irreversible |
| `Table` / `TableHeader` / `TableRow` / `TableCell` | Bandeja del Aprobador, Diff de simulación, Auditoría |
| `Badge` | Estado de solicitud, tipo de proceso, evento de auditoría |
| `Dialog` / `DialogContent` / `DialogFooter` | Modal de Simulación/Diff, Modal de Monitor/Resultado, Visor de payload JSON |
| `Textarea` | Motivo de rechazo (obligatorio) |
| `Button` (variants `default`, `secondary`, `destructive`, `outline`, `ghost`) | Todas las acciones |
| `Progress` (indeterminado) + `Skeleton` | Estado `EN_PROCESO` |
| `Tooltip` | Aclaración de reglas de negocio (rango de factor, definición de margen) |
| `Separator` | División de secciones dentro de cards y modales |
| `ScrollArea` | Tabla de Diff y payload JSON largo dentro de modal |
| `Toast` (sonner) | Confirmaciones no bloqueantes ("Solicitud enviada a aprobación") |

---

## 3. Estados de botones

| Estado | Estilo | Comportamiento |
|---|---|---|
| Default | `bg-primary text-primary-foreground` | Habilitado, acción disponible |
| Hover/Focus | Oscurece 5–8%, `ring-2 ring-ring ring-offset-2` visible en foco por teclado | Accesibilidad de navegación por teclado |
| Disabled | `opacity-50 cursor-not-allowed`, sin eventos | Ej. "Rechazar" sin motivo escrito; "Enviar a Aprobación" en `MAYOREOD_MASIVO` sin aceptar el aviso crítico |
| Loading | Spinner 14px a la izquierda del texto + texto de acción en progreso (ej. "Enviando…"), botón deshabilitado | Al enviar formulario, al aprobar (mientras se dispara la ejecución) |
| Success (transitorio) | Ícono `Check` + fondo verde por ~1.5s antes de volver a estado normal o cerrarse | Confirmación de envío/aprobación exitosa |
| Destructive | `bg-destructive text-destructive-foreground` | "Rechazar", "Aprobar e Iniciar Procesamiento" en `MAYOREOD_MASIVO` (impacto directo en lista base) |

---

## 4. Especificación por pantalla

### 4.1 Pantalla del Operador (Maker)

**Objetivo:** parametrizar una solicitud de uno de los tres procesos y enviarla a `PENDIENTE` sin tocar producción.

**Layout:**
- Encabezado de página (Display) + badge de rol activo ("Operador").
- `Card` "Nueva solicitud de cambio de precio" con `Tabs` de 3 opciones: `FACTOR_PRECIO`, `MAYOREOD_MASIVO`, `UDF_FACTOR_ARTICULO`.

**Tab `FACTOR_PRECIO`:**
- `Select` Nivel de Precio → `Select` Versión (dependiente, se habilita tras elegir nivel) → `Input` numérico "Nuevo % / Factor" con `Tooltip` de rango válido.
- Vista previa en vivo (no bloqueante) del precio resultante de un artículo de muestra.
- Botón `outline`: "Simular impacto" (habilita el resumen antes de poder enviar).
- Botón `default`: "Enviar a Aprobación" (disabled hasta que exista una simulación vigente).

**Tab `MAYOREOD_MASIVO`:**
- `Select` único: Grupo de Artículos.
- `Alert` variant `destructive` fijo y no descartable en la parte superior del tab:
  > **Atención:** esta actualización afectará directamente la Lista Base (`MAYOREOD`) para la versión actualmente **APROBADA**.
- Checkbox obligatorio "Entiendo el impacto y deseo continuar" — sin marcar, todos los botones de acción del tab permanecen `disabled`.
- Mismo patrón de Simular → Enviar, con el botón "Enviar a Aprobación" en variant `destructive` (no `default`) por ser el proceso de mayor impacto.

**Tab `UDF_FACTOR_ARTICULO`:**
- `Select` Nivel de Precio → `Select` Versión → `Select` Grupo de Artículos → `Input` numérico "Nuevo Factor" (rango `0 – 2`, con validación en vivo: fuera de rango pinta el input en rojo y muestra mensaje bajo el campo, sin bloquear el resto del formulario).
- Igual patrón Simular → Enviar.

**Estados y validaciones comunes a los 3 tabs:**
- "Enviar a Aprobación" siempre `disabled` hasta que exista una simulación vigente para los parámetros actuales (si el usuario cambia cualquier campo después de simular, la simulación se invalida y el botón vuelve a `disabled` con un `Badge` secundario "Simulación desactualizada").
- Al enviar: botón pasa a `loading` ("Enviando…") → `Toast` de éxito → `Badge` `PENDIENTE` se muestra junto al formulario con enlace "Ver en Bandeja".

### 4.2 Bandeja del Aprobador (Checker)

**Objetivo:** listar solicitudes, filtrarlas y abrir la simulación para decidir.

**Layout:**
- Barra de filtros: `Select` Estado (`Todos`, `PENDIENTE`, `EN_PROCESO`, `APROBADO`, `APROBADO_CON_ERRORES`, `RECHAZADO`, `ERROR_EJECUCION`), `Select` Proceso (los 3 tipos), `Input` de búsqueda por ID/Solicitante, botón `ghost` "Limpiar filtros".
- `Table`: columnas **ID Solicitud** (mono), **Proceso** (`Badge` outline con color por tipo), **Compañía**, **Solicitante**, **Fecha de envío**, **Estado** (`Badge` semántico de la sección 1.3), **Acciones**.
- Columna Acciones: botón `outline` "Revisar / Simular" — habilitado solo si `estado = PENDIENTE`; para otros estados el botón cambia a `ghost` "Ver detalle" (solo lectura).
- Regla visual crítica: si `solicitante_id === aprobador_actual_id`, la fila muestra un `Badge` secundario "Tu solicitud" y el botón de acción aparece `disabled` con `Tooltip` "No puede aprobar su propia solicitud" (refuerzo visual de RNF-05; la validación real ocurre en backend).
- Estado vacío: ilustración simple + texto "No hay solicitudes pendientes en tu ámbito."

### 4.3 Modal de Simulación y Diff (Precálculo)

**Objetivo:** decidir con evidencia comparativa.

**Layout (`Dialog` grande, `ScrollArea` interno):**
- Encabezado: ID de solicitud, `Badge` de proceso, compañía, solicitante, fecha.
- Franja de resumen (3–4 `Card` pequeñas en fila): Total artículos, Artículos con alerta, Impacto promedio (%), Modalidad de ejecución (SP autorizado / actualización directa).
- `Table` comparativa: **SKU**, **Descripción**, **Precio Actual**, **Precio Simulado** (`Precio Simulado = Precio Base × Factor`), **Margen %**, **Estado** (`Badge`: `OK` verde / `Margen negativo` rojo / `Bajo costo` rojo con ícono `AlertTriangle`).
  - Fila completa con fondo `bg-red-50` cuando el margen es negativo o el precio simulado queda por debajo del costo — refuerza el badge sin depender solo del color.
- `Separator`.
- Bloque de decisión:
  - `Textarea` "Motivo de rechazo" — visible siempre, marcado `required` visualmente (asterisco + borde ámbar al enfocar vacío).
  - `DialogFooter` con dos botones: `outline`/`destructive` **"Rechazar"** (disabled hasta que el textarea tenga contenido) y `default`/`destructive` **"Aprobar e Iniciar Procesamiento"** (variant `destructive` cuando el proceso es `MAYOREOD_MASIVO`, para reforzar el impacto).
- Al presionar "Aprobar e Iniciar Procesamiento": el botón pasa a `loading` ("Iniciando…"), el modal se transforma (o se reemplaza) por el Monitor de Estado (sección 4.4) sin perder contexto de la solicitud.

### 4.4 Monitor / Modal de Estado `EN_PROCESO` y Resultado de Ejecución

**Objetivo:** comunicar que el SP se está ejecutando y, al finalizar, mostrar el balance.

**Sub-estado A — `EN_PROCESO` (mientras el SP corre):**
- `Badge` `EN_PROCESO` con punto pulsante en el encabezado del modal.
- `Progress` indeterminado (barra animada, no porcentual porque la duración es variable) + `Skeleton` de 3 líneas simulando el panel de resultado que vendrá.
- Texto de estado: "Ejecutando actualización en Softland… esto puede tardar unos minutos." + `ID_PROCESO` mono en cuanto el backend lo retorna (aparece apenas se recibe, antes de terminar el SP).
- Botón único `secondary`: "Cerrar y notificarme" (no bloqueante: permite salir sin cancelar la ejecución, coherente con RF-25/RF-29, la ejecución sigue en backend).

**Sub-estado B — Resultado (tras consultar la tabla de auditoría del ERP y comparar `ID_PROCESO`):**
- Encabezado cambia el `Badge` a uno de: `APROBADO` (verde), `APROBADO_CON_ERRORES` (naranja) o `ERROR_EJECUCION` (rojo sólido).
- Panel de métricas (grid de 3): **ID de Proceso/Ejecución** (mono, con botón de copiar), **Registros exitosos** (número grande verde), **Registros con error/omitidos** (número grande, naranja o rojo).
- Si hay registros con error: tabla desplegable "Ver desglose de errores" — columnas **Fila/SKU**, **Código de error**, **Mensaje funcional** (nunca detalle técnico interno, según RF-35/RNF-10).
- `DialogFooter`: botón `outline` "Ver en Auditoría" (navega a 4.5 filtrado por este `ID_PROCESO`) y botón `default` "Cerrar".

### 4.5 Tabla de Auditoría y Logs

**Objetivo:** trazabilidad consolidada de solo lectura.

**Layout:**
- Filtros: rango de fechas, `Select` Evento, `Select` Rol, búsqueda por `ID_PROCESO` o usuario.
- `Table`: **Fecha/Hora**, **Usuario**, **Rol** (`Badge` outline: Operador/Aprobador/Auditor), **Evento** (`Badge`: `SOLICITUD_CREADA`, `SOLICITUD_ENVIADA`, `SOLICITUD_APROBADA`, `SOLICITUD_RECHAZADA`, `EJECUCION_INICIADA`, `EJECUCION_FINALIZADA`, `ERROR_TRANSACCION`), **ID_PROCESO** (mono + copiar), **Payload** (botón `ghost` "Ver JSON").
- Botón "Ver JSON" abre `Dialog` pequeño con `<pre>` de solo lectura, con nota fija: "Este registro no contiene credenciales ni datos de conexión" (refuerzo visual de RF-35).
- Esta vista es exclusivamente de consulta: ningún control de edición, aprobación o eliminación está presente (coherente con el rol Auditor/Administrador, P-03).

---

## 5. Flujo de pantallas (resumen navegable)

Diagrama completo en `docs/flujo-pantallas-gestion-masiva-precios.drawio` (swimlanes por rol: Operador, Aprobador, Backend Asíncrono, Resultado, Auditoría). Resumen textual:

1. **Operador** parametriza (4.1) → simula → envía → estado `PENDIENTE`.
2. **Aprobador** ve la solicitud en su Bandeja (4.2) → abre Modal de Simulación/Diff (4.3).
3. Desde el modal: **Rechazar** (motivo obligatorio) → `RECHAZADO` → aparece en Auditoría (4.5); o **Aprobar e Iniciar Procesamiento** → `EN_PROCESO`.
4. El backend ejecuta el SP, registra `ID_PROCESO`, y al finalizar evalúa el balance contra la tabla de resultados del ERP → transición a `APROBADO`, `APROBADO_CON_ERRORES` o `ERROR_EJECUCION`.
5. El Monitor (4.4) refleja `EN_PROCESO` y luego el resultado final.
6. Todo evento relevante queda visible en la Tabla de Auditoría (4.5).

---

## 6. Accesibilidad y mensajería

- Todo `Dialog`/`AlertDialog` atrapa el foco, cierra con `Escape` y al hacer clic en el overlay (con verificación `ev.target === overlay` antes de cerrar, para evitar cierres accidentales por clics dentro del contenido).
- Los badges de estado siempre incluyen texto legible, no solo color; los estados críticos (`RECHAZADO`, `ERROR_EJECUCION`) añaden ícono.
- Mensajes de error de validación son funcionales y en español claro (ej. "El factor debe ser mayor que 0 y menor o igual a 2"), nunca exponen mensajes de motor de base de datos ni trazas técnicas (RNF-10).
- Áreas con actualización asíncrona (`EN_PROCESO`) usan `aria-live="polite"` para anunciar el cambio de estado a lectores de pantalla sin interrumpir al usuario.
- Contraste verificado AA en todas las combinaciones de badge texto/fondo listadas en la sección 1.3.

---

## 7. Alcance no cubierto por este documento

Por indicación del proyecto (`docs/propuesta_interfaz.md`, sección 9 de `requirements.md`): no se especifican aquí consultas SQL, estructuras de tablas, ni el contrato exacto de API. Este documento es exclusivamente de diseño visual/UX; el diseño funcional detallado y el diseño de aplicación (backend, contratos, modelo de datos) se abordan en las etapas correspondientes de IA-DLC (`Diseño de Aplicación` / `Diseño Funcional` por unidad).
