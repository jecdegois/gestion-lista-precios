@echo off
REM =============================================================================
REM install-skills.bat — Instalador interactivo de Skills INTELIX (Windows)
REM =============================================================================
setlocal EnableDelayedExpansion

set "SKILLS_DIR=.kiro\skills"
set "SKILL_1=project-docs-html"
set "SKILL_2=requirements-matrix-excel"
set "SKILL_3=requirements-matrix-pdf"
set "DESC_1=Documentacion HTML del proyecto con Swagger UI"
set "DESC_2=Matriz de Requerimientos en Excel (.xlsx)"
set "DESC_3=Matriz de Requerimientos en PDF"
set "MIN_MAJOR=3"
set "MIN_MINOR=11"
set "PYTHON_CMD="
set "PYTHON_VER="
set "HAS_UV=0"
set "COMPAT_COUNT=0"
set "INCOMPAT_COUNT=0"
set "UV_COMPAT_COUNT=0"

echo.
echo ================================================================
echo    Instalador de Skills - Template Base IA-DLC INTELIX
echo ================================================================
echo.

REM =============================================================================
REM FASE 1: DETECCION Y SELECCION DE PYTHON
REM =============================================================================

echo [FASE 1] Verificacion de Python
echo    Version minima requerida: Python %MIN_MAJOR%.%MIN_MINOR%+
echo.

REM --- Detectar uv ---
where uv >nul 2>nul
if !ERRORLEVEL!==0 set "HAS_UV=1"

REM --- Buscar Python en PATH ---
for %%P in (python python3 python3.11 python3.12 python3.13 python3.14) do (
    where %%P >nul 2>nul
    if !ERRORLEVEL!==0 (
        for /f "tokens=2 delims= " %%V in ('%%P --version 2^>^&1') do (
            call :check_version "%%P" "%%V" "sistema"
        )
    )
)

REM --- Buscar en rutas comunes de Windows ---
for %%D in (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "C:\Python311\python.exe"
    "C:\Python312\python.exe"
    "C:\Python313\python.exe"
) do (
    if exist %%~D (
        for /f "tokens=2 delims= " %%V in ('%%~D --version 2^>^&1') do (
            call :check_version "%%~D" "%%V" "sistema"
        )
    )
)

REM --- Buscar versiones instaladas por uv ---
if "%HAS_UV%"=="1" (
    for /f "tokens=1,*" %%A in ('uv python list --only-installed 2^>nul') do (
        set "UV_LINE=%%A %%B"
        for /f "tokens=1,2" %%X in ("%%A %%B") do (
            set "UV_PY_VER=%%X"
            set "UV_PY_PATH=%%Y"
            if exist "!UV_PY_PATH!" (
                for /f "tokens=2 delims= " %%V in ('"!UV_PY_PATH!" --version 2^>^&1') do (
                    call :check_version_uv "!UV_PY_PATH!" "%%V"
                )
            )
        )
    )
)

echo.
echo ----------------------------------------------------------------
echo  Resumen del entorno
echo ----------------------------------------------------------------

if %COMPAT_COUNT% GTR 0 (
    echo  Python compatible en sistema:
    call :show_compatible
) else if %INCOMPAT_COUNT% GTR 0 (
    echo  Python en sistema: solo versiones incompatibles
    call :show_incompatible
) else (
    echo  Python en sistema: no detectado
)

if "%HAS_UV%"=="1" (
    echo  uv: instalado
    if %UV_COMPAT_COUNT% GTR 0 (
        call :show_uv_compatible
    ) else (
        echo    ^(sin versiones compatibles instaladas por uv^)
    )
) else (
    echo  uv: no instalado
)
echo ----------------------------------------------------------------
echo.

