# Insumo de Infraestructura y Arquitectura AWS (IA-DLC - Kiro)

> **Proyecto:** IV26004 - Aplicación para la Inspección de Inmuebles (AppInspecciones)  
> **Ubicación Diagrama de Arquitectura:** `/Users/innovart/Projects/intelix/appinspecciones/Product-Definition/02-arquitectura/arquitectura-aws-mvp.drawio`  
> **Metodología:** IA-DLC (AI-Driven Lifecycle) con **Kiro**  
> **Estado:** Documento de Insumo / Guía de Infraestructura Simplificada y Consolidada  

---

## 1. Contexto y Directrices de Simplificación IA-DLC

En concordancia con la metodología **IA-DLC** y las observaciones del equipo de arquitectura, se aplican los siguientes criterios para la estimación y aprovisionamiento de infraestructura Serverless en AWS:

1. **Agrupación por Módulo/Servicio:** Dado que los entornos Serverless varían dinámicamente según la carga, no se requiere un desglose atómico por sub-recurso. Se consolidan métricas y costos por bloques lógicos de servicios (Ej: Amplify, S3, RDS, Serverless Backend).
2. **Estándar del Lenguaje en Backend:** Se establece **Python** como lenguaje estándar para las funciones AWS Lambda (reemplazando especificaciones previas en Node.js).
3. **Criterios de Base de Datos:** `db.t4g.micro` se define estrictamente para entornos MVP / Cargas Bajas o Medias. En caso de escalar a cargas moderadas-altas, se debe promocionar a una instancia de mayor capacidad (ej. `db.t4g.small` o superior).
4. **Optimización Bedrock (AI):** Para el procesamiento de lenguaje técnico y de nicho en inspecciones de inmuebles, se descarta el uso de Amazon Titan sin RAG/KB indexada y se estandariza el uso de modelos **Anthropic Claude** a través de Amazon Bedrock.
5. **No Sobredimensionar en Etapa Inicial:** Eliminar políticas complejas de ciclo de vida de almacenamiento (Lifecycle Policies) y recursos innecesarios durante la fase inicial MVP.

---

## 2. Diagrama de Arquitectura y Referencia de Repositorio

El diagrama oficial de la arquitectura se encuentra sincronizado en el repositorio local y remoto:

```bash
/Users/innovart/Projects/intelix/appinspecciones/Product-Definition/02-arquitectura/arquitectura-aws-mvp.drawio
```

### Flujo Simplificado de Componentes:
- **Frontend / Delivery:** PWA React servida vía **AWS Amplify Hosting** (incluye CDN, SSL ACM, builds CI/CD y gestión de dominio/hosted UI).
- **Autenticación:** **Amazon Cognito** (User Pool + Identity Pool con OAuth2/OIDC + PKCE para los 4 roles: Admin, Inspector, Gestión, Comercial).
- **API & Compute:** **AWS API Gateway** (Regional REST API + WAF) $\rightarrow$ **AWS Lambda (Python 3.11/3.12)** para endpoints CRUD, `/sync` offline-first y procesamiento asíncrono de fotos.
- **Persistencia:** **Amazon RDS PostgreSQL** (instancia `t4g.micro` + almacenamiento GP3 de 20GB + backups).
- **Almacenamiento de Evidencias:** **Amazon S3** (bucket unificado para fotografías e inspecciones).
- **AI & Observabilidad:** **Amazon Bedrock (Claude)** para generación de reportes y **Amazon CloudWatch** para logs y métricas.

---

## 3. Estimación y Definición de Infraestructura Agrupada (MVP)

A continuación se detalla la matriz de servicios agrupados y simplificados para la fase MVP, integrando el feedback de revisión:

