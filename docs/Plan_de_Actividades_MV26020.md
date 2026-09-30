# Plan de Actividades de BDatos _ MV26020 - Homologación de Lista de Precios Venezuela, Costa Rica y Colombia - S_Código

## Descripción

### Objetivo General
Homologar el proceso de Lista de Precios en todas las compañías de Mayoreo.

### Objetivos Específicos
*(No especificados explícitamente en el documento original)*

---

## Tabla de Actividades y Estimaciones

| id | Prela. | Actividad | Detalle Actividad | Fecha Inicio | Fecha Fin | Recursos | Duracion (horas) | Total (horas) [1] | % avance | Observacion |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | Análisis del proceso de carga de actualización de lista de precios en VE, CR y COL | Comprender funcionamiento del modelo actual en el ambiente de pruebas (QA) | | | Santiago Ariza / Kevin Rodriguez | 4 | 4 | | |
| 2 | | Analisis y validaciones de las reglas de negocio | Analisis y validaciones de las reglas de negocio a considerar en cada país | | | Santiago Ariza / Kevin Rodriguez | 6 | 6 | | |
| 3 | | Creación de tablas maestro en VE, CR y COL | Creación de tablas maestro de articulo, lista, factor en cada compañía | | | Santiago Ariza / Kevin Rodriguez | 8 | 8 | | |
| 4 | | Mejora de Stored Procedures VE | Mejora de Stored Procedures:<br>- COMPAÑIA.SP_GESTION_LISTAS_PRECIOS_FULL<br>- COMPAÑIA.SP_GESTION_LISTAS_PRECIOS_PARCIAL | | | Santiago Ariza / Kevin Rodriguez | 12 | 12 | | |
| 5 | | Mejora de Stored Procedures CR | Mejora de Stored Procedures:<br>- COFER.SP_GESTION_LISTAS_PRECIOS_FULL<br>- COFER.SP_GESTION_LISTAS_PRECIOS_PARCIAL | | | Kevin Rodriguez | 10 | 10 | | |
| 6 | | Mejora de Stored Procedures COL | Mejora de Stored Procedures:<br>- MUNDIAL.SP_GESTION_LISTAS_PRECIOS_FULL<br>- MUNDIAL.SP_GESTION_LISTAS_PRECIOS_PARCIAL | | | Kevin Rodriguez | 10 | 10 | | |
| 7 | | Creación de validaciones en tabla maestro | Creación de validaciones en tabla maestro:<br>- No puede haber factor en cero.<br>- La unicidad es la combinación del articulo, lista. | | | Santiago Ariza / Kevin Rodriguez | 8 | 8 | | |
| 8 | | Pruebas unitarias en QA | Pruebas unitarias del equipo de Base de Datos en QA | | | Santiago Ariza / Kevin Rodriguez | 6 | 6 | | |
| 9 | | Pruebas internas en QA | Pruebas unitarias con equipo de Aplicaciones en QA | | | Santiago Ariza / Kevin Rodriguez | 4 | 4 | | |
| 10 | | Certificacion Interna | Certificacion Interna por parte del equipo de proyectos | | | Santiago Ariza / Kevin Rodriguez | 2 | 2 | | |
| | | Certificacion en ambiente QA por el cliente | Sesiones de Certificación con el Cliente | | | Santiago Ariza / Kevin Rodriguez | 4 | 4 | | |
| | | Despliegue en producción | Despliegue a producción | | | Santiago Ariza / Kevin Rodriguez | 8 | 8 | | |
| | | Configuración de proceso recurrente | Configuración de proceso recurrente automatico | | | Santiago Ariza / Kevin Rodriguez | 2 | 2 | | |
| | | Garantia | Garantia y/o monitoreo | | | Santiago Ariza / Kevin Rodriguez | 4 | 4 | | |

---

## Resumen de Tiempo y Recursos

**Tiempo Aproximado en Horas:** 88

### Recursos y Asignación Diaria

| Recursos | % | HH Día |
|---|---|---|
| Santiago Ariza | 20 | 1.6 |
| Kevin Rodriguez | 40 | 3.2 |

---

**Notas:**  
[1] Se estiman las horas partiendo de que es un solo recurso.
