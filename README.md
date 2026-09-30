# MV26020 — Gestión y Cálculo de Listas de Precio

Portal interno para controlar cambios en listas de precio de Softland. La solución aplica un flujo **maker-checker**: un usuario prepara y simula un cambio; otro usuario autorizado lo revisa y aprueba; solo entonces se ejecuta el procedimiento almacenado correspondiente y se conserva la trazabilidad del resultado.

El proyecto busca reducir el riesgo de actualizaciones directas de precio al incorporar simulación previa, segregación de funciones, validaciones comerciales, auditoría y ejecución controlada por compañía.

## Qué hace la solución

- Gestiona solicitudes de cambio de precio por compañía y lista.
- Permite simulación antes de enviar una solicitud a aprobación.
- Soporta gestión global por lista, actualización/carga masiva, cambios por artículo y carga masiva de margen mínimo.
- Implementa roles de **Operador** y **Aprobador**, con bloqueo de autoaprobación.
- Ejecuta cambios productivos únicamente después de una aprobación válida.
- Conserva solicitudes, resultados de ejecución y eventos de auditoría.
- Calcula y valida redondeo comercial mediante 12 bandas, incluyendo terminales comerciales y desempate al valor superior.
- Opera en modo demostración sin base de datos o contra SQL Server/Softland por compañía.

## Estado actual y cambio de alcance analizado

La aplicación web está en construcción y el flujo maker-checker ya está implementado. El cálculo actual en TypeScript usa factores multiplicadores y redondeo comercial; la integración real ejecuta procedimientos almacenados de Softland solo al aprobar.

Se analizó un cambio de alcance para conservar un **precio técnico/original** antes del redondeo comercial y reconstruir los precios publicados desde dicho valor. El cambio incorpora descuento porcentual encadenado a 8 decimales, listas dependientes, idempotencia y un job diario.

Existe una implementación SQL de referencia en `docs/implementacion_redondeo_articulo_precio_v2/` con:

- Columna `U_PRECIO_TECNICO` en `COFER.ARTICULO_PRECIO` y migración inicial.
- Función `COFER.FN_REDONDEAR_PRECIO` con 12 bandas, terminales por bloque y pruebas de aceptación.
- Procedimiento `COFER.SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2` con simulación, validaciones de costo/margen, transacción e idempotencia.

Ese motor SQL está preparado para QA, pero la aplicación todavía debe alinearse con su contrato y el job diario/orquestador por dependencia de listas sigue pendiente. Consulte los informes de impacto antes de implementar ese cambio.

## Arquitectura

```text
Usuario interno
  → Portal web Next.js (React + Server Actions)
    → Solicitud, simulación, revisión y auditoría
      → SQL Server / Softland por compañía
        → Procedimientos almacenados y ARTICULO_PRECIO
```

### Componentes principales

| Componente | Responsabilidad |
|---|---|
| `app-web/` | Aplicación full-stack Next.js: interfaz React, Server Actions y Route Handlers. |
| `app-web/src/lib/` | Reglas de dominio: factores, validaciones de margen y redondeo comercial. |
| `app-web/src/server/` | Persistencia del portal, modo demo, conexiones `mssql` y ejecución de SPs. |
| `docs/` | Especificaciones funcionales, análisis de datos y paquete SQL de redondeo v2. |
| `aidlc-docs/` | Requisitos, planes e informes de análisis e impacto IA-DLC. |

### Persistencia y ejecución

La solución separa los datos de gobernanza de la operación de precios:

- **Portal de precios:** solicitudes, detalle simulado, estados, aprobaciones y auditoría.
- **Softland por compañía:** artículos, listas, precios, márgenes, UDF y procedimientos almacenados operativos.

En modo real, la aplicación no actualiza precios directamente. Al aprobar una solicitud, invoca el SP configurado para la compañía activa. Para margen puede actualizar primero la UDF `U_FACTOR_REDUCCION_MARGEN` y luego ejecutar el SP de cálculo de margen.

## Flujos funcionales

1. **Crear y simular:** el Operador selecciona compañía/proceso, ingresa factores o carga un archivo Excel y revisa el resultado de la simulación.
2. **Enviar a aprobación:** la solicitud queda pendiente con su evidencia de simulación.
3. **Revisar:** el Aprobador consulta impacto, registros válidos/no válidos y datos relevantes del cambio.
4. **Aprobar o rechazar:** se bloquea que el solicitante apruebe su propia solicitud; un rechazo exige motivo.
5. **Ejecutar:** la solicitud pasa a proceso y, fuera de modo demo, se ejecuta el SP de Softland autorizado.
6. **Auditar:** se registra envío, revisión, aprobación/rechazo, ejecución y resultado final.

