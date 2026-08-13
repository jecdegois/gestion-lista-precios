# Formulario de Validación de Requerimientos — MVP Automatización de Listas de Precio

## Contexto

La fuente principal del MVP es `docs/Especificacion_Automatizacion_Listas_de_Precio.md`. El alcance identificado automatiza el cálculo y homologación de listas de precio mediante factores relacionales, con validaciones, trazabilidad y procedimientos SQL para las compañías de Venezuela, Costa Rica y Colombia.

Responde cada pregunta reemplazando el valor posterior a `[Answer]:` con la letra de la opción elegida. Si eliges **X) Otro**, agrega la explicación en la misma línea después de la letra.

## Pregunta 1 — Alcance inicial de compañías
¿Cuál será el alcance de la primera liberación del MVP?

A) Implementar el modelo y los procedimientos para Venezuela, Costa Rica y Colombia en la misma liberación.

B) Implementar primero una compañía piloto y extender a las demás después de su certificación.

C) Implementar únicamente los objetos reutilizables y dejar la adaptación por compañía para una fase posterior.

X) Otro (describa el alcance después de `[Answer]:`).

[Answer]: B

## Pregunta 2 — Procedimientos incluidos en el MVP
¿Qué modalidades de cálculo deben quedar operativas en la primera liberación?

A) Solo cálculo FULL para actualizar todos los artículos de las listas destino.

B) Cálculo FULL y cálculo PARCIAL por artículos modificados recientemente.

C) Solo cálculo PARCIAL.

X) Otro (describa las modalidades después de `[Answer]:`).

[Answer]: B

## Pregunta 3 — Gestión de factores sin configuración específica
Cuando un artículo no tenga un factor activo configurado para una lista destino, ¿cuál debe ser el comportamiento predeterminado?

A) Usar factor 1 y mantener el precio de la lista base.

B) Rechazar el artículo independientemente del modo de ejecución.

C) Usar factor 1 en ejecución FULL y rechazarlo en ejecución PARCIAL.

X) Otro (describa la regla después de `[Answer]:`).

[Answer]: A

## Pregunta 4 — Política inicial ante validaciones
¿Qué modo debe utilizarse como comportamiento predeterminado en las ejecuciones programadas?

A) ERROR: registrar rechazos y cancelar toda la corrida si existe al menos un artículo inválido.

B) OMITIR: registrar rechazos y actualizar únicamente los artículos válidos.

C) ERROR en QA y OMITIR en producción.

X) Otro (describa la política después de `[Answer]:`).

[Answer]: B

## Pregunta 5 — Validaciones obligatorias
Además de factor mayor que cero y menor o igual que dos, ¿qué validaciones deberán bloquear la actualización del artículo?

A) Precio base inválido, precio destino no positivo, precio bajo costo y margen menor al mínimo configurado.

B) Solo precio base inválido y precio destino no positivo.

C) Precio base inválido, precio destino no positivo y precio bajo costo; el margen mínimo será informativo.

X) Otro (describa las validaciones después de `[Answer]:`).

[Answer]: A

## Pregunta 6 — Manejo de la lista base
¿Cuál es la política para la lista base en el MVP?

A) Nunca puede actualizarse mediante estas corridas.

B) Se protege por defecto, pero puede actualizarse mediante un parámetro explícito y autorizado.

C) Puede incluirse como cualquier otra lista destino.

X) Otro (describa la política después de `[Answer]:`).

[Answer]: B La regla definida para la lista base establece que se encuentra protegida por defecto para evitar modificaciones accidentales; sin embargo, el procedimiento permite su actualización únicamente si se activa de forma explícita el parámetro 

## Pregunta 7 — Versionado y reversión
¿Qué mecanismo de reversión debe exigirse para una corrida aprobada?

A) Mantener auditoría completa de cambios; la reversión se realiza mediante una ejecución controlada basada en el log.

B) Crear una nueva versión de precios por cada corrida aprobada y revertir activando la versión anterior.

C) No incluir reversión en el MVP; solo auditoría y corrección mediante una nueva corrida.