| Categoría | Servicio AWS | Componentes Agrupados | Descripción y Estándares | Sizing Propuesto / Estimación | Prioridad MVP |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Autenticación** | Amazon Cognito | User Pool + Identity Pool + Hosted UI | Autenticación federada OAuth2/OIDC con PKCE. Soporta 4 roles. Dominio personalizado y certificado ACM. | Tier Free (Hasta 50,000 MAU) - **$0.00 / mes** | **Crítica** |
| **Frontend Hosting** | AWS Amplify Hosting | Web Hosting PWA + Build CI/CD + CloudFront CDN | Servidor de archivos estáticos PWA React, despliegue continuo desde repositorio, CDN integrado e invalidaciones de cache. | Tier Free (5GB storage, 15GB bandwidth, 1000 min build) - **$0.00 / mes** | **Crítica** |
| **API Backend** | AWS API Gateway + AWS Lambda | REST API + Funciones Serverless Python | API Gateway REST integrada con WAF. Funciones Lambda desarrolladas en **PYTHON** (Estándar): CRUD, endpoint `/sync` batch y thumbnails. | 200k - 500k invocaciones/mes, ARM64 Python - **~$9.25 / mes** | **Crítica** |
| **Base de Datos** | Amazon RDS PostgreSQL | Instancia DB + GP3 Storage + Backups | Instancia relacional para modelo de datos jerárquico. GP3 Storage de 20GB ampliable. *Nota: Carga baja/media inicial.* | `db.t4g.micro` (2 vCPU, 1GB RAM) + 20GB GP3 + 7 días retención - **~$17.30 / mes** | **Crítica** |
| **Almacenamiento** | Amazon S3 | Bucket Fotos Evidencias (Storage + Requests + Lifecycle) | Bucket consolidado para subida, descarga y gestión de fotos de inspecciones (~2MB/foto). Incluye consumo de requests PUT/GET. | 50-200 GB almacenamiento + 700k requests - **~$6.10 / mes** | **Crítica** |
| **Seguridad** | AWS WAF + ACM + IAM | Web ACL + Certificados + Roles | Protección OWASP para API Gateway (AWS Managed Rules), certificados SSL gratuitos y políticas IAM de menor privilegio. | 1 Web ACL + Reglas gestionadas + Certificados ACM - **~$10.30 / mes** | **Alta** |
| **Monitoreo** | Amazon CloudWatch | Logs + Métricas + Alarmas | Retención de logs de Lambda y API Gateway a 30 días. Métricas y alarmas principales de salud del sistema. | 5-20 GB Logs + 10 Alarmas básicas - **~$5.50 / mes** | **Alta** |
| **IA (Opcional v1.1)** | Amazon Bedrock | AI Text Optimization | Transformación de notas informales de inspector a reportes técnicos en lenguaje de nicho. **Uso estandarizado de Claude**. | 500-2,000 requests/mes (Feature v1.1 post-MVP) - **~$15.00 / mes** | **Media** |

---

## 4. Resumen de Costos y Consideraciones Económicas

- **Costo Mensual Estimado MVP (Core):** **~$48.45 - $73.17 USD / mes**
- **Costo Mensual Estimado con IA / Features v1.1:** **~$100.17 USD / mes**
- **Impacto AWS Free Tier (Año 1):** Durante los primeros 12 meses, los costos reales se reducirán significativamente por cobertura de Free Tier en RDS (`db.t2.micro` / `t4g.micro`), Lambda (1M llamadas/mes) y S3 (5GB).

---

## 5. Directrices Tácticas para Agentes Kiro / Prompting IA-DLC

Para la generación de código y templates de infraestructura como código (IaC) en Kiro, los agentes deberán guiarse por los siguientes archivos de dirección (*steering*):

### 5.1. Reglas de Backend Lambda (Python)
- **Runtime:** `python3.11` o `python3.12`.
- **Arquitectura de Procesador:** `arm64` (AWS Graviton2) para optimización de costos.
- **Estructura de Carpetas:**
  ```text
  backend/
  ├── src/
  │   ├── handlers/       # Lambdas por dominio (inspecciones, ordenes, sync, auth)
  │   ├── services/       # Lógica de negocio
  │   ├── db/             # Modelos SQLAlchemy / Peewee y conexión a RDS
  │   └── utils/          # Logger, respuestas formateadas API Gateway
  ├── template.yaml       # AWS SAM / Serverless Framework configuration
  └── requirements.txt
  ```

### 5.2. Reglas de Infraestructura como Código (IaC)
- Utilizar **AWS SAM** o **AWS CDK (Python)** para definir la infraestructura.
- Evitar crear recursos duplicados de S3 o CDN (usar Amplify Hosting para el Frontend y S3 unificado para la subida de evidencias).
- Configurar variables de entorno securizadas en AWS Systems Manager Parameter Store / Secrets Manager.

---

## 6. Siguientes Pasos en el Ciclo IA-DLC

1. **Cargar este insumo** en la carpeta de especificaciones del proyecto Kiro (`.kiro/steering/` o `Product-Definition/02-arquitectura/`).
2. **Ejecutar Prompt de Generación IaC:** Solicitar a Kiro la creación del archivo `template.yaml` (AWS SAM) con las Lambdas en Python 3.11 y la infraestructura consolidada.
3. **Validar la Sincronización del Diagrama:** Confirmar cualquier ajuste en `arquitectura-aws-mvp.drawio` si se agregan endpoints o triggers asíncronos.
