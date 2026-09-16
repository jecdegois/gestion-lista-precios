# Dropdown reutilizable de React/Next.js

## Propósito

`Dropdown.tsx` es un selector controlado y accesible para la aplicación Next.js. El componente no conoce el dominio, SQL Server ni las rutas API: recibe opciones adaptadas por el padre y emite únicamente el `value` seleccionado.

Actualmente se utiliza en `NuevaSolicitud.tsx` dentro de **Descuento por Artículo → Captura Manual**:

- **Lista de Precio**: usa el mismo componente con `searchable={false}`. No tiene buscador por decisión funcional.
- **Código de Artículo**: usa búsqueda remota, límite por página y carga incremental.

Los demás selectores de la aplicación continúan utilizando `Combobox.tsx` y no deben verse afectados por este componente.

## Contrato de opciones

```ts
export type SelectValue = string;

export interface SelectOption {
  value: SelectValue;
  label: string;
  searchText?: string;
  disabled?: boolean;
}
```

Reglas:

- `value` es un identificador estable, serializable y único.
- `label` es el texto visible.
- `searchText` permite indexar texto adicional sin cambiar el valor emitido.
- `disabled` impide seleccionar la opción, pero no la elimina del catálogo.
- El componente no recibe entidades de dominio directamente; el padre las transforma a `SelectOption[]`.

## API pública de `Dropdown.tsx`

```ts
export interface DropdownLoadParams {
  query: string;
  offset: number;
  maxRecords: number;
}

type DropdownLoadHandler = (params: DropdownLoadParams) => void | Promise<void>;
```

Props principales:

```ts
interface DropdownProps {
  id: string;
  modelValue: string;
  options: readonly SelectOption[];
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  searchable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  maxRecords?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
  debounceMs?: number;
  onSearch?: DropdownLoadHandler;
  onLoadMore?: DropdownLoadHandler;
  clearOnOptionsChange?: boolean;
  onChange: (value: string, option: SelectOption) => void;
  onBlur?: () => void;
}
```

Valores predeterminados:

- `placeholder`: `Seleccionar...`
- `searchPlaceholder`: `Buscar...`
- `emptyText`: `Sin resultados`
- `searchable`: `true`
- `disabled`: `false`
- `loading`: `false`
- `loadingMore`: `false`
- `maxRecords`: `50`
- `debounceMs`: `500`
- `hasMore`: `false`
- `nextOffset`: `null`
- `clearOnOptionsChange`: `false`

## Modos de operación

### 1. Selector local

Cuando no se proporciona `onSearch` ni `onLoadMore`, el componente filtra en memoria las opciones recibidas:

```tsx
<Dropdown
  id="nivel-desc"
  modelValue={nivel}
  options={nivelOpts}
  label="Lista de Precio"
  searchable={false}
  onChange={(value) => setNivel(value)}
/>
```

En este modo `maxRecords` limita las opciones visibles localmente.

### 2. Selector remoto e incremental

Cuando se proporciona `onSearch` o `onLoadMore`, el componente no filtra el catálogo en pantalla. Las opciones visibles son las páginas recibidas del servidor.

Al escribir en el buscador:

1. Se actualiza el texto local.
2. Se espera `debounceMs` milisegundos.
3. Se ejecuta `onSearch({ query, offset: 0, maxRecords })`.
4. El padre reemplaza las opciones por la nueva página.

Al acercarse al final del `listbox`:

1. Se detecta que quedan aproximadamente 80 píxeles.
2. Si `hasMore` es verdadero y no hay otra carga en curso, se ejecuta `onLoadMore`.
3. El padre solicita `nextOffset`.
4. Las opciones nuevas se agregan y se deduplican por `value`.

Ejemplo utilizado para artículos:

```tsx
<Dropdown
  id="codigo-articulo"
  modelValue={codigoArticulo}
  options={articuloOpts}
  label="Código de Artículo"
  searchable
  maxRecords={50}
  hasMore={articulosHasMore}
  nextOffset={articulosNextOffset}
  loading={cargandoArticulos}
  loadingMore={cargandoMasArticulos}
  debounceMs={500}
  onSearch={cargarArticulosPaginados}
  onLoadMore={cargarArticulosPaginados}
  onChange={(value) => setCodigoArticulo(value)}
/>
```

## API de artículos

La búsqueda remota utiliza exclusivamente lecturas mediante:

```text
GET /api/catalogo/articulos
```

Parámetros:

| Parámetro | Obligatorio | Descripción |
|---|---:|---|
| `compania` | Sí | Compañía activa, por ejemplo `FEBECA`. |
| `nivelPrecio` | Sí | Código de la lista de precio. |
| `search` | No | Texto a buscar en código o descripción. |
| `offset` | No | Desplazamiento de la página, predeterminado `0`. |
| `maxRecords` | No | Tamaño solicitado de página, predeterminado `50`. El servidor lo limita a `100`. |

Ejemplo:

