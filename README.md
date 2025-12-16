# 📊 Análisis de Cobertura DECE - Ecuador

Aplicación web interactiva de análisis geoespacial para Departamentos de Consejería Estudiantil (DECE) en Ecuador, con diseño tipo Mapbox profesional.

![Preview](https://img.shields.io/badge/Estado-Producción-brightgreen)
![Data](https://img.shields.io/badge/Datos-16,201_instituciones-blue)
![Tech](https://img.shields.io/badge/Tech-Leaflet_JS-orange)

## ✨ Características Principales

### 🎯 Análisis Automático Completo
- **16,201 instituciones educativas** procesadas
- **6,469 núcleos DECE** identificados (COD_GDECE 3, 4, 5)
- **2,096 satellites** enlazados (COD_GDECE 2, ≤7.5 km)
- **7,636 microsatélites** articulados (COD_GDECE 1)
  - Con conexión a núcleo (≤15 km)
  - Con conexión a satellite (≤10 km)
  - Aislados (sin cobertura cercana)

### 🗺️ Visualización Interactiva
- Mapa oscuro profesional tipo Mapbox
- Capa base Dark y Satellite intercambiables
- Buffers de cobertura de 7.5 km
- Conexiones visuales tipo red entre núcleos y satellites
- Popups informativos con datos detallados

### 📈 Métricas en Tiempo Real
- Total de núcleos y satellites
- Porcentaje de cobertura
- Total de estudiantes
- Top 10 núcleos que absorben más instituciones

### 🎨 Diseño Moderno
- Interfaz oscura estilo Mapbox/GitHub
- Paneles laterales deslizables
- Animaciones suaves y transiciones
- Totalmente responsivo

## 🚀 Uso Inmediato

### Instalación
1. Descargar todos los archivos
2. Colocarlos en la misma carpeta
3. Abrir `index.html` en un navegador moderno

### Archivos Incluidos
```
├── index.html              # Estructura HTML
├── style.css               # Estilos tipo Mapbox
├── app.js                  # Lógica de visualización
└── dece_data_final.js      # Datos precargados (16,201 instituciones)
```

**¡No es necesario cargar ningún archivo Excel!** Los datos están integrados.

## 📊 Datos Incluidos

### Estructura de Datos
Cada institución contiene:
- `lng`, `lat`: Coordenadas geográficas (WGS84)
- `cod`: Código GDECE (1-5)
- `name`: Nombre de la institución
- `dist`: Código del distrito
- `zone`: Zona educativa
- `students`: Número de estudiantes
- `profs`: Número de profesionales DECE

### Clasificación COD_GDECE
- **1**: Microsatélite (articulado a núcleo o satellite) - 7,636 instituciones
- **2**: Satellite (enlazado a núcleo) - 2,096 instituciones
- **3, 4, 5**: Núcleo DECE (principal) - 6,469 instituciones

## 🔬 Metodología de Análisis

### Criterios del Modelo DECE
Según el documento oficial del Ministerio de Educación:

1. **Distancia máxima**: 7.5 km entre núcleo y satellites
2. **Tiempo de desplazamiento**: ≤ 1 hora en transporte regular
3. **Acceso**: Existencia de medios de transporte
4. **Razón estudiantes/profesional**: Máximo 450 estudiantes por profesional

### Sistema de Microsatélites (Innovación)
Para las 7,636 instituciones COD_GDECE 1, se implementó un sistema de articulación flexible:

**Nivel 1 - Conexión a Núcleo (prioritaria)**
- Distancia: ≤ 15 km al núcleo más cercano
- Color: Amarillo/dorado (#d29922)
- Línea de conexión: Amarilla punteada
- Integran estadísticas del núcleo

**Nivel 2 - Conexión a Satellite (alternativa)**
- Distancia: ≤ 10 km al satellite más cercano
- Color: Naranja (#f0883e)
- Línea de conexión: Naranja punteada
- No integran estadísticas (satellite no es núcleo)

**Nivel 3 - Aislados (sin cobertura)**
- Sin núcleo ni satellite en radio definido
- Color: Gris (#6e7681)
- Sin línea de conexión
- Requieren atención especial

Esta estrategia permite:
- ✅ Cobertura universal (todas las instituciones tienen visibilidad)
- ✅ Priorización de recursos (3 niveles de urgencia)
- ✅ Identificación de brechas geográficas
- ✅ Planificación de expansión de servicios DECE

### Proceso de Análisis
```
1. Identificar Núcleos (COD 3,4,5)
   ↓
2. Generar buffers de 7.5 km
   ↓
3. Identificar Satellites (COD 2)
   ↓
4. Asignar satellites a núcleos (Haversine ≤7.5 km)
   ↓
5. Identificar Microsatélites (COD 1)
   ↓
6. Articular microsatélites:
   a) Prioridad: Núcleo ≤15 km
   b) Alternativa: Satellite ≤10 km
   c) Aislado: Sin cobertura
   ↓
7. Calcular métricas de cobertura
   ↓
8. Visualizar red completa de articulación
```

### Algoritmos Utilizados
- **Haversine**: Cálculo de distancias geodésicas
- **Nearest Neighbor**: Asignación de satellites a núcleos
- **Buffer Analysis**: Generación de áreas de cobertura de 7.5 km

## 🎛️ Funcionalidades

### Panel de Estadísticas
- **Núcleos DECE**: Cantidad total de instituciones principales
- **Satellites**: Instituciones enlazadas
- **Cobertura**: Porcentaje de satellites dentro de 7.5 km de algún núcleo
- **Estudiantes**: Suma total de estudiantes

### Panel de Leyenda
- **Símbolos**: Explicación de núcleos, satellites, buffers y conexiones
- **Controles de Capas**: Toggle para mostrar/ocultar elementos
  - Buffers de 7.5 km
  - Conexiones núcleo-satellite
  - Marcadores de núcleos
  - Marcadores de satellites

### Top 10 Núcleos
Lista interactiva de los núcleos que absorben más satellites:
- Clic en cualquier elemento para volar a su ubicación
- Muestra distrito, estudiantes y profesionales necesarios

### Popups Informativos

**Núcleos:**
- Nombre de la institución
- Distrito y zona
- Número de satellites conectados
- Total de estudiantes (núcleo + satellites)
- Profesionales necesarios vs actuales
- Déficit de profesionales

**Satellites:**
- Nombre de la institución
- Estado de cobertura (✓/✗)
- Núcleo asignado
- Distancia al núcleo
- Número de estudiantes

## 🎨 Diseño y UX

### Paleta de Colores
- **Núcleos**: Rojo (`#f85149`) con glow
- **Satellites**: Azul (`#58a6ff`) con glow
- **Buffers**: Rojo transparente
- **Conexiones**: Gradiente rojo-azul

### Mapas Base
1. **Dark** (por defecto): CartoDB Dark Matter
2. **Satellite**: Esri World Imagery

### Interacciones
- Hover sobre elementos para destacar
- Clic en marcadores para ver popups
- Clic en top nucleos para volar a ubicación
- Zoom con scroll o controles
- Pan arrastrando el mapa

## 🛠️ Tecnologías

### Frontend
- **HTML5**: Estructura semántica
- **CSS3**: Variables CSS, Flexbox, Grid, Animations
- **JavaScript ES6+**: Módulos, Arrow Functions, Map/Set

### Librerías
- **Leaflet.js 1.9.4**: Mapas interactivos
- **CartoDB**: Tiles oscuros
- **Esri**: Imágenes satelitales

### Optimizaciones
- Canvas rendering para mejor performance
- Datos precargados (sin fetch)
- Feature groups para manejo eficiente de capas
- CSS animations con GPU acceleration

## 📐 Cálculos Técnicos

### Conversión de Coordenadas
```
UTM Zone 17S (EPSG:32717) → WGS84 (EPSG:4326)
```

### Fórmula Haversine
```javascript
R = 6371000 // Radio de la Tierra en metros
a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
c = 2 × atan2(√a, √(1−a))
d = R × c // Distancia en metros
```

### Profesionales Necesarios
```javascript
profesionales = ceil(totalEstudiantes / 450)
deficit = profesionales - profesionalesActuales
```

## 📊 Estadísticas del Dataset

```
Total instituciones:     16,201
├─ Núcleos (3,4,5):      6,469 (39.9%)
├─ Satellites (2):       2,096 (12.9%)
└─ Microsatélites (1):   7,636 (47.1%)
    ├─ → Núcleo:         ~4,500 (≤15 km)
    ├─ → Satellite:      ~2,000 (≤10 km)
    └─ Aislados:         ~1,136 (sin cobertura)

Cobertura:
├─ Satellites:           ~85% cubiertos (≤7.5 km)
├─ Microsatélites:       ~85% articulados (≤15 km)
└─ Cobertura total:      ~92% de instituciones conectadas

Radios de cobertura:
├─ Núcleo → Buffer:      7.5 km (área primaria)
├─ Núcleo → Micro:       15 km (área extendida)
└─ Satellite → Micro:    10 km (área alternativa)
```

## 🔧 Personalización

### Modificar Radio de Cobertura
En `app.js`, línea 9:
```javascript
const BUFFER_RADIUS_M = 7500; // Cambiar a metros deseados
```

### Modificar Razón de Profesionales
En `app.js`, función `createNucleoPopup`:
```javascript
const profesionalesNecesarios = Math.ceil(stats.totalStudents / 450);
// Cambiar 450 al divisor deseado
```

### Modificar Colores
En `style.css`, variables CSS:
```css
--accent-red: #f85149;    /* Núcleos */
--accent-blue: #58a6ff;   /* Satellites */
```

### Cambiar Centro del Mapa
En `app.js`, línea 10:
```javascript
const ECUADOR_CENTER = [-1.831239, -78.183406]; // [lat, lng]
```

## 🌐 Compatibilidad

### Navegadores Soportados
- ✅ Chrome/Edge 90+ (Recomendado)
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

### Dispositivos
- 💻 Desktop (óptimo)
- 📱 Tablet (adaptado)
- 📱 Mobile (funcional)

## 📝 Notas Técnicas

### Performance
- Renderiza 16,201 instituciones sin lag
- Uso de `preferCanvas: true` para mejor rendimiento
- Feature groups para gestión eficiente de capas
- Lazy loading de popups

### Seguridad
- Sin llamadas a servidor externo (excepto tiles)
- Datos locales embebidos
- No se envía información a terceros

### Datos
- Fuente: Ministerio de Educación de Ecuador
- Corte: 2024-2025
- Coordenadas: UTM Zone 17S convertidas a WGS84
- Precisión: 6 decimales (~0.11 metros)

## 🤝 Créditos

Desarrollado para el análisis de cobertura DECE del Ministerio de Educación de Ecuador.

**Metodología basada en:**
- Documento: "Metodología para el Análisis de Cobertura de Instituciones Educativas mediante Unidades Móviles"
- Modelo de Gestión DECE
- Criterios de conformación de núcleos DECE

## 📄 Licencia

Este proyecto fue desarrollado para uso interno del Ministerio de Educación de Ecuador.

---

**Última actualización**: Diciembre 2024  
**Versión**: 2.0 (Mapbox Style)  
**Datos**: 16,201 instituciones educativas
