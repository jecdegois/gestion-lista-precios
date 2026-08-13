# Estándares de Desarrollo en AWS: SAM, CloudFormation y React

**Infraestructura como Código, Serverless, Design Systems, Amplify vs ECS, y Seguridad para Aplicaciones Internas y Externas**

*Beconsult INTELIX — Julio, 2026*

---

## 1. Visión General y Objetivo

El objetivo principal de este estándar es garantizar que **cualquier servicio nuevo se construya de forma reproducible, segura y barata de operar**. 

> **Regla de Oro:**  
> Si un recurso o configuración no está en el template SAM (o en un parámetro/secreto referenciado), **no está listo para desplegar**.

---

## 2. Metodología AI/DLC (AI-assisted Development Life Cycle)

**AI/DLC** es un ciclo de entrega asistido por Inteligencia Artificial diseñado para pasar del problema de negocio a un diseño implementable de forma rápida, trazable y alineada con los estándares técnicos de la organización.

### 2.1. Definición Operativa

| Aspecto | Descripción |
| :--- | :--- |
| **Para qué** | Acortar la fase de *discovery* y diseño sin saltarse la claridad de alcance, riesgos ni criterios de aceptación. |
| **Con qué** | IA + reglas del repositorio (SAM, React, Seguridad) + **validación humana en cada puerta de calidad**. |
| **Resultado** | Backlog priorizado, historias listas y diseño preparado para IaC y código (no diapositivas ambiguas). |

### 2.2. Prácticas Correctas vs. Incorrectas

* **Correcto:**
  * La IA propone; el equipo técnico valida alcance, datos sensibles y restricciones de AWS.
  * Cada fase deja un artefacto versionado (documento, backlog, ADR, boceto).
  * El diseño ya contempla entornos, autenticación, serverless y design system existente.
* **Incorrecto:**
  * Pedir a la IA *"haz el sistema"* y saltarse el *discovery*.
  * Historias sin criterios de aceptación ni Definición de Hecho (*Definition of Done*).
  * Diseñar UI/infraestructura sin revisar el *design system* o el estándar SAM.

### 2.3. Flujo Fase por Fase: De Requisitos al Diseño

```
1. Levantamiento ──► 2. Discovery ──► 3. Historias ──► 4. Planificación ──► 5. Diseño
```

1. **Levantamiento:** Problema, actores, dolores, KPIs y restricciones (cumplimiento, datos sensibles, plazos).  
   *Entregable:* Brief de problema.
2. **Discovery:** Mapear flujos *as-is/to-be*, sistemas, APIs, riesgos.  
   *Entregable:* Mapa de contexto + preguntas abiertas/cerradas.
3. **Historias:** Formato *"Como / quiero / para"* + criterios de aceptación evaluables.  
   *Entregable:* Backlog priorizado (MoSCoW o Valor/Esfuerzo).
4. **Planificación:** Slices verticales, dependencias, entornos, *spikes* técnicos.  
   *Entregable:* Plan de release / sprint goals.
5. **Diseño:** UX con Design System existente + arquitectura (Lambda/ECS, Amplify, auth).  
   *Entregable:* Wireflows + ADR + esqueleto SAM.

*Ejemplo de flujo:*  
Para un "Portal de pedidos", el *discovery* detecta una API existente $ightarrow$ historias CRUD + cola asíncrona $ightarrow$ plan: MVP sincrónico en QA $ightarrow$ diseño: React + shadcn + API Gateway $ightarrow$ Lambda + SQS según estándar.

### 2.4. Prompts y Trabajo con IA (Ejemplos)

* **Requisitos:** *"Lista actores, casos de uso y fuera de alcance a partir de esta entrevista..."*
* **Discovery:** *"Genera preguntas para validar integraciones, volúmenes y auth interna vs pública."*
* **Historias:** *"Convierte estos casos en user stories con estructura Given/When/Then."*
* **Plan:** *"Propón MVP de 2 sprints y dependencias técnicas (SAM, Cognito, DS)."*
* **Diseño:** *"Propón pantallas con componentes del DS y contrato API; justifica Lambda vs ECS."*

### 2.5. Puertas de Calidad (Humanas)

