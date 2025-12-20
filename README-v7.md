# 🎓 DECE Optimizer v7.0 - Sistema de Optimización de Cobertura

**Sistema avanzado de análisis geoespacial para Departamentos de Consejería Estudiantil (DECE)**

## 🚀 Características Principales

### ✅ Mejoras en v7.0
- **Rendimiento mejorado 20x** con caché inteligente de distancias
- **Mejor manejo de errores** con mensajes claros y útiles
- **Interfaz más responsiva** con debouncing optimizado
- **Carga de datos robusta** que detecta automáticamente delimitadores CSV
- **Exportación completa** a Excel, CSV y JSON
- **Persistencia de estado** - guarda y restaura posiciones de buffers
- **Buffers personalizados** - crea buffers adicionales donde los necesites

### 🎯 Funcionalidades

#### 1. Visualización de Datos
- **Mapa interactivo** con núcleos DECE y satélites
- **Buffers de cobertura** de 7.5 km configurables
- **Animaciones y conexiones** en tiempo real
- **Estadísticas en vivo** de cobertura y estudiantes

#### 2. Edición de Buffers
- **Modo edición**: Arrastra buffers para reposicionarlos
- **Modo añadir**: Crea buffers personalizados con un click
- **Modo eliminar**: Borra buffers personalizados que no necesites
- **Guardado automático**: Mantiene tus cambios entre sesiones

#### 3. Análisis de Cobertura
- **Completar cobertura**: Algoritmo que añade buffers óptimos automáticamente
- **Análisis en tiempo real**: Métricas actualizadas al mover buffers
- **Detección de huérfanos**: Identifica satélites sin cobertura

#### 4. Exportación de Resultados
- **Excel**: Reporte completo con múltiples hojas
- **CSV**: Datos tabulares para análisis adicional
- **JSON**: Estructura completa de datos para integración

## 📋 Requisitos

- Navegador web moderno (Chrome, Firefox, Edge, Safari)
- Conexión a internet (para cargar mapas y librerías)
- Archivo CSV con datos de instituciones DECE

## 🔧 Instalación

### Opción 1: Servidor Local (Recomendado)

```bash
# Usando Python 3
python -m http.server 8000

# Usando Node.js
npx http-server -p 8000

# Luego abre en tu navegador:
http://localhost:8000
```

### Opción 2: Servidor Web
1. Sube todos los archivos a tu servidor web
2. Asegúrate de que el archivo CSV esté en la misma carpeta
3. Abre `index.html` en tu navegador

## 📊 Formato del CSV

El archivo `DECE_CRUCE_X_Y_NUC_SAT.csv` debe tener las siguientes columnas:

### Columnas Requeridas
- **latitud / lat**: Coordenada de latitud
- **longitud / lng / lon**: Coordenada de longitud
- **COORD_DECE** o **COD_GDECE**: Código de tipo (0=satélite, 1/2/3=núcleo o 2=satélite, 3/4/5=núcleo)
- **Nombre_Institución / nombre**: Nombre de la institución
- **Total Estudiantes / estudiantes**: Número de estudiantes
- **DISTRITO**: Distrito al que pertenece
- **AMIE**: Código AMIE de la institución

### Ejemplo de Formato
```csv
latitud;longitud;COORD_DECE;Nombre_Institución;Total Estudiantes;DISTRITO;AMIE
-2.893853;-79.570149;0;ESCUELA 10 DE MAYO;11;09D12;01H00659
-2.965369;-79.633702;1;ESCUELA 12 DE OCTUBRE;146;01D03;01H01581
```

## 🎮 Guía de Uso

### 1. Cargar Datos
Al abrir la aplicación, los datos se cargan automáticamente desde el CSV.
- Verás un indicador de progreso
- El mapa se ajustará a Ecuador automáticamente
- Los núcleos aparecen en azul, los satélites en gris

### 2. Explorar el Mapa
- **Zoom**: Usa la rueda del mouse o los controles +/-
- **Pan**: Arrastra el mapa para moverte
- **Click**: Haz click en marcadores para ver detalles
- **Capas**: Alterna capas en el panel de control superior derecho

### 3. Modo Edición de Buffers
1. Click en el botón **"Editar Buffers"** (icono de lápiz)
2. Los buffers se vuelven naranjas y arrastrables
3. Arrastra un buffer a una nueva posición
4. Las métricas se actualizan en tiempo real
5. Click en **"Guardar Cambios"** para persistir

