# Tabla de productos: funcionamiento y especificación reutilizable

## Propósito

Este documento describe la tabla de detalle de `ProductListPage.vue` y define cómo convertirla en un componente reutilizable. Conserva el comportamiento actual de consulta, carga, error, paginación, tamaño del área visible, estilos y versión móvil. Añade una opción booleana para habilitar o deshabilitar la redirección al pulsar una fila.

## Funcionamiento actual

### Datos y consulta

La pantalla mantiene el estado de filtros y paginación en el padre:

```ts
const page = ref(1);
const limit = ref(20);

const queryParams = computed(() => ({
  page: page.value,
  limit: limit.value,
  search: debouncedSearch.value || undefined,
  category: categoryFilter.value || undefined,
  isActive: activeFilter.value || undefined,
}));

const { data, isLoading, isError } = useProductList(queryParams);
const products = computed(() => data.value?.data ?? []);
const meta = computed(() => data.value?.meta ?? null);
```

`useProductList` llama a `GET /products`, elimina parámetros vacíos y usa una clave de Vue Query que incluye página, límite y filtros. También usa `keepPreviousData`: al pedir otra página o cambiar un filtro puede conservar temporalmente las filas anteriores, evitando que el contenedor se desarme durante cada recarga.

Cuando cambia categoría, estado o límite, la pantalla reinicia la página a `1`. Si la página actual queda fuera de `meta.totalPages`, también la corrige a la última página válida.

### Estados de la interfaz

La pantalla resuelve tres estados excluyentes antes de pintar filas:

| Estado | Renderizado actual |
| --- | --- |
| `isLoading` | Panel con borde discontinuo y el texto `Cargando...`. |
| `isError` | Panel rojo de error con el texto `Error al cargar productos.` |
| Datos disponibles | Área desplazable con tabla de escritorio y tarjetas para móvil. |

Si la consulta termina correctamente pero no contiene filas, muestra dentro de la tabla y de la vista móvil un estado vacío: `No hay productos` y una indicación para ajustar filtros o crear un producto.

### Tabla de escritorio

La tabla solo se muestra desde `md` en adelante. Tiene ocho columnas:

| Columna | Contenido |
| --- | --- |
| SKU | Imagen, SKU en monoespaciado y chip `S` si el producto usa control por serial. |
| Nombre | Nombre y descripción opcional. |
| Categoría | Categoría o `---`. |
| Marca | Marca o `---`. |
| UDM | Unidad de medida. |
| Garantía | `Sí` o `No`, con color semántico. |
| Estado | Píldora `Activo` o `Inactivo`. |
| Acciones | Mensaje orientativo: `Toca la fila para ver detalle`. |

Las cabeceras permanecen fijas al desplazarse verticalmente. Cada fila usa bordes redondeados en la primera y última celda, fondo blanco, sombra del contenedor y cambio de fondo a gris claro al pasar el cursor.

La implementación actual hace que cada fila sea clicable y navega al detalle:

```ts
function openDetail(productId: string) {
  router.push(`/products/${productId}`);
}
```

El `<tr>` llama a `openDetail(p.id)` en `@click`. La versión móvil usa tarjetas y un `<button>` que ejecuta la misma acción.

### Tamaño, desplazamiento y respuesta móvil

El área de datos tiene altura natural y únicamente un máximo dependiente del ancho de pantalla:

```text
Base: max-h-[56vh]
sm:   max-h-[58vh]
md:   max-h-[64vh]
lg:   max-h-[70vh]
xl:   max-h-[74vh]
```

Con pocos registros, el contenedor crece solo hasta la altura de su contenido. Cuando las filas superan el máximo responsive, el área interna activa `overflow-auto` y permite desplazarse sin que la tabla crezca indefinidamente.

En pantallas menores a `md`, la tabla se oculta y se muestran tarjetas con el mismo contenido relevante. La tarjeta es pulsable únicamente porque la navegación por detalle está habilitada hoy.

### Paginación

`Pagination.vue` se muestra cuando hay `meta` y existen registros. Recibe el límite actual y las opciones `[10, 20, 50]`; emite `update:page` y `update:limit`.

- Muestra total de registros, página actual y total de páginas.
- Ofrece primera, anterior, siguiente y última página; deshabilita los controles inválidos.
- Al cambiar el número de filas, el padre actualiza el límite y vuelve a la página `1`.
- En móvil conserva el selector y los botones principales, pero oculta textos secundarios y los botones de primera/última página para ahorrar espacio.

## Diseño del componente reutilizable