Antes de iniciar la codificación o despliegue, el equipo debe responder afirmativamente a:
- [ ] ¿El problema de negocio quedó medible?
- [ ] ¿Hay criterios de aceptación sin ambigüedad?
- [ ] ¿Se reutiliza el *design system* y las APIs existentes?
- [ ] ¿El diseño respeta IaC, entornos y seguridad del estándar?
- [ ] ¿Quedó claro qué va a `dev` / `qa` / `prod` y cómo se prueba?

> **Regla:** No se escribe código de *feature* ni se despliega infraestructura hasta cerrar el *discovery* + historias + diseño mínimo aprobado.

---

## 3. Infraestructura como Código (IaC) y Gestión de Ambientes

### 3.1. El Problema a Evitar

Sin un estándar formal, los equipos modifican la infraestructura directamente en la consola de AWS ("artesanal"). Esto impide repetir, auditar o promocionar cambios con confianza.

```
       CONSOLA ARTESANAL                 HARDCODE                      ROLES AMPLIOS                    SIN MEDIR
┌─────────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ Colas, Lambdas y permisos   │ │ IDs, ARNs, subnet-xxx y │ │ "AdministratorAccess    │ │ Timeout 900s y          │
│ creados a mano. Se ignora   │ │ URLs de prod pegados    │ │ para que compile".      │ │ 128 MB por defecto.     │
│ qué versión está en prod.   │ │ en código o YAML.       │ │ Fuga compromete cuenta. │ │ Costos o fallos ciegos. │
└─────────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

**Consecuencias:** Drift (diferencia entre lo documentado y lo real), incidentes difíciles de reproducir, costo impredecible, *onboarding* lento y liberaciones complejas.

### 3.2. Comparativa: Prácticas Correctas vs. Incorrectas en IaC

| Dominio | Práctica Incorrecta | Práctica Correcta |
| :--- | :--- | :--- |
| **Templates** | Crear recursos en consola "para la demo" y luego tratar de pasarlos a código. Tener `template-dev.yaml`, `template-qa.yaml` y `template-prod.yaml` divergentes. | Declarar Queue + Function en un solo `template.yaml` y desplegar con SAM. Usar la misma plantilla con secciones `[dev]`, `[qa]`, `[prod]` en `samconfig.toml`. |
| **Parámetros** | Hardcode de `TABLE="prod-orders"` o `subnet-0abc123` en el *handler*. Guardar passwords/API keys en variables o en `samconfig` versionado. | Usar `!Ref OrdersTable` y parámetros SSM para subnets. Guardar secretos con `SECRET_NAME=/qa/app/db` y obtenerlos en runtime mediante `GetSecretValue` con caché. |
| **Nombres** | `MyFunction`, `lambda1`, `OrdersFnProd`, `test-queue-final-v2`. | Logical ID: `OrdersProcessorFunction`. Físico: `${AWS::StackName}-orders-processor`. |
| **IAM** | `Action: "*"` / `Resource: "*"` o roles administradores compartidos. | Solo acciones estrictamente necesarias sobre la cola/tabla/secreto del stack. |
| **Configuración Lambda** | Timeout 900s y Memoria 128 MB por defecto sin medir. | Timeout y memoria medidos en QA (ej. 30s / 512 MB) apoyados en métricas de *Duration* y *Cost*. |
| **Resiliencia SQS** | Cola sin DLQ; `VisibilityTimeout` igual al `Timeout` de la Lambda; fallo completo del batch. | DLQ + `maxReceiveCount` $\ge 5$; `VisibilityTimeout` $\ge 6 	imes 	ext{Timeout}$; `ReportBatchItemFailures`. |

### 3.3. Principio Rector: Todo Vive en Código

* **SAM sobre CloudFormation:** Abstrae `Function`, `Api`, `Queue` y eventos. Se traduce directamente a CloudFormation (mismo *changeset*, *rollback* y estado conocido).
* **Una plantilla, N ambientes:** `Parameters` + `samconfig.toml`. Lo que cambia entre entornos es el valor del parámetro, nunca la estructura del YAML.
* **Serverless First:** Lambda por defecto. ECS/Fargate se utiliza únicamente bajo justificación de duración, runtime o costo.
* **CloudFormation como contrato:** El stack es la fuente de verdad operativa. Prohibido crear a mano recursos que pertenezcan al stack. Si hay un fallo durante el despliegue, el sistema realiza *rollback* automático.

### 3.4. Ambientes Obligatorios: DEV, QA y PROD

Se requieren tres stacks totalmente independientes generados desde la misma plantilla:

1. **DEV:** Experimentos e iteración rápida. Logs con retención corta (7 días). Datos no productivos.
2. **QA:** Validación de integración, regresiones y prueba del *changeset* exacto que irá a PROD. Pruebas de carga para tuning de memoria y timeout. Misma topología que producción.
3. **PROD:** Cambios estrictamente controlados y revisados. Logs con retención de 30 días. Alarmas activas en errores y DLQ. Solo recibe cambios validados previamente en QA.

> **Regla de Nombres de Stack:**  
> `dev-orders-api` \| `qa-orders-api` \| `prod-orders-api`.  
> Parámetros en SSM: `/dev/app/...`, `/qa/app/...`, `/prod/app/...`.

### 3.5. Parametrización vs. Duplicación

Si un valor cambia entre entornos, debe ser un **Parameter**, una **Condition** o un valor en **Parameter Store**, nunca una plantilla YAML separada.

* **Qué parametrizar siempre:**
  * `Environment` (`dev` | `qa` | `prod`)
  * VPC: Security Group IDs y Subnet IDs (vía SSM)
  * Nombres/rutas de secretos y parámetros
  * IDs de API Gateway existentes, Layer ARNs, Endpoints
  * Banderas de característica (*feature flags*) y retención de logs (mediante `Condition`)
* **Convención de variables de entorno:**  
  Usar `UPPER_SNAKE_CASE`.  
  *Correcto:* `QUEUE_URL`, `TABLE_NAME`, `SECRET_NAME`.  
  *Incorrecto:* `DB_PASSWORD`, IDs o ARNs de prod escritos a mano.

---

## 4. Ejemplos de Código IaC (SAM y Configuración)

### 4.1. `template.yaml` (Parameters, Conditions y Log Groups)

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: ORDERS PROCESSOR | Servicio de procesamiento asíncrono de pedidos

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, qa, prod]
    Description: Ambiente de despliegue
  SubnetIds:
    Type: AWS::SSM::Parameter::Value<String>
    Description: SSM Parameter Path para Subnets
  SecurityGroupId:
    Type: AWS::SSM::Parameter::Value<String>
    Description: SSM Parameter Path para Security Group
  DbSecretName:
    Type: String
    Description: Nombre o path del secreto en Secrets Manager (nunca la password)

Conditions:
  IsProduction: !Equals [!Ref Environment, prod]

Resources:
  OrdersProcessorLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${AWS::StackName}-orders-processor
      RetentionInDays: !If [IsProduction, 30, 7]
```

