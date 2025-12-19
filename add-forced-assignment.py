#!/usr/bin/env python3
"""
Agregar sistema de asignación forzada para 100% de cobertura
"""

print("🔧 Agregando sistema de asignación forzada...")

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# ============ PASO 1: Agregar nuevas variables globales ============
print("1️⃣ Agregando variables globales...")

# Buscar donde están las variables globales y agregar las nuevas
new_globals = '''
// Variables para asignación forzada
let forcedAssignments = new Map(); // satellite_index -> nucleo_index (forzado)
let orphanNucleos = new Set(); // núcleos sin satélites
let orphanSatellites = new Set(); // satélites sin núcleo
let coverageStats = {
  totalSatellites: 0,
  coveredNormal: 0,
  coveredForced: 0,
  orphanCount: 0,
  normalCoveragePercent: 0,
  totalCoveragePercent: 0
};
'''

# Insertar después de las variables existentes
content = content.replace(
    'let hasUnsavedChanges = false;',
    'let hasUnsavedChanges = false;\n' + new_globals
)

print("   ✅ Variables agregadas")

# ============ PASO 2: Función para encontrar núcleo más cercano ============
print("2️⃣ Agregando función findClosestNucleo...")

find_closest = '''

// ==================== ASIGNACIÓN FORZADA ====================

function findClosestNucleo(satLat, satLng, nucleos, selected) {
  let closestNi = null;
  let minDistance = Infinity;
  
  selected.forEach(ni => {
    const nucleo = nucleos[ni];
    if (!nucleo) return;
    
    // Obtener posición actual del buffer (puede haber sido movido)
    const bufferData = editableBuffers.get(ni);
    let nLat, nLng;
    
    if (bufferData && bufferData.currentPos) {
      nLat = bufferData.currentPos.lat;
      nLng = bufferData.currentPos.lng;
    } else {
      nLat = nucleo.lat;
      nLng = nucleo.lng;
    }
    
    const dist = haversineDistance(satLat, satLng, nLat, nLng);
    
    if (dist < minDistance) {
      minDistance = dist;
      closestNi = ni;
    }
  });
  
  return { ni: closestNi, distance: minDistance };
}

function assignOrphanSatellites(satellites, nucleos, satCandidates, selected) {
  console.log("🔍 Buscando satélites huérfanos...");
  
  forcedAssignments.clear();
  orphanSatellites.clear();
  
  let normalCovered = 0;
  let forcedCovered = 0;
  
  satellites.forEach((sat, si) => {
    // Verificar si está cubierto normalmente
    let isCovered = false;
    
    if (satCandidates[si]) {
      satCandidates[si].forEach(c => {
        if (selected.has(c.ni) && c.dist <= BUFFER_RADIUS_M) {
          isCovered = true;
        }
      });
    }
    
    if (isCovered) {
      normalCovered++;
    } else {
      // Satélite huérfano - buscar núcleo más cercano
      const closest = findClosestNucleo(sat.lat, sat.lng, nucleos, selected);
      
      if (closest.ni !== null) {
        forcedAssignments.set(si, {
          ni: closest.ni,
          distance: closest.distance
        });
        forcedCovered++;
        console.log(`  📌 Satélite ${si} asignado forzadamente a núcleo ${closest.ni} (${(closest.distance/1000).toFixed(2)}km)`);
      } else {
        orphanSatellites.add(si);
        console.warn(`  ⚠️ Satélite ${si} no pudo ser asignado`);
      }
    }
  });
  
  // Actualizar estadísticas
  coverageStats.totalSatellites = satellites.length;
  coverageStats.coveredNormal = normalCovered;
  coverageStats.coveredForced = forcedCovered;
  coverageStats.orphanCount = orphanSatellites.size;
  coverageStats.normalCoveragePercent = ((normalCovered / satellites.length) * 100).toFixed(2);
  coverageStats.totalCoveragePercent = (((normalCovered + forcedCovered) / satellites.length) * 100).toFixed(2);
  
  console.log("✅ Asignación forzada completada:");
  console.log(`   📊 Total satélites: ${satellites.length}`);
  console.log(`   ✅ Cobertura normal: ${normalCovered} (${coverageStats.normalCoveragePercent}%)`);
  console.log(`   📌 Asignados forzadamente: ${forcedCovered}`);
  console.log(`   🎯 Cobertura TOTAL: ${normalCovered + forcedCovered} (${coverageStats.totalCoveragePercent}%)`);
  console.log(`   ⚠️ Sin asignar: ${orphanSatellites.size}`);
}

function identifyOrphanNucleos(nucleos, satCandidates, selected) {
  console.log("🔍 Identificando núcleos huérfanos...");
  
  orphanNucleos.clear();
  
  selected.forEach(ni => {
    let hasSatellites = false;
    
    // Verificar si tiene satélites en cobertura normal
    satCandidates.forEach((candidates, si) => {
      if (candidates) {
        candidates.forEach(c => {
          if (c.ni === ni && c.dist <= BUFFER_RADIUS_M) {
            hasSatellites = true;
          }
        });
      }
    });
    
    // Verificar si tiene satélites asignados forzadamente
    forcedAssignments.forEach((assignment, si) => {
      if (assignment.ni === ni) {
        hasSatellites = true;
      }
    });
    
    if (!hasSatellites) {
      orphanNucleos.add(ni);
      console.log(`  ⚠️ Núcleo ${ni} (${nucleos[ni].name}) no tiene satélites asignados`);
    }
  });
  
  console.log(`✅ Núcleos huérfanos identificados: ${orphanNucleos.size}`);
}
'''