REM --- Presentar opciones al usuario ---
echo Como deseas gestionar la version de Python para los skills?
echo.
echo   [1] Usar una version ya instalada y compatible
if %COMPAT_COUNT% GTR 0 (
    echo       ^(se detectaron versiones compatibles arriba^)
) else if %UV_COMPAT_COUNT% GTR 0 (
    echo       ^(se detectaron versiones compatibles en uv^)
) else (
    echo       ^(NO se detectaron versiones compatibles - no disponible^)
)
echo.
echo   [2] Instalar/usar Python con uv ^(gestor moderno y ultra-rapido^)
if "%HAS_UV%"=="1" (
    echo       uv ya esta instalado.
) else (
    echo       Se instalara uv primero.
)
echo       Gestor de paquetes y versiones de Python de nueva generacion.
echo       Instala Python, crea entornos y resuelve dependencias 10-100x mas rapido.
echo       Permite tener multiples versiones de Python conviviendo sin conflicto.
echo       Recomendado si buscas velocidad y simplicidad todo-en-uno.
echo.
echo   [3] Descargar Python desde python.org ^(instalacion global^)
echo       Abre la pagina de descargas para instalar manualmente.
echo       Windows soporta multiples versiones lado a lado.
echo       Bueno para empezar rapido si solo necesitas una version.
echo.

set /p "PY_STRATEGY=Selecciona opcion (1/2/3): "

if "%PY_STRATEGY%"=="1" goto :use_existing
if "%PY_STRATEGY%"=="2" goto :use_uv_python
if "%PY_STRATEGY%"=="3" goto :use_global_install

echo [ERROR] Opcion invalida. Saliendo.
pause
exit /b 1

:use_existing
REM --- Opcion 1: Usar version existente compatible ---
set "TOTAL_COMPAT=0"
set /a "TOTAL_COMPAT=COMPAT_COUNT+UV_COMPAT_COUNT"

if %TOTAL_COMPAT%==0 (
    echo.
    echo [ERROR] No hay versiones compatibles instaladas. Selecciona otra opcion.
    pause
    exit /b 1
)

echo.
echo Versiones compatibles disponibles:
echo.
set "OPT_IDX=0"
for /L %%i in (1,1,%COMPAT_COUNT%) do (
    set /a "OPT_IDX+=1"
    set "OPT_!OPT_IDX!_CMD=!COMPAT_%%i_CMD!"
    set "OPT_!OPT_IDX!_VER=!COMPAT_%%i_VER!"
    echo   [!OPT_IDX!] Python !COMPAT_%%i_VER! ^(sistema: !COMPAT_%%i_CMD!^)
)
for /L %%i in (1,1,%UV_COMPAT_COUNT%) do (
    set /a "OPT_IDX+=1"
    set "OPT_!OPT_IDX!_CMD=!UV_COMPAT_%%i_CMD!"
    set "OPT_!OPT_IDX!_VER=!UV_COMPAT_%%i_VER!"
    echo   [!OPT_IDX!] Python !UV_COMPAT_%%i_VER! ^(uv: !UV_COMPAT_%%i_CMD!^)
)
echo.

if %TOTAL_COMPAT%==1 (
    set "PYTHON_CMD=!OPT_1_CMD!"
    set "PYTHON_VER=!OPT_1_VER!"
    echo -^> Usando: Python !PYTHON_VER!
) else (
    set /p "VER_CHOICE=Selecciona version: "
    set "PYTHON_CMD=!OPT_%VER_CHOICE%_CMD!"
    set "PYTHON_VER=!OPT_%VER_CHOICE%_VER!"
    if not defined PYTHON_CMD (
        echo [ERROR] Opcion invalida.
        pause
        exit /b 1
    )
    echo -^> Usando: Python !PYTHON_VER!
)
goto :python_ready

:use_uv_python
REM --- Opcion 2: Usar uv para gestionar Python ---
echo.
if "%HAS_UV%"=="0" (
    echo Instalando uv...
    echo.
    where pip >nul 2>nul
    if !ERRORLEVEL!==0 (
        pip install uv
    ) else (
        echo Ejecutando instalador oficial de uv...
        powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    )
    where uv >nul 2>nul
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] No se pudo instalar uv. Instalalo manualmente:
        echo   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
        echo   Mas info: https://docs.astral.sh/uv/getting-started/installation/
        pause
        exit /b 1
    )
    echo [OK] uv instalado correctamente
    set "HAS_UV=1"
    echo.
) else (
    echo [OK] uv ya esta instalado
    echo.
)