### 4.2. `samconfig.toml` (Parámetros por Ambiente)

```toml
[dev.deploy.parameters]
stack_name = "dev-orders-api"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "Environment=dev",
  "SubnetIds=/dev/app/network/subnets",
  "SecurityGroupId=/dev/app/network/lambda-sg",
  "DbSecretName=/dev/app/db"
]
tags = [
  "Project=ORDERS",
  "Environment=DEV",
  "Name=dev-orders-api"
]

[qa.deploy.parameters]
stack_name = "qa-orders-api"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
parameter_overrides = [
  "Environment=qa",
  "SubnetIds=/qa/app/network/subnets",
  "SecurityGroupId=/qa/app/network/lambda-sg",
  "DbSecretName=/qa/app/db"
]
tags = [
  "Project=ORDERS",
  "Environment=QA",
  "Name=qa-orders-api"
]

# Prod utiliza los mismos keys en parameter_overrides apuntando a /prod/...
```

*Comando de despliegue:*
```bash
sam build
sam deploy --config-env qa
```

### 4.3. Naming y Variables de Entorno en SAM

```yaml
  OrdersProcessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${AWS::StackName}-orders-processor
      Description: ORDERS PROCESSOR | Consume eventos SQS de pedidos
      Runtime: python3.13
      Handler: app.handler
      Environment:
        Variables:
          ENVIRONMENT: !Ref Environment
          ORDERS_TABLE: !Ref OrdersTable
          QUEUE_URL: !Ref OrdersProcessorQueue
          SECRET_NAME: !Ref DbSecretName
          FEATURE_FLAG_X: "true"
```

---

