# 🏗️ Template Base IA-DLC con Kiro — INTELIX

Plantilla inicial para nuevos proyectos de desarrollo que implementan la metodología **AI-Driven Lifecycle (IA-DLC)** usando **Kiro** como entorno de desarrollo asistido por IA.

Al clonar este repositorio, obtienes toda la estructura de carpetas, steering files, skills y reglas necesarias para arrancar un proyecto desde cero con el flujo IA-DLC listo para usar.

---

## ¿Qué incluye esta plantilla?

| Carpeta / Archivo | Descripción |
|---|---|
| `.kiro/steering/` | Archivos de dirección (steering files) que guían el comportamiento del agente Kiro durante todo el ciclo de desarrollo. |
| `.kiro/aws-aidlc-rule-details/` | Reglas detalladas del workflow IA-DLC: fases de Inception, Construction y Operations. |
| `.kiro/skills/requirements-matrix-excel/` | **Skill INTELIX**: Genera la Matriz de Identificación de Requerimientos en formato Excel (.xlsx) con formato corporativo. |
| `.kiro/skills/requirements-matrix-pdf/` | **Skill INTELIX**: Genera la Matriz de Identificación de Requerimientos en formato PDF con formato corporativo. |
| `.kiro/skills/project-docs-html/` | **Skill INTELIX**: Genera documentación HTML del proyecto con Swagger UI embebido para las APIs del backend. |
| `docs/` | Carpeta para documentación técnica del proyecto (estándares, arquitectura, etc.). |

---

## Skills disponibles (INTELIX)

### 1. Matriz de Requerimientos — Excel
Genera un archivo `.xlsx` con la Matriz de Identificación de Requerimientos siguiendo el formato corporativo INTELIX.

> Activación en Kiro: Pedir "generar matriz de requerimientos en Excel"

### 2. Matriz de Requerimientos — PDF
Genera un PDF con la misma matriz, alineado visualmente al formato del Excel.

> Activación en Kiro: Pedir "generar matriz de requerimientos en PDF"

### 3. Documentación de Proyecto — HTML
Genera documentación HTML completa del proyecto incluyendo Swagger UI embebido para documentar las APIs.

> Activación en Kiro: Pedir "generar documentación del proyecto en HTML"

---

## Primeros pasos: Crear un nuevo proyecto a partir de esta plantilla

### Opción A — Desde GitLab (recomendado)

1. **Clonar la plantilla:**
   ```bash
   git clone https://git.intelix.biz/grupomayoreo/template_base.git mi-nuevo-proyecto
   ```

2. **Entrar al directorio:**
   ```bash
   cd mi-nuevo-proyecto
   ```

3. **Desvincular del repositorio plantilla:**
   ```bash
   git remote remove origin
   ```

4. **Crear tu nuevo repositorio en GitLab** (desde la interfaz web o CLI).

5. **Vincular al nuevo repositorio:**
   ```bash
   git remote add origin https://git.intelix.biz/grupomayoreo/mi-nuevo-proyecto.git
   ```

6. **Subir la estructura inicial:**
   ```bash
   git branch -M main
   git push -uf origin main
   ```