```text
/api/catalogo/articulos?compania=FEBECA&nivelPrecio=MAYOREOB&search=nevera&offset=0&maxRecords=50
```

Respuesta:

```ts
{
  items: ArticuloCatalogo[];
  offset: number;
  maxRecords: number;
  hasMore: boolean;
  nextOffset: number | null;
}
```

El servidor consulta como máximo `maxRecords + 1` registros. El registro adicional determina `hasMore`, sin ejecutar un `COUNT` costoso para cada búsqueda.

### SQL Server

En modo real, `listarCatalogoPaginado()`:

- Consulta la versión activa máxima de la lista.
- Busca por `AP.ARTICULO` o `A.DESCRIPCION` usando parámetros SQL.
- Ordena por código de artículo.
- Utiliza `OFFSET ... FETCH NEXT ...`.
- Mantiene el esquema y los objetos configurables por compañía.

La consulta no recibe nombres de tablas desde el navegador. Estos se obtienen del mapa seguro de configuración de compañía.

### Modo demo

En `DEMO_MODE=true`:

- Se usa el catálogo en memoria.
- La búsqueda se realiza en el servidor sobre el catálogo demo.
- Se aplica el mismo `offset`, `maxRecords`, orden y respuesta `hasMore`.
- No se conecta a SQL Server.

## Protección contra respuestas obsoletas

`NuevaSolicitud.tsx` mantiene:

- Un contador `articulosRequestRef` para identificar la solicitud vigente.
- Un `AbortController` para cancelar la consulta anterior cuando cambia la búsqueda o la lista.
- Verificación del `requestId` antes de aplicar una respuesta.

Esto evita que una búsqueda anterior sobrescriba los resultados de una búsqueda más reciente.

La búsqueda remota debe mantener siempre esta regla:

```text
respuesta aplicada solo si corresponde a la combinación vigente de:
compania + nivelPrecio + search + offset
```

## Preservación de selección

El padre conserva temporalmente el artículo seleccionado en `articuloSeleccionado`. Esto evita que la etiqueta seleccionada desaparezca si una nueva búsqueda reemplaza la página actual y ya no contiene ese artículo.

La selección sigue enviando únicamente el código del artículo. El precio, costo y demás datos se usan para la vista previa cuando están disponibles.

## Simulación y envío

La paginación del dropdown solo controla la experiencia de búsqueda. No sustituye las validaciones de negocio.

Al simular:

- `simularManual()` vuelve a consultar el catálogo completo en el servidor.
- Verifica que el artículo pertenezca a la lista seleccionada.
- Construye las filas de impacto con precio, costo, margen y redondeo.

Al enviar:

- `enviarSolicitud()` vuelve a consultar los maestros de Softland.
- Verifica nuevamente lista y artículo.
- No confía en que el cliente haya recibido la página completa.

Por tanto, nunca se debe usar la página parcial del dropdown como contexto para simulación, Excel, grupos o validación final.

## Accesibilidad e interacción

El componente implementa:

- Botón real con `type="button"`.
- `role="combobox"`.
- `aria-expanded`.
- `aria-controls`.
- `aria-haspopup="listbox"`.
- Lista con `role="listbox"`.
- Opciones con `role="option"`, `aria-selected` y `aria-disabled`.
- Navegación con `ArrowDown`, `ArrowUp`, `Home`, `End`, `Enter`, `Space`, `Escape` y `Tab`.
- Cierre al hacer clic fuera.
- Cierre al perder foco.
- Limpieza de listeners al desmontar.
- Normalización de búsqueda para ignorar mayúsculas, acentos y espacios extremos.

## Reglas específicas de Captura Manual

### Lista de Precio

Debe conservarse sin buscador:

```tsx
searchable={false}
```

Su selección reinicia la página de artículos y solicita la primera página de la nueva lista.

### Código de Artículo

Debe utilizar:

```tsx
searchable
maxRecords={50}
debounceMs={500}
onSearch={cargarArticulosPaginados}
onLoadMore={cargarArticulosPaginados}
```

El límite `50` es el tamaño de cada carga, no un límite total del catálogo. Las páginas posteriores se agregan cuando el usuario se aproxima al final de la lista.

## Criterios de aceptación

- Lista de Precio utiliza `Dropdown` y sigue sin mostrar buscador.
- Código de Artículo no carga miles de registros al abrir la pantalla.
- La primera consulta devuelve como máximo 50 artículos.
- Al escribir, se espera 500 ms antes de consultar la API.
- La búsqueda se ejecuta en servidor por código o descripción.
- Al llegar al final se solicita la siguiente página.
- No se duplican artículos al concatenar páginas.
- Una búsqueda anterior no puede sobrescribir una búsqueda posterior.
- Cambiar de lista cancela las consultas anteriores y reinicia el offset.
- La selección actual permanece visible aunque cambie la página de resultados.
- Simulación y envío continúan validando contra el catálogo completo en el servidor.
- El endpoint no recibe ni expone credenciales SQL.
- `Combobox.tsx` y los selectores de las demás pestañas no se modifican.