# Buscar un buen lugar para insertar (después de haversineDistance)
content = content.replace(
    'function haversineDistance(lat1, lon1, lat2, lon2) {',
    find_closest + '\nfunction haversineDistance(lat1, lon1, lat2, lon2) {'
)

print("   ✅ Funciones de asignación agregadas")

# ============ PASO 3: Modificar updateCoverageAnalysis ============
print("3️⃣ Modificando updateCoverageAnalysis...")

# Buscar updateCoverageAnalysis y agregar llamadas a las nuevas funciones
old_analysis = 'function updateCoverageAnalysis() {'
new_analysis = '''function updateCoverageAnalysis() {
  if (!globalData) return;
  
  // Primero asignar satélites huérfanos
  assignOrphanSatellites(
    globalData.satellites,
    globalData.nucleos,
    globalData.satCandidates,
    globalData.selected
  );
  
  // Luego identificar núcleos huérfanos
  identifyOrphanNucleos(
    globalData.nucleos,
    globalData.satCandidates,
    globalData.selected
  );
'''

content = content.replace(old_analysis, new_analysis)

print("   ✅ updateCoverageAnalysis modificado")

# ============ PASO 4: Modificar exportToCSV ============
print("4️⃣ Modificando exportToCSV...")

# Buscar exportToCSV y reemplazar completamente
old_export_pattern = r'function exportToCSV\(\) \{[^}]*(?:\{[^}]*\}[^}]*)*\}'

