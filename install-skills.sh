#!/usr/bin/env bash
# =============================================================================
# install-skills.sh — Instalador interactivo de Skills INTELIX (Linux/macOS)
# =============================================================================
set -e

SKILLS_DIR=".kiro/skills"
AVAILABLE_SKILLS=("project-docs-html" "requirements-matrix-excel" "requirements-matrix-pdf")
SKILL_DESCRIPTIONS=(
  "Documentación HTML del proyecto con Swagger UI"
  "Matriz de Requerimientos en Excel (.xlsx)"
  "Matriz de Requerimientos en PDF"
)
MIN_PYTHON_MAJOR=3
MIN_PYTHON_MINOR=11

# Colores
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Variable que almacenará el ejecutable de Python a usar
PYTHON_CMD=""
HAS_PYENV=0
HAS_UV=0

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🛠️  Instalador de Skills — Template Base IA-DLC INTELIX   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# FUNCIONES AUXILIARES
# =============================================================================

is_compatible() {
  local version="$1"
  local major minor
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)
  if [ "$major" -gt "$MIN_PYTHON_MAJOR" ]; then
    return 0
  elif [ "$major" -eq "$MIN_PYTHON_MAJOR" ] && [ "$minor" -ge "$MIN_PYTHON_MINOR" ]; then
    return 0
  fi
  return 1
}

