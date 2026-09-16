# Cargas iniciales y consultas de maestros Softland

## Decisión de propiedad de datos

| Dato | Fuente de verdad | Tratamiento del portal/app |
|---|---|---|
| Compañías habilitadas | `PORTAL_PRECIOS.COMPANIA` | Carga inicial idempotente en `01_esquema_y_catalogos.sql` |
| Listas/niveles habilitados | `[ESQUEMA_SOFTLAND].NIVEL_PRECIO` y `VERSION_NIVEL` | Consulta directa por compañía; no se replica a `PORTAL_PRECIOS` |
| Usuarios, roles y ámbitos | `PORTAL_PRECIOS.USUARIO` y `USUARIO_AMBITO` | Carga inicial idempotente en `05_carga_inicial_usuarios_pruebas.sql`; en producción se vincula el `IDP_SUBJECT` real |
| Artículos | `[ESQUEMA_SOFTLAND].ARTICULO` | Consulta en vivo por compañía |
| Precios | `[ESQUEMA_SOFTLAND].ARTICULO_PRECIO` | Consulta en vivo por compañía, nivel y versión activa |
| Versiones | `[ESQUEMA_SOFTLAND].VERSION_NIVEL` | Consulta en vivo; solo `ESTADO = 'A'` |
| Solicitudes y auditoría | `PORTAL_PRECIOS.SOLICITUD_*` y `AUDITORIA_EVENTOS` | Persistencia del flujo maker-checker |
| Colores de usuario | Catálogo de presentación de la interfaz | No se escriben desde el seed ni se usan como dato de negocio en SQL |

No se copian `NIVEL_PRECIO`, `ARTICULO` ni `ARTICULO_PRECIO` al portal. Esto evita duplicar maestros de Softland y mantiene listas, precios y artículos actualizados mediante consultas directas por compañía.

## Orden de ejecución

1. `backend/sql/portal/01_esquema_y_catalogos.sql`
   - Crea el esquema portal y registra las compañías.
   - No carga listas ni maestros de Softland.
2. `backend/sql/portal/02_usuarios_y_ambitos.sql`
   - Crea usuarios, ámbitos, función de autorización y vista de ámbito efectivo.
3. `backend/sql/portal/03_solicitudes.sql`
4. `backend/sql/portal/04_aprobaciones_y_ejecucion.sql`
5. `backend/sql/portal/05_carga_inicial_usuarios_pruebas.sql`

Las listas, artículos, versiones y precios se consultan directamente en la base/esquema Softland configurado para la compañía. No existe una carga inicial de esos maestros en `PORTAL_PRECIOS`.

## Consultas reales usadas por la aplicación

La aplicación resuelve el esquema configurado por compañía y ejecuta consultas equivalentes a las siguientes:

### Niveles disponibles

```sql
SELECT DISTINCT NP.NIVEL_PRECIO AS codigo
FROM [ESQUEMA_SOFTLAND].[NIVEL_PRECIO] NP
WHERE NP.NIVEL_PRECIO IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM [ESQUEMA_SOFTLAND].[VERSION_NIVEL] VN
      WHERE VN.NIVEL_PRECIO = NP.NIVEL_PRECIO
        AND VN.ESTADO = 'A'
  )
ORDER BY NP.NIVEL_PRECIO;
```

### Catálogo de artículos y precio vigente