Nombre sugerido: `ResponsiveDataTable.vue`. El componente debe ser genérico: no puede conocer campos como `sku`, `brand`, `isActive` ni rutas de Productos. Esos detalles se entregan mediante definición de columnas y slots.

### Contratos de tipos

```ts
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TableColumn<Row> {
  key: string;
  header: string;
  headerClass?: string;
  cellClass?: string;
  align?: 'left' | 'center' | 'right';
  value?: (row: Row) => string | number | null | undefined;
}
```

### API pública propuesta

```ts
const props = withDefaults(defineProps<{
  rows: readonly Row[];
  columns: readonly TableColumn<Row>[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: boolean;
  errorText?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  meta?: PageMeta | null;
  page: number;
  limit: number;
  pageSizes?: readonly number[];
  redirectOnRowClick?: boolean;
  getRowDestination?: (row: Row) => RouteLocationRaw | string;
  tableHeightClass?: string;
  rowClassName?: (row: Row) => string;
}>(), {
  loading: false,
  error: false,
  errorText: 'Error al cargar los datos.',
  emptyTitle: 'No hay registros',
  emptyDescription: 'Intenta ajustar los filtros.',
  pageSizes: () => [10, 20, 50],
  redirectOnRowClick: false,
  tableHeightClass: 'max-h-[56vh] sm:max-h-[58vh] md:max-h-[64vh] lg:max-h-[70vh] xl:max-h-[74vh]',
});

const emit = defineEmits<{
  'update:page': [page: number];
  'update:limit': [limit: number];
  'row-activate': [row: Row];
}>();
```

`Row` representa el tipo genérico de cada registro y `RouteLocationRaw` se importa desde `vue-router` si el proyecto utiliza Vue Router.

`rowClassName` permite al padre aplicar clases visuales por registro sin acoplar el componente a un dominio específico. Por ejemplo, una fila validada puede devolver `"bg-green-50"`; una fila con error puede devolver una clase de alerta. Si no se devuelve ninguna clase, se mantiene el estilo neutro.

### Booleano de redirección por fila

Usar `redirectOnRowClick`, con valor predeterminado `false`.

| Configuración | Resultado |
| --- | --- |
| `redirectOnRowClick: false` | La fila no presenta cursor clicable, no recibe foco como enlace y no navega. Los botones o enlaces incluidos dentro de una celda siguen funcionando de forma independiente. |
| `redirectOnRowClick: true` + `getRowDestination` | Clic, `Enter` o `Space` sobre la fila navegan al destino calculado para ese registro. También se emite `row-activate` para analítica o lógica adicional. |
| `redirectOnRowClick: true` sin `getRowDestination` | No navegar. En desarrollo, mostrar una advertencia clara para evitar filas que parecen interactivas pero no hacen nada. |

El componente no debe codificar rutas como `/products/:id`. El padre aporta la ruta:

```vue
<ResponsiveDataTable
  :rows="products"
  :columns="productColumns"
  :row-key="(product) => product.id"
  :loading="isLoading"
  :error="isError"
  :meta="meta"
  :page="page"
  :limit="limit"
  :redirect-on-row-click="true"
  :get-row-destination="(product) => `/products/${product.id}`"
  @update:page="page = $event"
  @update:limit="limit = $event"
/>
```

La navegación debe ignorarse cuando el evento proviene de un elemento interactivo hijo (`button`, `a`, `input`, `select`, `textarea` o un elemento con rol de botón/enlace). De ese modo, futuras acciones por celda no activan accidentalmente el detalle de la fila.

### Estilo y accesibilidad obligatorios

- Conservar por defecto el contenedor redondeado, borde `slate-200`, fondo blanco, sombra suave, `flex-1`, `overflow-hidden` y la clase de altura indicada arriba.
- Conservar el área interna con `overflow-auto`, encabezados `sticky top-0 z-10`, filas con transición y efecto hover gris claro.
- Cuando `redirectOnRowClick` esté activo, aplicar `cursor-pointer`, `tabindex="0"`, una indicación de foco visible y `aria-label` descriptivo. Activar con `Enter` y `Space`.
- Cuando esté desactivado, no aplicar cursor, foco de enlace, listeners de teclado ni texto que prometa navegación.
- No reemplazar las cabeceras semánticas `<table>`, `<thead>`, `<tbody>`, `<th scope="col">` y `<td>`.
- Mantener los slots `#cell-{column.key}` para celdas complejas y `#mobile-row` para tarjetas móviles. La tabla genérica no debe asumir el diseño del SKU, chips, imágenes o píldoras de estado.

## Flujo de datos y paginación

