# 🎯 DECE Coverage App - Versión Mejorada

## 📦 Archivos Incluidos

```
✅ index.html                    - Página principal (USAR ESTE)
✅ app.js                        - Lógica de la aplicación
✅ style.css                     - Estilos
✅ DECE_CRUCE_X_Y_NUC_SAT.csv   - Datos de instituciones
📖 README.md                     - Este archivo
📖 GUIA-VISUAL.md               - Guía visual de uso
```

## 🚀 Instalación Rápida

### Opción 1: Local (Simple)
1. Descarga todos los archivos
2. Colócalos en la **misma carpeta**
3. Abre `index.html` en tu navegador
4. ¡Listo!

### Opción 2: Servidor Web
1. Sube todos los archivos a tu servidor
2. Asegúrate de que estén en la misma carpeta
3. Abre `index.html` desde tu navegador

## ✨ Nuevas Funcionalidades

### 1️⃣ Modo de Edición de Buffers
- Click en **"Editar Buffers"** (botón lápiz) en la barra superior
- Los buffers cambian a **color naranja** 🟠
- Ahora son **arrastrables**

### 2️⃣ Mover Buffers
- Con el modo edición activado
- **Click y arrastra** cualquier buffer naranja
- Muévelo libremente por el mapa
- Suelta para fijar la nueva posición

### 3️⃣ Ver Métricas
- **Click** en un buffer para abrir panel de métricas
- Muestra:
  - 🎯 Número de IEs cubiertas
  - 👥 Total de estudiantes  
  - 👨‍🏫 Profesores necesarios
  - 📋 Lista de instituciones con distancias

### 4️⃣ Actualización en Tiempo Real
- Al arrastrar un buffer, las métricas se actualizan automáticamente
- Ves inmediatamente cuántas IEs nuevas capturas

### 5️⃣ Restaurar Posición
- En el panel de métricas
- Click en **"↺ Restaurar Posición Original"**
- El buffer vuelve a su ubicación inicial

## 🎮 Uso Paso a Paso

```
1. Abre index.html
   ↓
2. Click en "Editar Buffers" (botón lápiz)
   ↓
3. Arrastra un buffer naranja
   ↓
4. Click en el buffer para ver métricas
   ↓
5. Ajusta la posición según necesites
   ↓
6. Restaura o mantén la nueva posición
```

## 🎨 Indicadores Visuales

| Color | Significado |
|-------|-------------|
| 🔵 Azul | Buffer en modo normal |
| 🟠 Naranja | Buffer en modo edición (arrastrables) |
| 🟢 Verde | IEs cubiertas / Núcleos activos |
| 🔴 Rojo | IEs sin cobertura |

## ⚙️ Requisitos

- ✅ Navegador moderno (Chrome, Firefox, Edge, Safari)
- ✅ JavaScript habilitado
- ✅ Conexión a internet (para cargar librerías: Leaflet, PapaParse)
- ✅ Archivo CSV en la misma carpeta

## 🐛 Solución de Problemas

### ❌ "No se ven los buffers"
- Verifica que el toggle "Buffers (7.5 km)" esté activado
- Los buffers tienen baja opacidad por diseño (para no ocultar info)

### ❌ "No puedo arrastrar los buffers"
- Asegúrate de activar el modo edición (botón lápiz)
- El botón debe estar naranja/activado

### ❌ "No carga el CSV"
- Verifica que `DECE_CRUCE_X_Y_NUC_SAT.csv` esté en la misma carpeta
- Abre la consola (F12) para ver errores

### ❌ "Las métricas no se actualizan"
- Cierra y reabre el panel de métricas
- Desactiva y reactiva el modo edición

## 📊 Configuración Avanzada

Puedes editar parámetros en `app.js`:

```javascript
// Línea 28: Radio del buffer (metros)
const BUFFER_RADIUS_M = 7500;

// Línea 36: Cobertura objetivo
const TARGET_COVERAGE = 0.97;

// Línea 38: Máximo de buffers
const MAX_BUFFERS = 220;

// Línea 49: Velocidad para cálculo de tiempo
const ASSUMED_SPEED_KMH = 30;
```

## 📖 Más Información

- Lee `GUIA-VISUAL.md` para ver ejemplos visuales
- Los cambios de posición NO se guardan (solo durante la sesión)
- Refresca la página para volver a la configuración original

## 🎉 ¡Listo para Usar!

Simplemente abre `index.html` y comienza a optimizar la cobertura de los DECE.

---

**Versión**: 5.0  
**Última actualización**: Diciembre 2024