## 5. Estrategia Serverless: Lambda vs. ECS

La arquitectura por defecto es **Lambda**. Se evalúa ECS únicamente cuando las limitaciones técnicas o económicas de Lambda no permiten cumplir con los requerimientos.

```
                            ┌────────────────────────┐
                            │ ¿El servicio es un...  │
                            └───────────┬────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
  Proceso < 15 min, API HTTP,                               Proceso > 15 min,
  Carga por eventos o burst,                                Carga constante 24/7,
  Equipo con enfoque Serverless                             GPU, Sockets o Monolito
           │                                                         │
           ▼                                                         ▼
┌─────────────────────┐                                   ┌─────────────────────┐
│     USAR LAMBDA     │                                   │    USAR ECS/FARGATE  │
└─────────────────────┘                                   └─────────────────────┘
```

### 5.1. Cuándo usar AWS Lambda

* APIs HTTP con respuesta en milisegundos o pocos segundos (exposición vía API Gateway).
* Arquitecturas orientadas a eventos: SQS, S3, EventBridge, DynamoDB Streams.
* Trabajos de corta duración y cargas de tráfico irregulares o en ráfagas.
* Integraciones que se benefician de reintentos y colas DLQ nativas.
* *Ejemplo:* API REST de procesamiento de pedidos + Worker SQS (ejecución de 20-40s). Costo operativo casi nulo fuera de picos.

### 5.2. Cuándo usar AWS ECS / Fargate

* Procesos batch continuos con ejecución $> 15$ minutos, streaming o conexiones persistentes (WebSockets prolongados).
* Contenedores con dependencias pesadas de runtime, uso de GPU o binarios no soportados en Lambda.
* Carga de trabajo totalmente estable $24/7$ donde el modelo de cobro mensual de Fargate resulte inferior al de Lambda.
* Monolitos containerizados existentes o workers de larga duración.
* *Ejemplo:* Proceso ETL nocturno de 2 horas con librerías C++ nativas. Se debe documentar la duración, memoria y análisis comparativo de costo antes de elegir ECS.

> **Regla de Decisión:**  
> Ante la duda, comenzar siempre en Lambda. La migración hacia ECS debe respaldarse con métricas reales (timeout, consumo de memoria y costos en USD/mes), nunca por preferencia de plataforma.

---

## 6. Patrón Asíncrono con SQS: Los 4 Controles de Resiliencia

Cuando se procesan eventos de SQS con AWS Lambda, es obligatorio implementar **4 controles de resiliencia** para evitar pérdida de datos, loops infinitos o duplicaciones indeseadas.

```
[ Cliente ] ──► [ API Gateway ] ──► (202 Accepted)
                                         │
                                         ▼
                                  [ SQS Queue ] ──(Visibility Timeout >= 6x)──► [ Lambda Worker ]
                                         │                                            │
                             (maxReceiveCount >= 5)                               (ReportBatchItemFailures)
                                         │                                            │
                                         ▼                                            ▼
                                   [ SQS DLQ ] ──► [ Alarma CloudWatch ]       [ Tabla Idempotencia ]
```

### Control 1: Dead Letter Queue (DLQ) Obligatoria
* **Qué es:** Una cola secundaria asignada en la política `RedrivePolicy`. Al superar `maxReceiveCount`, SQS transfiere el mensaje a la DLQ.
* **Por qué:** Evita que mensajes con errores insalvables ("mensajes venenosos") reintenten infinitamente.
* **Regla:** Nombre con sufijo `-dlq`. Retención de mensajes $\ge 14$ días. Debe contar con una alarma de CloudWatch que alerte cuando la cantidad de mensajes sea $> 0$.

### Control 2: `maxReceiveCount ≥ 5`
* **Qué es:** Número de entregas e intentos fallidos permitidos antes de enviar el mensaje a la DLQ.
* **Por qué:** Un valor muy bajo (1-2) transfiere mensajes válidos a la DLQ ante fallos de red temporales, arranques en frío (*cold starts*) o pequeños cortes de base de datos.
* **Regla:** `maxReceiveCount` debe ser mínimo 5.

