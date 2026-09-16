# Dropdown de categorías de Productos: funcionamiento y especificación reutilizable

## Propósito

Este documento describe el selector de categorías de `ProductListPage.vue` y define un contrato para reproducirlo de forma reutilizable en otro proyecto. Es una guía de implementación; no modifica el componente actual.

## Funcionamiento actual

### Origen de los datos

1. La pantalla consulta `GET /products` mediante `useProductList(queryParams)`.
2. La respuesta contiene productos paginados, contadores y `categories: string[]`.
3. El backend obtiene `categories` como la lista distinta y ordenada de categorías de los productos que cumplen los filtros actuales.
4. La pantalla adapta esa lista a la forma que consume el selector:

```ts
const categoryOptions = computed(() => [
  { value: '', label: 'Todas las categorías' },
  ...categories.value.map((category: string) => ({
    value: category,
    label: category,
  })),
]);
```

`value` es el valor técnico que se envía al API; `label` es el texto visible. Para categorías ambas cadenas coinciden, pero deben conservarse como propiedades separadas.

### Selección y filtrado

La pantalla mantiene el valor elegido en `categoryFilter`, inicialmente vacío:

```ts
const categoryFilter = ref('');
```

El uso visual es:

```vue
<SearchableSelect
  v-model="categoryFilter"
  :options="categoryOptions"
  placeholder="Todas las categorías"
/>
```

Al hacer clic en una opción, `SearchableSelect` emite `update:modelValue`. `categoryFilter` cambia, se reinicia la paginación a la primera página y `queryParams` se recalcula. El composable elimina los valores vacíos antes de llamar al API; por tanto:

| Valor seleccionado | Parámetro enviado | Efecto |
| --- | --- | --- |
| `''` | No se envía `category` | Muestra todas las categorías. |
| `'Electrónica'` | `category=Electrónica` | El backend filtra por coincidencia exacta. |

La clave de Vue Query incluye `category`, por lo que el cambio del valor provoca una consulta nueva. El mismo filtro se reutiliza al exportar el CSV.

### Comportamiento del selector actual

- Muestra la etiqueta de la opción cuyo `value` coincide con el `v-model`.
- Abre una lista flotante al pulsar el control.
- Enfoca un campo de búsqueda al abrirse.
- Filtra en memoria por coincidencia parcial y sin distinguir mayúsculas/minúsculas sobre `label`.
- Emite el `value` de la opción al seleccionarla y cierra la lista.
- Cierra la lista al pulsar fuera o con `Escape`.

## Hallazgo relevante

En la implementación actual, `categories` se calcula en el backend con todos los filtros activos, incluido `category`. Tras seleccionar una categoría, la siguiente respuesta normalmente contiene solamente esa categoría. Para cambiar directamente a otra, la persona debe elegir primero `Todas las categorías`.

Para un componente reutilizable, las opciones no deben provenir de una respuesta ya restringida por el mismo selector. La alternativa recomendada es cargar el catálogo de categorías de manera independiente o pedir al API que devuelva facetas no afectadas por el filtro de su propia categoría.

## Contrato de opciones reutilizable

Usar siempre un arreglo de objetos, incluso cuando la fuente sea un enum, una lista local o una API. No pasar strings sueltos, mapas `Record`, entidades de API sin adaptar ni etiquetas como valor.

```ts
export type SelectValue = string;

export interface SelectOption {
  /** Identificador estable, serializable y enviado en el filtro o formulario. */
  value: SelectValue;
  /** Texto principal que se ve en la lista y en el valor seleccionado. */
  label: string;
  /** Texto adicional indexable; no modifica el valor que se emite. */
  searchText?: string;
  /** Impide elegir la opción sin retirarla de la lista. */
  disabled?: boolean;
}
```

Reglas del contrato:

- `value` debe ser único, estable y de tipo `string`. Si la fuente usa números o booleanos, convertirlos en el adaptador (`String(id)`), no dentro del componente.
- `label` debe estar listo para mostrarse y localizado en el idioma de la pantalla.
- El componente nunca debe conocer campos propios del dominio como `id`, `name`, `categoryName` o `isActive`.
- El padre transforma los datos externos una vez, cerca de la consulta. Ejemplo:

```ts
const categoryOptions = computed<SelectOption[]>(() => [
  { value: '', label: 'Todas las categorías' },
  ...availableCategories.value.map((category) => ({
    value: category.id,
    label: category.name,
    searchText: `${category.name} ${category.code ?? ''}`,
  })),
]);
```

