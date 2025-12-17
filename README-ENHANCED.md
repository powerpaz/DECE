# DECE Coverage App - Versión Mejorada v5.0

## 🎯 Nuevas Funcionalidades

### ✅ Buffers Visibles y Configurables
- Los buffers ahora son **visibles** con mejor opacidad (0.08) para no ocultar información
- Colores: **azul** en modo normal, **naranja** en modo edición

### ✅ Modo de Edición con Botón Lápiz
- **Nuevo botón "Editar Buffers"** en la barra superior
- Al activarlo, los buffers se vuelven **arrastrables**
- Puedes mover libremente cada buffer para absorber más instituciones educativas

### ✅ Métricas en Tiempo Real
- **Click en un buffer** para ver métricas detalladas
- El panel muestra:
  - 🎯 **Número de IEs** cubiertas dentro del buffer
  - 👥 **Total de estudiantes**
  - 👨‍🏫 **Profesores necesarios** (ratio: 1 profesor cada 450 estudiantes)
  - 📏 **Radio del buffer**
  - 📋 **Lista completa** de instituciones educativas cubiertas

### ✅ Actualización Dinámica al Arrastrar
- Las métricas se **actualizan en tiempo real** mientras arrastras el buffer
- Puedes ver inmediatamente cuántas IEs nuevas capturas al mover el buffer

### ✅ Restaurar Posición
- Botón para **restaurar la posición original** del buffer
- No afecta la lógica ni los cálculos del resto de la aplicación

## 🚀 Cómo Usar

### 1. Instalación
```bash
# Simplemente abre el archivo index-enhanced.html en un navegador
# No requiere servidor, funciona localmente
```

### 2. Activar Modo de Edición
1. Haz click en el botón **"Editar Buffers"** (ícono de lápiz) en la barra superior
2. Los buffers cambiarán a **color naranja** indicando que están editables
3. El cursor cambiará a "move" al pasar sobre un buffer

### 3. Mover un Buffer
1. **Click y mantén presionado** sobre un buffer (círculo naranja)
2. **Arrastra** el buffer a la nueva posición deseada
3. **Suelta** para colocar el buffer en la nueva ubicación
4. Verás una **notificación** con las nuevas coordenadas

### 4. Ver Métricas Detalladas
1. Con el modo de edición activado, haz **click** en un buffer
2. Se abrirá un **panel lateral derecho** con:
   - Nombre del núcleo DECE
   - Coordenadas originales y actuales
   - Métricas (IEs, estudiantes, profesores)
   - Lista de todas las instituciones cubiertas con distancias

### 5. Restaurar Posición Original
1. En el panel de métricas, haz click en **"↺ Restaurar Posición Original"**
2. El buffer volverá a su posición inicial (núcleo DECE)

### 6. Desactivar Modo de Edición
1. Haz click nuevamente en el botón **"Editar Buffers"**
2. Los buffers volverán a **color azul** y no serán arrastrables

## 📊 Características Técnicas

### Sin Afectar la Lógica Original
- Los cambios de posición son **locales y visuales**
- La lógica de optimización (Set Cover Greedy) no se modifica
- Los cálculos originales se mantienen intactos
- Puedes restaurar en cualquier momento

### Rendimiento Optimizado
- Uso de **Leaflet Canvas Renderer** para mejor rendimiento
- Indexación espacial con **grillas** para cálculos rápidos
- Actualización eficiente de métricas en tiempo real
- Manejo de miles de instituciones educativas sin lag

### Datos Calculados
- **Distancia**: Fórmula de Haversine (distancia real en metros)
- **Profesores**: Ratio de 1 profesor cada 450 estudiantes
- **Tiempo estimado**: Basado en 30 km/h promedio

## 📁 Archivos Incluidos

```
DECE-enhanced/
├── index-enhanced.html        # HTML mejorado con botón de edición
├── app-enhanced.js            # JavaScript con funcionalidad de arrastre
├── style-enhanced.css         # CSS con estilos para panel de métricas
├── DECE_CRUCE_X_Y_NUC_SAT.csv  # Datos de instituciones
├── vias_principales.geojson   # (Opcional) Vías principales
└── README.md                  # Este archivo
```

## 🎨 Interfaz Visual

### Colores
- **Azul (#58a6ff)**: Buffers en modo normal
- **Naranja (#f0883e)**: Buffers en modo edición
- **Verde (#3fb950)**: IEs cubiertas / Núcleos activos
- **Rojo (#f85149)**: IEs sin cobertura

### Iconos
- 🖊️ **Botón lápiz**: Activar/desactivar modo edición
- 🎯 **IEs cubiertas**: Número de instituciones en el buffer
- 👥 **Estudiantes**: Total de estudiantes
- 👨‍🏫 **Profesores**: Cantidad necesaria
- 📏 **Radio**: Tamaño del buffer

## 🔧 Configuración

### Parámetros Ajustables en `app-enhanced.js`

```javascript
// Radio del buffer (metros)
const BUFFER_RADIUS_M = 7500;

// Política de selección de buffers
const BUFFER_SELECTION_POLICY = "cover"; // 'cover' | 'used' | 'top'

// Cobertura objetivo
const TARGET_COVERAGE = 0.97; // 95-98% recomendado

// Máximo de buffers
const MAX_BUFFERS = 220;

// Mínimo de satélites por buffer
const MIN_SATS_PER_BUFFER = 3;

// Velocidad asumida para cálculo de tiempo
const ASSUMED_SPEED_KMH = 30;
```

## 🐛 Solución de Problemas

### Los buffers no se ven
- Verifica que el toggle "Buffers (7.5 km)" esté activado en el panel izquierdo
- La opacidad por defecto es baja (0.08) - esto es intencional para no ocultar información

### No puedo arrastrar los buffers
- Asegúrate de que el modo de edición esté **activado** (botón naranja)
- Verifica que estés haciendo click **directamente sobre un buffer**

### Las métricas no se actualizan
- Cierra y vuelve a abrir el panel de métricas
- Desactiva y reactiva el modo de edición

### El CSV no carga
- Verifica que `DECE_CRUCE_X_Y_NUC_SAT.csv` esté en la misma carpeta
- Abre la consola del navegador (F12) para ver errores
- El archivo debe tener las columnas: LAT, LON, COD_GDECE, NOMBRE_IE, etc.

## 📝 Notas Importantes

1. **Los cambios de posición NO se guardan** - son solo visuales durante la sesión
2. **Refresca la página** para volver a la configuración original
3. **Puedes tener múltiples buffers** abiertos en el panel de métricas
4. **La lógica de optimización original** no se modifica con los movimientos

## 🚀 Próximas Mejoras Sugeridas

- [ ] Guardar posiciones personalizadas en localStorage
- [ ] Exportar configuración de buffers a JSON
- [ ] Cambiar radio del buffer de forma dinámica
- [ ] Modo de múltiple selección de buffers
- [ ] Historial de cambios (undo/redo)
- [ ] Análisis de impacto al mover buffers

## 📞 Soporte

Para preguntas o problemas, revisa:
1. La consola del navegador (F12)
2. Este README
3. Los comentarios en el código fuente

## 🎉 ¡Listo para Usar!

Abre `index-enhanced.html` en tu navegador favorito y comienza a optimizar la cobertura de los DECE de Ecuador.

---

**Versión**: 5.0 Enhanced  
**Fecha**: Diciembre 2024  
**Compatibilidad**: Chrome, Firefox, Edge, Safari (últimas versiones)