### Control 3: `Visibility Timeout ≥ 6 × Lambda Timeout`
* **Qué es:** El tiempo en que SQS oculta un mensaje entregado a un worker para que ningún otro consumidor lo procese en paralelo.
* **Por qué:** Si la Lambda no ha terminado y el `Visibility Timeout` expira, SQS entrega el mismo mensaje a otra instancia, duplicando el procesamiento.
* **Regla:** Si la Lambda tiene un `Timeout` de 30s, el `Visibility Timeout` de la cola SQS debe ser mínimo de 180s ($30 	imes 6$).

### Control 4: Idempotencia y `ReportBatchItemFailures`
* **Idempotencia (DynamoDB + TTL):** SQS *Standard* garantiza entrega *"al menos una vez"* (*at-least-once*). Se debe validar en una tabla DynamoDB utilizando el `messageId` como Partition Key y expiración automática mediante TTL (ej. 24h).
* **`ReportBatchItemFailures`:** En el evento de integración SQS en SAM, se debe habilitar `FunctionResponseTypes: [ReportBatchItemFailures]`. Si un batch de 10 mensajes falla en 2, la Lambda retorna solo los IDs de los 2 fallidos, reintentando únicamente esos y evitando reprocesar los 8 exitosos.

---

## 7. Implementación SAM y Código para Patrones SQS + Lambda

### 7.1. Definición SAM de Cola SQS + DLQ + Controles

```yaml
Resources:
  OrdersProcessorQueueDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub ${AWS::StackName}-orders-processor-dlq
      MessageRetentionPeriod: 1209600 # 14 días

  OrdersProcessorQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub ${AWS::StackName}-orders-processor
      VisibilityTimeout: 180 # 6x Timeout de la Lambda (30s * 6)
      ReceiveMessageWaitTimeSeconds: 20 # Long polling
      MessageRetentionPeriod: 1209600
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt OrdersProcessorQueueDLQ.Arn
        maxReceiveCount: 5

  OrdersProcessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${AWS::StackName}-orders-processor
      Runtime: python3.13
      Handler: app.handler
      Timeout: 30
      MemorySize: 512
      Events:
        SqsOrdersEvent:
          Type: SQS
          Properties:
            Queue: !GetAtt OrdersProcessorQueue.Arn
            BatchSize: 10
            FunctionResponseTypes:
              - ReportBatchItemFailures
```

### 7.2. Handler de Python con Idempotencia y Manejo de Errores de Batch

```python
import os
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('IDEMPOTENCY_TABLE_NAME')
idempotency_table = dynamodb.Table(table_name) if table_name else None

def is_already_processed(message_id: str) -> bool:
    if not idempotency_table:
        return False
    try:
        response = idempotency_table.get_item(Key={'messageId': message_id})
        return 'Item' in response
    except ClientError as e:
        logger.error(f"Error consultando idempotencia: {e}")
        return False

def mark_as_processed(message_id: str, ttl_seconds: int = 86400):
    if not idempotency_table:
        return
    import time
    expires_at = int(time.time()) + ttl_seconds
    try:
        idempotency_table.put_item(
            Item={
                'messageId': message_id,
                'expiresAt': expires_at
            },
            ConditionExpression='attribute_not_exists(messageId)'
        )
    except ClientError as e:
        logger.warning(f"Mensaje {message_id} ya estaba registrado: {e}")

def process_record(record):
    # Lógica de negocio del dominio
    payload = record['body']
    logger.info(f"Procesando mensaje: {record['messageId']}")

def handler(event, context):
    batch_item_failures = []
    
    for record in event.get('Records', []):
        message_id = record['messageId']
        
        if is_already_processed(message_id):
            logger.info(f"Mensaje {message_id} omitido por idempotencia.")
            continue
            
        try:
            mark_as_processed(message_id)
            process_record(record)
        except Exception as exc:
            logger.error(f"Fallo al procesar mensaje {message_id}: {exc}", exc_info=True)
            # Retornar el ID que falló para que SQS solo reintente este mensaje
            batch_item_failures.append({"itemIdentifier": message_id})
            
    return {"batchItemFailures": batch_item_failures}
```

### 7.3. Resumen de la Checklist Async

