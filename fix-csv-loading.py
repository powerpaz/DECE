#!/usr/bin/env python3
"""
Agregar logs detallados para detectar problemas de carga CSV
"""

print("🔧 Agregando logs detallados a loadCSV...")

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Reemplazar la función loadCSV con versión con logs exhaustivos
old_load = '''function loadCSV() {
  const overlay = document.getElementById("loadingOverlay");
  const setText = (main, sub = "") => { if (overlay) { overlay.querySelector(".loading-text").textContent = main; const s = document.getElementById("loadingSubtext"); if (s) s.textContent = sub; } };
  if (!window.Papa) { setText("Falta PapaParse"); return; }
  setText("Cargando CSV...", "DECE_CRUCE_X_Y_NUC_SAT.csv");
  
  fetch("DECE_CRUCE_X_Y_NUC_SAT.csv", { cache: "no-store" })
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); })
    .then(rawText => {
      let text = rawText.replace(/^\uFEFF/, "");
      const firstLine = text.split(/\r?\n/, 1)[0] || "";
      const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
      setText("Procesando...", `Delimiter: ${delim}`);
      Papa.parse(text, {
        delimiter: delim, skipEmptyLines: "greedy", worker: true,
        complete: (results) => { try { handleParsed(results); } catch (e) { console.error(e); setText("Error procesando CSV"); } },
        error: (err) => { console.error(err); setText("Error leyendo CSV"); }
      });
    })
    .catch(err => { console.error(err); setText("Error cargando CSV"); });
  
  function handleParsed(results) {
    const rows = results.data || [];
    if (!rows.length) { setText("CSV vacío"); return; }
    const resolved = resolveColumnIndexes(rows[0] || []);
    const mapped = mapRowsToData(rows, resolved.idx);
    if (!mapped.data.length) { setText("No hay registros válidos"); return; }
    if (mapped.bounds?.isValid()) map.fitBounds(mapped.bounds.pad(0.10), { animate: false });
    processData(mapped.data);
  }
}'''

new_load = '''function loadCSV() {
  console.log("🔍 loadCSV() iniciado");
  
  const overlay = document.getElementById("loadingOverlay");
  const setText = (main, sub = "") => { 
    console.log("📝 setText:", main, sub);
    if (overlay) { 
      overlay.querySelector(".loading-text").textContent = main; 
      const s = document.getElementById("loadingSubtext"); 
      if (s) s.textContent = sub; 
    } 
  };
  
  if (!window.Papa) { 
    console.error("❌ PapaParse no disponible");
    setText("Falta PapaParse"); 
    return; 
  }
  
  console.log("✅ PapaParse disponible");
  setText("Cargando CSV...", "DECE_CRUCE_X_Y_NUC_SAT.csv");
  
  console.log("🔍 Intentando fetch del CSV...");
  fetch("DECE_CRUCE_X_Y_NUC_SAT.csv", { cache: "no-store" })
    .then(res => { 
      console.log("📡 Respuesta fetch:", res.status, res.ok);
      if (!res.ok) throw new Error(`HTTP ${res.status}`); 
      return res.text(); 
    })
    .then(rawText => {
      console.log("✅ CSV cargado, tamaño:", rawText.length);
      
      let text = rawText.replace(/^\uFEFF/, "");
      const firstLine = text.split(/\r?\n/, 1)[0] || "";
      const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
      
      console.log("🔧 Delimiter detectado:", delim);
      console.log("🔧 Primera línea:", firstLine.substring(0, 100));
      
      setText("Procesando...", `Delimiter: ${delim}`);
      
      Papa.parse(text, {
        delimiter: delim, 
        skipEmptyLines: "greedy", 
        worker: true,
        complete: (results) => { 
          console.log("✅ Parse completado");
          try { 
            handleParsed(results); 
          } catch (e) { 
            console.error("❌ Error en handleParsed:", e);
            setText("Error procesando CSV"); 
          } 
        },
        error: (err) => { 
          console.error("❌ Error en Papa.parse:", err);
          setText("Error leyendo CSV"); 
        }
      });
    })
    .catch(err => { 
      console.error("❌ Error en fetch:", err);
      setText("Error cargando CSV: " + err.message); 
    });
  
  function handleParsed(results) {
    console.log("🔍 handleParsed iniciado");
    const rows = results.data || [];
    console.log("📊 Total rows:", rows.length);
    
    if (!rows.length) { 
      console.error("❌ CSV vacío");
      setText("CSV vacío"); 
      return; 
    }
    
    console.log("🔍 Resolviendo columnas...");
    const resolved = resolveColumnIndexes(rows[0] || []);
    console.log("✅ Columnas resueltas:", resolved.idx);
    
    console.log("🔍 Mapeando rows a data...");
    const mapped = mapRowsToData(rows, resolved.idx);
    console.log("✅ Data mapeada:", mapped.data.length, "registros");
    
    if (!mapped.data.length) { 
      console.error("❌ No hay registros válidos");
      setText("No hay registros válidos"); 
      return; 
    }
    
    if (mapped.bounds?.isValid()) {
      console.log("🗺️ Ajustando mapa a bounds");
      map.fitBounds(mapped.bounds.pad(0.10), { animate: false });
    }
    
    console.log("🔍 Procesando data...");
    processData(mapped.data);
  }
}'''

content = content.replace(old_load, new_load)

# Agregar logs a processData
content = content.replace(
    'function processData(data) {\n  layers.nucleos.clearLayers();',
    '''function processData(data) {
  console.log("🔍 processData iniciado con", data.length, "registros");
  
  layers.nucleos.clearLayers();'''
)

# Agregar log al final de processData
content = content.replace(
    '  hideLoadingOverlay();\n  console.log(`✓ ${nucleos.length} núcleos, ${satellites.length} satélites`);',
    '''  // Guardar en globalData con satCandidates y selected
  globalData.satCandidates = satCandidates;
  globalData.selected = result.selected;
  
  console.log("✅ globalData guardado:", {
    nucleos: globalData.nucleos.length,
    satellites: globalData.satellites.length,
    satCandidates: globalData.satCandidates.length,
    selected: globalData.selected.size
  });
  
  hideLoadingOverlay();
  console.log(`✓ Datos cargados: ${nucleos.length} núcleos, ${satellites.length} satélites`);'''
)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Logs agregados!")
print("\n📋 Cambios:")
print("  1. Logs exhaustivos en loadCSV")
print("  2. Logs en cada paso del fetch")
print("  3. Logs en Papa.parse")
print("  4. Logs en handleParsed")
print("  5. Logs en processData")
print("  6. globalData.satCandidates y globalData.selected guardados")
print("\n🧪 Ahora podrás ver EXACTAMENTE dónde falla la carga")

