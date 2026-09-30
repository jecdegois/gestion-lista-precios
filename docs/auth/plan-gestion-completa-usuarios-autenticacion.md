# Plan de implementación: gestión completa de usuarios y autenticación

## Resumen

Implementar autenticación con correo y contraseña, autorregistro sujeto a aprobación, sesiones persistentes y administración global de usuarios. Se reutilizarán Next.js y SQL Server existentes; la identidad (usuarios, sesiones, tokens, roles y auditoría de seguridad) vive en **PostgreSQL** (ver [entidades](./entidades-modulo-usuarios-autenticacion.md)).

Roles acordados:

| Rol | Funciones |
|---|---|
| ADMINISTRADOR | Crear, aprobar, editar, desactivar y reactivar usuarios; asignar permisos; restablecer contraseñas. |
| OPERADOR | Crear, simular y enviar solicitudes en sus compañías autorizadas. |
| APROBADOR | Revisar, aprobar y rechazar solicitudes en sus compañías autorizadas, sin autoaprobación. |

Cada usuario operativo tendrá un solo rol por compañía y podrá tener roles diferentes entre compañías. El administrador global tendrá funciones administrativas.

## Comportamiento e interfaces

- **Registro:** nombre, correo y contraseña con confirmación. La cuenta queda pendiente y sin permisos hasta que el administrador compruebe la identidad y asigne sus compañías y roles.
- **Login y logout:** validar credenciales en el servidor, mantener la sesión al recargar y revocarla al salir. Las cuentas pendientes solo podrán consultar su estado, cambiar contraseña y cerrar sesión.
- **Gestión de usuarios:** listado paginado con búsqueda y filtros por estado, compañía y rol; creación, detalle, edición, aprobación, desactivación y reactivación. Proteger al último administrador activo frente a desactivación o pérdida de privilegios.
- **Alta administrativa:** crear la cuenta con permisos y enviar un enlace para que el usuario defina su contraseña. Permitir reenviar el enlace si expira o falla el envío.
- **Recuperación:** enlace por correo y restablecimiento administrativo mediante contraseña temporal, mostrada una sola vez y con cambio obligatorio al ingresar.
- **Mi cuenta:** consultar datos y cambiar contraseña proporcionando la actual. El correo será un identificador no editable en esta primera versión, para conservar las referencias históricas existentes.
- **Navegación:** incorporar registro, recuperación, definición de contraseña, estado pendiente y gestión de usuarios. Mostrar únicamente compañías y funciones autorizadas.

## Implementación

1. **Persistencia y migración.** Crear las entidades de identidad en PostgreSQL con **Prisma** (`app-web/prisma-postgres/`, migraciones con `prisma migrate`) según el diccionario de entidades; agregar los campos de correlación en SQL Server (`SOLICITUD_PRECIO.ID_USUARIO_SOLICITANTE_UID`, `APROBADOR_UID`). El operativo SQL Server sigue con `mssql`; Prisma se extenderá a él de forma progresiva (`app-web/prisma-sqlserver/`, por introspección con `db pull`). `PORTAL_PRECIOS.USUARIO` y `USUARIO_AMBITO` quedan obsoletas y son la fuente de la migración única. Mantener los identificadores y registros históricos. La migración detectará correos duplicados y roles incompatibles antes de aplicar restricciones, sin resolver conflictos silenciosamente.

2. **Autenticación.** Usar `node:crypto` con `scrypt` asíncrono, sal aleatoria y comparación segura. Guardar sesiones opacas en PostgreSQL y enviar su identificador mediante cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Guardar únicamente hashes de los tokens. Referencia: [API de criptografía de Node.js](https://nodejs.org/api/crypto.html).

3. **Autorización centralizada.** Incorporar funciones de servidor para exigir sesión, administrador o rol por compañía (contrato en [matriz de autorización](./matriz-autorizacion.md)). Reemplazar `resolverIdentidad` como mecanismo de acceso y eliminar la confianza en correo, nombre o rol enviados por el navegador. Proteger todas las Server Actions y rutas API existentes, incluidas consultas, simulaciones, archivos, solicitudes y auditoría. Referencia: [autenticación en Next.js](https://nextjs.org/docs/14/app/building-your-application/authentication).

4. **Identidad y segregación.** Incorporar el ID estable del usuario al contexto autenticado; obtener permisos vigentes del servidor. Comparar ese ID para impedir autoaprobación, usando el correo histórico normalizado cuando una solicitud antigua carezca de vínculo. Sustituir la dependencia actual de `ROL_GLOBAL`, ausente en los scripts SQL revisados.

5. **Correo.** Agregar Nodemailer con SMTP configurable mediante variables de entorno y una URL pública fija para construir enlaces. Usar tokens de propósito específico, consumo único y vencimiento; registrar errores de envío sin guardar contraseñas ni tokens en logs. Referencia: [transporte SMTP de Nodemailer](https://nodemailer.com/smtp).

6. **Integración y documentación.** Implementar los formularios con Server Actions y reutilizar componentes visuales existentes. Registrar altas, aprobaciones, cambios de permisos, bajas y restablecimientos. Actualizar el requisito anterior de SSO y documentar migraciones, SMTP y creación inicial del administrador.

## Seguridad y valores predeterminados

- Contraseñas de 15 a 128 caracteres, permitiendo espacios, pegado y gestores de contraseñas.
- Sesiones con duración máxima de 8 horas. Revocarlas al cambiar contraseña, restablecer acceso, desactivar la cuenta o modificar permisos.
- Enlaces de recuperación válidos durante 30 minutos; enlaces de alta administrativa durante 24 horas. Su consumo no activa cuentas pendientes ni desactivadas.
- Limitar intentos de login, registro y recuperación mediante contadores compartidos en PostgreSQL; responder de forma genérica para evitar revelar cuentas existentes.
- Validar entradas y origen de las mutaciones; ejecutar cambios de permisos y consumo de tokens de forma transaccional.
- Crear el primer administrador mediante un comando local explícito con entrada segura de contraseña, sin credenciales predeterminadas.
- Las cuentas existentes sin contraseña deberán establecerla mediante recuperación o intervención administrativa; el autorregistro nunca sobrescribirá esas cuentas.
- Conservar los bloqueos operativos de solo lectura y de ejecución sobre Softland. El acceso simulado quedará restringido al entorno local de demostración.
- SMTP y la URL pública se configurarán al desplegar. No se incluyen SSO ni MFA en esta entrega.

## Pruebas y aceptación

- Registro → aprobación → asignación de compañías → login → operación autorizada → logout.
- Alta administrativa y recuperación por ambas vías, incluidos enlaces expirados, reutilizados y fallos SMTP.
- Persistencia y vencimiento de sesiones; revocación inmediata tras baja, cambio de contraseña o permisos.
- Rechazo de acceso directo a APIs y acciones sin sesión, con identidad manipulada o fuera de compañía.
- Bloqueo de autoaprobación incluso después de cambiar el rol del solicitante.
- Protección del último administrador, correos duplicados y asignaciones concurrentes.
- Migración desde una copia de SQL Server (`USUARIO`/`USUARIO_AMBITO`) hacia las entidades de PostgreSQL, con usuarios e historial existentes.
- Pruebas automatizadas de autorización y recuperación, recorridos de navegador, `typecheck` y compilación de producción. Verificar la integración sin ejecutar cambios productivos de precios.

