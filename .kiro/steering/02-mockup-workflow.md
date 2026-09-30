\---

inclusion: always

\---



\# Directiva de Gestión de Estado, Checkpoints y Rollback



\## OBJETIVO

Garantizar la evolución de los mockups interactivos dentro de `Product-Definition/mockups/` sin pérdida de trabajo aprobado y manteniendo el historial en `.versions`.



\## RUTAS DEL PROYECTO

\- \*\*Directorio de Trabajo:\*\* `Product-Definition/mockups/`

\- \*\*Directorio de Respaldo/Backups:\*\* `Product-Definition/mockups/.versions/`

\- \*\*Registro de Estado:\*\* `Product-Definition/MOCKUP\_NOTES.md`



\## REGLAS DE COMPORTAMIENTO AUTOMÁTICO



\### 1. Creación de Checkpoints (Backups)

Cuando el usuario exprese conformidad o valide el estado actual (ej. \*"conforme"\*, \*"me gusta"\*, \*"guarda backup"\*, \*"hacer checkpoint"\*, \*"aprobado"\*):

1\. Duplica el archivo activo o el conjunto de cambios de `Product-Definition/mockups/` dentro de `Product-Definition/mockups/.versions/`.

2\. Asigna un nombre de versión o subcarpeta secuencial (ej. `v1\_aprobado.html`, `v2\_aprobado/` o con fecha).

3\. Actualiza `Product-Definition/MOCKUP\_NOTES.md` registrando la nueva versión como la \*\*Línea Base Activa\*\* y listando los componentes clave aprobados.



\### 2. Cambios Incrementales sobre la Línea Base

\- Toma \*\*únicamente\*\* la Línea Base Activa indicada en `Product-Definition/MOCKUP\_NOTES.md` como punto de partida para cualquier modificación.

\- Aplica exclusivamente los cambios solicitados por el usuario.

\- No alteres, reestructures ni elimines componentes validados previamente a menos que el usuario lo pida explícitamente.



\### 3. Registro de Métodos Descartados

Si el usuario rechaza un enfoque, propuesta o diseño (ej. \*"no me gusta"\*, \*"descarta esa opción"\*, \*"revertir esto"\*):

\- Añade inmediatamente la técnica o solución rechazada a la sección `## Métodos Descartados` en `Product-Definition/MOCKUP\_NOTES.md`.

\- \*\*REGLA ESTRICTA:\*\* Tienes prohibido volver a sugerir o implementar cualquier patrón listado en los métodos descartados.



\### 4. Operación de Rollback (Restauración)

Cuando el usuario pida revertir o deshacer cambios (ej. \*"rollback"\*, \*"volver al último backup"\*, \*"restaurar versión anterior"\*):

\- Sobrescribe el código borrador en `Product-Definition/mockups/` copiando el contenido exacto de la última versión aprobada disponible en `Product-Definition/mockups/.versions/`.

\- Confirma en el chat qué versión específica fue restaurada.