X) Otro (describa el mecanismo después de `[Answer]:`).

[Answer]: C

## Pregunta 8 — Programación y ejecución
¿Cómo se activará el cálculo de listas de precio en el MVP?

A) Solo mediante SQL Server Agent Job programado.

B) Solo mediante ejecución manual autorizada en QA y producción.

C) Mediante Job programado y ejecución manual autorizada para pruebas, correcciones y contingencia.

X) Otro (describa el mecanismo después de `[Answer]:`).

[Answer]: 

## Pregunta 9 — Integración hacia AFV
¿Cuál es el límite de responsabilidad del MVP respecto de AFV?

A) Actualizar Softland y registrar los datos de réplica en `PS_AFV_JSON`; los microservicios existentes continúan enviando a AFV.

B) Actualizar Softland, registrar la réplica y modificar/crear los microservicios AWS de sincronización hacia AFV.

C) Actualizar únicamente Softland; la réplica hacia AFV queda fuera del MVP.

X) Otro (describa el alcance después de `[Answer]:`).

[Answer]: 

## Pregunta 10 — Portal maker-checker
¿El portal React/FastAPI de solicitudes, aprobación y auditoría forma parte del MVP actual?

A) No. El MVP se limita a objetos y automatización SQL; el portal será una fase posterior.

B) Sí. Debe incluir los tres procesos propuestos, catálogos, roles Operador/Aprobador y auditoría.

C) Parcialmente. Solo se requiere el portal de carga y aprobación de factores; los demás procesos quedan fuera.

X) Otro (describa el alcance después de `[Answer]:`).

[Answer]: 

## Pregunta 11 — Acceso y separación de funciones
¿Quiénes estarán autorizados para administrar factores y aprobar corridas o solicitudes en producción?

A) Equipo funcional administra factores; equipo técnico autorizado ejecuta y aprueba corridas.

B) Un usuario funcional crea solicitudes y otro usuario funcional aprobador las ejecuta, bajo separación maker-checker.

C) Solo el equipo técnico administra, aprueba y ejecuta.

X) Otro (describa los roles después de `[Answer]:`).

[Answer]: 

## Pregunta 12 — Criterio de éxito de la primera liberación
¿Cuál será el criterio principal para aceptar el MVP en QA?

A) Los precios calculados coinciden con el resultado esperado en una muestra funcional aprobada y no se presentan rechazos críticos.

B) Se procesan exitosamente todas las listas y artículos de las tres compañías, incluyendo la réplica hacia AFV.

C) Se ejecutan los procedimientos sin errores técnicos en QA; la validación funcional detallada se hará posteriormente.

X) Otro (describa el criterio después de `[Answer]:`).

[Answer]: 

## Pregunta 13 — Extensión de seguridad
¿Deben aplicarse las reglas de la extensión de seguridad como restricciones obligatorias del proyecto?

A) Sí — aplicar todas las reglas de seguridad como restricciones bloqueantes, recomendado para una solución productiva.

B) No — omitir las reglas de seguridad, adecuado únicamente para prototipos o pruebas experimentales.

X) Otro (describa la decisión después de `[Answer]:`).

[Answer]: 

## Pregunta 14 — Extensión de resiliencia
¿Debe aplicarse la línea base de resiliencia como guía de diseño para el proyecto?

A) Sí — aplicar prácticas de diseño para tolerancia a fallos, observabilidad y recuperabilidad.

B) No — omitir la línea base de resiliencia para priorizar una implementación experimental o de rápida iteración.

X) Otro (describa la decisión después de `[Answer]:`).

[Answer]: 

## Pregunta 15 — Pruebas basadas en propiedades
¿Deben aplicarse reglas de pruebas basadas en propiedades (PBT) al proyecto?

A) Sí — aplicar todas las reglas PBT a la lógica de negocio y transformaciones de datos.

B) Parcial — aplicar PBT solo a funciones puras de cálculo, validación y serialización.

C) No — omitir PBT y usar únicamente pruebas convencionales.

X) Otro (describa la decisión después de `[Answer]:`).

[Answer]: 