new_export = '''function exportToCSV() {
  if (!globalData) {
    showNotification("⚠️ No hay datos para exportar", "warning");
    return;
  }
  
  console.log("📊 Exportando datos con asignaciones forzadas...");
  
  const { nucleos, satellites, satCandidates, selected } = globalData;
  
  // Header del CSV
  let csv = "TIPO,ID,NOMBRE,DISTRITO,LAT_ORIGINAL,LNG_ORIGINAL,BUFFER_LAT,BUFFER_LNG,DISTANCIA_M,ESTUDIANTES,ASIGNACION\\n";
  
  // Exportar satélites
  satellites.forEach((sat, si) => {
    let bestNi = null;
    let bestDist = Infinity;
    let isForced = false;
    
    // Buscar en cobertura normal
    if (satCandidates[si]) {
      satCandidates[si].forEach(c => {
        if (selected.has(c.ni) && c.dist < bestDist && c.dist <= BUFFER_RADIUS_M) {
          bestNi = c.ni;
          bestDist = c.dist;
        }
      });
    }
    
    // Si no tiene cobertura normal, buscar asignación forzada
    if (bestNi === null && forcedAssignments.has(si)) {
      const forced = forcedAssignments.get(si);
      bestNi = forced.ni;
      bestDist = forced.distance;
      isForced = true;
    }
    
    if (bestNi !== null) {
      const nucleo = nucleos[bestNi];
      const bufferData = editableBuffers.get(bestNi);
      
      let bufferLat, bufferLng;
      if (bufferData && bufferData.currentPos) {
        bufferLat = bufferData.currentPos.lat;
        bufferLng = bufferData.currentPos.lng;
      } else {
        bufferLat = nucleo.lat;
        bufferLng = nucleo.lng;
      }
      
      const assignmentType = isForced ? "FORZADA" : "NORMAL";
      
      csv += `SATELITE,${si},"${escapeCSV(sat.name)}","${escapeCSV(sat.dist)}",${sat.lat},${sat.lng},${bufferLat},${bufferLng},${bestDist.toFixed(2)},${sat.students || 0},${assignmentType}\\n`;
    }
  });
  
  // Exportar núcleos activos
  selected.forEach(ni => {
    const nucleo = nucleos[ni];
    const bufferData = editableBuffers.get(ni);
    
    let bufferLat, bufferLng;
    if (bufferData && bufferData.currentPos) {
      bufferLat = bufferData.currentPos.lat;
      bufferLng = bufferData.currentPos.lng;
    } else {
      bufferLat = nucleo.lat;
      bufferLng = nucleo.lng;
    }
    
    const isOrphan = orphanNucleos.has(ni);
    const status = isOrphan ? "HUERFANO" : "ACTIVO";
    
    csv += `NUCLEO,${ni},"${escapeCSV(nucleo.name)}","${escapeCSV(nucleo.dist)}",${nucleo.lat},${nucleo.lng},${bufferLat},${bufferLng},0,${nucleo.students || 0},${status}\\n`;
  });
  
  // Agregar estadísticas al final
  csv += "\\n--- ESTADISTICAS ---\\n";
  csv += `Total Satélites,${coverageStats.totalSatellites}\\n`;
  csv += `Cobertura Normal,${coverageStats.coveredNormal},${coverageStats.normalCoveragePercent}%\\n`;
  csv += `Asignados Forzadamente,${coverageStats.coveredForced}\\n`;
  csv += `Cobertura TOTAL,${coverageStats.coveredNormal + coverageStats.coveredForced},${coverageStats.totalCoveragePercent}%\\n`;
  csv += `Satélites sin asignar,${coverageStats.orphanCount}\\n`;
  csv += `Núcleos huérfanos,${orphanNucleos.size}\\n`;
  csv += `Núcleos activos,${selected.size}\\n`;
  
  // Descargar
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `dece_cobertura_total_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log("✅ CSV exportado con asignaciones forzadas");
  showNotification(`📥 CSV exportado: ${coverageStats.totalCoveragePercent}% cobertura total`, "success");
}

function escapeCSV(str) {
  if (!str) return "";
  return String(str).replace(/"/g, '""');
}'''

import re
content = re.sub(old_export_pattern, new_export, content, flags=re.MULTILINE | re.DOTALL)

print("   ✅ exportToCSV modificado")

# ============ PASO 5: Actualizar panel de métricas ============
print("5️⃣ Actualizando panel de métricas...")

# Buscar donde se actualiza el panel y agregar nuevas métricas
old_metrics = 'metricsPanel.innerHTML = `'
new_metrics = '''metricsPanel.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Cobertura Normal</div>
      <div class="metric-value" style="color: #3fb950">${coverageStats.normalCoveragePercent}%</div>
      <div class="metric-sublabel">${coverageStats.coveredNormal} satélites</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Asignación Forzada</div>
      <div class="metric-value" style="color: #f0883e">${coverageStats.coveredForced}</div>
      <div class="metric-sublabel">satélites forzados</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Cobertura TOTAL</div>
      <div class="metric-value" style="color: #58a6ff; font-size: 2em">${coverageStats.totalCoveragePercent}%</div>
      <div class="metric-sublabel">${coverageStats.coveredNormal + coverageStats.coveredForced} de ${coverageStats.totalSatellites}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Núcleos Huérfanos</div>
      <div class="metric-value" style="color: #f85149">${orphanNucleos.size}</div>
      <div class="metric-sublabel">sin satélites</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Buffers Activos</div>
      <div class="metric-value">${selected.size}</div>
      <div class="metric-sublabel">de ${nucleos.length} total</div>
    </div>
  `'''

content = content.replace(old_metrics, new_metrics)

print("   ✅ Panel de métricas actualizado")

# Guardar
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✅ ¡SISTEMA DE ASIGNACIÓN FORZADA IMPLEMENTADO!")
print("\n📋 Cambios realizados:")
print("  1. Variables globales para asignaciones forzadas")
print("  2. findClosestNucleo() - encuentra núcleo más cercano")
print("  3. assignOrphanSatellites() - asigna satélites sueltos")
print("  4. identifyOrphanNucleos() - identifica núcleos sin satélites")
print("  5. exportToCSV() - incluye columna ASIGNACION (NORMAL/FORZADA/HUERFANO)")
print("  6. Panel de métricas - muestra cobertura normal vs total")
print("\n🎯 Resultado esperado:")
print("  - Cobertura normal: ~85%")
print("  - Cobertura TOTAL: ~97%+")
print("  - CSV con columna ASIGNACION")
print("  - Panel muestra ambas coberturas")