## Reglas de negocio implementadas

- Factores de precio permitidos en el rango `(0, 2]` para los procesos actuales de la app.
- Porcentaje de reducción de margen en `[0, 100)`: por ejemplo, `10` representa 10 % y se normaliza a `0.10`.
- Margen mínimo validado contra el precio comercial redondeado.
- Redondeo comercial en 12 bandas entre `0,01` y `100.000,00`, con estado calculado, fuera de rango o alerta de margen.
- Las solicitudes pendientes no ejecutan cambios productivos.
- La ejecución productiva se habilita exclusivamente tras la aprobación de un usuario con rol Aprobador.

## Requisitos

- Node.js 18.18+ o 20+.
- npm.
- Opcional para modo real: SQL Server accesible y objetos Softland configurados por compañía.

> En Windows, si PowerShell bloquea `npm`, ejecute `npm.cmd` en lugar de `npm`.

## Inicio rápido

```powershell
Set-Location app-web
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abra `http://localhost:5000`.

Scripts disponibles dentro de `app-web/`:

| Comando | Propósito |
|---|---|
| `npm run dev` | Ejecuta el entorno de desarrollo. |
| `npm run build` | Genera la compilación de producción. |
| `npm start` | Sirve la compilación de producción. |
| `npm run typecheck` | Ejecuta TypeScript sin emitir archivos. |

## Configuración de ejecución

### Modo demostración

`DEMO_MODE=true` es el modo predeterminado. No requiere SQL Server: usa datos y solicitudes en memoria para probar el flujo completo sin modificar sistemas productivos.

### Modo SQL Server

Para operar contra Softland, configure `DEMO_MODE=false` y `COMPANIES_CONFIG` en `app-web/.env.local`. La configuración define la conexión, esquema, objetos SQL y parámetros de cada compañía. Use `.env.example` como referencia y no incluya credenciales en el repositorio.

## Documentación relevante

| Documento | Contenido |
|---|---|
| `app-web/README.md` | Configuración técnica detallada de la aplicación, modo demo/real y objetos SQL configurables. |
| `docs/Requerimiento_ precio original y redondeo de listas 2026-09-10.md` | Requerimiento de precio técnico/original, redondeo e idempotencia. |
| `docs/implementacion_redondeo_articulo_precio_v2/` | DDL, función, SP y análisis de referencia para QA. |
| `aidlc-docs/inception/requirements/requirements.md` | Requisitos funcionales y no funcionales aprobados para el portal. |
| `aidlc-docs/inception/reverse-engineering/impacto-precio-original-y-redondeo.md` | Informe general de impacto del cambio de precio técnico y redondeo. |
| `aidlc-docs/inception/reverse-engineering/impacto-bd-precio-original-y-redondeo.md` | Impacto específico en base de datos y Softland. |
| `aidlc-docs/inception/reverse-engineering/impacto-app-precio-original-y-redondeo.md` | Impacto específico en la aplicación Next.js. |

## Documentación de persistencia por artículo y lista

- `docs/especificacion-factor-articulo-lista.md`: mapeo, validaciones y upsert de `DESCUENTO_LISTA_PRECIO`.
- `backend/sql/FACTOR_ARTICULO_LISTA.sql`: DDL de `FACTOR_ARTICULO_LISTA` por esquema de compañía.

## Estructura del repositorio

```text
MV26020-Calculo-de-listas-de-precio/
├── app-web/                         # Portal Next.js
│   ├── src/app/                     # Rutas, acciones de servidor y API
│   ├── src/components/              # Interfaz del portal
│   ├── src/lib/                     # Cálculo, redondeo y tipos de dominio
│   └── src/server/                  # SQL Server, repositorios y modo demo
├── docs/                            # Requerimientos y paquete SQL v2
├── aidlc-docs/                      # Requisitos, planes e informes IA-DLC
└── README.md
```

## Alcance pendiente del cambio de precio técnico

Antes de integrar el cambio de precio original/técnico en producción se deben resolver, entre otros, los siguientes puntos:

- Unificar el nombre `U_PRECIO_ORIGINAL` vs. `U_PRECIO_TECNICO`.
- Confirmar la llave real de `ARTICULO_PRECIO`, el tipo de `ESQUEMA_TRABAJO` y la moneda utilizada para validar costos/márgenes.
- Aprobar la política para precios superiores a 100.000 y la extensión opcional de terminales `50/90`.
- Definir el tratamiento de EPA y `MARGEN_MULR`.
- Implementar el job diario/orquestador que respete la dependencia entre listas y no se ejecute simultáneamente con el proceso actual.
- Alinear la simulación TypeScript y el contrato de integración con `SP_GESTION_LISTAS_PRECIOS_FULL_QA_V2`.
