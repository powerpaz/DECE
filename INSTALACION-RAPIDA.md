# 🚀 INSTALACIÓN RÁPIDA - DECE v7.1 BUTTONS FIXED

## ⚡ INICIO EN 3 PASOS

### 1️⃣ DESCOMPRIMIR
```bash
# Descomprime el archivo ZIP
unzip DECE-v7.1-BUTTONS-FIXED.zip
cd DECE-FIXED
```

### 2️⃣ ABRIR EN NAVEGADOR
```bash
# Opción A: Doble click en index.html

# Opción B: Servidor local (recomendado)
python -m http.server 8000
# O con Python 2:
# python -m SimpleHTTPServer 8000

# Luego abre: http://localhost:8000
```

### 3️⃣ VERIFICAR
Abre la consola (F12) y verifica que aparezca:
```
✅ Edit button found, adding event listener
✅ Add button found, adding event listener
✅ Delete button found, adding event listener
✅ All buttons configured!
📦 DECE App v7.1 - Buttons Fixed - Loaded successfully!
```

---

## ✅ PRUEBA RÁPIDA DE BOTONES

### 🖊️ Botón EDITAR
```
1. Click en "Editar"
2. Busca en consola: "🔧 Edit button clicked!"
3. Arrastra un buffer azul
4. Debe moverse suavemente
✅ FUNCIONA
```

### ➕ Botón AÑADIR
```
1. Click en "Añadir"  
2. Busca en consola: "➕ Add button clicked!"
3. Cursor cambia a cruz (+)
4. Click en el mapa
5. Aparece buffer púrpura
✅ FUNCIONA
```

### 🗑️ Botón ELIMINAR
```
1. Click en "Eliminar"
2. Busca en consola: "🗑️ Delete button clicked!"
3. Click en un buffer → se pone rojo
4. Presiona SUPR o DELETE
5. Buffer desaparece
✅ FUNCIONA
```

---

## 🔧 SI NO FUNCIONA

### Problema: Botones no responden

**Solución:**
```bash
# 1. Limpia caché del navegador
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)

# 2. Verifica la consola (F12)
Busca errores en rojo

# 3. Verifica que el archivo app.js está actualizado
grep "v7.1 - Buttons Fixed" app.js
# Debe aparecer: "DECE App v7.1 - Buttons Fixed"
```

### Problema: Error CORS

**Causa:** Algunos navegadores bloquean archivos locales

**Solución:**
```bash
# Usa un servidor local
python -m http.server 8000

# O instala Live Server en VS Code
```

### Problema: No carga el CSV

**Causa:** Archivo muy grande o ruta incorrecta

**Solución:**
```bash
# Verifica que existe el archivo
ls -lh DECE_CRUCE_X_Y_NUC_SAT.csv

# Debe mostrar: ~7MB
```

---

## 📁 ESTRUCTURA DEL PROYECTO

```
DECE-FIXED/
│
├── index.html                      ← Archivo principal (ABRIR ESTE)
├── app.js                          ← JavaScript CORREGIDO ✅
├── style.css                       ← Estilos
├── style-enhanced.css              ← Estilos adicionales
├── DECE_CRUCE_X_Y_NUC_SAT.csv     ← Datos (7MB)
│
├── README-BUTTONS-FIXED.md         ← LEER PRIMERO
├── GUIA-RAPIDA.md                  ← Guía de uso
├── TROUBLESHOOTING.md              ← Solución de problemas
└── README.md                       ← README original
```

---

## 🎯 PRÓXIMOS PASOS

1. ✅ **Lee** `README-BUTTONS-FIXED.md` para detalles completos
2. ✅ **Prueba** cada botón según las instrucciones
3. ✅ **Guarda** cambios con el botón "Guardar Cambios"
4. ✅ **Exporta** resultados con el botón "Exportar"

---

## 💡 TIPS IMPORTANTES

- 🔥 **Modo Editar**: Solo puedes arrastrar cuando está activo
- 💾 **Guardar**: Los cambios solo persisten si guardas
- 🗑️ **Eliminar**: Requiere 2 pasos (seleccionar + DELETE)
- 🔄 **Optimizar**: Usa el botón para mejorar cobertura
- 📊 **Análisis**: Activa "Malla" y "Zonas Sin Cobertura"

---

## 📞 SOPORTE

¿Problemas? Comparte:
1. Mensajes de la consola (F12)
2. Navegador y versión
3. Sistema operativo

---

## 🎉 ¡LISTO!

Ya tienes el proyecto completo y funcionando con todos los botones corregidos.

**Versión:** 7.1 - Buttons Fixed  
**Estado:** ✅ Totalmente Funcional  
**Última actualización:** Diciembre 2024

¡Disfruta la aplicación! 🚀