```sql
SELECT AP.ARTICULO,
       A.DESCRIPCION,
       AP.PRECIO,
       A.COSTO_PROM_DOL,
       AP.NIVEL_PRECIO,
       AP.VERSION,
       A.CATEGORIA,
       A.LINEA,
       A.PROVEEDOR
FROM [ESQUEMA_SOFTLAND].[ARTICULO_PRECIO] AP
INNER JOIN [ESQUEMA_SOFTLAND].[ARTICULO] A
        ON A.ARTICULO = AP.ARTICULO
INNER JOIN [ESQUEMA_SOFTLAND].[VERSION_NIVEL] VN
        ON VN.NIVEL_PRECIO = AP.NIVEL_PRECIO
       AND VN.VERSION = AP.VERSION
WHERE VN.ESTADO = 'A'
  AND (@nivelPrecio IS NULL OR AP.NIVEL_PRECIO = @nivelPrecio)
ORDER BY AP.ARTICULO;
```
### Descripciones de Clasificaciones
```
SELECT A.CLASIFICACION_1, C1.DESCRIPCION AS CATEGORIA, A.CLASIFICACION_2, C2.DESCRIPCION AS SUB_CAT,
A.CLASIFICACION_3,C3.DESCRIPCION AS MARCA, A.CLASIFICACION_4 AS GRUPO, C4.DESCRIPCION AS BDF, A.CLASIFICACION_5, c5.descripcion AS GRUPO_COMPRA, A.CLASIFICACION_6, c6.descripcion AS DISPONIBLE_VENTA 
FROM [ESQUEMA_SOFTLAND].ARTICULO A 
LEFT JOIN 
[ESQUEMA_SOFTLAND].CLASIFICACION C1 ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
LEFT JOIN 
[ESQUEMA_SOFTLAND].CLASIFICACION C2 ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
LEFT JOIN
[ESQUEMA_SOFTLAND].CLASIFICACION C3 ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
LEFT JOIN 
[ESQUEMA_SOFTLAND].CLASIFICACION C4 ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
LEFT JOIN 
[ESQUEMA_SOFTLAND].CLASIFICACION C5 ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
LEFT JOIN 
[ESQUEMA_SOFTLAND].CLASIFICACION C6 ON A.CLASIFICACION_6 = C6.CLASIFICACION AND C6.AGRUPACION = 6
```
### Búsqueda puntual de artículo

La búsqueda debe filtrar por artículo y versión activa. Cuando el flujo trabaja sobre una lista concreta, también debe enviar `NIVEL_PRECIO`; no debe depender de un `TOP (1)` sin orden ni contexto.

### Autorización

Antes de enviar, revisar o ejecutar una solicitud, la operación debe validar el usuario contra `PORTAL_PRECIOS.FN_USUARIO_EN_AMBITO` o `V_USUARIO_AMBITO`, usando compañía y rol. La lista de la solicitud se valida por separado contra los maestros Softland de la compañía; su existencia no sustituye la autorización del portal.

## Cambios realizados en la implementación

- `01_esquema_y_catalogos.sql` dejó de insertar listas ficticias y documenta que los maestros se consultan directamente en Softland.
- Se descartó la sincronización de `LISTA_PRECIO`; la aplicación consulta `NIVEL_PRECIO` y `VERSION_NIVEL` en la compañía activa.
- `companies.ts` configura `tablaVersionNivel` con valor predeterminado `VERSION_NIVEL`.
- `pricing-repository.ts` consulta `VERSION_NIVEL` y descarta precios cuya versión no esté activa.
- `app-web/.env.example` documenta el mapeo de `tablaVersionNivel`.
- El catálogo demo permanece disponible únicamente cuando `DEMO_MODE=true`; para consultar Softland se requiere `DEMO_MODE=false`, `COMPANIES_CONFIG` completo y credenciales válidas.

## Prerrequisitos de operación real

- Cada compañía debe tener `server`, `database`, `schema`, `user` y `password` configurados en `COMPANIES_CONFIG`.
- Cada esquema debe exponer `NIVEL_PRECIO`, `VERSION_NIVEL`, `ARTICULO` y `ARTICULO_PRECIO` con las columnas consultadas.
- `VERSION_NIVEL.ESTADO = 'A'` debe representar la versión vigente.
- Los nombres de procedimientos, UDF y parámetros deben mapearse por compañía cuando no coincidan con los valores predeterminados.
- No se debe cambiar `DEMO_MODE=false` hasta disponer de conectividad y permisos en QA.

La validación realizada en este workspace es estática. No se ejecutaron scripts ni consultas contra una instancia SQL Server real.
