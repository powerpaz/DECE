#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              🚀 SERVIDOR LOCAL PARA DECE OPTIMIZER           ║
║                                                               ║
║  Este script inicia un servidor HTTP simple para que         ║
║  puedas abrir la aplicación DECE sin problemas de CORS       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

USO:
  python servidor.py
  
  Luego abre en tu navegador:
  http://localhost:8000

REQUISITOS:
  - Python 3.x (viene preinstalado en Mac/Linux)
  - Para Windows: descarga desde python.org
"""

import http.server
import socketserver
import os
import sys
import webbrowser
from pathlib import Path

# Configuración
PORT = 8000
DIRECTORY = Path(__file__).parent

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Handler personalizado con headers CORS y mejor logging"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def end_headers(self):
        # Agregar headers CORS para evitar problemas
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
    
    def log_message(self, format, *args):
        """Log mejorado con colores"""
        message = format % args
        
        # Colores para diferentes tipos de request
        if "200" in message:
            color = "\033[92m"  # Verde
        elif "304" in message:
            color = "\033[94m"  # Azul
        elif "404" in message:
            color = "\033[93m"  # Amarillo
        else:
            color = "\033[91m"  # Rojo
        
        reset = "\033[0m"
        
        print(f"{color}[{self.log_date_time_string()}] {message}{reset}")

def find_available_port(start_port=8000, max_tries=10):
    """Encuentra un puerto disponible"""
    for port in range(start_port, start_port + max_tries):
        try:
            with socketserver.TCPServer(("", port), CustomHTTPRequestHandler) as test_server:
                return port
        except OSError:
            continue
    return None

def main():
    """Función principal"""
    
    # Banner
    print("\n" + "="*70)
    print("🚀  SERVIDOR LOCAL DECE OPTIMIZER")
    print("="*70 + "\n")
    
    # Verificar que el archivo CSV existe
    csv_path = DIRECTORY / "DECE_CRUCE_X_Y_NUC_SAT.csv"
    if not csv_path.exists():
        print("⚠️  ADVERTENCIA: No se encontró DECE_CRUCE_X_Y_NUC_SAT.csv")
        print(f"   Buscando en: {csv_path}")
        print("   La aplicación no funcionará sin este archivo.\n")
    else:
        csv_size = csv_path.stat().st_size / (1024 * 1024)  # MB
        print(f"✅  CSV encontrado: {csv_size:.2f} MB\n")
    
    # Verificar archivos HTML
    html_files = list(DIRECTORY.glob("*.html"))
    if html_files:
        print(f"📄  Archivos HTML disponibles:")
        for html_file in html_files:
            print(f"   - {html_file.name}")
        print()
    
    # Encontrar puerto disponible
    port = find_available_port(PORT)
    if port is None:
        print(f"❌  No se pudo encontrar un puerto disponible entre {PORT} y {PORT + 10}")
        sys.exit(1)
    
    # Crear servidor
    try:
        with socketserver.TCPServer(("", port), CustomHTTPRequestHandler) as httpd:
            url = f"http://localhost:{port}"
            
            print(f"🌐  Servidor iniciado en: {url}")
            print(f"📁  Sirviendo archivos desde: {DIRECTORY}")
            print(f"\n{'='*70}")
            print(f"\n🎯  ABRE EN TU NAVEGADOR:")
            print(f"\n   {url}/index-mejorado.html  (versión mejorada)")
            print(f"   {url}/index.html            (versión original)")
            print(f"\n{'='*70}")
            print(f"\n💡  Presiona Ctrl+C para detener el servidor\n")
            
            # Abrir navegador automáticamente
            try:
                print("🔄  Abriendo navegador...")
                webbrowser.open(f"{url}/index-mejorado.html")
            except:
                pass
            
            # Iniciar servidor
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n\n🛑  Servidor detenido por el usuario")
        print("👋  ¡Hasta luego!\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌  Error al iniciar servidor: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