REM Verificar versiones compatibles en uv
set "UV_COMPAT_COUNT=0"
for /f "tokens=1,*" %%A in ('uv python list --only-installed 2^>nul') do (
    for /f "tokens=1,2" %%X in ("%%A %%B") do (
        if exist "%%Y" (
            for /f "tokens=2 delims= " %%V in ('"%%Y" --version 2^>^&1') do (
                call :check_version_uv "%%Y" "%%V"
            )
        )
    )
)

if %UV_COMPAT_COUNT% GTR 0 (
    echo Versiones compatibles gestionadas por uv:
    echo.
    call :show_uv_compatible
    echo   [N] Instalar una nueva version con uv
    echo.
    set /p "UV_PY_CHOICE=Selecciona version o N para instalar nueva: "

    if /i "!UV_PY_CHOICE!" NEQ "N" (
        set "PYTHON_CMD=!UV_COMPAT_%UV_PY_CHOICE%_CMD!"
        set "PYTHON_VER=!UV_COMPAT_%UV_PY_CHOICE%_VER!"
        if defined PYTHON_CMD (
            echo -^> Usando: Python !PYTHON_VER!
            goto :python_ready
        )
    )
)

echo Instalando Python 3.12 con uv...
uv python install 3.12
for /f "tokens=*" %%P in ('uv python find 3.12 2^>nul') do set "PYTHON_CMD=%%P"
if not defined PYTHON_CMD (
    echo [ERROR] No se pudo localizar Python 3.12 despues de instalarlo con uv.
    pause
    exit /b 1
)
for /f "tokens=2 delims= " %%V in ('"!PYTHON_CMD!" --version 2^>^&1') do set "PYTHON_VER=%%V"
echo [OK] Python %PYTHON_VER% instalado con uv
goto :python_ready

:use_global_install
REM --- Opcion 3: Descargar desde python.org ---
echo.
echo Abriendo la pagina de descargas de Python...
start https://www.python.org/downloads/
echo.
echo INSTRUCCIONES:
echo   1. Descarga Python 3.12 o superior
echo   2. Durante la instalacion, MARCA "Add python.exe to PATH"
echo   3. Completa la instalacion
echo   4. Cierra esta ventana y vuelve a ejecutar install-skills.bat
echo.
pause
exit /b 0

:python_ready
echo.
echo ================================================================
echo   [OK] Python %PYTHON_VER% listo para usar
echo ================================================================
echo.

REM =============================================================================
REM FASE 2: SELECCION DE SKILLS
REM =============================================================================

echo [FASE 2] Seleccion de Skills
echo.
echo   [1] %SKILL_1% - %DESC_1%
echo   [2] %SKILL_2% - %DESC_2%
echo   [3] %SKILL_3% - %DESC_3%
echo   [A] Instalar TODOS los skills
echo.

set /p "SELECTION=Selecciona los skills a instalar (ej: 1,3 o A para todos): "

set "SELECTED_COUNT=0"
set "SEL_1=0"
set "SEL_2=0"
set "SEL_3=0"

if /i "%SELECTION%"=="A" (
    set "SEL_1=1"
    set "SEL_2=1"
    set "SEL_3=1"
    set "SELECTED_COUNT=3"
) else (
    for %%i in (%SELECTION%) do (
        set "IDX=%%i"
        set "IDX=!IDX: =!"
        if "!IDX!"=="1" ( set "SEL_1=1" & set /a SELECTED_COUNT+=1 )
        if "!IDX!"=="2" ( set "SEL_2=1" & set /a SELECTED_COUNT+=1 )
        if "!IDX!"=="3" ( set "SEL_3=1" & set /a SELECTED_COUNT+=1 )
    )
)

if %SELECTED_COUNT%==0 (
    echo [ERROR] No se selecciono ningun skill valido. Saliendo.
    pause
    exit /b 1
)

echo.
echo Skills seleccionados:
if "%SEL_1%"=="1" echo   - %SKILL_1%
if "%SEL_2%"=="1" echo   - %SKILL_2%
if "%SEL_3%"=="1" echo   - %SKILL_3%
echo.

REM =============================================================================
REM FASE 3: METODO DE INSTALACION DE DEPENDENCIAS
REM =============================================================================