- Para un filtro opcional, representar “todos” o “sin filtro” como `{ value: '', label: 'Todas las categorías' }`.
- Para un campo obligatorio, no incluir la opción vacía; iniciar el modelo en `''` y usar `placeholder="Seleccionar categoría"`.
- No usar `null`, `undefined`, `false`, `0` ni el texto visible como valores especiales. El valor vacío es únicamente `''`.

## Especificación del componente portable

Nombre sugerido: `SearchableSelect.vue` o `AppSelect.vue`.

### API pública

```ts
const props = withDefaults(defineProps<{
  modelValue: string;
  options: readonly SelectOption[];
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  searchable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  clearOnOptionsChange?: boolean;
}>(), {
  placeholder: 'Seleccionar...',
  searchPlaceholder: 'Buscar...',
  emptyText: 'Sin resultados',
  searchable: true,
  disabled: false,
  loading: false,
  clearOnOptionsChange: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string, option: SelectOption];
  blur: [];
}>();
```

Decisiones obligatorias:

- El componente es controlado: el padre es dueño de `modelValue`; el componente solo emite valores.
- Debe admitir carga asíncrona: con `loading` activo no se deben borrar ni alterar automáticamente las selecciones existentes.
- No emitir `update:modelValue` por una actualización transitoria de `options`. Si una opción queda inválida, el padre decide si limpia el filtro usando `clearOnOptionsChange` como política explícita.
- Mantener selección simple en este componente. Crear un componente de selección múltiple separado si el producto lo requiere; así el tipo del modelo nunca alterna entre `string` y `string[]`.

### Accesibilidad e interacción

- El disparador debe ser un `<button type="button">`, no un `<div>` clicable.
- Asociar el texto de `label` con el control mediante `id`, `aria-labelledby` o `aria-label`.
- Declarar `role="combobox"`, `aria-expanded`, `aria-controls` y `aria-haspopup="listbox"` en el disparador.
- Renderizar la lista con `role="listbox"`; cada opción usa `role="option"`, `aria-selected` y `aria-disabled` cuando corresponda.
- Al abrir: enfocar la búsqueda si es visible, o la opción seleccionada si no hay búsqueda.
- Soportar `ArrowDown`, `ArrowUp`, `Home`, `End`, `Enter`, `Space`, `Escape` y `Tab`.
- Mantener el índice resaltado en estado reactivo (`highlightedIndex`); no manipular clases del DOM con `querySelector`.
- Omitir opciones deshabilitadas durante la navegación y no permitir su selección.
- Cerrar al hacer clic fuera, al pulsar `Escape`, al seleccionar y al perder foco hacia fuera; retirar listeners globales al desmontar.
- Normalizar la búsqueda sin distinguir mayúsculas, acentos ni espacios extremos.

### Flujo interno recomendado

```text
El padre adapta los datos a SelectOption[]
  -> el componente recibe options y modelValue
  -> el usuario abre, busca y navega las opciones
  -> el componente emite el value seleccionado
  -> el padre actualiza el filtro y solicita los datos
  -> la respuesta actualiza la vista, sin reconstruir el catálogo desde datos ya filtrados
```

## Integración de referencia

Separar los datos de opciones de la consulta de resultados:

```ts
const categoryFilter = ref('');

const { data: categoryData, isFetching: categoriesLoading } = useCategoryCatalog();

const categoryOptions = computed<SelectOption[]>(() => [
  { value: '', label: 'Todas las categorías' },
  ...(categoryData.value ?? []).map((category) => ({
    value: category.id,
    label: category.name,
  })),
]);

const productQuery = computed(() => ({
  page: page.value,
  limit: limit.value,
  category: categoryFilter.value || undefined,
}));

watch(categoryFilter, () => {
  page.value = 1;
});
```

```vue
<AppSelect
  v-model="categoryFilter"
  label="Categoría"
  :options="categoryOptions"
  placeholder="Todas las categorías"
  :loading="categoriesLoading"
/>
```

## Criterios de aceptación para otra IA

- El componente solo acepta `SelectOption[]` y emite solo `string`.
- Seleccionar una categoría actualiza el filtro y reinicia la página a `1`.
- Elegir la opción con `value: ''` elimina el parámetro del filtro.
- Las categorías disponibles permanecen seleccionables aunque la lista de productos esté filtrada por una de ellas.
- La búsqueda encuentra etiquetas con diferencias de mayúsculas o acentos.
- El control es completamente operable con teclado y expone los atributos ARIA indicados.
- No hay listeners globales, estados de foco ni opciones residuales después de desmontar el componente.

## Archivos de referencia en este proyecto

- `frontend/src/modules/products/pages/ProductListPage.vue`
- `frontend/src/shared/components/SearchableSelect.vue`
- `frontend/src/modules/products/composables/useProducts.ts`
- `backend/src/modules/products/products.service.ts`