```text
El padre conserva filtros, página y límite
  -> construye parámetros de consulta
  -> obtiene rows y meta del API
  -> pasa los datos a ResponsiveDataTable
  -> el usuario cambia página o límite
  -> el componente emite el cambio
  -> el padre actualiza la consulta y reinicia página cuando corresponde
```

Reglas de paginación:

- El componente no solicita datos ni contiene una copia local de las filas.
- Al cambiar `limit`, debe emitir `update:limit` y `update:page(1)` para conservar el comportamiento actual.
- Ante filtros nuevos, el padre es responsable de emitir o asignar `page = 1`.
- Si el API informa que `page > totalPages`, el padre debe corregirla antes de dejar la tabla vacía por una página inexistente.
- La paginación solo se presenta si `meta.total > 0`.

## Estructura de columnas para Productos

La pantalla de Productos puede definir las ocho columnas actuales y usar slots para las celdas enriquecidas:

```ts
const productColumns: TableColumn<Product>[] = [
  { key: 'sku', header: 'SKU' },
  { key: 'name', header: 'Nombre' },
  { key: 'category', header: 'Categoría' },
  { key: 'brand', header: 'Marca' },
  { key: 'unitOfMeasure', header: 'UDM' },
  { key: 'hasWarranty', header: 'Garantía', align: 'center' },
  { key: 'isActive', header: 'Estado', align: 'center' },
  { key: 'actions', header: 'Acciones', align: 'right' },
];
```

Usar `#cell-sku` para la imagen y el chip de serial, `#cell-name` para la descripción, `#cell-hasWarranty` y `#cell-isActive` para sus colores semánticos, y `#cell-actions` para el texto orientativo o acciones específicas.

## Adaptador de artículos capturados en Captura Manual

En **Descuento por Artículo → Captura Manual**, la tabla previa a la simulación utiliza el mismo `ResponsiveDataTable` mediante `TablaArticulosCapturaManual.tsx`.

Columnas:

- `#`
- `Código`
- `Lista`
- `Factor %`
- Acción de eliminar

La acción de eliminar se entrega desde el padre mediante `onRemove(codigo, listaCodigo)`. El componente mantiene `redirectOnRowClick={false}` para que pulsar una fila no navegue; únicamente el botón de eliminar ejecuta la acción. El botón usa `type="button"`, `aria-label` y respeta el estado `disabled`.

La tabla recibe el arreglo controlado `itemsManual` y conserva el comportamiento de altura dinámica: crece con las filas hasta el `max-height` responsive y permite desplazamiento cuando corresponde. Las demás tablas de la aplicación no se modifican.

## Texto largo y una sola línea

En la tabla de impacto de `Descuento por Artículo → Captura Manual`:

- La columna `Código` usa `whitespace-nowrap` para evitar que el código se divida en varias líneas.
- La columna `Descripción` usa un ancho máximo de `280px`, truncado visual y `whitespace-nowrap`.
- El texto completo se conserva en el atributo `title`, por lo que se muestra al pasar el cursor sobre la descripción.

Este patrón evita que una descripción extensa aumente el ancho o la altura de la fila, sin perder acceso al texto completo.

## Criterios de aceptación para otra IA

- Con carga inicial, se muestra el panel de carga y no hay filas interactivas.
- Ante error, se muestra el panel de error y no hay tabla parcial.
- Sin registros, se muestra el estado vacío tanto en escritorio como en móvil.
- La tabla mantiene las ocho columnas de Productos, encabezados fijos, desplazamiento interno y las alturas máximas actuales.
- Las tarjetas móviles conservan la información relevante y el comportamiento de navegación definido por el booleano.
- Con `redirectOnRowClick` en `false`, pulsar una fila no redirige.
- Con `redirectOnRowClick` en `true` y un destino válido, clic, `Enter` y `Space` navegan al detalle correcto.
- Un botón o enlace dentro de una fila no dispara la redirección de la fila.
- La paginación conserva `[10, 20, 50]`, no aparece sin registros y al cambiar el límite vuelve a la página `1`.
- Los filtros y la navegación entre páginas siguen siendo controlados por el padre; el componente no duplica peticiones ni estado de consulta.

## Archivos de referencia en este proyecto

- `frontend/src/modules/products/pages/ProductListPage.vue`
- `frontend/src/modules/products/composables/useProducts.ts`
- `frontend/src/shared/components/Pagination.vue`

## Paginación incremental de impacto

`ResponsiveDataTable` admite carga incremental server-side mediante:

