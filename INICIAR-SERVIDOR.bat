@echo off
echo ========================================
echo  DECE Optimizer v7.0 - Servidor Local
echo ========================================
echo.
echo Iniciando servidor en puerto 8000...
echo.

REM Intenta Python 3 primero
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Usando Python...
    echo.
    echo Abre tu navegador en: http://localhost:8000
    echo.
    echo Presiona Ctrl+C para detener el servidor
    echo.
    python -m http.server 8000
) else (
    echo Python no encontrado. Intentando Node.js...
    echo.
    
    REM Intenta npx si Python no está disponible
    npx --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo Usando Node.js...
        echo.
        echo Abre tu navegador en: http://localhost:8000
        echo.
        echo Presiona Ctrl+C para detener el servidor
        echo.
        npx http-server -p 8000
    ) else (
        echo.
        echo ERROR: No se encontro Python ni Node.js
        echo.
        echo Instala Python desde: https://www.python.org/downloads/
        echo O Node.js desde: https://nodejs.org/
        echo.
        pause
    )
)
