# DECE Optimizer v6.0 - Enhanced

Sistema de optimización de cobertura para Departamentos de Consejería Estudiantil (DECE) en Ecuador.

## 🚀 Nuevas Funcionalidades (v6.0)

### 📤 Exportar Resultados
- **Excel (.xlsx)**: Exporta con múltiples hojas (Resumen, Buffers, Instituciones)
- **CSV (.csv)**: Datos tabulares para análisis
- **JSON (.json)**: Formato estructurado para integraciones

### 🔗 Spatial Join Completo
La exportación incluye:
- Número total de buffers exportados
- Cantidad de AMIEs (código único de instituciones) dentro de cada buffer
- Clasificación Núcleo vs Satélite
- Estudiantes por buffer
- Distancia de cada institución al centro del buffer
- Métricas de cobertura

### 🎯 Animaciones Mejoradas
- Líneas animadas conectando núcleos con satélites
- Se actualizan automáticamente al mover/crear buffers
- Visualización del flujo de cobertura

### 💬 Popups Dinámicos
- Click en cualquier buffer muestra métricas detalladas
- Información actualizada en tiempo real
- Lista de instituciones dentro del buffer

## 📋 Uso

### Botones de la Barra Superior

| Botón | Función |
|-------|---------|
| 🖊️ Editar Buffers | Activa modo arrastrar buffers |
| ➕ Añadir Buffers | Crea buffers personalizados con click |
| 💾 Guardar Cambios | Persiste cambios en localStorage |
| 🔧 Completar Cobertura | Crea buffers automáticos para cubrir satélites |
| 📤 Exportar | Abre modal de exportación |

### Flujo de Trabajo

1. **Visualizar**: Explora el mapa con núcleos (verde) y satélites (azul/rojo)
2. **Editar**: Activa modo edición y arrastra buffers para optimizar
3. **Añadir**: Crea buffers personalizados donde se necesiten
4. **Completar**: Usa "Completar Cobertura" para cubrir satélites sin buffer
5. **Guardar**: Persiste los cambios
6. **Exportar**: Descarga los resultados en Excel/CSV/JSON

## 📊 Estructura de Exportación

### Excel (3 hojas)

**Hoja "Resumen":**
- Fecha de exportación
- Métricas globales (buffers, AMIEs, cobertura)

**Hoja "Buffers":**
- ID, Nombre, Tipo, Coordenadas
- Total de instituciones cubiertas
- Núcleos y satélites por buffer
- Estudiantes totales

**Hoja "Instituciones":**
- Detalle de cada institución por buffer
- AMIE, nombre, tipo, coordenadas
- Distancia al centro del buffer
- Número de estudiantes

## 🗂️ Archivos del Proyecto

```
DECE-main/
├── index.html          # Interfaz principal
├── app.js              # Lógica de la aplicación
├── style.css           # Estilos
├── DECE_CRUCE_X_Y_NUC_SAT.csv  # Datos de instituciones
├── README.md           # Este archivo
└── GUIA-VISUAL.md      # Guía visual detallada
```

## 🛠️ Tecnologías

- **Leaflet.js**: Mapas interactivos
- **PapaParse**: Procesamiento de CSV
- **SheetJS (XLSX)**: Exportación a Excel
- **LocalStorage**: Persistencia de cambios

## 📝 Códigos GDECE

| Código | Tipo | Descripción |
|--------|------|-------------|
| 2 | Satélite | Instituciones de 51-120 estudiantes |
| 3 | Núcleo | Instituciones de 121-450 estudiantes |
| 4 | Núcleo | Instituciones de 451-675 estudiantes |
| 5 | Núcleo | Instituciones > 675 estudiantes |

## 📄 Licencia

Proyecto desarrollado para el Ministerio de Educación del Ecuador.
