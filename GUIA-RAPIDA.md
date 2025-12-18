# DECE v7.0 FINAL - GUÍA RÁPIDA ⚡

## 🚀 USO INMEDIATO

### **Botones Principales (en orden):**

1. **📝 Editar** 
   - Click en el botón
   - ARRASTRA buffers con el mouse
   - Se mueven libremente
   - Click de nuevo para desactivar

2. **➕ Añadir**
   - Click en el botón
   - CLICK en el mapa donde quieras el buffer
   - Se crea buffer morado
   - Click de nuevo para desactivar

3. **🗑️ Eliminar**
   - Click en el botón
   - CLICK en buffer que quieras borrar
   - O presiona **SUPR** o **DELETE** después de seleccionar
   - Confirma y listo

4. **⚡ Optimizar**
   - Click en el botón
   - Automáticamente:
     - Elimina buffers vacíos
     - Detecta zonas sin cobertura
     - Sugiere nuevos buffers (verde)
   - ¡Listo!

5. **💾 Guardar**
   - Guarda todos los cambios
   - Persiste entre sesiones

6. **📤 Exportar**
   - Excel, CSV o JSON
   - Con todos los análisis

---

## 🎯 MODOS DE USO

### Modo Normal (por defecto)
- Click en núcleos/satélites → Ver info
- Click en buffers → Ver detalles
- Solo visualización

### Modo Editar ✏️
- Click en botón "Editar"
- Arrastra cualquier buffer
- Se actualiza automáticamente
- Click "Editar" de nuevo para salir

### Modo Añadir ➕
- Click en botón "Añadir"
- Cursor cambia a cruz (+)
- Click en mapa = nuevo buffer
- Click "Añadir" de nuevo para salir

### Modo Eliminar 🗑️
- Click en botón "Eliminar"
- Opción 1: Click en buffer → Confirmar
- Opción 2: Click en buffer → Presiona SUPR/DELETE
- Click "Eliminar" de nuevo para salir

---

## 🔍 FUNCIONES DE ANÁLISIS

### 🔍 Analizar Vacíos
- Detecta buffers sin instituciones
- Muestra panel con lista
- Opción de eliminar individual o todos

### 📊 Malla
- Visualiza cobertura por zonas
- 🔴 Rojo = Sin cobertura
- 🟡 Amarillo = Parcial
- 🔵 Azul = Óptimo

### ⚠️ Zonas Sin Cobertura
- Marca instituciones sin buffer
- Círculos pulsantes rojos/rosas
- Haz click para ver detalles

---

## ⚡ OPTIMIZACIÓN AUTOMÁTICA

### ¿Qué hace el botón "Optimizar"?

1. **Limpia buffers vacíos**
   - Detecta buffers sin instituciones
   - Los elimina automáticamente

2. **Analiza zonas sin cobertura**
   - Identifica instituciones desprotegidas
   - Agrupa puntos cercanos

3. **Sugiere buffers nuevos**
   - Crea buffers VERDES en ubicaciones óptimas
   - Maximiza cobertura
   - Respeta límite de 220 buffers

4. **Actualiza todo**
   - Recalcula estadísticas
   - Actualiza mapa
   - Muestra resumen

### ¿Cuándo usar Optimizar?

✅ Al inicio para configuración base  
✅ Después de mover muchos buffers  
✅ Cuando hay muchos buffers vacíos  
✅ Para mejorar cobertura rápidamente  

---

## 🎨 COLORES DE BUFFERS

- **🔵 Azul**: Buffer original (del algoritmo)
- **🟣 Morado**: Buffer personalizado (añadido por ti)
- **🟢 Verde**: Buffer optimizado (sugerido por optimizar)
- **🔴 Rojo**: Buffer vacío (sin instituciones)

---

## 💡 FLUJO DE TRABAJO RECOMENDADO

### Optimización Rápida (5 minutos)
```
1. Click "Optimizar" → Acepta
2. Revisa buffers verdes sugeridos
3. Click "Guardar"
4. Click "Exportar" → Descarga Excel
✅ LISTO
```

### Optimización Manual (15 minutos)
```
1. Click "Analizar Vacíos" → Elimina todos
2. Click "Zonas Sin Cobertura" → Identifica áreas rojas
3. Click "Añadir" → Crea buffers en zonas críticas
4. Click "Editar" → Ajusta posiciones
5. Click "Malla" → Verifica cobertura
6. Click "Guardar"
7. Click "Exportar"
✅ LISTO
```

### Optimización Completa (30 minutos)
```
1. Click "Optimizar" → Acepta
2. Click "Malla" → Identifica amarillos
3. Click "Editar" → Mueve buffers hacia zonas amarillas
4. Click "Añadir" → Rellena huecos importantes
5. Click "Analizar Vacíos" → Verifica que no haya vacíos
6. Click "Zonas Sin Cobertura" → Verifica cobertura completa
7. Repite pasos 3-6 hasta satisfacción
8. Click "Guardar"
9. Click "Exportar"
✅ LISTO
```

---

## 🔑 ATAJOS DE TECLADO

- **SUPR** o **DELETE**: Elimina buffer seleccionado (en modo Eliminar)
- **ESC**: Sale del modo actual (próximamente)
- **Ctrl+S**: Guardar (estándar del navegador)

---

## ⚠️ TIPS IMPORTANTES

1. **Solo un modo a la vez**
   - Editar, Añadir o Eliminar
   - Se desactivan automáticamente entre sí

2. **Guardar frecuentemente**
   - Los cambios se pierden al cerrar sin guardar
   - Botón "Guardar" se ilumina con cambios

3. **Buffers verdes son sugerencias**
   - Puedes moverlos o eliminarlos
   - Son solo recomendaciones del optimizador

4. **El optimizador respeta límites**
   - Máximo 220 buffers totales
   - Mínimo 3 satélites por buffer

---

## 🐛 SOLUCIÓN RÁPIDA

### ❌ No puedo eliminar buffers
✅ Asegúrate de estar en modo "Eliminar" (botón naranja)
✅ Click en buffer y confirma, O presiona SUPR/DELETE

### ❌ No puedo mover buffers
✅ Activa modo "Editar" primero (botón naranja)
✅ Luego arrastra con el mouse

### ❌ No se crean buffers nuevos
✅ Activa modo "Añadir" primero (botón naranja)
✅ Cursor debe ser cruz (+)
✅ Click en el mapa

### ❌ Optimizar no hace nada
✅ Debe haber datos cargados primero
✅ Espera a que termine de cargar el CSV
✅ Verás notificaciones del proceso

---

## 📊 SELECTOR DE MAPA

**Esquina superior derecha** (icono □)
- OpenStreetMap (predeterminado)
- Satélite (Esri)
- Modo Oscuro (CartoDB)

---

## 📈 PANEL DE ESTADÍSTICAS (izquierda)

- **Núcleos DECE**: Total
- **Satélites**: Total  
- **Núcleos Activos**: Con buffer
- **Sin Cobertura**: Satélites sin buffer
- **🚫 Buffers Vacíos**: Para eliminar
- **⚡ Puntos Sin Cobertura**: Para cubrir

---

## 🎯 META

**Objetivo**: > 97% de cobertura
**Método**: Mínimo de buffers, máxima eficiencia
**Resultado**: Exportar y entregar

---

¡Suerte con tu proyecto! 🚀

**Versión**: 7.0 FINAL  
**Última actualización**: Diciembre 2024
