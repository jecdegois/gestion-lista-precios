# Seguimiento de Estado IA-DLC

## Información del Proyecto
- **Proyecto:** MV26020 - Automatización de Listas de Precio
- **Tipo de Proyecto:** Brownfield de mejora y homologación de procesos Softland existentes en Costa Rica, Venezuela y Colombia
- **Fecha de Inicio:** 2026-08-13T00:00:00Z
- **Etapa Actual:** CONSTRUCCIÓN - Modo real FEBECA blindado en solo lectura; pendiente de prueba manual del usuario con sus credenciales y SQL Server

## Estado del Workspace
- **Código Existente:** Sí — mockup React/Babel, scripts SQL y componentes Python de referencia en el workspace.
- **Ingeniería Inversa Requerida:** Sí, sobre los objetos legacy de Softland cuando se entreguen los scripts del Job, SP maestro y SPs por compañía. El workspace no contiene código legacy ejecutable.
- **Raíz del Workspace:** `c:\Users\ysalas\MV26020-Calculo-de-listas-de-precio`
- **Fuente principal del MVP:** `docs/Especificacion_Automatizacion_Listas_de_Precio.md`

## Reglas de Ubicación
- **Código de Aplicación:** Raíz del workspace, nunca en `aidlc-docs/`.
- **Documentación IA-DLC:** Solo en `aidlc-docs/`.

## Configuración de Extensiones
| Extensión | Habilitada | Decidida en |
|---|---|---|
| Security Baseline | Sí | Análisis de Requerimientos |
| Resiliency Baseline | Sí | Análisis de Requerimientos |
| Property-Based Testing | Sí | Análisis de Requerimientos |

## Progreso de Etapas
### Fase de Incepción
- [x] Detección del Workspace
- [ ] Ingeniería Inversa (no aplicable: no existe código en el workspace)
- [x] Análisis de Requerimientos
- [x] Historias de Usuario
- [ ] Planificación del Flujo (en curso)
- [ ] Diseño de Aplicación
- [ ] Generación de Unidades de Trabajo