7. **Instalar los skills** (ver sección [Instalación de Skills](#instalación-de-skills-post-clonado)):
   ```bash
   # Linux/macOS
   chmod +x install-skills.sh && ./install-skills.sh

   # Windows
   install-skills.bat
   ```

8. **Abrir en Kiro** y comenzar el flujo IA-DLC.

### Opción B — Desde la terminal (sin GitLab previo)

1. **Clonar y renombrar:**
   ```bash
   git clone https://git.intelix.biz/grupomayoreo/template_base.git nombre-de-mi-proyecto
   cd nombre-de-mi-proyecto
   ```

2. **Limpiar historial (opcional, para empezar limpio):**
   ```bash
   rm -rf .git
   git init
   git add .
   git commit -m "feat: scaffold inicial desde template_base IA-DLC"
   ```

3. **Conectar a tu repositorio remoto:**
   ```bash
   git remote add origin <URL_DE_TU_REPO>
   git push -u origin main
   ```

4. **Instalar los skills:**
   ```bash
   # Linux/macOS
   chmod +x install-skills.sh && ./install-skills.sh

   # Windows
   install-skills.bat
   ```

---

## Estructura resultante después de clonar

```
mi-nuevo-proyecto/
├── .kiro/
│   ├── aws-aidlc-rule-details/   # Reglas del workflow IA-DLC
│   │   ├── common/               # Reglas comunes (validación, formatos, sesión)
│   │   ├── inception/            # Fases de incepción
│   │   ├── construction/         # Fases de construcción
│   │   ├── extensions/           # Extensiones (seguridad, resiliencia, testing)
│   │   └── operations/           # Fases de operaciones
│   ├── skills/                   # Skills personalizados INTELIX
│   │   ├── project-docs-html/
│   │   ├── requirements-matrix-excel/
│   │   └── requirements-matrix-pdf/
│   └── steering/                 # Archivos de dirección para Kiro
│       ├── aws-aidlc-rules/
│       ├── 01-prototype-guardrails.md
│       ├── 02-mockup-workflow.md
│       ├── compactar.md
│       ├── entregables_tareas_iadlc.md
│       └── infraestructura_estimacion_iadlc.md
├── docs/
│   ├── arquitectura/
│   └── estandares-desarrollo-intelix.md
└── README.md
```

---

## Instalación de Skills (Post-Clonado)

Después de clonar el repositorio y antes de usar los skills en Kiro, ejecuta el instalador interactivo que detecta/instala Python y configura las dependencias de cada skill.

### Ejecutar el instalador

**Linux / macOS:**
```bash
chmod +x install-skills.sh
./install-skills.sh
```

**Windows (CMD o doble clic):**
```cmd
install-skills.bat
```

### Flujo del instalador (4 fases)

#### Fase 1 — Verificación e instalación de Python

El script escanea el sistema buscando **todas las versiones de Python instaladas** (PATH, rutas comunes, pyenv, uv) y las clasifica como compatibles o incompatibles. También detecta si tienes **pyenv** o **uv** instalados.

Independientemente de si ya tienes una versión compatible, el script te presenta estas opciones para que decidas cómo trabajar:

| Opción | Descripción |
|--------|-------------|
| **Usar versión existente** | Selecciona entre las versiones compatibles detectadas (sistema, pyenv o uv) |
| **pyenv** (Linux/macOS) | Gestiona múltiples versiones de Python lado a lado. Si ya lo tienes, muestra tus versiones; si no, lo instala. Ideal para proyectos con requisitos distintos. |
| **uv** (todas las plataformas) | Gestor moderno todo-en-uno: instala Python, crea entornos y resuelve dependencias 10-100x más rápido. Si ya lo tienes, muestra tus versiones; si no, lo instala. |
| **Global** (gestor del sistema) | `apt`/`dnf`/`brew` en Linux/macOS o descarga desde python.org en Windows. Simple y directo para una sola versión. |

> **¿Por qué pyenv o uv?** Permiten instalar múltiples versiones de Python sin conflicto. Puedes tener 3.11, 3.12 y 3.13 simultáneamente y elegir la correcta por proyecto. Si ya tienen versiones instaladas, el script las detecta y te las ofrece directamente.

#### Fase 2 — Selección de Skills

Te presenta los skills disponibles y eliges cuáles instalar:

- `[1]` project-docs-html — Documentación HTML con Swagger UI
- `[2]` requirements-matrix-excel — Matriz de Requerimientos Excel
- `[3]` requirements-matrix-pdf — Matriz de Requerimientos PDF
- `[A]` Instalar todos

#### Fase 3 — Método de instalación de dependencias

| Método | Descripción | Cuándo usarlo |
|--------|-------------|---------------|
| **Global** | `pip install` directo en el Python seleccionado | Proyectos simples o entornos ya aislados (contenedores, CI) |
| **venv** | Crea un `.venv/` independiente por cada skill con `python -m venv` | Opción estándar para aislar dependencias por skill |
| **uv** | Crea un `.venv/` por skill usando [uv](https://docs.astral.sh/uv/) (ultra-rápido) | Si prefieres velocidad y gestión moderna de paquetes |

Si eliges `uv` y no está instalado, el script lo instala automáticamente.

#### Fase 4 — Instalación

Instala las dependencias de cada skill seleccionado en el entorno correspondiente usando el Python elegido en la Fase 1.

### Estructura resultante (con entornos virtuales)

```
.kiro/skills/
├── project-docs-html/
│   ├── .venv/              ← Entorno aislado del skill
│   ├── requirements.txt
│   └── ...
├── requirements-matrix-excel/
│   ├── .venv/
│   ├── requirements.txt
│   └── ...
└── requirements-matrix-pdf/
    ├── .venv/
    ├── requirements.txt
    └── ...
```

### Activar manualmente un entorno de skill (opcional)

Si necesitas ejecutar scripts de un skill fuera de Kiro:

```bash
# Linux/macOS
source .kiro/skills/project-docs-html/.venv/bin/activate

# Windows
.kiro\skills\project-docs-html\.venv\Scripts\activate.bat
```

---

## Cómo iniciar el flujo IA-DLC en Kiro

Una vez clonado y abierto el proyecto en Kiro:

1. **Inicia una conversación** describiendo el proyecto que vas a desarrollar.
2. Kiro detectará automáticamente los steering files y las reglas IA-DLC.
3. El workflow adaptativo evaluará qué fases son necesarias (Requirements, Design, Code Generation, etc.).
4. Los skills estarán disponibles en cualquier momento para generar entregables corporativos.

### Comando útil: COMPACTAR
Escribe `COMPACTAR` en el chat para que Kiro resuma toda la sesión en 5-7 viñetas autocontenidas, útil para continuar el trabajo en una nueva sesión.

---

## Personalización de la plantilla

Después de clonar, considera ajustar:

- **`.kiro/steering/infraestructura_estimacion_iadlc.md`** — Actualizar con los datos de infraestructura de tu proyecto específico.
- **`.kiro/steering/entregables_tareas_iadlc.md`** — Reemplazar con el plan de tareas y módulos de tu proyecto.
- **`docs/estandares-desarrollo-intelix.md`** — Revisar y adaptar estándares si tu proyecto tiene particularidades.

---

## Requisitos

- [Kiro IDE](https://kiro.dev) instalado
- Git
- Python 3.11+ (el instalador de skills te ayuda a instalarlo si no lo tienes)
- (Opcional) [uv](https://docs.astral.sh/uv/) — gestor moderno de paquetes y versiones de Python
- (Opcional) [pyenv](https://github.com/pyenv/pyenv) — gestión de múltiples versiones de Python (Linux/macOS)
- Acceso al GitLab corporativo INTELIX

---

## Mantenido por

**Equipo de Desarrollo — INTELIX / Grupo Mayoreo**