- [ ] **DLQ:** Recurso separado con nombre `-dlq` asignado en `RedrivePolicy`.
- [ ] **maxReceiveCount $\ge$ 5:** Margen para tolerar fallos intermitentes antes de aislar.
- [ ] **Visibility Timeout $\ge$ 6x Timeout:** Evita ejecuciones duplicadas simultáneas.
- [ ] **ReportBatchItemFailures:** Configurado en la plantilla y en el retorno del handler.
- [ ] **Idempotencia:** Control de deduplicación con DynamoDB + TTL.
- [ ] **Alarma:** CloudWatch Metric Alarm cuando la profundidad de mensajes en la DLQ es $> 0$.

---

## 8. Optimización, Roles IAM y Observabilidad

### 8.1. Permisos e IAM: Mínimo Privilegio

* **Acciones y Recursos Concretos:** Especificar ARNs exactos de las colas, tablas o secretos del stack. Prohibido el uso de comodines (`" Resource: "*"`).
* **Consolidación de Roles:** Las cuentas de AWS poseen una cuota máxima de roles IAM. Si dos o más funciones Lambda ejecutan el mismo patrón de acceso, se debe utilizar un rol único compartido en lugar de crear un rol individual por función.
* **Políticas SAM Tipadas:** Usar las macros de SAM siempre que sea posible:

```yaml
Policies:
  - SQSPollerPolicy:
      QueueName: !GetAtt OrdersProcessorQueue.QueueName
  - DynamoDBCrudPolicy:
      TableName: !Ref OrdersTable
  - Statement:
      Effect: Allow
      Action:
        - secretsmanager:GetSecretValue
      Resource: !Sub arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${DbSecretName}*
```

### 8.2. Tuning y Performance de Lambdas

* **MemorySize vs. CPU:** AWS asigna potencia de CPU proporcional a la memoria asignada. Configurar 512 MB o 1024 MB suele reducir la duración y ser **más económico** que ejecutar con 128 MB de forma lenta.
* **Timeout Ajustado:** Establecer el tiempo según el p95 observado en QA. Nunca dejar 900s "por si acaso".
* **Reuso de Conexiones (Warm Start):** Cargar clientes de SDK (boto3), configuraciones y secretos en variables globales fuera del handler.

```python
import boto3

# Inicialización fuera del handler (global / warm start)
_cached_secret = None

def get_secret(secret_name):
    global _cached_secret
    if _cached_secret is None:
        client = boto3.client('secretsmanager')
        res = client.get_secret_value(SecretId=secret_name)
        _cached_secret = res['SecretString']
    return _cached_secret
```

* **Runtime:** Python 3.13 (o Node.js 22.x LTS). Se deben especificar las arquitecturas explícitamente (`Architectures: [x86_64]` o `arm64`).

### 8.3. Configuración, Secretos y Logs

| Herramienta | Caso de Uso Principal | Buenas Prácticas |
| :--- | :--- | :--- |
| **AWS Secrets Manager** | Passwords, tokens de terceros, certificados. | Pasar solo el nombre/ARN a la Lambda. Implementar caché en runtime. Permitir rotación sin *redeploy* del código. |
| **AWS Parameter Store (SSM)** | Subnets, Security Groups, Endpoints, Feature Flags. | Resolver en tiempo de despliegue (`AWS::SSM::Parameter::Value<String>`) o en runtime para parámetros dinámicos. |
| **CloudWatch Logs** | Observabilidad de ejecuciones. | Log Format: JSON. Retención: `dev`/`qa` 7 días, `prod` 30 días. Log Group declarado explícitamente en la plantilla. |

---

## 9. Estándar Frontend: React

El framework oficial para el desarrollo de aplicaciones web es **React**. Queda restringida la introducción de otros frameworks (Vue, Angular, Svelte) salvo aprobación explícita de Arquitectura.

### 9.1. Sistema de Diseño (Jerarquía de Reuso)

Antes de programar un componente desde cero, se debe respetar el siguiente orden estricto de decisión:

```
1. Design System del Producto ──► 2. Kits Aprobados ──► 3. Extender Componente ──► 4. Crear Nuevo Componente
   (Tokens, Button, Table, Sheet)    (shadcn / NextUI)       (Wrappers en shared/)     (Proponer al DS)
```

* **Correcto:** Reutilizar componentes base (`Button`, `Input`, `Sheet`), usar tokens tipográficos (`text-body`, `text-caption`) y utilidades definidas en `@/components/ui` o `shared`.
* **Incorrecto:** Instalar librerías adicionales como MUI o Ant Design "solo para una pantalla", o agregar estilos CSS ad-hoc que rompan la línea gráfica general.