echo [FASE 3] Metodo de instalacion de dependencias
echo.
echo   [1] Global - Instala dependencias directamente con pip (sin entorno virtual)
echo   [2] venv   - Crea un entorno virtual (.venv) por cada skill usando python -m venv
echo   [3] uv     - Crea un entorno virtual por cada skill usando 'uv' (rapido, moderno)
echo.

set /p "METHOD=Selecciona metodo (1/2/3): "

if "%METHOD%"=="1" set "INSTALL_METHOD=global"
if "%METHOD%"=="2" set "INSTALL_METHOD=venv"
if "%METHOD%"=="3" set "INSTALL_METHOD=uv"

if not defined INSTALL_METHOD (
    echo [ERROR] Opcion invalida. Saliendo.
    pause
    exit /b 1
)

echo.
echo Metodo seleccionado: %INSTALL_METHOD%
echo.

REM --- Instalar uv si fue seleccionado y no esta disponible ---
if "%INSTALL_METHOD%"=="uv" (
    if "%HAS_UV%"=="0" (
        where uv >nul 2>nul
        if !ERRORLEVEL! NEQ 0 (
            echo Instalando uv...
            where pip >nul 2>nul
            if !ERRORLEVEL!==0 (
                pip install uv
            ) else (
                powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
            )
            where uv >nul 2>nul
            if !ERRORLEVEL! NEQ 0 (
                echo [ERROR] No se pudo instalar uv.
                pause
                exit /b 1
            )
            echo [OK] uv instalado
        ) else (
            echo [OK] uv disponible
        )
    ) else (
        echo [OK] uv disponible
    )
    echo.
)

REM =============================================================================
REM FASE 4: INSTALACION DE SKILLS
REM =============================================================================

echo ================================================================
echo   Instalando skills...
echo ================================================================
echo.

if "%SEL_1%"=="1" call :install_skill "%SKILL_1%"
if "%SEL_2%"=="1" call :install_skill "%SKILL_2%"
if "%SEL_3%"=="1" call :install_skill "%SKILL_3%"

REM =============================================================================
REM RESUMEN FINAL
REM =============================================================================

echo ================================================================
echo   Instalacion completada
echo ================================================================
echo.
echo Python utilizado: %PYTHON_CMD% (%PYTHON_VER%)
echo Metodo de entornos: %INSTALL_METHOD%
echo.
echo Skills instalados:
if "%SEL_1%"=="1" echo   [OK] %SKILL_1%
if "%SEL_2%"=="1" echo   [OK] %SKILL_2%
if "%SEL_3%"=="1" echo   [OK] %SKILL_3%

if not "%INSTALL_METHOD%"=="global" (
    echo.
    echo NOTA: Cada skill tiene su propio .venv en:
    echo   .kiro\skills\^<nombre-skill^>\.venv\
    echo.
    echo   Para activar manualmente un entorno:
    echo   .kiro\skills\^<nombre-skill^>\.venv\Scripts\activate.bat
)

echo.
echo Listo! Abre el proyecto en Kiro y los skills estaran disponibles.
echo.
pause
exit /b 0

REM =============================================================================
REM FUNCIONES
REM =============================================================================

:check_version
REM Parametros: %~1 = ejecutable, %~2 = version, %~3 = fuente
set "CV_CMD=%~1"
set "CV_VER=%~2"
set "CV_SRC=%~3"

for /f "tokens=1,2 delims=." %%A in ("%CV_VER%") do (
    set "CV_MAJOR=%%A"
    set "CV_MINOR=%%B"
)

REM Evitar duplicados
for /L %%i in (1,1,!COMPAT_COUNT!) do (
    if "!COMPAT_%%i_VER!"=="%CV_VER%" goto :eof
)
for /L %%i in (1,1,!INCOMPAT_COUNT!) do (
    if "!INCOMPAT_%%i_VER!"=="%CV_VER%" goto :eof
)

set "IS_COMPAT=0"
if %CV_MAJOR% GTR %MIN_MAJOR% set "IS_COMPAT=1"
if %CV_MAJOR%==%MIN_MAJOR% if %CV_MINOR% GEQ %MIN_MINOR% set "IS_COMPAT=1"

