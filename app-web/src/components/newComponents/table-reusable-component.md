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

El área de datos conserva una altura y una altura máxima dependientes del ancho de pantalla:

```text
Base: h-[56vh] max-h-[56vh]
sm:   h-[58vh] max-h-[58vh]
md:   h-[64vh] max-h-[64vh]
lg:   h-[70vh] max-h-[70vh]
xl:   h-[74vh] max-h-[74vh]
```

El contenedor exterior usa `overflow-hidden`; su contenido interno usa `overflow-auto`. Así, cabeceras y paginación externa no crecen indefinidamente y el listado se desplaza dentro del área disponible.

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
}>(), {
  loading: false,
  error: false,
  errorText: 'Error al cargar los datos.',
  emptyTitle: 'No hay registros',
  emptyDescription: 'Intenta ajustar los filtros.',
  pageSizes: () => [10, 20, 50],
  redirectOnRowClick: false,
  tableHeightClass: 'h-[56vh] max-h-[56vh] sm:h-[58vh] sm:max-h-[58vh] md:h-[64vh] md:max-h-[64vh] lg:h-[70vh] lg:max-h-[70vh] xl:h-[74vh] xl:max-h-[74vh]',
});

const emit = defineEmits<{
  'update:page': [page: number];
  'update:limit': [limit: number];
  'row-activate': [row: Row];
}>();
```

`Row` representa el tipo genérico de cada registro y `RouteLocationRaw` se importa desde `vue-router` si el proyecto utiliza Vue Router.

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