### 9.2. Arquitectura de Pantallas React

El código debe organizarse en capas con responsabilidades delimitadas:

```
[ Page Component ] ──► [ Custom Controller Hook ] ──► [ Service API Module ] ──► [ Axios Custom Instance ]
```

* **Estructura de Módulos:** `src/views/<modulo>/` conteniendo `api/`, `routes/`, `pages/`, `hooks/`, `components/`.
* **Naming:** Usar `kebab-case` en archivos, sufijos `*Page` en componentes de página, `use*Controller` para hooks de estado y `*Api` para módulos de conexión.
* **Límites de Extensión:**
  * Componentes atómicos: máximo 120 líneas.
  * Secciones/formularios: máximo 200 líneas.
  * Páginas (*Pages*): máximo 250 líneas.
* **Manejo de Peticiones:** Usar una instancia centralizada de Axios (`axiosApiGateway`) que gestione tokens, interceptores y cancelación mediante `AbortController`. Evitar invocaciones directas a `fetch` o `axios` en componentes visuales.

---

## 10. Despliegue Frontend: AWS Amplify vs. ECS Fargate

| Criterio | AWS Amplify (o S3 + CloudFront) | AWS ECS / Fargate |
| :--- | :--- | :--- |
| **Tipo de App** | Single Page Application (SPA) o Sitio Estático (Vite/CRA $ightarrow$ HTML/JS/CSS). | Server-Side Rendering (SSR) o BFF (Next.js server, Node.js backend). |
| **Infraestructura** | Hosting totalmente administrado con CDN, HTTPS y CI/CD integrado por rama. | Contenedores Docker sobre VPC privada, ALB y controles estrictos de Security Groups. |
| **Control de Red** | Distribución global pública mediante CDN. | Red privada sin salida pública o con inspección de tráfico por firewall interno. |
| **Costo Operativo** | Muy bajo / Pago por transferencia y almacenamiento. | Pago por hora vCPU/RAM por tarea activa. |

```
                       ┌───────────────────────────────┐
                       │   ¿Qué tipo de Frontend es?   │
                       └───────────────┬───────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
     SPA Pure / Estático                                 SSR / BFF / VPC Privada
  (Vite + React + S3/CDN)                                (Next.js / Node Server)
            │                                                     │
            ▼                                                     ▼
┌───────────────────────┐                             ┌───────────────────────┐
│  AWS AMPLIFY / S3+CF  │                             │    AWS ECS FARGATE    │
└───────────────────────┘                             └───────────────────────┘
```

> **Antipatrón Frecuente:**  
> Montar una SPA estática dentro de un contenedor en ECS simplemente porque el backend está en ECS. Esto incrementa innecesariamente los costos operacionales.

---

## 11. Seguridad: Aplicaciones Internas vs. Aplicaciones Externas

Las reglas de arquitectura varían dependiendo del alcance de la aplicación:

### 11.1. Aplicaciones Internas
* **Audiencia:** Empleados y colaboradores conectados a la red corporativa o VPN.
* **Autenticación:** SSO / IdP Corporativo / Cognito con sesiones de corta duración.
* **Exposición de API:** API Gateway privada o endpoint protegido por un *Custom Authorizer*. Prohibido usar `AuthorizationType: NONE`.
* **Red:** Despliegues en redes privadas o restringidas mediante rangos IP (*allowlist*).

### 11.2. Aplicaciones Externas (Públicas)
* **Audiencia:** Clientes o usuarios generales en Internet.
* **Autenticación:** AWS Cognito Hosted UI / OAuth 2.0 con Multi-Factor Authentication (MFA) obligatorio.
* **Protección Perimetral:** AWS WAF activo sobre CloudFront o API Gateway, con reglas de *Rate Limiting* y headers de seguridad (CSP, HSTS, X-Frame-Options).
* **Controles:** CORS estricto (especificando dominios permitidos, jamás `*`). Limpieza inmediata de tokens localstorage/sessionstorage ante un estado HTTP 401.

