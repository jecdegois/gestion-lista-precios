-------------------- Modelo Actual de Gestión de Precio en SFL -------------------
La actualización del factor de la lista de precios y su posterior réplica a las aplicaciones de venta (AFV) involucra una serie de objetos que van desde tablas de gestión y procedimientos almacenados en Softland hasta tablas de auditoría para la integración.
Los objetos implicados se dividen en tres capas principales:

1. Capa de Gestión y Parámetros (Softland)
Esta capa define las reglas del cálculo (aumentos o disminuciones) y los factores que se aplicarán.
Tabla dbo.GESTION_LISTAS_PRECIOS: Es el objeto central donde se almacenan los parámetros por cada empresa y lista de precios, incluyendo el FACTOR_MULTIPLICADOR y la VARIACION_PORC.

Tablas Maestras de Validación: Para que el proceso funcione, los datos deben coincidir con lo registrado en las tablas estándar de Softland:
NIVEL_PRECIO: Define las listas existentes.
VERSION_NIVEL: Controla las versiones activas y sus fechas de vigencia.
ARTICULO_PRECIO: Donde finalmente se guardan los precios calculados.

2. Capa de Ejecución y Lógica (SQL Jobs y SPs)
Estos objetos son los encargados de procesar la información y realizar los cálculos matemáticos.
Job Actualiza Lista Precios(Todas): Tarea programada que se ejecuta diariamente (habitualmente a las 10:00 pm) para iniciar el proceso.
Stored Procedure Maestro ([dbo].[SP_GESTION_LISTAS_PRECIOS_TABLA]): Es llamado por el Job para recorrer la tabla de gestión y recopilar los parámetros de cada lista.

Stored Procedures de Cálculo por Empresa: Dependiendo del tipo de ejecución definido en la tabla de gestión, se disparan estos objetos:
[EMPRESA].SP_GESTION_LISTAS_PRECIOS_FULL: Actualiza la totalidad de los artículos de una lista.
[EMPRESA].SP_GESTION_LISTAS_PRECIOS_PARCIAL: Actualiza solo los artículos modificados recientemente en la lista base según el parámetro HORAS_ATRAS.

3. Capa de Réplica e Integración (Softland a AFV)
Una vez que el precio ha sido actualizado en Softland, debe replicarse hacia la aplicación de ventas externa mediante microservicios.
Tabla PRODUSOFT.${CASA}.PS_AFV_JSON: Funciona como una tabla de auditoría donde se guardan los objetos JSON que contienen los nuevos precios y factores antes de ser enviados a través de las APIs de AWS.

Entidades de Réplica en JSON: Los objetos específicos que se sincronizan incluyen:
ARTICULO_PRECIO: Contiene el nuevo precio calculado para cada artículo.
GRUPO_CLIENTE_PRECIO: Utilizado para la réplica de listas de precios alternativas, donde se incluyen explícitamente los campos FACTOR y PORCENTAJE.
APIs de AWS: Microservicios que consumen los datos de la tabla de auditoría para actualizar la base de datos de AFV.