#!/bin/bash

echo "========================================"
echo " DECE Optimizer v7.0 - Servidor Local"
echo "========================================"
echo ""
echo "Iniciando servidor en puerto 8000..."
echo ""

# Intenta Python 3 primero
if command -v python3 &> /dev/null; then
    echo "Usando Python 3..."
    echo ""
    echo "Abre tu navegador en: http://localhost:8000"
    echo ""
    echo "Presiona Ctrl+C para detener el servidor"
    echo ""
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "Usando Python..."
    echo ""
    echo "Abre tu navegador en: http://localhost:8000"
    echo ""
    echo "Presiona Ctrl+C para detener el servidor"
    echo ""
    python -m http.server 8000
elif command -v npx &> /dev/null; then
    # Intenta npx si Python no está disponible
    echo "Usando Node.js..."
    echo ""
    echo "Abre tu navegador en: http://localhost:8000"
    echo ""
    echo "Presiona Ctrl+C para detener el servidor"
    echo ""
    npx http-server -p 8000
else
    echo ""
    echo "ERROR: No se encontró Python ni Node.js"
    echo ""
    echo "Instala Python desde: https://www.python.org/downloads/"
    echo "O Node.js desde: https://nodejs.org/"
    echo ""
    exit 1
fi