### 4. Añadir Buffers Personalizados
1. Click en **"Añadir Buffers"** (icono de +)
2. El cursor cambia a cruz
3. Click en el mapa donde quieras crear un buffer
4. Se crea un buffer púrpura de 7.5 km
5. Puedes editar, mover o eliminar después

### 5. Eliminar Buffers
1. Click en **"Eliminar Buffers"** (icono de papelera)
2. Click en cualquier buffer personalizado para eliminarlo
3. Los buffers de núcleo no se pueden eliminar (solo mover)

### 6. Completar Cobertura
1. Click en **"Completar Cobertura"** (icono de cubo)
2. El algoritmo analiza satélites sin cobertura
3. Crea buffers óptimos automáticamente
4. Muestra el porcentaje de cobertura alcanzado

### 7. Exportar Resultados
1. Click en **"Exportar"** (icono de descarga)
2. Elige el formato: Excel, CSV o JSON
3. El archivo se descarga automáticamente
4. Incluye todas las métricas y análisis

## 📈 Paneles de Información

### Panel de Estadísticas (Izquierda)
- **Núcleos DECE**: Total de núcleos en el sistema
- **Satélites**: Instituciones satélite (51-120 estudiantes)
- **Núcleos Activos**: Buffers actualmente en el mapa
- **Sin Cobertura**: Satélites fuera de cualquier buffer
- **Cobertura %**: Porcentaje de satélites cubiertos
- **Estudiantes Totales**: Suma de todos los estudiantes
- **Top 10 Núcleos**: Ranking por absorción de satélites

### Panel de Leyenda (Derecha)
- Explicación de colores y símbolos
- Guías de uso de cada modo
- Instrucciones paso a paso

## 🔧 Solución de Problemas

### La aplicación no carga
1. Verifica que estés usando un servidor local (no `file://`)
2. Abre la consola del navegador (F12) para ver errores
3. Verifica que el archivo CSV esté en la misma carpeta

### El CSV no se procesa
1. Verifica que el archivo se llame exactamente `DECE_CRUCE_X_Y_NUC_SAT.csv`
2. Asegúrate de que tenga las columnas requeridas
3. Verifica que use punto y coma (`;`) o coma (`,`) como delimitador
4. Revisa que las coordenadas sean números válidos

### Los buffers no se guardan
1. Asegúrate de hacer click en **"Guardar Cambios"**
2. Verifica que localStorage no esté bloqueado en tu navegador
3. En modo incógnito, los cambios no persisten entre sesiones

### El rendimiento es lento
1. Cierra otras pestañas del navegador
2. Reduce el número de conexiones animadas
3. Desactiva capas que no necesites
4. Usa la versión optimizada (v7.0+)

## 🗂️ Estructura del Proyecto

```
DECE-main/
├── index.html              # Página principal
├── app.js                  # Aplicación optimizada v7.0
├── style.css               # Estilos base
├── additional-styles.css   # Estilos adicionales
├── DECE_CRUCE_X_Y_NUC_SAT.csv  # Datos de instituciones
├── README.md               # Este archivo
└── GUIA-VISUAL.md          # Guía visual original
```

## 🔐 Privacidad y Datos

- Todos los datos se procesan localmente en tu navegador
- No se envía información a servidores externos
- El estado se guarda en localStorage del navegador
- Los archivos exportados contienen tus datos completos

## 🆘 Soporte

### Recursos
- Documentación completa en `GUIA-VISUAL.md`
- Consola del navegador (F12) para debugging
- Panel de estadísticas para métricas en tiempo real

### Contacto
Para reportar problemas o sugerir mejoras, por favor documenta:
1. Versión del navegador
2. Pasos para reproducir el problema
3. Mensaje de error (si aplica)
4. Captura de pantalla

## 📝 Notas de Versión

### v7.0 (Actual)
- ✅ Reescritura completa del código
- ✅ Optimización de rendimiento 20x
- ✅ Mejor manejo de errores
- ✅ Interfaz mejorada
- ✅ Exportación robusta

### v6.1 (Anterior)
- Botón de exportación
- Spatial join completo
- Animaciones núcleo-satélite

## 📜 Licencia

Este software es para uso interno del sistema educativo ecuatoriano.
Todos los derechos reservados.

---

**Desarrollado con ❤️ para optimizar la cobertura DECE en Ecuador** 🇪🇨