```ts
hasMore?: boolean;
nextOffset?: number | null;
loadingMore?: boolean;
onLoadMore?: (params: { offset: number; limit: number }) => void | Promise<void>;
```

Cuando el scroll llega aproximadamente a los últimos 80 píxeles, el componente ejecuta `onLoadMore` si `hasMore` es verdadero y no existe otra carga en curso. El padre concatena la página recibida y conserva la validación del lote completo.

Gestión Global utiliza páginas de `200` filas mediante:

```text
GET /api/simulacion/gestion-global
```

La respuesta contiene `filas`, `offset`, `maxRecords`, `hasMore` y `nextOffset`. Las filas se calculan y validan en servidor antes de enviarse al componente. El envío de la solicitud no debe utilizar únicamente la página visible.

## Tabla de hallazgos de margen

Los hallazgos de margen se presentan mediante `TablaHallazgosMargen.tsx`, otro adaptador de `ResponsiveDataTable`. La tabla muestra código, descripción, causa, precio actual y precio mínimo, con scroll responsive y páginas locales de `200` filas. El cálculo de hallazgos se realiza sobre el conjunto completo recibido, no solo sobre la página visible.

## Simulación global por páginas de 200

Gestión Global usa `GET /api/simulacion/gestion-global` para obtener `FilaPrecio[]` calculadas en servidor por páginas de hasta `200` registros.

```text
GET /api/simulacion/gestion-global
  ?compania=FEBECA
  &nivel=MAYOREOB
  &factor=10
  &tipoVariacion=AUMENTO
  &offset=0
  &maxRecords=200
```

`ResponsiveDataTable` acumula las páginas y solicita `nextOffset` cuando el scroll llega al final. Mientras `hasMore` sea verdadero, el envío de Gestión Global permanece bloqueado para evitar enviar un lote parcial. Las respuestas se protegen con `AbortController` y un identificador de solicitud.

## Hallazgos de margen como tabla

`TablaHallazgosMargen.tsx` reemplaza la lista textual de hallazgos. Usa `ResponsiveDataTable` con scroll responsive y paginación local de `200` filas. El conteo se calcula sobre todos los hallazgos; la tabla solo muestra la página actual.

## Colores de validación de filas

En las tablas de impacto, el padre puede usar `rowClassName` para distinguir resultados:

- `bg-green-50`: fila válida, cumple los criterios de validación.
- `bg-red-50`: fila inválida, contiene un error o no cumple un criterio de negocio.

La regla aplicada en los adaptadores de impacto es:

```tsx
rowClassName={(fila) => fila.validacion.valido ? "bg-green-50" : "bg-red-50"}
```

## Adaptador de Actualización Masiva

`TablaImpactoActualizacionMasiva.tsx` utiliza el mismo `ResponsiveDataTable` y el mismo resumen de validaciones/hallazgos para `MAYOREOD_MASIVO`. Así, Actualización Masiva, Gestión Global y Descuento manual comparten la presentación reusable de impacto, mientras `RevisionModal` y las demás rutas conservan sus consumidores existentes.

## Detalle de solicitudes en RevisionModal

`TablaResultadoModal.tsx` usa `ResponsiveDataTable` para el detalle de `FilaPrecio` y `FilaMargen` dentro de `RevisionModal`.

- Conserva las columnas de precios, variación, margen, estado y validación.
- Divide localmente el detalle en páginas de `200` filas.
- Mantiene scroll responsive y encabezado sticky.
- Conserva `ResumenValidaciones` sobre el conjunto completo.
- Usa `redirectOnRowClick={false}` para no interferir con aprobar, rechazar o cerrar el modal.
- `TablaResultado` permanece disponible para las demás pantallas.

## Datos persistidos del detalle del modal

El detalle de `TablaResultadoModal` se alimenta de las columnas reales de `SOLICITUD_PRECIO_DETALLE`:

- `LISTA_CODIGO` y `TIPO_VARIACION` para lista y variación.
- `FACTOR_MULTIPLICADOR` para factor de precio.
- `FACTOR_REDUCCION_NORM` y `MULTIPLICADOR_MARGEN` para procesos de margen.
- `MARGEN_PROMEDIO`, `MARGEN_MINIMO` y `COSTO_MINIMO` para los valores de margen.
- `PRECIO_CALCULADO`, `PRECIO_REDONDEADO`, `BANDA_NUMERO` y `BANDA_REDONDEO` para el impacto.

El modal no muestra columnas independientes de Estado o Validación. La fila se pinta con `bg-green-50` cuando `VALIDO = 'S'` y con `bg-red-50` cuando no cumple los criterios.