if "%IS_COMPAT%"=="1" (
    set /a COMPAT_COUNT+=1
    set "COMPAT_!COMPAT_COUNT!_CMD=%CV_CMD%"
    set "COMPAT_!COMPAT_COUNT!_VER=%CV_VER%"
) else (
    set /a INCOMPAT_COUNT+=1
    set "INCOMPAT_!INCOMPAT_COUNT!_CMD=%CV_CMD%"
    set "INCOMPAT_!INCOMPAT_COUNT!_VER=%CV_VER%"
)
goto :eof

:check_version_uv
REM Parametros: %~1 = ejecutable, %~2 = version
set "UV_CV_CMD=%~1"
set "UV_CV_VER=%~2"

for /f "tokens=1,2 delims=." %%A in ("%UV_CV_VER%") do (
    set "UV_CV_MAJOR=%%A"
    set "UV_CV_MINOR=%%B"
)

REM Evitar duplicados con sistema
for /L %%i in (1,1,!COMPAT_COUNT!) do (
    if "!COMPAT_%%i_VER!"=="%UV_CV_VER%" goto :eof
)
for /L %%i in (1,1,!UV_COMPAT_COUNT!) do (
    if "!UV_COMPAT_%%i_VER!"=="%UV_CV_VER%" goto :eof
)

set "IS_COMPAT=0"
if %UV_CV_MAJOR% GTR %MIN_MAJOR% set "IS_COMPAT=1"
if %UV_CV_MAJOR%==%MIN_MAJOR% if %UV_CV_MINOR% GEQ %MIN_MINOR% set "IS_COMPAT=1"

if "%IS_COMPAT%"=="1" (
    set /a UV_COMPAT_COUNT+=1
    set "UV_COMPAT_!UV_COMPAT_COUNT!_CMD=%UV_CV_CMD%"
    set "UV_COMPAT_!UV_COMPAT_COUNT!_VER=%UV_CV_VER%"
)
goto :eof

:show_compatible
for /L %%i in (1,1,%COMPAT_COUNT%) do (
    echo    [OK] Python !COMPAT_%%i_VER! - ^(!COMPAT_%%i_CMD!^)
)
goto :eof

:show_incompatible
for /L %%i in (1,1,%INCOMPAT_COUNT%) do (
    echo    [X]  !INCOMPAT_%%i_VER! ^(!INCOMPAT_%%i_CMD!^) - incompatible
)
goto :eof

:show_uv_compatible
for /L %%i in (1,1,%UV_COMPAT_COUNT%) do (
    echo    [%%i] Python !UV_COMPAT_%%i_VER! ^(uv: !UV_COMPAT_%%i_CMD!^)
)
goto :eof

:install_skill
set "SKILL_NAME=%~1"
set "SKILL_PATH=%SKILLS_DIR%\%SKILL_NAME%"
set "REQ_FILE=%SKILL_PATH%\requirements.txt"

echo [INSTALLING] %SKILL_NAME%

if not exist "%REQ_FILE%" (
    echo   [WARN] requirements.txt no encontrado en %SKILL_PATH%. Saltando.
    echo.
    goto :eof
)

if "%INSTALL_METHOD%"=="global" (
    "%PYTHON_CMD%" -m pip install -r "%REQ_FILE%"
)

if "%INSTALL_METHOD%"=="venv" (
    set "VENV_PATH=%SKILL_PATH%\.venv"
    if not exist "!VENV_PATH!" (
        "%PYTHON_CMD%" -m venv "!VENV_PATH!"
    )
    call "!VENV_PATH!\Scripts\activate.bat"
    pip install -r "%REQ_FILE%"
    call deactivate
    echo   Entorno virtual creado en: !VENV_PATH!
)

if "%INSTALL_METHOD%"=="uv" (
    set "VENV_PATH=%SKILL_PATH%\.venv"
    if not exist "!VENV_PATH!" (
        uv venv --python "%PYTHON_CMD%" "!VENV_PATH!"
    )
    uv pip install --python "!VENV_PATH!\Scripts\python.exe" -r "%REQ_FILE%"
    echo   Entorno virtual (uv) creado en: !VENV_PATH!
)

echo   [OK] %SKILL_NAME% instalado correctamente
echo.
goto :eof