get_python_version() {
  local cmd="$1"
  "$cmd" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

find_system_pythons() {
  FOUND_PYTHONS=()
  local checked_versions=()
  local candidates=("python3" "python" "python3.11" "python3.12" "python3.13" "python3.14")

  for p in /usr/local/bin/python3.* /opt/homebrew/bin/python3.* /usr/bin/python3.*; do
    [ -x "$p" ] && candidates+=("$p")
  done

  for cmd in "${candidates[@]}"; do
    if command -v "$cmd" &>/dev/null || [ -x "$cmd" ]; then
      local ver
      ver=$(get_python_version "$cmd" 2>/dev/null)
      if [ -n "$ver" ]; then
        local duplicate=0
        for cv in "${checked_versions[@]}"; do
          [ "$cv" == "$ver" ] && duplicate=1 && break
        done
        if [ "$duplicate" -eq 0 ]; then
          checked_versions+=("$ver")
          FOUND_PYTHONS+=("$cmd|$ver")
        fi
      fi
    fi
  done
}

find_pyenv_pythons() {
  PYENV_PYTHONS=()
  if [ "$HAS_PYENV" -eq 1 ]; then
    for ver in $(pyenv versions --bare 2>/dev/null); do
      local pyenv_path
      pyenv_path="$(pyenv root)/versions/$ver/bin/python3"
      if [ -x "$pyenv_path" ]; then
        local full_ver
        full_ver=$(get_python_version "$pyenv_path" 2>/dev/null)
        [ -n "$full_ver" ] && PYENV_PYTHONS+=("$pyenv_path|$full_ver")
      fi
    done
  fi
}

find_uv_pythons() {
  UV_PYTHONS=()
  if [ "$HAS_UV" -eq 1 ]; then
    while IFS= read -r line; do
      # uv python list --only-installed muestra: cpython-3.12.4-... <path>
      local ver path_str
      ver=$(echo "$line" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
      path_str=$(echo "$line" | awk '{print $NF}')
      if [ -n "$ver" ] && [ -x "$path_str" ]; then
        UV_PYTHONS+=("$path_str|$ver")
      fi
    done < <(uv python list --only-installed 2>/dev/null)
  fi
}

# =============================================================================
# FASE 1: DETECCIÓN Y SELECCIÓN DE PYTHON
# =============================================================================

echo -e "${YELLOW}🐍 Fase 1: Verificación de Python${NC}"
echo -e "   Versión mínima requerida: ${BOLD}Python ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR}+${NC}"
echo ""

# Detectar herramientas de gestión de versiones
command -v pyenv &>/dev/null && HAS_PYENV=1
command -v uv &>/dev/null && HAS_UV=1

# Buscar versiones en el sistema
find_system_pythons
find_pyenv_pythons
find_uv_pythons

# Clasificar versiones del sistema
COMPATIBLE_SYSTEM=()
INCOMPATIBLE_SYSTEM=()
for entry in "${FOUND_PYTHONS[@]}"; do
  local_ver="${entry##*|}"
  if is_compatible "$local_ver"; then
    COMPATIBLE_SYSTEM+=("$entry")
  else
    INCOMPATIBLE_SYSTEM+=("$entry")
  fi
done

# Clasificar versiones de pyenv
COMPATIBLE_PYENV=()
for entry in "${PYENV_PYTHONS[@]}"; do
  local_ver="${entry##*|}"
  is_compatible "$local_ver" && COMPATIBLE_PYENV+=("$entry")
done

# Clasificar versiones de uv
COMPATIBLE_UV=()
for entry in "${UV_PYTHONS[@]}"; do
  local_ver="${entry##*|}"
  is_compatible "$local_ver" && COMPATIBLE_UV+=("$entry")
done

# --- Mostrar resumen de lo encontrado ---
echo -e "${CYAN}┌─ Resumen del entorno ──────────────────────────────────────┐${NC}"

if [ ${#FOUND_PYTHONS[@]} -gt 0 ]; then
  echo -e "${CYAN}│${NC} Python en sistema:"
  for entry in "${COMPATIBLE_SYSTEM[@]}"; do
    echo -e "${CYAN}│${NC}   ${GREEN}✔${NC} ${entry##*|} (${entry%%|*}) — compatible"
  done
  for entry in "${INCOMPATIBLE_SYSTEM[@]}"; do
    echo -e "${CYAN}│${NC}   ${RED}✘${NC} ${entry##*|} (${entry%%|*}) — incompatible"
  done
else
  echo -e "${CYAN}│${NC} Python en sistema: ${RED}no detectado${NC}"
fi

if [ "$HAS_PYENV" -eq 1 ]; then
  echo -e "${CYAN}│${NC} pyenv: ${GREEN}instalado${NC}"
  if [ ${#COMPATIBLE_PYENV[@]} -gt 0 ]; then
    for entry in "${COMPATIBLE_PYENV[@]}"; do
      echo -e "${CYAN}│${NC}   ${GREEN}✔${NC} ${entry##*|} — compatible"
    done
  else
    echo -e "${CYAN}│${NC}   ${DIM}(sin versiones compatibles instaladas)${NC}"
  fi
else
  echo -e "${CYAN}│${NC} pyenv: ${DIM}no instalado${NC}"
fi

if [ "$HAS_UV" -eq 1 ]; then
  echo -e "${CYAN}│${NC} uv: ${GREEN}instalado${NC}"
  if [ ${#COMPATIBLE_UV[@]} -gt 0 ]; then
    for entry in "${COMPATIBLE_UV[@]}"; do
      echo -e "${CYAN}│${NC}   ${GREEN}✔${NC} ${entry##*|} — compatible"
    done
  else
    echo -e "${CYAN}│${NC}   ${DIM}(sin versiones compatibles instaladas)${NC}"
  fi
else
  echo -e "${CYAN}│${NC} uv: ${DIM}no instalado${NC}"
fi

echo -e "${CYAN}└────────────────────────────────────────────────────────────┘${NC}"
echo ""

# --- Presentar opciones al usuario ---
echo -e "${YELLOW}¿Cómo deseas gestionar la versión de Python para los skills?${NC}"
echo ""
echo -e "  ${BOLD}[1] Usar una versión ya instalada y compatible${NC}"
if [ ${#COMPATIBLE_SYSTEM[@]} -gt 0 ] || [ ${#COMPATIBLE_PYENV[@]} -gt 0 ] || [ ${#COMPATIBLE_UV[@]} -gt 0 ]; then
  echo -e "      ${DIM}(se detectaron versiones compatibles arriba)${NC}"
else
  echo -e "      ${RED}(no se detectaron versiones compatibles — no disponible)${NC}"
fi
echo ""
echo -e "  ${BOLD}[2] Instalar/usar Python con pyenv${NC} (gestión de múltiples versiones)"
if [ "$HAS_PYENV" -eq 1 ]; then
  echo -e "      ${GREEN}pyenv ya está instalado.${NC}"
else
  echo -e "      ${DIM}Se instalará pyenv primero.${NC}"
fi
echo -e "      ${DIM}↳ Permite instalar múltiples versiones de Python lado a lado.${NC}"
echo -e "      ${DIM}  Cada proyecto puede usar una versión distinta sin conflicto.${NC}"
echo -e "      ${DIM}  Ideal si trabajas en varios proyectos con requisitos distintos.${NC}"
echo ""
echo -e "  ${BOLD}[3] Instalar/usar Python con uv${NC} (gestor moderno y ultra-rápido)"
if [ "$HAS_UV" -eq 1 ]; then
  echo -e "      ${GREEN}uv ya está instalado.${NC}"
else
  echo -e "      ${DIM}Se instalará uv primero.${NC}"
fi
echo -e "      ${DIM}↳ Gestor de paquetes y versiones de Python de nueva generación.${NC}"
echo -e "      ${DIM}  Instala Python, crea entornos y resuelve dependencias 10-100x más rápido.${NC}"
echo -e "      ${DIM}  Recomendado si buscas velocidad y simplicidad todo-en-uno.${NC}"
echo ""
echo -e "  ${BOLD}[4] Instalar Python globalmente${NC} (gestor de paquetes del sistema)"
echo -e "      ${DIM}↳ apt/dnf/brew — instala una versión global, simple y directo.${NC}"
echo -e "      ${DIM}  Bueno para empezar rápido si solo necesitas una versión.${NC}"
echo ""

# Determinar opciones válidas
HAS_ANY_COMPATIBLE=0
[ ${#COMPATIBLE_SYSTEM[@]} -gt 0 ] || [ ${#COMPATIBLE_PYENV[@]} -gt 0 ] || [ ${#COMPATIBLE_UV[@]} -gt 0 ] && HAS_ANY_COMPATIBLE=1

read -rp "Selecciona opción (1/2/3/4): " PY_STRATEGY

case "$PY_STRATEGY" in
  1)
    # Usar versión ya instalada compatible
    ALL_COMPATIBLE=()
    for entry in "${COMPATIBLE_SYSTEM[@]}"; do
      ALL_COMPATIBLE+=("sistema|$entry")
    done
    for entry in "${COMPATIBLE_PYENV[@]}"; do
      ALL_COMPATIBLE+=("pyenv|$entry")
    done
    for entry in "${COMPATIBLE_UV[@]}"; do
      ALL_COMPATIBLE+=("uv|$entry")
    done

    if [ ${#ALL_COMPATIBLE[@]} -eq 0 ]; then
      echo ""
      echo -e "${RED}❌ No se detectaron versiones compatibles. Selecciona otra opción.${NC}"
      exit 1
    fi

    echo ""
    echo -e "${CYAN}Versiones compatibles disponibles:${NC}"
    for i in "${!ALL_COMPATIBLE[@]}"; do
      full="${ALL_COMPATIBLE[$i]}"
      source_type="${full%%|*}"
      rest="${full#*|}"
      cmd_path="${rest%%|*}"
      ver="${rest##*|}"
      echo "  [$((i+1))] Python $ver ($source_type) — $cmd_path"
    done
    echo ""

    if [ ${#ALL_COMPATIBLE[@]} -eq 1 ]; then
      full="${ALL_COMPATIBLE[0]}"
      rest="${full#*|}"
      PYTHON_CMD="${rest%%|*}"
      echo -e "${GREEN}→ Usando: Python ${rest##*|} ($PYTHON_CMD)${NC}"
    else
      read -rp "Selecciona versión: " VER_CHOICE
      idx=$((VER_CHOICE - 1))
      if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#ALL_COMPATIBLE[@]} ]; then
        full="${ALL_COMPATIBLE[$idx]}"
        rest="${full#*|}"
        PYTHON_CMD="${rest%%|*}"
        echo -e "${GREEN}→ Usando: Python ${rest##*|} ($PYTHON_CMD)${NC}"
      else
        echo -e "${RED}Opción inválida. Usando la primera.${NC}"
        full="${ALL_COMPATIBLE[0]}"
        rest="${full#*|}"
        PYTHON_CMD="${rest%%|*}"
      fi
    fi
    ;;

  2)
    # pyenv
    echo ""
    if [ "$HAS_PYENV" -eq 0 ]; then
      echo -e "${CYAN}Instalando pyenv...${NC}"
      curl https://pyenv.run | bash
      export PATH="$HOME/.pyenv/bin:$PATH"
      eval "$(pyenv init -)"
      eval "$(pyenv virtualenv-init -)" 2>/dev/null || true
      HAS_PYENV=1
      echo -e "${GREEN}✔ pyenv instalado${NC}"
      echo ""
    fi

    # Mostrar versiones compatibles ya instaladas en pyenv
    find_pyenv_pythons
    COMPATIBLE_PYENV=()
    for entry in "${PYENV_PYTHONS[@]}"; do
      local_ver="${entry##*|}"
      is_compatible "$local_ver" && COMPATIBLE_PYENV+=("$entry")
    done

    if [ ${#COMPATIBLE_PYENV[@]} -gt 0 ]; then
      echo -e "${CYAN}Versiones compatibles en pyenv:${NC}"
      for i in "${!COMPATIBLE_PYENV[@]}"; do
        entry="${COMPATIBLE_PYENV[$i]}"
        echo "  [$((i+1))] Python ${entry##*|}"
      done
      echo "  [N] Instalar una nueva versión con pyenv"
      echo ""
      read -rp "Selecciona versión o N para instalar nueva: " PYENV_CHOICE

      if [[ "${PYENV_CHOICE^^}" != "N" ]]; then
        idx=$((PYENV_CHOICE - 1))
        if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#COMPATIBLE_PYENV[@]} ]; then
          entry="${COMPATIBLE_PYENV[$idx]}"
          PYTHON_CMD="${entry%%|*}"
          echo -e "${GREEN}→ Usando: Python ${entry##*|}${NC}"
        else
          echo -e "${RED}Opción inválida.${NC}"
          exit 1
        fi
      fi
    fi

    # Si no se seleccionó, instalar nueva
    if [ -z "$PYTHON_CMD" ]; then
      echo -e "${CYAN}Instalando Python 3.12 con pyenv...${NC}"
      pyenv install -s 3.12
      PYTHON_CMD=$(ls "$(pyenv root)"/versions/3.12.*/bin/python3 2>/dev/null | head -1)
      if [ -z "$PYTHON_CMD" ]; then
        eval "$(pyenv init -)"
        pyenv local 3.12
        PYTHON_CMD="python3"
      fi
      echo -e "${GREEN}✔ Python instalado: $($PYTHON_CMD --version)${NC}"
    fi
    ;;

  3)
    # uv
    echo ""
    if [ "$HAS_UV" -eq 0 ]; then
      echo -e "${CYAN}Instalando uv...${NC}"
      curl -LsSf https://astral.sh/uv/install.sh | sh
      export PATH="$HOME/.local/bin:$PATH"
      if ! command -v uv &>/dev/null; then
        echo -e "${RED}❌ No se pudo instalar uv. Instálalo manualmente:${NC}"
        echo "   https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
      fi
      HAS_UV=1
      echo -e "${GREEN}✔ uv instalado${NC}"
      echo ""
    fi

    # Mostrar versiones compatibles ya instaladas por uv
    find_uv_pythons
    COMPATIBLE_UV=()
    for entry in "${UV_PYTHONS[@]}"; do
      local_ver="${entry##*|}"
      is_compatible "$local_ver" && COMPATIBLE_UV+=("$entry")
    done

    if [ ${#COMPATIBLE_UV[@]} -gt 0 ]; then
      echo -e "${CYAN}Versiones compatibles gestionadas por uv:${NC}"
      for i in "${!COMPATIBLE_UV[@]}"; do
        entry="${COMPATIBLE_UV[$i]}"
        echo "  [$((i+1))] Python ${entry##*|}"
      done
      echo "  [N] Instalar una nueva versión con uv"
      echo ""
      read -rp "Selecciona versión o N para instalar nueva: " UV_CHOICE

      if [[ "${UV_CHOICE^^}" != "N" ]]; then
        idx=$((UV_CHOICE - 1))
        if [ "$idx" -ge 0 ] && [ "$idx" -lt ${#COMPATIBLE_UV[@]} ]; then
          entry="${COMPATIBLE_UV[$idx]}"
          PYTHON_CMD="${entry%%|*}"
          echo -e "${GREEN}→ Usando: Python ${entry##*|}${NC}"
        else
          echo -e "${RED}Opción inválida.${NC}"
          exit 1
        fi
      fi
    fi

    # Si no se seleccionó, instalar nueva
    if [ -z "$PYTHON_CMD" ]; then
      echo -e "${CYAN}Instalando Python 3.12 con uv...${NC}"
      uv python install 3.12
      PYTHON_CMD="$(uv python find 3.12)"
      echo -e "${GREEN}✔ Python instalado: $($PYTHON_CMD --version)${NC}"
    fi
    ;;

  4)
    # Instalación global con gestor de paquetes del sistema
    echo ""
    echo -e "${CYAN}Instalando Python con el gestor de paquetes del sistema...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      if command -v brew &>/dev/null; then
        brew install python@3.12
        PYTHON_CMD="python3.12"
      else
        echo -e "${RED}Homebrew no encontrado. Instálalo primero: https://brew.sh${NC}"
        exit 1
      fi
    elif command -v apt-get &>/dev/null; then
      echo "Se requieren permisos de administrador (sudo):"
      sudo apt-get update
      sudo apt-get install -y python3.12 python3.12-venv python3.12-dev
      PYTHON_CMD="python3.12"
    elif command -v dnf &>/dev/null; then
      echo "Se requieren permisos de administrador (sudo):"
      sudo dnf install -y python3.12
      PYTHON_CMD="python3.12"
    else
      echo -e "${RED}No se detectó un gestor de paquetes soportado (brew/apt/dnf).${NC}"
      echo "Instala Python 3.11+ manualmente desde: https://www.python.org/downloads/"
      exit 1
    fi
    echo -e "${GREEN}✔ Python instalado: $($PYTHON_CMD --version)${NC}"
    ;;

  *)
    echo -e "${RED}❌ Opción inválida. Saliendo.${NC}"
    exit 1
    ;;
esac

echo ""

# Validación final
FINAL_VER=$(get_python_version "$PYTHON_CMD")
if ! is_compatible "$FINAL_VER"; then
  echo -e "${RED}❌ Error: La versión de Python resultante ($FINAL_VER) no es compatible.${NC}"
  echo "   Se requiere Python ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR}+"
  exit 1
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✔ Python $FINAL_VER listo para usar${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# =============================================================================
# FASE 2: SELECCIÓN DE SKILLS
# =============================================================================

echo -e "${YELLOW}📦 Fase 2: Selección de Skills${NC}"
echo ""
for i in "${!AVAILABLE_SKILLS[@]}"; do
  echo "  [$((i+1))] ${AVAILABLE_SKILLS[$i]} — ${SKILL_DESCRIPTIONS[$i]}"
done
echo "  [A] Instalar TODOS los skills"
echo ""

read -rp "Selecciona los skills a instalar (ej: 1,3 o A para todos): " SELECTION

SELECTED_SKILLS=()
if [[ "${SELECTION^^}" == "A" ]]; then
  SELECTED_SKILLS=("${AVAILABLE_SKILLS[@]}")
else
  IFS=',' read -ra INDICES <<< "$SELECTION"
  for idx in "${INDICES[@]}"; do
    idx=$(echo "$idx" | tr -d ' ')
    if [[ "$idx" =~ ^[0-9]+$ ]] && [ "$idx" -ge 1 ] && [ "$idx" -le ${#AVAILABLE_SKILLS[@]} ]; then
      SELECTED_SKILLS+=("${AVAILABLE_SKILLS[$((idx-1))]}")
    else
      echo -e "${RED}⚠️  Índice inválido: $idx (ignorado)${NC}"
    fi
  done
fi

if [ ${#SELECTED_SKILLS[@]} -eq 0 ]; then
  echo -e "${RED}❌ No se seleccionó ningún skill válido. Saliendo.${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}Skills seleccionados:${NC}"
for s in "${SELECTED_SKILLS[@]}"; do
  echo "  • $s"
done
echo ""

# =============================================================================
# FASE 3: MÉTODO DE INSTALACIÓN DE DEPENDENCIAS
# =============================================================================

echo -e "${YELLOW}🔧 Fase 3: Método de instalación de dependencias${NC}"
echo ""
echo "  [1] Global — Instala dependencias directamente con pip (sin entorno virtual)"
echo "  [2] venv   — Crea un entorno virtual (.venv) por cada skill usando python -m venv"
echo "  [3] uv     — Crea un entorno virtual por cada skill usando 'uv' (rápido, moderno)"
echo ""

read -rp "Selecciona método (1/2/3): " METHOD

case $METHOD in
  1) INSTALL_METHOD="global" ;;
  2) INSTALL_METHOD="venv" ;;
  3) INSTALL_METHOD="uv" ;;
  *)
    echo -e "${RED}❌ Opción inválida. Saliendo.${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}Método seleccionado: $INSTALL_METHOD${NC}"
echo ""

# --- Instalar uv si fue seleccionado y no está disponible ---
if [ "$INSTALL_METHOD" == "uv" ]; then
  if ! command -v uv &>/dev/null; then
    echo -e "${YELLOW}⏳ 'uv' no encontrado. Instalando...${NC}"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    if ! command -v uv &>/dev/null; then
      echo -e "${RED}❌ No se pudo instalar 'uv'. Instálalo manualmente:${NC}"
      echo "   https://docs.astral.sh/uv/getting-started/installation/"
      exit 1
    fi
    echo -e "${GREEN}✔ uv instalado correctamente${NC}"
  else
    echo -e "${GREEN}✔ uv disponible${NC}"
  fi
  echo ""
fi

# =============================================================================
# FASE 4: INSTALACIÓN DE SKILLS
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📦 Instalando skills...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

for SKILL in "${SELECTED_SKILLS[@]}"; do
  SKILL_PATH="$SKILLS_DIR/$SKILL"
  REQ_FILE="$SKILL_PATH/requirements.txt"

  echo -e "${YELLOW}📦 Instalando: $SKILL${NC}"

  if [ ! -f "$REQ_FILE" ]; then
    echo -e "${RED}   ⚠️  requirements.txt no encontrado en $SKILL_PATH. Saltando.${NC}"
    echo ""
    continue
  fi

  case $INSTALL_METHOD in
    global)
      "$PYTHON_CMD" -m pip install -r "$REQ_FILE"
      ;;
    venv)
      VENV_PATH="$SKILL_PATH/.venv"
      if [ ! -d "$VENV_PATH" ]; then
        "$PYTHON_CMD" -m venv "$VENV_PATH"
      fi
      source "$VENV_PATH/bin/activate"
      pip install -r "$REQ_FILE"
      deactivate
      echo -e "   ${GREEN}Entorno virtual creado en: $VENV_PATH${NC}"
      ;;
    uv)
      VENV_PATH="$SKILL_PATH/.venv"
      if [ ! -d "$VENV_PATH" ]; then
        uv venv --python "$PYTHON_CMD" "$VENV_PATH"
      fi
      VIRTUAL_ENV="$VENV_PATH" uv pip install -r "$REQ_FILE"
      echo -e "   ${GREEN}Entorno virtual (uv) creado en: $VENV_PATH${NC}"
      ;;
  esac

  echo -e "   ${GREEN}✔ $SKILL instalado correctamente${NC}"
  echo ""
done

# =============================================================================
# RESUMEN FINAL
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Instalación completada${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Python utilizado: $PYTHON_CMD ($FINAL_VER)"
echo "Método de entornos: $INSTALL_METHOD"
echo ""
echo "Skills instalados:"
for s in "${SELECTED_SKILLS[@]}"; do
  echo "  ✔ $s"
done

if [ "$INSTALL_METHOD" != "global" ]; then
  echo ""
  echo -e "${YELLOW}💡 Nota: Cada skill tiene su propio .venv en:${NC}"
  echo "   .kiro/skills/<nombre-skill>/.venv/"
  echo ""
  echo "   Para activar manualmente un entorno:"
  echo "   source .kiro/skills/<nombre-skill>/.venv/bin/activate"
fi

echo ""
echo -e "${GREEN}¡Listo! Abre el proyecto en Kiro y los skills estarán disponibles.${NC}"
echo ""