```
       APLICACIÓN INTERNA                                APLICACIÓN EXTERNA
 ┌──────────────────────────┐                      ┌──────────────────────────┐
 │ • Red Corporativa / VPN  │                      │ • Tráfico Público        │
 │ • SSO / IdP / Cognito    │                      │ • AWS WAF + CloudFront   │
 │ • API GW Privada         │                      │ • Cognito + MFA          │
 │ • IP Allowlist           │                      │ • CORS Estricto          │
 └──────────────────────────┘                      └──────────────────────────┘
```

---

## 12. Estándar de Código Python (Backend)

En el desarrollo de backend con AWS Lambda y Python 3.13, la arquitectura debe basarse en el patrón **Hexagonal (Ports & Adapters)**, aplicando los principios **SOLID** y **DRY**.

```
┌─────────────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE LAYER (Adapters: DynamoDB, SQS, Secrets, HTTP)  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ APPLICATION LAYER (Use Cases, Ports / Interfaces)       │   │
│   │   ┌─────────────────────────────────────────────────┐   │   │
│   │   │ DOMAIN LAYER (Business Rules, Entities)         │   │   │
│   │   └─────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 12.1. Capas del Patrón Hexagonal

1. **Domain:** Entidades y reglas de negocio puras. No tiene dependencias con librerías externas ni de AWS (`boto3`).
2. **Application:** Casos de uso y definición de interfaces (*ports*).
3. **Infrastructure:** Implementación concreta de los adaptadores (*adapters*) para comunicación con DynamoDB, SQS, APIs de terceros, etc.
4. **Handler:** Punto de entrada de la función AWS Lambda. Su única responsabilidad es parsear el evento entrante de AWS, invocar el caso de uso y retornar la respuesta formateada.

### 12.2. Pruebas Unitarias mediante *Fakes*

Dado que los casos de uso dependen de interfaces (*ports*) y no de clientes concretos de AWS, las pruebas unitarias se ejecutan inyectando simuladores en memoria (*Fakes*).

* **Pruebas Unitarias:** Evalúan las reglas del dominio de forma rápida y determinista sin requerir red ni credenciales de AWS.
* **Pruebas de Integración:** Pruebas reducidas encargadas de validar los adaptadores reales con `boto3`.

---

## 13. Checklist General para Salida a Producción

Antes de autorizar el despliegue a `prod`, el equipo debe verificar el cumplimiento de los siguientes puntos:

- [ ] **Plantilla IaC:** Existe una única plantilla `template.yaml` gestionada por SAM/CloudFormation.
- [ ] **Configuración por Ambiente:** Los valores específicos de `prod` se encuentran definidos en `samconfig.toml` o Parameter Store, sin *hardcode*.
- [ ] **Seguridad IAM:** Los roles asignados cumplen con el principio de mínimo privilegio y especifican ARNs concretos.
- [ ] **Gestión de Secretos:** No existen passwords, llaves ni datos sensibles en Git, variables de entorno ni en los *bundles* de JavaScript.
- [ ] **Patrón SQS Async:** Si aplica, se implementaron los 4 controles (`DLQ`, `maxReceiveCount ≥ 5`, `VisibilityTimeout ≥ 6x Timeout`, `ReportBatchItemFailures` e idempotencia).
- [ ] **Observabilidad:** Retención de logs en CloudWatch configurada en 30 días para producción y alarmas vinculadas a la DLQ.
- [ ] **Frontend:** La aplicación React utiliza el *Design System* o kit aprobado, con la estrategia de despliegue (Amplify o ECS) respaldada técnicamente.
- [ ] **Backend Python:** Estructura modular alineada a arquitectura hexagonal con pruebas unitarias ejecutables mediante fakes.

---

## 14. Mensajes Clave para Llevarse

1. **AI/DLC Primero:** La inteligencia artificial acelera la fase de descubrimiento y diseño, pero cada etapa debe ser validada en puertas de calidad por el equipo técnico.
2. **Código Primero (IaC):** La infraestructura expresada en SAM/CloudFormation constituye la única fuente de verdad. Modificar recursos desde la consola de AWS está estrictamente prohibido.
3. **Serverless + React:** La estrategia predeterminada combina AWS Lambda y React con el *Design System* oficial. El uso de ECS o librerías externas requiere una justificación basada en métricas.
4. **Seguridad Adaptativa:** Definir desde el primer día el alcance del aplicativo (interno vs. público) para aplicar controles proporcionales en autenticación, red y protección perimetral.
