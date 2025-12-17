/*************************************************
 * DECE Coverage App - v6.0 ENHANCED
 * ✅ Botón Exportar Resultados (Excel, CSV, JSON)
 * ✅ Spatial Join completo
 * ✅ Animaciones Núcleo-Satélite
 * ✅ Popups dinámicos funcionales
 *************************************************/

let map;
const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup(),
  animations: L.featureGroup()
};

const BUFFER_RADIUS_M = 7500;
const ECUADOR_CENTER = [-1.831239, -78.183406];
const canvasRenderer = L.canvas({ padding: 0.5 });
const GRID_CELL_DEG = 0.10;
const BUFFER_SELECTION_POLICY = "cover";
const TARGET_COVERAGE = 0.97;
const MAX_BUFFERS = 220;
const MIN_SATS_PER_BUFFER = 3;
const TOP_N_BUFFERS = 120;
const ENABLE_NETWORK_ANIMATION = true;
const MAX_CONNECTIONS_FOR_ANIM = 6000;
const ASSUMED_SPEED_KMH = 30;

let editMode = false;
let addMode = false;
let deleteMode = false;
let editableBuffers = new Map();
let customBuffers = [];
let customBufferCounter = 0;
let globalData = null;
let metricsPanel = null;
let hasUnsavedChanges = false;
let animationLines = [];
let _connectionAnimTimer = null;
let _initialized = false;

const STORAGE_KEY = 'dece_buffers_state';

// ==================== STORAGE ====================
function saveBuffersState() {
  const state = { editableBuffers: [], customBuffers: [], timestamp: new Date().toISOString() };
  editableBuffers.forEach((data, ni) => {
    const pos = data.circle.getLatLng();
    state.editableBuffers.push({ ni, currentLat: pos.lat, currentLng: pos.lng, originalLat: data.originalPos.lat, originalLng: data.originalPos.lng });
  });
  customBuffers.forEach(buffer => {
    const pos = buffer.circle.getLatLng();
    state.customBuffers.push({ id: buffer.id, lat: pos.lat, lng: pos.lng, name: buffer.name });
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    hasUnsavedChanges = false;
    updateSaveButtonState();
    showNotification("💾 Cambios guardados exitosamente", "success");
  } catch (e) { showNotification("❌ Error al guardar", "error"); }
}

function loadBuffersState() {
  try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? JSON.parse(saved) : null; }
  catch (e) { return null; }
}

function clearBuffersState() {
  localStorage.removeItem(STORAGE_KEY);
  hasUnsavedChanges = false;
  updateSaveButtonState();
  showNotification("Estado reiniciado. Recarga la página.", "info");
}

function markAsChanged() { hasUnsavedChanges = true; updateSaveButtonState(); }

function updateSaveButtonState() {
  const btn = document.getElementById('btnSaveChanges');
  if (btn) btn.classList.toggle('has-changes', hasUnsavedChanges);
}

// ==================== EXPORT FUNCTIONS ====================
function showExportModal() {
  const exportData = performSpatialJoin();
  if (!exportData || exportData.buffers.length === 0) { showNotification("❌ No hay buffers para exportar", "error"); return; }
  
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.innerHTML = `
    <div class="export-panel">
      <div class="export-header">
        <h3>📤 Exportar Resultados</h3>
        <button class="close-btn" onclick="this.closest('.export-modal').remove()">×</button>
      </div>
      <div class="export-content">
        <div class="export-summary">
          <h4>📊 Resumen del Análisis Espacial</h4>
          <div class="summary-grid">
            <div class="summary-card"><div class="summary-icon">🎯</div><div class="summary-value">${exportData.summary.totalBuffers}</div><div class="summary-label">Buffers Totales</div></div>
            <div class="summary-card"><div class="summary-icon">🏫</div><div class="summary-value">${exportData.summary.totalAMIEs}</div><div class="summary-label">AMIEs Cubiertas</div></div>
            <div class="summary-card"><div class="summary-icon">🏛️</div><div class="summary-value">${exportData.summary.totalNucleos}</div><div class="summary-label">Núcleos</div></div>
            <div class="summary-card"><div class="summary-icon">📍</div><div class="summary-value">${exportData.summary.totalSatellites}</div><div class="summary-label">Satélites</div></div>
            <div class="summary-card"><div class="summary-icon">👥</div><div class="summary-value">${exportData.summary.totalStudents.toLocaleString()}</div><div class="summary-label">Estudiantes</div></div>
            <div class="summary-card"><div class="summary-icon">📈</div><div class="summary-value">${exportData.summary.coveragePercent}%</div><div class="summary-label">Cobertura</div></div>
          </div>
        </div>
        <div class="export-options">
          <h4>📁 Formato de exportación</h4>
          <div class="export-buttons">
            <button class="export-btn excel" onclick="exportToExcel()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Excel (.xlsx)</span></button>
            <button class="export-btn csv" onclick="exportToCSV()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>CSV (.csv)</span></button>
            <button class="export-btn json" onclick="exportToJSON()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>JSON (.json)</span></button>
          </div>
        </div>
        <div class="export-preview">
          <h4>👁️ Vista previa</h4>
          <div class="preview-table-container">
            <table class="preview-table">
              <thead><tr><th>Buffer</th><th>Tipo</th><th>AMIEs</th><th>Núcleos</th><th>Satélites</th><th>Estudiantes</th></tr></thead>
              <tbody>
                ${exportData.buffers.slice(0, 5).map(b => `<tr><td>${b.bufferName}</td><td><span class="type-badge ${b.isCustom ? 'custom' : 'original'}">${b.isCustom ? 'Personalizado' : 'Original'}</span></td><td>${b.totalAMIEs}</td><td>${b.nucleosCount}</td><td>${b.satellitesCount}</td><td>${b.totalStudents.toLocaleString()}</td></tr>`).join('')}
                ${exportData.buffers.length > 5 ? `<tr class="more-rows"><td colspan="6">... y ${exportData.buffers.length - 5} buffers más</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
  window._exportData = exportData;
}

function performSpatialJoin() {
  if (!globalData) return null;
  const { nucleos, satellites } = globalData;
  const allInstitutions = [...nucleos.map(n => ({...n, type: 'nucleo'})), ...satellites.map(s => ({...s, type: 'satellite'}))];
  const buffers = [];
  let totalAMIEsCovered = new Set();
  let totalStudentsCovered = 0;
  
  editableBuffers.forEach((data, ni) => {
    const bufferPos = data.circle.getLatLng();
    const result = spatialJoinBuffer(bufferPos, BUFFER_RADIUS_M, allInstitutions);
    result.institutions.forEach(inst => { if (inst.amie) totalAMIEsCovered.add(inst.amie); });
    totalStudentsCovered += result.totalStudents;
    buffers.push({
      bufferId: `buffer_nucleo_${ni}`, bufferName: data.nucleo.name || `Núcleo ${ni}`, isCustom: false,
      centerLat: bufferPos.lat, centerLng: bufferPos.lng, radiusMeters: BUFFER_RADIUS_M,
      originalLat: data.nucleo.lat, originalLng: data.nucleo.lng,
      wasMoved: bufferPos.lat !== data.nucleo.lat || bufferPos.lng !== data.nucleo.lng,
      totalAMIEs: result.institutions.length, nucleosCount: result.nucleosCount, satellitesCount: result.satellitesCount,
      totalStudents: result.totalStudents, institutions: result.institutions
    });
  });
  
  customBuffers.forEach(buffer => {
    const bufferPos = buffer.circle.getLatLng();
    const result = spatialJoinBuffer(bufferPos, BUFFER_RADIUS_M, allInstitutions);
    result.institutions.forEach(inst => { if (inst.amie) totalAMIEsCovered.add(inst.amie); });
    totalStudentsCovered += result.totalStudents;
    buffers.push({
      bufferId: buffer.id, bufferName: buffer.name, isCustom: true,
      centerLat: bufferPos.lat, centerLng: bufferPos.lng, radiusMeters: BUFFER_RADIUS_M,
      originalLat: buffer.originalPos.lat, originalLng: buffer.originalPos.lng,
      wasMoved: bufferPos.lat !== buffer.originalPos.lat || bufferPos.lng !== buffer.originalPos.lng,
      totalAMIEs: result.institutions.length, nucleosCount: result.nucleosCount, satellitesCount: result.satellitesCount,
      totalStudents: result.totalStudents, institutions: result.institutions
    });
  });
  
  const allSatellites = buffers.reduce((sum, b) => sum + b.satellitesCount, 0);
  return {
    exportDate: new Date().toISOString(),
    summary: {
      totalBuffers: buffers.length, originalBuffers: buffers.filter(b => !b.isCustom).length,
      customBuffers: buffers.filter(b => b.isCustom).length, totalAMIEs: totalAMIEsCovered.size,
      totalNucleos: new Set(buffers.flatMap(b => b.institutions.filter(i => i.type === 'nucleo').map(i => i.amie))).size,
      totalSatellites: allSatellites, totalStudents: totalStudentsCovered,
      coveragePercent: satellites.length > 0 ? ((allSatellites / satellites.length) * 100).toFixed(1) : 0
    },
    buffers
  };
}

function spatialJoinBuffer(center, radius, institutions) {
  const result = { institutions: [], nucleosCount: 0, satellitesCount: 0, totalStudents: 0 };
  institutions.forEach(inst => {
    const dist = haversineMeters(center.lat, center.lng, inst.lat, inst.lng);
    if (dist <= radius) {
      result.institutions.push({
        amie: inst.amie || '', name: inst.name || '', type: inst.type, typeName: inst.type === 'nucleo' ? 'Núcleo' : 'Satélite',
        codGDECE: inst.code, lat: inst.lat, lng: inst.lng, distanceMeters: Math.round(dist),
        distanceKm: (dist / 1000).toFixed(2), students: inst.students || 0, distrito: inst.dist || ''
      });
      if (inst.type === 'nucleo') result.nucleosCount++; else result.satellitesCount++;
      result.totalStudents += inst.students || 0;
    }
  });
  result.institutions.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return result;
}

function exportToExcel() {
  const data = window._exportData;
  if (!data) return;
  showNotification("📊 Generando Excel...", "info");
  
  const wb = XLSX.utils.book_new();
  const summaryData = [['REPORTE DE ANÁLISIS ESPACIAL DECE'],['Fecha:', data.exportDate],[''],['MÉTRICAS'],
    ['Total Buffers:', data.summary.totalBuffers],['Buffers Originales:', data.summary.originalBuffers],
    ['Buffers Personalizados:', data.summary.customBuffers],['Total AMIEs:', data.summary.totalAMIEs],
    ['Núcleos:', data.summary.totalNucleos],['Satélites:', data.summary.totalSatellites],
    ['Estudiantes:', data.summary.totalStudents],['Cobertura:', data.summary.coveragePercent + '%']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Resumen');
  
  const buffersHeaders = ['ID Buffer','Nombre','Tipo','Lat Centro','Lng Centro','Radio (m)','Fue Movido','Total AMIEs','Núcleos','Satélites','Estudiantes'];
  const buffersData = data.buffers.map(b => [b.bufferId,b.bufferName,b.isCustom?'Personalizado':'Original',b.centerLat,b.centerLng,b.radiusMeters,b.wasMoved?'Sí':'No',b.totalAMIEs,b.nucleosCount,b.satellitesCount,b.totalStudents]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([buffersHeaders, ...buffersData]), 'Buffers');
  
  const instHeaders = ['Buffer','AMIE','Nombre','Tipo','COD_GDECE','Lat','Lng','Distancia(m)','Distancia(km)','Estudiantes','Distrito'];
  const instData = [];
  data.buffers.forEach(buffer => buffer.institutions.forEach(inst => instData.push([buffer.bufferName,inst.amie,inst.name,inst.typeName,inst.codGDECE,inst.lat,inst.lng,inst.distanceMeters,inst.distanceKm,inst.students,inst.distrito])));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([instHeaders, ...instData]), 'Instituciones');
  
  XLSX.writeFile(wb, `DECE_Analysis_${formatDateForFilename()}.xlsx`);
  showNotification("✅ Excel descargado", "success");
  document.querySelector('.export-modal')?.remove();
}

function exportToCSV() {
  const data = window._exportData;
  if (!data) return;
  showNotification("📄 Generando CSV...", "info");
  const headers = ['Buffer_ID','Buffer_Nombre','Buffer_Tipo','Buffer_Lat','Buffer_Lng','AMIE','Institucion_Nombre','Institucion_Tipo','COD_GDECE','Inst_Lat','Inst_Lng','Distancia_m','Distancia_km','Estudiantes','Distrito'];
  const rows = [];
  data.buffers.forEach(buffer => buffer.institutions.forEach(inst => rows.push([buffer.bufferId,`"${buffer.bufferName}"`,buffer.isCustom?'Personalizado':'Original',buffer.centerLat,buffer.centerLng,inst.amie,`"${inst.name}"`,inst.typeName,inst.codGDECE,inst.lat,inst.lng,inst.distanceMeters,inst.distanceKm,inst.students,`"${inst.distrito}"`].join(','))));
  downloadFile([headers.join(','), ...rows].join('\n'), `DECE_Analysis_${formatDateForFilename()}.csv`, 'text/csv;charset=utf-8;');
  showNotification("✅ CSV descargado", "success");
  document.querySelector('.export-modal')?.remove();
}

function exportToJSON() {
  const data = window._exportData;
  if (!data) return;
  showNotification("📋 Generando JSON...", "info");
  downloadFile(JSON.stringify(data, null, 2), `DECE_Analysis_${formatDateForFilename()}.json`, 'application/json');
  showNotification("✅ JSON descargado", "success");
  document.querySelector('.export-modal')?.remove();
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatDateForFilename() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
}

window.showExportModal = showExportModal;
window.exportToExcel = exportToExcel;
window.exportToCSV = exportToCSV;
window.exportToJSON = exportToJSON;

// ==================== COVERAGE ====================
function completeCoverage() {
  if (!globalData) { showNotification("❌ Espera a que carguen los datos", "error"); return; }
  showNotification("🔄 Completando cobertura...", "info");
  const uncovered = findUncoveredSatellites();
  if (uncovered.length === 0) { showNotification("✅ ¡Cobertura completa!", "success"); return; }
  const newBuffers = createOptimalBuffers(uncovered);
  newBuffers.forEach(pos => createCustomBuffer(pos.lat, pos.lng));
  setTimeout(() => {
    const stillUncovered = findUncoveredSatellites();
    const coverage = ((globalData.satellites.length - stillUncovered.length) / globalData.satellites.length * 100).toFixed(1);
    regenerateAnimations();
    showNotification(`✅ Cobertura: ${coverage}%. ${newBuffers.length} buffers agregados.`, stillUncovered.length === 0 ? "success" : "info");
    markAsChanged();
  }, 300);
}

function findUncoveredSatellites() {
  if (!globalData) return [];
  return globalData.satellites.filter((sat, index) => {
    let covered = false;
    editableBuffers.forEach(data => { if (haversineMeters(sat.lat, sat.lng, data.circle.getLatLng().lat, data.circle.getLatLng().lng) <= BUFFER_RADIUS_M) covered = true; });
    if (!covered) customBuffers.forEach(buffer => { if (haversineMeters(sat.lat, sat.lng, buffer.circle.getLatLng().lat, buffer.circle.getLatLng().lng) <= BUFFER_RADIUS_M) covered = true; });
    return !covered;
  }).map((sat, index) => ({ ...sat, index }));
}

function createOptimalBuffers(uncoveredSatellites) {
  const minDistance = BUFFER_RADIUS_M * 1.5;
  let numClusters = Math.min(Math.ceil(uncoveredSatellites.length / 5), uncoveredSatellites.length);
  let centroids = [];
  const usedIndices = new Set();
  for (let i = 0; i < numClusters; i++) {
    let idx; do { idx = Math.floor(Math.random() * uncoveredSatellites.length); } while (usedIndices.has(idx));
    usedIndices.add(idx);
    centroids.push({ lat: uncoveredSatellites[idx].lat, lng: uncoveredSatellites[idx].lng });
  }
  for (let iter = 0; iter < 10; iter++) {
    const clusters = Array.from({ length: numClusters }, () => []);
    uncoveredSatellites.forEach(sat => {
      let minDist = Infinity, closest = 0;
      centroids.forEach((c, ci) => { const d = haversineMeters(sat.lat, sat.lng, c.lat, c.lng); if (d < minDist) { minDist = d; closest = ci; } });
      clusters[closest].push(sat);
    });
    centroids = clusters.filter(c => c.length > 0).map(cluster => ({
      lat: cluster.reduce((s, sat) => s + sat.lat, 0) / cluster.length,
      lng: cluster.reduce((s, sat) => s + sat.lng, 0) / cluster.length
    }));
  }
  return centroids.filter(c => {
    let tooClose = false;
    editableBuffers.forEach(data => { if (haversineMeters(c.lat, c.lng, data.circle.getLatLng().lat, data.circle.getLatLng().lng) < minDistance) tooClose = true; });
    if (!tooClose) customBuffers.forEach(buffer => { if (haversineMeters(c.lat, c.lng, buffer.circle.getLatLng().lat, buffer.circle.getLatLng().lng) < minDistance) tooClose = true; });
    return !tooClose;
  });
}

function showUncoveredInstitutions() {
  const uncovered = findUncoveredSatellites();
  if (uncovered.length === 0) { showNotification("✅ ¡Todas cubiertas!", "success"); return; }
  const modal = document.createElement('div');
  modal.className = 'uncovered-modal';
  modal.innerHTML = `<div class="uncovered-panel"><div class="uncovered-header"><h3>⚠️ Sin Cobertura</h3><button class="close-btn" onclick="this.closest('.uncovered-modal').remove()">×</button></div><div class="uncovered-content"><div class="uncovered-summary"><div class="summary-item"><span class="summary-number">${uncovered.length}</span><span class="summary-label">Instituciones</span></div><div class="summary-item"><span class="summary-number">${uncovered.reduce((s, sat) => s + (sat.students || 0), 0).toLocaleString()}</span><span class="summary-label">Estudiantes</span></div></div><div class="uncovered-actions"><button class="btn-action-modal" onclick="completeCoverage(); this.closest('.uncovered-modal').remove();">🔧 Completar Cobertura</button></div><div class="uncovered-list">${uncovered.slice(0, 20).map((sat, idx) => `<div class="uncovered-item" onclick="map.flyTo([${sat.lat}, ${sat.lng}], 13)"><div class="uncovered-item-number">${idx + 1}</div><div class="uncovered-item-info"><div class="uncovered-item-name">${escapeHTML(sat.name)}</div><div class="uncovered-item-details">👥 ${sat.students || 0}</div></div></div>`).join('')}${uncovered.length > 20 ? `<div class="more-rows">... y ${uncovered.length - 20} más</div>` : ''}</div></div></div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
}

window.showUncoveredInstitutions = showUncoveredInstitutions;
window.completeCoverage = completeCoverage;

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", () => {
  if (_initialized) return;
  _initialized = true;
  initMap();
  setupControls();
  setupEditControls();
  loadCSV();
});

function initMap() {
  map = L.map("map", { center: ECUADOR_CENTER, zoom: 7, zoomControl: true, preferCanvas: true, renderer: canvasRenderer });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
  L.control.layers({ "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"), "Satélite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}") }).addTo(map);
  Object.values(layers).forEach(layer => layer.addTo(map));
}

function setupEditControls() {
  document.getElementById("btnEditBuffers")?.addEventListener("click", toggleEditMode);
  document.getElementById("btnAddBuffers")?.addEventListener("click", toggleAddMode);
  document.getElementById("btnDeleteBuffers")?.addEventListener("click", toggleDeleteMode);
  document.getElementById("btnSaveChanges")?.addEventListener("click", saveBuffersState);
  document.getElementById("btnCompleteCoverage")?.addEventListener("click", completeCoverage);
  document.getElementById("btnExportResults")?.addEventListener("click", showExportModal);
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById("btnEditBuffers");
  if (editMode && addMode) toggleAddMode();
  if (editMode) { btn?.classList.add("active"); enableBufferEditing(); showNotification("🖊️ Modo edición activado", "info"); }
  else { btn?.classList.remove("active"); disableBufferEditing(); closeMetricsPanel(); showNotification("Modo edición desactivado", "info"); }
}

function toggleAddMode() {
  addMode = !addMode;
  const btn = document.getElementById("btnAddBuffers");
  if (addMode && editMode) toggleEditMode();
  if (addMode && deleteMode) toggleDeleteMode();
  if (addMode) { btn?.classList.add("active"); map.getContainer().style.cursor = 'crosshair'; map.on('click', onMapClickAddBuffer); showNotification("➕ Click en mapa para crear buffer", "info"); }
  else { btn?.classList.remove("active"); map.getContainer().style.cursor = ''; map.off('click', onMapClickAddBuffer); }
}

function toggleDeleteMode() {
  deleteMode = !deleteMode;
  const btn = document.getElementById("btnDeleteBuffers");
  if (deleteMode && editMode) toggleEditMode();
  if (deleteMode && addMode) toggleAddMode();
  if (deleteMode) { 
    btn?.classList.add("active"); 
    map.getContainer().style.cursor = 'not-allowed'; 
    enableDeleteMode();
    showNotification("🗑️ Click en un buffer para eliminarlo", "info"); 
  } else { 
    btn?.classList.remove("active"); 
    map.getContainer().style.cursor = ''; 
    disableDeleteMode();
  }
}

function enableDeleteMode() {
  // Hacer los buffers personalizados clickeables para eliminar
  customBuffers.forEach(buffer => {
    buffer.circle.off('click');
    buffer.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (deleteMode) {
        if (confirm(`¿Eliminar "${buffer.name}"?`)) {
          deleteCustomBuffer(buffer.id);
        }
      }
    });
    buffer.circle.setStyle({ color: '#f85149', fillColor: '#f85149' });
  });
  
  // También para buffers editables (núcleos) - mostrar que no se pueden eliminar
  editableBuffers.forEach((data, ni) => {
    data.circle.off('click');
    data.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (deleteMode) {
        showNotification("⚠️ Los buffers de núcleo no se pueden eliminar, solo mover", "error");
      }
    });
  });
}

function disableDeleteMode() {
  // Restaurar comportamiento normal de los buffers personalizados
  customBuffers.forEach(buffer => {
    buffer.circle.off('click');
    buffer.circle.on('click', (e) => { L.DomEvent.stopPropagation(e); showBufferPopup(buffer, true); });
    buffer.circle.setStyle({ color: '#a371f7', fillColor: '#a371f7' });
  });
  
  // Restaurar buffers editables
  editableBuffers.forEach((data, ni) => {
    data.circle.off('click');
    data.circle.on('click', (e) => { if (!editMode) showBufferPopup(data, false); });
  });
}

function onMapClickAddBuffer(e) { if (addMode) createCustomBuffer(e.latlng.lat, e.latlng.lng); }

function createCustomBuffer(lat, lng) {
  customBufferCounter++;
  const circle = L.circle([lat, lng], { radius: BUFFER_RADIUS_M, color: '#a371f7', fillColor: '#a371f7', weight: 2, opacity: 0.7, fillOpacity: 0.15, renderer: canvasRenderer });
  circle.addTo(layers.buffers);
  const buffer = { id: `custom_${customBufferCounter}`, circle, lat, lng, originalPos: { lat, lng }, currentPos: { lat, lng }, isCustom: true, isDragging: false, name: `Buffer Personalizado #${customBufferCounter}` };
  customBuffers.push(buffer);
  markAsChanged();
  circle.on('click', (e) => { L.DomEvent.stopPropagation(e); showBufferPopup(buffer, true); });
  const metrics = calculateBufferMetrics({ lat, lng }, BUFFER_RADIUS_M);
  showNotification(`✓ Buffer creado: ${metrics.iesCount} IEs`, "info");
  setTimeout(() => regenerateAnimations(), 100);
  if (editMode) makeBufferDraggable(circle, buffer, true);
}

window.createCustomBuffer = createCustomBuffer;

// ==================== POPUPS ====================
function showBufferPopup(bufferData, isCustom = false) {
  const pos = bufferData.circle.getLatLng();
  const metrics = calculateBufferMetricsDetailed(pos, BUFFER_RADIUS_M);
  const content = `<div class="buffer-popup"><div class="popup-title">${isCustom ? '🎨' : '🏛️'} ${isCustom ? bufferData.name : (bufferData.nucleo?.name || 'Buffer')}</div><div class="popup-content"><div class="popup-row"><span class="popup-label">Tipo:</span><span class="popup-value" style="color:${isCustom ? '#a371f7' : '#58a6ff'}">${isCustom ? 'Personalizado' : 'Núcleo'}</span></div><div class="popup-row"><span class="popup-label">Posición:</span><span class="popup-value">${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}</span></div><div class="popup-divider"></div><div class="popup-row highlight"><span class="popup-label">🎯 AMIEs:</span><span class="popup-value">${metrics.iesCount}</span></div><div class="popup-row"><span class="popup-label">🏛️ Núcleos:</span><span class="popup-value" style="color:#3fb950">${metrics.nucleosCount}</span></div><div class="popup-row"><span class="popup-label">📍 Satélites:</span><span class="popup-value" style="color:#58a6ff">${metrics.satellitesCount}</span></div><div class="popup-row"><span class="popup-label">👥 Estudiantes:</span><span class="popup-value" style="color:#d29922">${metrics.totalStudents.toLocaleString()}</span></div>${metrics.iesList.length > 0 ? `<div class="popup-divider"></div><div class="popup-ies-list"><strong>Instituciones:</strong>${metrics.iesList.slice(0, 5).map(ie => `<div class="popup-ie-item"><span class="ie-type-dot ${ie.type}"></span><span class="ie-name">${escapeHTML(ie.name).substring(0, 25)}...</span><span class="ie-dist">${(ie.dist/1000).toFixed(1)}km</span></div>`).join('')}${metrics.iesList.length > 5 ? `<div class="popup-more">... y ${metrics.iesList.length - 5} más</div>` : ''}</div>` : ''}</div></div>`;
  bufferData.circle.bindPopup(content, { maxWidth: 350, className: 'custom-buffer-popup' }).openPopup();
}

function calculateBufferMetricsDetailed(position, radius) {
  if (!globalData) return { iesCount: 0, totalStudents: 0, profNecesarios: 0, iesList: [], nucleosCount: 0, satellitesCount: 0 };
  let iesCount = 0, totalStudents = 0, iesList = [], nucleosCount = 0, satellitesCount = 0;
  globalData.satellites.forEach(sat => {
    const dist = haversineMeters(position.lat, position.lng, sat.lat, sat.lng);
    if (dist <= radius) { iesCount++; satellitesCount++; totalStudents += sat.students || 0; iesList.push({ name: sat.name || 'Sin nombre', dist, students: sat.students || 0, type: 'satellite' }); }
  });
  globalData.nucleos.forEach(nuc => {
    const dist = haversineMeters(position.lat, position.lng, nuc.lat, nuc.lng);
    if (dist <= radius) { iesCount++; nucleosCount++; totalStudents += nuc.students || 0; iesList.push({ name: nuc.name || 'Sin nombre', dist, students: nuc.students || 0, type: 'nucleo' }); }
  });
  iesList.sort((a, b) => a.dist - b.dist);
  return { iesCount, totalStudents, profNecesarios: Math.ceil(totalStudents / 450), iesList, nucleosCount, satellitesCount };
}

function calculateBufferMetrics(position, radius) {
  if (!globalData) return { iesCount: 0, totalStudents: 0, profNecesarios: 0, iesList: [] };
  let iesCount = 0, totalStudents = 0, iesList = [];
  globalData.satellites.forEach(sat => {
    const dist = haversineMeters(position.lat, position.lng, sat.lat, sat.lng);
    if (dist <= radius) { iesCount++; totalStudents += sat.students || 0; iesList.push({ name: sat.name || 'Sin nombre', dist, students: sat.students || 0 }); }
  });
  iesList.sort((a, b) => a.dist - b.dist);
  return { iesCount, totalStudents, profNecesarios: Math.ceil(totalStudents / 450), iesList };
}

function closeMetricsPanel() { if (metricsPanel) metricsPanel.classList.remove('show'); }
window.closeMetricsPanel = closeMetricsPanel;

function deleteCustomBuffer(bufferId) {
  const idx = customBuffers.findIndex(b => b.id === bufferId);
  if (idx === -1) return;
  layers.buffers.removeLayer(customBuffers[idx].circle);
  customBuffers.splice(idx, 1);
  markAsChanged();
  closeMetricsPanel();
  regenerateAnimations();
  showNotification("✓ Buffer eliminado", "info");
}
window.deleteCustomBuffer = deleteCustomBuffer;

// ==================== EDITING ====================
function enableBufferEditing() {
  editableBuffers.forEach((data, ni) => {
    data.circle.setStyle({ color: '#f0883e', fillColor: '#f0883e', weight: 3, fillOpacity: 0.2 });
    makeBufferDraggable(data.circle, data, false, ni);
    data.circle.on('click', (e) => { L.DomEvent.stopPropagation(e); if (editMode && !data.isDragging) showBufferPopup(data, false); });
  });
  customBuffers.forEach(buffer => makeBufferDraggable(buffer.circle, buffer, true));
}

function disableBufferEditing() {
  editableBuffers.forEach((data) => {
    data.circle.setStyle({ color: '#58a6ff', fillColor: '#58a6ff', weight: 2, fillOpacity: 0.08 });
    data.circle.off('mousedown'); data.circle.off('click');
  });
}

function makeBufferDraggable(circle, data, isCustom, ni = null) {
  let isDragging = false;
  circle.on('mousedown', function(e) {
    if (!editMode) return;
    isDragging = true; data.isDragging = true;
    map.dragging.disable();
    circle.setStyle({ weight: 4, fillOpacity: 0.3 });
    const onMove = (e) => { if (isDragging) circle.setLatLng(e.latlng); };
    const onUp = () => {
      isDragging = false; data.isDragging = false;
      map.dragging.enable();
      circle.setStyle({ weight: isCustom ? 2 : 3, fillOpacity: isCustom ? 0.15 : 0.2 });
      map.off('mousemove', onMove); map.off('mouseup', onUp);
      const pos = circle.getLatLng();
      data.currentPos = pos;
      if (isCustom) { data.lat = pos.lat; data.lng = pos.lng; }
      markAsChanged();
      regenerateAnimations();
      showNotification("Buffer reposicionado", "info");
    };
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
  });
}

function resetBufferPosition(ni) {
  const data = editableBuffers.get(ni);
  if (!data) return;
  data.circle.setLatLng([data.originalPos.lat, data.originalPos.lng]);
  data.currentPos = data.originalPos;
  markAsChanged();
  regenerateAnimations();
  showNotification("✓ Posición restaurada", "info");
}
window.resetBufferPosition = resetBufferPosition;

function resetAllBuffersState() { if (confirm('¿Reiniciar todos los buffers?')) { clearBuffersState(); location.reload(); } }
window.resetAllBuffersState = resetAllBuffersState;

// ==================== ANIMATIONS ====================
function regenerateAnimations() {
  layers.connections.clearLayers();
  animationLines = [];
  if (!globalData) return;
  const { nucleos, satellites } = globalData;
  
  satellites.forEach(sat => {
    let bestBuffer = null, bestDist = BUFFER_RADIUS_M + 1;
    editableBuffers.forEach((data) => {
      const pos = data.circle.getLatLng();
      const dist = haversineMeters(sat.lat, sat.lng, pos.lat, pos.lng);
      if (dist <= BUFFER_RADIUS_M && dist < bestDist) { bestDist = dist; bestBuffer = pos; }
    });
    if (!bestBuffer) {
      customBuffers.forEach(buffer => {
        const pos = buffer.circle.getLatLng();
        const dist = haversineMeters(sat.lat, sat.lng, pos.lat, pos.lng);
        if (dist <= BUFFER_RADIUS_M && dist < bestDist) { bestDist = dist; bestBuffer = pos; }
      });
    }
    if (bestBuffer) {
      const line = L.polyline([[sat.lat, sat.lng], [bestBuffer.lat, bestBuffer.lng]], { color: '#58a6ff', weight: 1.5, opacity: 0.4, dashArray: '8,8', renderer: canvasRenderer });
      line.addTo(layers.connections);
      animationLines.push(line);
    }
  });
  
  if (ENABLE_NETWORK_ANIMATION && animationLines.length <= MAX_CONNECTIONS_FOR_ANIM) startConnectionAnimation(animationLines);
}

function startConnectionAnimation(lines) {
  stopAnimations();
  let offset = 0;
  _connectionAnimTimer = setInterval(() => {
    offset = (offset + 1) % 1000;
    lines.forEach(line => line.setStyle({ dashOffset: String(offset) }));
  }, 80);
}

function stopAnimations() { if (_connectionAnimTimer) { clearInterval(_connectionAnimTimer); _connectionAnimTimer = null; } }

// ==================== UTILITIES ====================
function showNotification(message, type = 'info') {
  const n = document.createElement('div');
  n.className = `notification notification-${type}`;
  n.innerHTML = `<div class="notification-content">${type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '⚠'} ${message}</div>`;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3500);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHTML(str) { return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

function flyToLocation(lat, lng) { map.flyTo([lat, lng], 12, { duration: 1.2 }); }
window.flyToLocation = flyToLocation;

// ==================== CSV LOADING ====================
function loadCSV() {
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
}

function resolveColumnIndexes(headerRow) {
  const norm = s => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
  const header = headerRow.map(norm);
  const find = (candidates) => { for (let c of candidates) { const idx = header.findIndex(h => h.includes(c)); if (idx >= 0) return idx; } return -1; };
  return { idx: { lat: find(["lat", "latitud"]), lon: find(["lon", "longitud", "lng"]), code: find(["cod_gdece"]), name: find(["nombre_ie", "nombre_institución"]), dist: find(["distrito"]), students: find(["total estudiantes", "estudiantes"]), amie: find(["amie"]) }, issues: [] };
}

function mapRowsToData(rows, idx) {
  const data = [], bounds = L.latLngBounds();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r?.length) continue;
    const lat = parseFloat(String(r[idx.lat] || "").replace(",", "."));
    const lng = parseFloat(String(r[idx.lon] || "").replace(",", "."));
    const codeVal = parseInt(String(r[idx.code] || "").trim(), 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || ![2, 3, 4, 5].includes(codeVal)) continue;
    const name = idx.name >= 0 ? String(r[idx.name] || "").trim() : "";
    const dist = idx.dist >= 0 ? String(r[idx.dist] || "").trim() : "";
    const students = idx.students >= 0 ? parseInt(String(r[idx.students] || "0").replace(/\D/g, ""), 10) || 0 : 0;
    const amie = idx.amie >= 0 ? String(r[idx.amie] || "").trim() : "";
    data.push({ lat, lng, code: codeVal, name, dist, students, amie });
    bounds.extend([lat, lng]);
  }
  return { data, bounds };
}

function processData(data) {
  layers.nucleos.clearLayers(); layers.satellites.clearLayers(); layers.buffers.clearLayers(); layers.connections.clearLayers(); layers.animations.clearLayers();
  editableBuffers.clear(); stopAnimations();
  
  const nucleos = data.filter(d => [3, 4, 5].includes(d.code));
  const satellites = data.filter(d => d.code === 2);
  globalData = { nucleos, satellites };
  
  if (!nucleos.length || !satellites.length) { hideLoadingOverlay(); return; }
  
  const spatialIndex = buildSpatialIndex(satellites);
  const satCandidates = findCandidates(nucleos, satellites, spatialIndex);
  const result = setCoverGreedy(nucleos, satellites, satCandidates);
  const nucleoStats = buildNucleoStats(nucleos, satCandidates);
  
  drawNucleos(nucleos, result.selected);
  drawBuffersEditable(nucleos, result.selected, nucleoStats);
  drawSatellites(satellites, satCandidates, result.selected);
  regenerateAnimations();
  
  const stats = computeStatistics(nucleos, satellites, satCandidates, result.selected, nucleoStats);
  updateStatistics(stats);
  updateTopNucleos(nucleoStats);
  
  hideLoadingOverlay();
  console.log(`✓ ${nucleos.length} núcleos, ${satellites.length} satélites`);
}

function buildSpatialIndex(satellites) {
  const grid = new Map();
  satellites.forEach((s, i) => { const key = `${Math.floor(s.lat / GRID_CELL_DEG)},${Math.floor(s.lng / GRID_CELL_DEG)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); });
  return grid;
}

function findCandidates(nucleos, satellites, spatialIndex) {
  const satCandidates = Array.from({ length: satellites.length }, () => []);
  nucleos.forEach((n, ni) => {
    const cellLat = Math.floor(n.lat / GRID_CELL_DEG), cellLng = Math.floor(n.lng / GRID_CELL_DEG);
    for (let dLat = -2; dLat <= 2; dLat++) for (let dLng = -2; dLng <= 2; dLng++) {
      (spatialIndex.get(`${cellLat + dLat},${cellLng + dLng}`) || []).forEach(si => {
        const dist = haversineMeters(n.lat, n.lng, satellites[si].lat, satellites[si].lng);
        if (dist <= BUFFER_RADIUS_M) satCandidates[si].push({ ni, dist });
      });
    }
  });
  satCandidates.forEach(cands => cands.sort((a, b) => a.dist - b.dist));
  return satCandidates;
}

function setCoverGreedy(nucleos, satellites, satCandidates) {
  const uncovered = new Set(satCandidates.map((c, i) => c.length > 0 ? i : -1).filter(i => i >= 0));
  const selected = new Set();
  const nucleoStats = buildNucleoStats(nucleos, satCandidates);
  while (uncovered.size > 0 && selected.size < MAX_BUFFERS) {
    if (uncovered.size / satellites.length <= (1 - TARGET_COVERAGE)) break;
    let bestNi = -1, bestCount = 0;
    nucleos.forEach((_, ni) => {
      if (selected.has(ni) || nucleoStats[ni].satIdx.length < MIN_SATS_PER_BUFFER) return;
      let count = nucleoStats[ni].satIdx.filter(si => uncovered.has(si)).length;
      if (count > bestCount) { bestCount = count; bestNi = ni; }
    });
    if (bestNi < 0) break;
    selected.add(bestNi);
    nucleoStats[bestNi].satIdx.forEach(si => uncovered.delete(si));
  }
  return { selected, uncovered };
}

function buildNucleoStats(nucleos, satCandidates) {
  const stats = nucleos.map(n => ({ satIdx: [], totalStudents: 0, nucleo: n }));
  satCandidates.forEach((cands, si) => { if (cands.length > 0) stats[cands[0].ni].satIdx.push(si); });
  stats.forEach(st => st.satIdx.forEach(si => st.totalStudents += globalData.satellites[si].students || 0));
  return stats;
}

function drawNucleos(nucleos, selected) {
  nucleos.forEach((n, ni) => {
    const isSelected = selected.has(ni);
    const marker = L.circleMarker([n.lat, n.lng], { radius: isSelected ? 10 : 6, fillColor: isSelected ? '#3fb950' : '#58a6ff', color: '#fff', weight: 2, opacity: 1, fillOpacity: isSelected ? 0.9 : 0.7, renderer: canvasRenderer });
    marker.bindPopup(createNucleoPopup(n, 0, 0));
    marker.addTo(layers.nucleos);
  });
}

function drawBuffersEditable(nucleos, selected, nucleoStats) {
  const savedState = loadBuffersState();
  const savedPositions = new Map();
  if (savedState?.editableBuffers) savedState.editableBuffers.forEach(s => savedPositions.set(s.ni, { lat: s.currentLat, lng: s.currentLng }));
  
  selected.forEach(ni => {
    const n = nucleos[ni], st = nucleoStats[ni];
    const savedPos = savedPositions.get(ni);
    const lat = savedPos ? savedPos.lat : n.lat, lng = savedPos ? savedPos.lng : n.lng;
    const circle = L.circle([lat, lng], { radius: BUFFER_RADIUS_M, color: '#58a6ff', fillColor: '#58a6ff', weight: 2, opacity: 0.6, fillOpacity: 0.08, renderer: canvasRenderer });
    circle.addTo(layers.buffers);
    circle.on('click', (e) => { if (!editMode) showBufferPopup(editableBuffers.get(ni), false); });
    editableBuffers.set(ni, { circle, nucleo: n, stats: st, originalPos: { lat: n.lat, lng: n.lng }, currentPos: { lat, lng }, isDragging: false });
  });
  
  if (savedState?.customBuffers) savedState.customBuffers.forEach(s => restoreCustomBuffer(s));
}

function restoreCustomBuffer(saved) {
  customBufferCounter++;
  const circle = L.circle([saved.lat, saved.lng], { radius: BUFFER_RADIUS_M, color: '#a371f7', fillColor: '#a371f7', weight: 2, opacity: 0.7, fillOpacity: 0.15, renderer: canvasRenderer });
  circle.addTo(layers.buffers);
  const buffer = { id: saved.id, circle, lat: saved.lat, lng: saved.lng, originalPos: { lat: saved.lat, lng: saved.lng }, currentPos: { lat: saved.lat, lng: saved.lng }, isCustom: true, isDragging: false, name: saved.name };
  customBuffers.push(buffer);
  circle.on('click', (e) => { L.DomEvent.stopPropagation(e); showBufferPopup(buffer, true); });
  if (editMode) makeBufferDraggable(circle, buffer, true);
}

function drawSatellites(satellites, satCandidates, selected) {
  satellites.forEach((s, si) => {
    let isCovered = false, bestDist = BUFFER_RADIUS_M + 1;
    satCandidates[si]?.forEach(c => { if (selected.has(c.ni) && c.dist < bestDist) { bestDist = c.dist; isCovered = true; } });
    const marker = L.circleMarker([s.lat, s.lng], { radius: 4, fillColor: isCovered ? '#3fb950' : '#f85149', color: '#fff', weight: 1, opacity: 1, fillOpacity: 0.8, renderer: canvasRenderer });
    marker.bindPopup(createSatellitePopup(s, isCovered ? bestDist : null));
    marker.addTo(layers.satellites);
  });
}

function hideLoadingOverlay() { const o = document.getElementById("loadingOverlay"); if (o) { o.style.opacity = "0"; setTimeout(() => o.style.display = "none", 500); } }

function createNucleoPopup(n, satCount, totalStudents) {
  return `<div class="popup-title">🏛️ Núcleo DECE</div><div class="popup-content"><div class="popup-row"><span class="popup-label">Institución:</span><span class="popup-value">${escapeHTML(n.name)}</span></div><div class="popup-row"><span class="popup-label">Distrito:</span><span class="popup-value">${escapeHTML(n.dist)}</span></div><div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value" style="color:#d29922">${(n.students || 0).toLocaleString()}</span></div></div>`;
}

function createSatellitePopup(s, distMetersOrNull) {
  const covered = distMetersOrNull !== null;
  return `<div class="popup-title">📍 Satélite</div><div class="popup-content"><div class="popup-row"><span class="popup-label">Institución:</span><span class="popup-value">${escapeHTML(s.name)}</span></div><div class="popup-row"><span class="popup-label">Distrito:</span><span class="popup-value">${escapeHTML(s.dist)}</span></div><div class="popup-row"><span class="popup-label">Estado:</span><span class="popup-value" style="color:${covered ? "#3fb950" : "#f85149"}">${covered ? "✓ Cubierto" : "✗ Sin cobertura"}</span></div>${covered ? `<div class="popup-row"><span class="popup-label">Distancia:</span><span class="popup-value">${(distMetersOrNull/1000).toFixed(2)} km</span></div>` : ''}<div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value" style="color:#d29922">${(s.students || 0).toLocaleString()}</span></div></div>`;
}

function updateStatistics(stats) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = typeof val === 'number' ? val.toLocaleString() : val; };
  set("totalNucleos", stats.totalNucleos); set("totalSatellites", stats.totalSatellites); set("coveragePercent", stats.coveragePercent + "%"); set("totalStudents", stats.totalStudents);
  set("nucleosActivos", stats.nucleosActivos); set("sinCobertura", stats.sinCobertura);
  const fill = document.getElementById("coverageFill"); if (fill) fill.style.width = Math.min(100, parseFloat(stats.coveragePercent)) + "%";
}

function computeStatistics(nucleos, satellites, satCandidates, selected, nucleoStats) {
  let covered = 0, totalStudents = 0;
  satellites.forEach((s, si) => { if (satCandidates[si]?.some(c => selected.has(c.ni))) { covered++; totalStudents += s.students || 0; } });
  return { totalNucleos: nucleos.length, totalSatellites: satellites.length, coveragePercent: satellites.length > 0 ? ((covered / satellites.length) * 100).toFixed(1) : "0.0", totalStudents, nucleosActivos: selected.size, sinCobertura: satellites.length - covered };
}

function updateTopNucleos(nucleoStats) {
  const container = document.getElementById("topNucleos");
  if (!container) return;
  const sorted = nucleoStats.map((st, i) => ({ st, i })).sort((a, b) => b.st.satIdx.length - a.st.satIdx.length).slice(0, 10);
  container.innerHTML = sorted.map((x, idx) => `<div class="top-item" onclick="flyToLocation(${x.st.nucleo.lat},${x.st.nucleo.lng})"><div class="top-item-header"><span class="top-rank">#${idx + 1}</span><span class="top-name">${escapeHTML(x.st.nucleo.name)}</span><span class="top-count">${x.st.satIdx.length}</span></div><div class="top-desc">${x.st.totalStudents.toLocaleString()} est.</div></div>`).join("");
}

function setupControls() {
  document.getElementById("toggleStats")?.addEventListener("click", () => { document.getElementById("statsPanel")?.classList.toggle("active"); document.getElementById("legendPanel")?.classList.remove("active"); });
  document.getElementById("toggleLegend")?.addEventListener("click", () => { document.getElementById("legendPanel")?.classList.toggle("active"); document.getElementById("statsPanel")?.classList.remove("active"); });
  ["toggleBuffers", "toggleConnections", "toggleNucleos", "toggleSatellites"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", (e) => { const layer = [layers.buffers, layers.connections, layers.nucleos, layers.satellites][i]; e.target.checked ? map.addLayer(layer) : map.removeLayer(layer); });
  });
  setTimeout(() => document.getElementById("statsPanel")?.classList.add("active"), 500);
}
// ==================== VARIABLES GLOBALES AÑADIDAS ====================
let selectedBufferForDelete = null;
let coverageLayerEnabled = false;
let adjustedBuffers = new Set();
let emptyBuffers = new Set();
let coverageProgressInterval = null;

// ==================== MEJORA ELIMINACIÓN CON TECLADO ====================
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Suprimir o Delete para eliminar buffer seleccionado
        if ((e.key === 'Delete' || e.key === 'Suprimir') && selectedBufferForDelete) {
            confirmDeleteSelectedBuffer();
        }
        
        // Escape para cancelar selección
        if (e.key === 'Escape') {
            cancelDeleteSelection();
        }
        
        // Ctrl+D para activar modo borrado
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            toggleDeleteMode();
        }
    });
}

function selectBufferForDelete(bufferData, isCustom = false) {
    // Limpiar selección anterior
    cancelDeleteSelection();
    
    // Marcar nuevo buffer para eliminar
    selectedBufferForDelete = { bufferData, isCustom };
    bufferData.circle.addClass('buffer-to-delete');
    
    // Mostrar panel de confirmación
    showDeleteConfirmPanel(bufferData);
}

function cancelDeleteSelection() {
    if (selectedBufferForDelete) {
        selectedBufferForDelete.bufferData.circle.removeClass('buffer-to-delete');
        selectedBufferForDelete = null;
    }
    document.querySelector('.delete-confirm-panel')?.remove();
}

function confirmDeleteSelectedBuffer() {
    if (!selectedBufferForDelete) return;
    
    const { bufferData, isCustom } = selectedBufferForDelete;
    
    if (isCustom) {
        deleteCustomBuffer(bufferData.id);
    } else {
        showNotification("⚠️ Los buffers de núcleo no se pueden eliminar, solo mover", "error");
    }
    
    cancelDeleteSelection();
}

function showDeleteConfirmPanel(bufferData) {
    // Eliminar panel anterior si existe
    document.querySelector('.delete-confirm-panel')?.remove();
    
    const panel = document.createElement('div');
    panel.className = 'delete-confirm-panel';
    panel.innerHTML = `
        <div class="delete-confirm-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            ¿Eliminar buffer?
        </div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            ${bufferData.name || 'Buffer'} será eliminado permanentemente.
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
            Presiona <strong>Suprimir</strong> para confirmar o <strong>ESC</strong> para cancelar
        </div>
        <div class="delete-confirm-buttons">
            <button class="btn-cancel-delete" onclick="cancelDeleteSelection()">Cancelar (ESC)</button>
            <button class="btn-confirm-delete" onclick="confirmDeleteSelectedBuffer()">Eliminar (Suprimir)</button>
        </div>
    `;
    
    document.body.appendChild(panel);
}

// ==================== LIMPIEZA AUTOMÁTICA DE BUFFERS VACÍOS ====================
function scanAndRemoveEmptyBuffers() {
    showNotification("🔍 Escaneando buffers vacíos...", "info");
    
    let removedCount = 0;
    const buffersToCheck = [...editableBuffers.entries(), ...customBuffers.map(b => [b.id, b])];
    
    buffersToCheck.forEach(([id, bufferData]) => {
        const metrics = calculateBufferMetricsDetailed(bufferData.circle.getLatLng(), BUFFER_RADIUS_M);
        
        if (metrics.iesCount === 0) {
            if (bufferData.isCustom) {
                deleteCustomBuffer(bufferData.id);
                removedCount++;
            } else {
                // Para buffers de núcleo, marcamos como vacío pero no eliminamos
                emptyBuffers.add(id);
                bufferData.circle.setStyle({ 
                    color: '#6e7681', 
                    fillColor: '#6e7681',
                    opacity: 0.3,
                    fillOpacity: 0.05,
                    dashArray: '5,5'
                });
            }
        } else {
            emptyBuffers.delete(id);
        }
    });
    
    // Recalcular cobertura
    regenerateAnimations();
    updateCoverageProgress();
    
    if (removedCount > 0) {
        showNotification(`✅ Eliminados ${removedCount} buffers vacíos`, "success");
        markAsChanged();
    } else {
        showNotification("ℹ️ No se encontraron buffers vacíos", "info");
    }
}

// ==================== CAPA DE COBERTURA TERRITORIAL ====================
function initCoverageLayer() {
    // Crear toggle en la interfaz
    createCoverageToggle();
    
    // Inicializar seguimiento de buffers ajustados
    updateAdjustedBuffers();
    
    // Actualizar progreso cada 5 segundos
    coverageProgressInterval = setInterval(updateCoverageProgress, 5000);
}

function createCoverageToggle() {
    const togglePanel = document.createElement('div');
    togglePanel.className = 'toggle-coverage-panel';
    togglePanel.innerHTML = `
        <div class="toggle-coverage-info">
            <div class="toggle-coverage-label">🧩 Cobertura Territorial</div>
            <div class="toggle-coverage-subtitle" id="coverageSubtitle">0/0 buffers ajustados</div>
        </div>
        <label class="switch">
            <input type="checkbox" id="toggleCoverageLayer" ${coverageLayerEnabled ? 'checked' : ''}>
            <span class="slider"></span>
        </label>
    `;
    
    document.body.appendChild(togglePanel);
    
    // Event listener para el toggle
    document.getElementById('toggleCoverageLayer').addEventListener('change', (e) => {
        coverageLayerEnabled = e.target.checked;
        toggleCoverageLayer();
    });
}

function toggleCoverageLayer() {
    if (coverageLayerEnabled) {
        showNotification("🧩 Activada capa de cobertura territorial", "info");
        updateCoverageVisualization();
        document.body.classList.add('coverage-mode');
    } else {
        showNotification("Capa de cobertura desactivada", "info");
        resetCoverageVisualization();
        document.body.classList.remove('coverage-mode');
    }
}

function updateCoverageVisualization() {
    // Ocultar/mostrar buffers según estado de ajuste
    editableBuffers.forEach((data, ni) => {
        const isAdjusted = adjustedBuffers.has(ni);
        const isEmpty = emptyBuffers.has(ni);
        
        if (isEmpty) {
            // Buffers vacíos - muy tenues
            data.circle.setStyle({ 
                opacity: 0.2,
                fillOpacity: 0.02,
                color: '#6e7681'
            });
        } else if (isAdjusted) {
            // Buffers ajustados - verde brillante
            data.circle.setStyle({ 
                opacity: 0.8,
                fillOpacity: 0.2,
                color: '#3fb950',
                weight: 3
            });
        } else {
            // Buffers sin ajustar - rojo
            data.circle.setStyle({ 
                opacity: 0.6,
                fillOpacity: 0.1,
                color: '#f85149',
                weight: 2
            });
        }
    });
    
    customBuffers.forEach(buffer => {
        buffer.circle.setStyle({ 
            opacity: 0.7,
            fillOpacity: 0.15,
            color: '#a371f7',
            weight: 2
        });
    });
}

function resetCoverageVisualization() {
    // Restaurar estilos originales
    editableBuffers.forEach((data, ni) => {
        const isEmpty = emptyBuffers.has(ni);
        
        if (isEmpty) {
            data.circle.setStyle({ 
                color: '#6e7681', 
                fillColor: '#6e7681',
                opacity: 0.3,
                fillOpacity: 0.05,
                dashArray: '5,5'
            });
        } else {
            data.circle.setStyle({ 
                color: editMode ? '#f0883e' : '#58a6ff', 
                fillColor: editMode ? '#f0883e' : '#58a6ff',
                opacity: editMode ? 0.6 : 0.6,
                fillOpacity: editMode ? 0.2 : 0.08,
                weight: editMode ? 3 : 2,
                dashArray: null
            });
        }
    });
    
    customBuffers.forEach(buffer => {
        buffer.circle.setStyle({ 
            color: '#a371f7', 
            fillColor: '#a371f7',
            opacity: 0.7,
            fillOpacity: 0.15,
            weight: 2
        });
    });
}

function updateAdjustedBuffers() {
    // Un buffer se considera "ajustado" si ha sido movido de su posición original
    editableBuffers.forEach((data, ni) => {
        const pos = data.circle.getLatLng();
        const originalPos = data.originalPos;
        
        const wasMoved = haversineMeters(pos.lat, pos.lng, originalPos.lat, originalPos.lng) > 100; // Más de 100 metros
        
        if (wasMoved) {
            adjustedBuffers.add(ni);
        } else {
            adjustedBuffers.delete(ni);
        }
    });
}

function updateCoverageProgress() {
    updateAdjustedBuffers();
    
    const totalBuffers = editableBuffers.size;
    const adjustedCount = adjustedBuffers.size;
    const emptyCount = emptyBuffers.size;
    const activeCount = totalBuffers - emptyCount;
    const percentage = activeCount > 0 ? Math.round((adjustedCount / activeCount) * 100) : 0;
    
    // Actualizar subtítulo
    const subtitle = document.getElementById('coverageSubtitle');
    if (subtitle) {
        subtitle.textContent = `${adjustedCount}/${activeCount} buffers ajustados (${percentage}%)`;
    }
    
    // Actualizar barra de progreso si existe
    const progressFill = document.getElementById('coverageProgressFill');
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    
    // Si llegamos al 100%, mostrar notificación
    if (percentage === 100 && activeCount > 0) {
        showNotification("🎉 ¡Cobertura territorial completa! Todo ajustado al 100%", "success");
    }
    
    return { totalBuffers, adjustedCount, emptyCount, percentage };
}

// ==================== FUNCIONES DE INTERFAZ NUEVAS ====================
function showCoverageProgressPanel() {
    const stats = updateCoverageProgress();
    
    const panel = document.createElement('div');
    panel.className = 'delete-confirm-panel';
    panel.style.minWidth = '350px';
    panel.innerHTML = `
        <div class="delete-confirm-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.2 15c.7-1.2 1-2.5.8-3.9-.3-1.9-1.5-3.6-3.2-4.5-2.7-1.5-6.1-.9-8.3 1.5-2.2 2.4-2.6 6-.9 8.8 1.7 2.8 5 4 8.1 3.1"/>
                <path d="M16 16v4"/>
                <path d="M12 16v4"/>
                <path d="M8 16v4"/>
                <path d="M3 16v4"/>
                <path d="M3 12h18"/>
            </svg>
            Progreso de Cobertura Territorial
        </div>
        
        <div class="coverage-progress">
            <div class="progress-value">${stats.percentage}%</div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" id="coverageProgressFill" style="width: ${stats.percentage}%"></div>
            </div>
            <div class="progress-stats">
                <span>Buffers ajustados: ${stats.adjustedCount}</span>
                <span>Buffers vacíos: ${stats.emptyCount}</span>
                <span>Total: ${stats.totalBuffers}</span>
            </div>
        </div>
        
        <div style="margin-top: 16px;">
            <button class="btn-action" onclick="scanAndRemoveEmptyBuffers()" style="width: 100%; margin-bottom: 8px;">
                🗑️ Eliminar Buffers Vacíos
            </button>
            <button class="btn-action" onclick="completeCoverage()" style="width: 100%; margin-bottom: 8px;">
                🎯 Completar Cobertura Automáticamente
            </button>
            <button class="btn-cancel-delete" onclick="this.closest('.delete-confirm-panel').remove()" style="width: 100%;">
                Cerrar
            </button>
        </div>
    `;
    
    document.body.appendChild(panel);
}

// ==================== MODIFICACIONES A FUNCIONES EXISTENTES ====================

// Modificar enableDeleteMode para usar nueva interfaz
function enableDeleteMode() {
    deleteMode = true;
    const btn = document.getElementById("btnDeleteBuffers");
    if (btn) btn.classList.add("active");
    
    document.body.classList.add('delete-mode-active');
    
    // Hacer los buffers personalizados clickeables para seleccionar para eliminar
    customBuffers.forEach(buffer => {
        buffer.circle.off('click');
        buffer.circle.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (deleteMode) {
                selectBufferForDelete(buffer, true);
            }
        });
    });
    
    // También para buffers editables (núcleos)
    editableBuffers.forEach((data, ni) => {
        data.circle.off('click');
        data.circle.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (deleteMode) {
                showNotification("⚠️ Los buffers de núcleo no se pueden eliminar, solo mover", "error");
                selectBufferForDelete({...data, name: `Núcleo ${ni}`}, false);
            }
        });
    });
    
    showNotification("🗑️ Modo borrado activado. Haz clic en un buffer y presiona Suprimir para eliminar.", "info");
}

// Modificar disableDeleteMode
function disableDeleteMode() {
    deleteMode = false;
    const btn = document.getElementById("btnDeleteBuffers");
    if (btn) btn.classList.remove("active");
    
    document.body.classList.remove('delete-mode-active');
    cancelDeleteSelection();
    
    // Restaurar comportamiento normal
    customBuffers.forEach(buffer => {
        buffer.circle.off('click');
        buffer.circle.on('click', (e) => { 
            L.DomEvent.stopPropagation(e); 
            showBufferPopup(buffer, true); 
        });
    });
    
    editableBuffers.forEach((data, ni) => {
        data.circle.off('click');
        data.circle.on('click', (e) => { 
            if (!editMode) showBufferPopup(data, false); 
        });
    });
}

// Modificar makeBufferDraggable para rastrear ajustes
function makeBufferDraggable(circle, data, isCustom, ni = null) {
    let isDragging = false;
    let startPos = null;
    
    circle.on('mousedown', function(e) {
        if (!editMode) return;
        isDragging = true; 
        data.isDragging = true;
        startPos = circle.getLatLng();
        map.dragging.disable();
        circle.setStyle({ weight: 4, fillOpacity: 0.3 });
        
        const onMove = (e) => { 
            if (isDragging) circle.setLatLng(e.latlng); 
        };
        
        const onUp = () => {
            isDragging = false; 
            data.isDragging = false;
            map.dragging.enable();
            circle.setStyle({ 
                weight: isCustom ? 2 : 3, 
                fillOpacity: isCustom ? 0.15 : 0.2 
            });
            map.off('mousemove', onMove); 
            map.off('mouseup', onUp);
            
            const endPos = circle.getLatLng();
            data.currentPos = endPos;
            if (isCustom) { 
                data.lat = endPos.lat; 
                data.lng = endPos.lng; 
            }
            
            // Marcar como ajustado si se movió significativamente
            if (startPos && haversineMeters(startPos.lat, startPos.lng, endPos.lat, endPos.lng) > 100) {
                if (ni !== null) adjustedBuffers.add(ni);
                updateCoverageProgress();
            }
            
            markAsChanged();
            regenerateAnimations();
            showNotification("Buffer reposicionado", "info");
        };
        
        map.on('mousemove', onMove);
        map.on('mouseup', onUp);
    });
}

// Modificar drawBuffersEditable para inicializar emptyBuffers
function drawBuffersEditable(nucleos, selected, nucleoStats) {
    const savedState = loadBuffersState();
    const savedPositions = new Map();
    if (savedState?.editableBuffers) savedState.editableBuffers.forEach(s => savedPositions.set(s.ni, { lat: s.currentLat, lng: s.currentLng }));
    
    selected.forEach(ni => {
        const n = nucleos[ni], st = nucleoStats[ni];
        const savedPos = savedPositions.get(ni);
        const lat = savedPos ? savedPos.lat : n.lat, lng = savedPos ? savedPos.lng : n.lng;
        const circle = L.circle([lat, lng], { 
            radius: BUFFER_RADIUS_M, 
            color: '#58a6ff', 
            fillColor: '#58a6ff', 
            weight: 2, 
            opacity: 0.6, 
            fillOpacity: 0.08, 
            renderer: canvasRenderer 
        });
        circle.addTo(layers.buffers);
        circle.on('click', (e) => { if (!editMode) showBufferPopup(editableBuffers.get(ni), false); });
        editableBuffers.set(ni, { 
            circle, 
            nucleo: n, 
            stats: st, 
            originalPos: { lat: n.lat, lng: n.lng }, 
            currentPos: { lat, lng }, 
            isDragging: false 
        });
        
        // Verificar si está vacío inicialmente
        const metrics = calculateBufferMetricsDetailed({lat, lng}, BUFFER_RADIUS_M);
        if (metrics.iesCount === 0) {
            emptyBuffers.add(ni);
            circle.setStyle({ 
                color: '#6e7681', 
                fillColor: '#6e7681',
                opacity: 0.3,
                fillOpacity: 0.05,
                dashArray: '5,5'
            });
        }
    });
    
    if (savedState?.customBuffers) savedState.customBuffers.forEach(s => restoreCustomBuffer(s));
}

// ==================== INICIALIZACIÓN COMPLETA ====================
document.addEventListener("DOMContentLoaded", () => {
    if (_initialized) return;
    _initialized = true;
    initMap();
    setupControls();
    setupEditControls();
    initKeyboardShortcuts();
    initCoverageLayer();
    loadCSV();
});

// ==================== NUEVAS FUNCIONES PARA LA INTERFAZ ====================
window.scanAndRemoveEmptyBuffers = scanAndRemoveEmptyBuffers;
window.showCoverageProgressPanel = showCoverageProgressPanel;
window.selectBufferForDelete = selectBufferForDelete;
window.confirmDeleteSelectedBuffer = confirmDeleteSelectedBuffer;
window.cancelDeleteSelection = cancelDeleteSelection;

// Agregar botón al panel de leyenda
// Buscar en index.html y añadir esto en la sección de "Leyenda":
/*
<div class="legend-section">
    <div class="legend-title">🧩 Cobertura Territorial</div>
    <div class="legend-help">
        <p>Verde: Buffers ya ajustados manualmente</p>
        <p>Rojo: Buffers que aún necesitan ajuste</p>
        <p>Gris: Buffers vacíos (sin instituciones)</p>
        <button class="btn-analysis" onclick="showCoverageProgressPanel()">
            📊 Ver Progreso de Cobertura
        </button>
        <button class="btn-analysis" onclick="scanAndRemoveEmptyBuffers()" style="margin-top: 8px;">
            🗑️ Eliminar Buffers Vacíos
        </button>
    </div>
</div>
*/
/*************************************************
 * DECE Coverage App - v7.0 COBERTURA TERRITORIAL
 * ✅ Tecla Suprimir/Delete para eliminar buffers
 * ✅ Limpieza automática de buffers vacíos
 * ✅ Capa de cobertura territorial (rompecabezas)
 * ✅ Barrido inteligente del territorio
 *************************************************/

// ==================== VARIABLES GLOBALES NUEVAS ====================
let selectedBufferForDelete = null;
let coverageLayerEnabled = false;
let adjustedBuffers = new Set(); // Buffers que ya fueron movidos
let emptyBuffers = new Set(); // Buffers vacíos (sin instituciones)
let bufferStats = new Map(); // Estadísticas de cada buffer
let sweepMode = false; // Modo barrido inteligente
let coverageProgressPanel = null;

// ==================== INICIALIZACIÓN MEJORADA ====================
document.addEventListener("DOMContentLoaded", () => {
  if (_initialized) return;
  _initialized = true;
  initMap();
  setupControls();
  setupEditControls();
  initKeyboardShortcuts();
  initCoverageLayer();
  loadCSV();
});

function initCoverageLayer() {
  // Crear toggle de cobertura territorial
  createCoverageToggle();
  
  // Inicializar eventos de teclado
  initKeyboardShortcuts();
  
  // Actualizar progreso periódicamente
  setInterval(updateCoverageProgress, 3000);
}

function createCoverageToggle() {
  // Eliminar toggle anterior si existe
  document.getElementById('coverageTogglePanel')?.remove();
  
  const togglePanel = document.createElement('div');
  togglePanel.id = 'coverageTogglePanel';
  togglePanel.className = 'coverage-toggle-panel';
  togglePanel.innerHTML = `
    <div class="coverage-toggle-info">
      <div class="coverage-toggle-label">
        <span>🧩 Cobertura Territorial</span>
        <span id="coverageProgressText" style="font-size: 12px; color: var(--accent-blue);">0%</span>
      </div>
      <div class="coverage-toggle-subtitle" id="coverageSubtitle">0/0 buffers ajustados</div>
    </div>
    <label class="switch">
      <input type="checkbox" id="toggleCoverageLayer" ${coverageLayerEnabled ? 'checked' : ''}>
      <span class="slider"></span>
    </label>
  `;
  
  document.body.appendChild(togglePanel);
  
  // Event listener para el toggle
  document.getElementById('toggleCoverageLayer').addEventListener('change', (e) => {
    coverageLayerEnabled = e.target.checked;
    toggleCoverageLayer();
  });
}

// ==================== TECLADO Y ELIMINACIÓN MEJORADA ====================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e) {
  // Suprimir o Delete para eliminar buffer seleccionado
  if ((e.key === 'Delete' || e.key === 'Suprimir') && selectedBufferForDelete) {
    e.preventDefault();
    confirmDeleteSelectedBuffer();
  }
  
  // Escape para cancelar selección
  if (e.key === 'Escape') {
    cancelDeleteSelection();
  }
  
  // Ctrl+D para activar modo borrado
  if (e.ctrlKey && e.key === 'd') {
    e.preventDefault();
    toggleDeleteMode();
  }
  
  // Ctrl+B para barrido inteligente
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    performIntelligentSweep();
  }
  
  // Ctrl+P para ver progreso
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    showCoverageProgressPanel();
  }
  
  // Ctrl+T para toggle cobertura territorial
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault();
    document.getElementById('toggleCoverageLayer')?.click();
  }
}

function selectBufferForDelete(bufferData, isCustom = false) {
  // Limpiar selección anterior
  cancelDeleteSelection();
  
  // Marcar nuevo buffer para eliminar
  selectedBufferForDelete = { bufferData, isCustom };
  
  // Aplicar estilo de selección
  bufferData.circle.setStyle({ 
    color: '#f85149',
    fillColor: '#f85149',
    weight: 4,
    opacity: 0.9,
    fillOpacity: 0.3
  });
  
  // Mostrar panel de confirmación
  showDeleteConfirmPanel(bufferData);
  
  // Mostrar hint del teclado
  showKeyboardHint("Presiona <strong>Suprimir</strong> para eliminar o <strong>ESC</strong> para cancelar");
}

function cancelDeleteSelection() {
  if (selectedBufferForDelete) {
    const { bufferData, isCustom } = selectedBufferForDelete;
    
    // Restaurar estilo original
    if (isCustom) {
      bufferData.circle.setStyle({ 
        color: '#a371f7', 
        fillColor: '#a371f7',
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.15
      });
    } else {
      bufferData.circle.setStyle({ 
        color: editMode ? '#f0883e' : '#58a6ff', 
        fillColor: editMode ? '#f0883e' : '#58a6ff',
        weight: editMode ? 3 : 2,
        opacity: editMode ? 0.6 : 0.6,
        fillOpacity: editMode ? 0.2 : 0.08
      });
    }
    
    selectedBufferForDelete = null;
  }
  
  // Ocultar panel de confirmación
  document.querySelector('.delete-confirm-panel')?.remove();
  
  // Ocultar hint del teclado
  hideKeyboardHint();
}

function confirmDeleteSelectedBuffer() {
  if (!selectedBufferForDelete) return;
  
  const { bufferData, isCustom } = selectedBufferForDelete;
  
  if (isCustom) {
    deleteCustomBuffer(bufferData.id);
    showNotification("✅ Buffer personalizado eliminado", "success");
  } else {
    showNotification("⚠️ Los buffers de núcleo no se pueden eliminar", "error");
  }
  
  cancelDeleteSelection();
}

function showDeleteConfirmPanel(bufferData) {
  // Eliminar panel anterior si existe
  document.querySelector('.delete-confirm-panel')?.remove();
  
  const panel = document.createElement('div');
  panel.className = 'delete-confirm-panel';
  panel.innerHTML = `
    <div class="delete-confirm-title">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
      </svg>
      ¿Eliminar buffer?
    </div>
    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
      <strong>${bufferData.name || 'Buffer'}</strong> será eliminado permanentemente.
    </div>
    <div class="delete-confirm-buttons">
      <button class="btn-cancel-delete" onclick="cancelDeleteSelection()">Cancelar (ESC)</button>
      <button class="btn-confirm-delete" onclick="confirmDeleteSelectedBuffer()">Eliminar (Suprimir)</button>
    </div>
  `;
  
  document.body.appendChild(panel);
}

function showKeyboardHint(message) {
  // Eliminar hint anterior
  hideKeyboardHint();
  
  const hint = document.createElement('div');
  hint.className = 'keyboard-hint';
  hint.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(hint);
}

function hideKeyboardHint() {
  document.querySelector('.keyboard-hint')?.remove();
}

// ==================== LIMPIEZA DE BUFFERS VACÍOS ====================
function scanAndRemoveEmptyBuffers() {
  showNotification("🔍 Escaneando buffers vacíos...", "info");
  
  let removedCount = 0;
  const emptyCustomBuffers = [];
  
  // Escanear buffers personalizados
  customBuffers.forEach(buffer => {
    const metrics = calculateBufferMetricsDetailed(buffer.circle.getLatLng(), BUFFER_RADIUS_M);
    if (metrics.iesCount === 0) {
      emptyCustomBuffers.push(buffer);
    }
  });
  
  // Eliminar buffers personalizados vacíos
  emptyCustomBuffers.forEach(buffer => {
    deleteCustomBuffer(buffer.id);
    removedCount++;
  });
  
  // Marcar buffers de núcleo vacíos (sin eliminar)
  editableBuffers.forEach((data, ni) => {
    const metrics = calculateBufferMetricsDetailed(data.circle.getLatLng(), BUFFER_RADIUS_M);
    if (metrics.iesCount === 0) {
      emptyBuffers.add(ni);
      data.circle.setStyle({ 
        color: '#6e7681', 
        fillColor: '#6e7681',
        opacity: 0.3,
        fillOpacity: 0.05,
        weight: 1,
        dashArray: '5,5'
      });
      data.circle.addClass('empty-buffer');
    } else {
      emptyBuffers.delete(ni);
      data.circle.removeClass('empty-buffer');
    }
  });
  
  // Recalcular todo
  regenerateAnimations();
  updateCoverageProgress();
  
  if (removedCount > 0) {
    showNotification(`✅ Eliminados ${removedCount} buffers vacíos`, "success");
    markAsChanged();
  } else {
    showNotification("ℹ️ No se encontraron buffers vacíos para eliminar", "info");
  }
}

// ==================== BARRIDO INTELIGENTE ====================
function performIntelligentSweep() {
  showNotification("🌀 Realizando barrido inteligente...", "info");
  
  // 1. Eliminar buffers vacíos
  scanAndRemoveEmptyBuffers();
  
  // 2. Identificar áreas sin cobertura
  const uncovered = findUncoveredSatellites();
  
  // 3. Crear buffers estratégicos
  if (uncovered.length > 0) {
    const optimalPositions = findOptimalBufferPositions(uncovered);
    optimalPositions.forEach(pos => {
      createStrategicBuffer(pos.lat, pos.lng);
    });
    
    showNotification(`🎯 Creados ${optimalPositions.length} buffers estratégicos`, "success");
  }
  
  // 4. Optimizar buffers existentes
  optimizeExistingBuffers();
  
  // 5. Actualizar visualización
  updateCoverageVisualization();
  updateCoverageProgress();
  
  showNotification("✅ Barrido inteligente completado", "success");
}

function findOptimalBufferPositions(uncoveredSatellites) {
  const positions = [];
  const minDistance = BUFFER_RADIUS_M * 1.2; // Distancia mínima entre buffers
  
  // Agrupar satélites no cubiertos por proximidad
  const clusters = [];
  uncoveredSatellites.forEach(sat => {
    let addedToCluster = false;
    
    // Buscar cluster cercano
    for (const cluster of clusters) {
      const avgLat = cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length;
      const dist = haversineMeters(sat.lat, sat.lng, avgLat, avgLng);
      
      if (dist < BUFFER_RADIUS_M) {
        cluster.push(sat);
        addedToCluster = true;
        break;
      }
    }
    
    // Si no hay cluster cercano, crear uno nuevo
    if (!addedToCluster) {
      clusters.push([sat]);
    }
  });
  
  // Para cada cluster, encontrar posición óptima
  clusters.forEach(cluster => {
    if (cluster.length >= 3) { // Solo crear buffer si hay al menos 3 satélites
      // Calcular centroide del cluster
      const centerLat = cluster.reduce((sum, sat) => sum + sat.lat, 0) / cluster.length;
      const centerLng = cluster.reduce((sum, sat) => sum + sat.lng, 0) / cluster.length;
      
      // Verificar que no esté demasiado cerca de buffers existentes
      let tooClose = false;
      
      editableBuffers.forEach(data => {
        const pos = data.circle.getLatLng();
        if (haversineMeters(centerLat, centerLng, pos.lat, pos.lng) < minDistance) {
          tooClose = true;
        }
      });
      
      customBuffers.forEach(buffer => {
        const pos = buffer.circle.getLatLng();
        if (haversineMeters(centerLat, centerLng, pos.lat, pos.lng) < minDistance) {
          tooClose = true;
        }
      });
      
      if (!tooClose) {
        positions.push({ lat: centerLat, lng: centerLng });
      }
    }
  });
  
  return positions;
}

function createStrategicBuffer(lat, lng) {
  customBufferCounter++;
  const circle = L.circle([lat, lng], { 
    radius: BUFFER_RADIUS_M, 
    color: '#a371f7', 
    fillColor: '#a371f7', 
    weight: 3, 
    opacity: 0.8, 
    fillOpacity: 0.2,
    renderer: canvasRenderer 
  });
  
  circle.addTo(layers.buffers);
  
  const buffer = { 
    id: `strategic_${customBufferCounter}`, 
    circle, 
    lat, 
    lng, 
    originalPos: { lat, lng }, 
    currentPos: { lat, lng }, 
    isCustom: true, 
    isDragging: false, 
    name: `Buffer Estratégico #${customBufferCounter}` 
  };
  
  customBuffers.push(buffer);
  markAsChanged();
  
  circle.on('click', (e) => { 
    L.DomEvent.stopPropagation(e); 
    showBufferPopup(buffer, true); 
  });
  
  const metrics = calculateBufferMetrics({ lat, lng }, BUFFER_RADIUS_M);
  showNotification(`🎯 Buffer estratégico creado: ${metrics.iesCount} IEs cubiertas`, "info");
  
  setTimeout(() => regenerateAnimations(), 100);
  if (editMode) makeBufferDraggable(circle, buffer, true);
}

function optimizeExistingBuffers() {
  // Optimizar posición de buffers existentes para maximizar cobertura
  let optimizedCount = 0;
  
  editableBuffers.forEach((data, ni) => {
    // Solo optimizar buffers no vacíos
    if (!emptyBuffers.has(ni)) {
      const currentPos = data.circle.getLatLng();
      const optimalPos = findOptimalPositionForBuffer(ni, currentPos);
      
      // Si la nueva posición es significativamente mejor, mover el buffer
      if (optimalPos && haversineMeters(currentPos.lat, currentPos.lng, optimalPos.lat, optimalPos.lng) > 500) {
        data.circle.setLatLng([optimalPos.lat, optimalPos.lng]);
        data.currentPos = optimalPos;
        optimizedCount++;
        adjustedBuffers.add(ni);
      }
    }
  });
  
  if (optimizedCount > 0) {
    markAsChanged();
    regenerateAnimations();
    showNotification(`⚡ Optimizados ${optimizedCount} buffers existentes`, "success");
  }
}

function findOptimalPositionForBuffer(ni, currentPos) {
  // Encontrar posición óptima para un buffer basado en las instituciones que cubre
  const bufferData = editableBuffers.get(ni);
  if (!bufferData || !bufferData.stats) return null;
  
  const institutions = getInstitutionsInBuffer(currentPos);
  if (institutions.length === 0) return null;
  
  // Calcular centroide de las instituciones cubiertas
  const avgLat = institutions.reduce((sum, inst) => sum + inst.lat, 0) / institutions.length;
  const avgLng = institutions.reduce((sum, inst) => sum + inst.lng, 0) / institutions.length;
  
  return { lat: avgLat, lng: avgLng };
}

function getInstitutionsInBuffer(position) {
  if (!globalData) return [];
  
  const institutions = [];
  const radius = BUFFER_RADIUS_M;
  
  globalData.satellites.forEach(sat => {
    const dist = haversineMeters(position.lat, position.lng, sat.lat, sat.lng);
    if (dist <= radius) {
      institutions.push({ ...sat, type: 'satellite' });
    }
  });
  
  globalData.nucleos.forEach(nuc => {
    const dist = haversineMeters(position.lat, position.lng, nuc.lat, nuc.lng);
    if (dist <= radius) {
      institutions.push({ ...nuc, type: 'nucleo' });
    }
  });
  
  return institutions;
}

// ==================== CAPA DE COBERTURA TERRITORIAL ====================
function toggleCoverageLayer() {
  if (coverageLayerEnabled) {
    showNotification("🧩 Capa de cobertura territorial activada", "info");
    updateCoverageVisualization();
    document.body.classList.add('coverage-mode');
  } else {
    showNotification("Capa de cobertura desactivada", "info");
    resetCoverageVisualization();
    document.body.classList.remove('coverage-mode');
  }
}

function updateCoverageVisualization() {
  // Actualizar todos los buffers según su estado
  editableBuffers.forEach((data, ni) => {
    const isAdjusted = adjustedBuffers.has(ni);
    const isEmpty = emptyBuffers.has(ni);
    
    if (isEmpty) {
      // Buffers vacíos - estilo tenue
      data.circle.setStyle({ 
        color: '#6e7681',
        fillColor: '#6e7681',
        opacity: 0.3,
        fillOpacity: 0.05,
        weight: 1,
        dashArray: '5,5'
      });
    } else if (isAdjusted) {
      // Buffers ajustados - verde brillante
      data.circle.setStyle({ 
        color: '#3fb950',
        fillColor: '#3fb950',
        opacity: 0.8,
        fillOpacity: 0.2,
        weight: 3
      });
      data.circle.addClass('buffer-adjusted');
      data.circle.removeClass('buffer-unadjusted');
    } else {
      // Buffers sin ajustar - rojo/anaranjado
      data.circle.setStyle({ 
        color: '#f85149',
        fillColor: '#f85149',
        opacity: 0.7,
        fillOpacity: 0.15,
        weight: 2
      });
      data.circle.addClass('buffer-unadjusted');
      data.circle.removeClass('buffer-adjusted');
    }
  });
  
  // Buffers personalizados - púrpura
  customBuffers.forEach(buffer => {
    buffer.circle.setStyle({ 
      color: '#a371f7',
      fillColor: '#a371f7',
      opacity: 0.7,
      fillOpacity: 0.15,
      weight: 2
    });
    buffer.circle.addClass('buffer-custom');
  });
}

function resetCoverageVisualization() {
  // Restaurar estilos originales
  editableBuffers.forEach((data, ni) => {
    const isEmpty = emptyBuffers.has(ni);
    
    data.circle.removeClass('buffer-adjusted');
    data.circle.removeClass('buffer-unadjusted');
    data.circle.removeClass('buffer-custom');
    
    if (isEmpty) {
      data.circle.setStyle({ 
        color: '#6e7681', 
        fillColor: '#6e7681',
        opacity: 0.3,
        fillOpacity: 0.05,
        weight: 1,
        dashArray: '5,5'
      });
    } else {
      data.circle.setStyle({ 
        color: editMode ? '#f0883e' : '#58a6ff', 
        fillColor: editMode ? '#f0883e' : '#58a6ff',
        opacity: editMode ? 0.6 : 0.6,
        fillOpacity: editMode ? 0.2 : 0.08,
        weight: editMode ? 3 : 2,
        dashArray: null
      });
    }
  });
  
  customBuffers.forEach(buffer => {
    buffer.circle.removeClass('buffer-custom');
    buffer.circle.setStyle({ 
      color: '#a371f7', 
      fillColor: '#a371f7',
      opacity: 0.7,
      fillOpacity: 0.15,
      weight: 2
    });
  });
}

function updateAdjustedBuffers() {
  // Un buffer se considera "ajustado" si ha sido movido de su posición original
  editableBuffers.forEach((data, ni) => {
    const pos = data.circle.getLatLng();
    const originalPos = data.originalPos;
    
    const wasMoved = haversineMeters(pos.lat, pos.lng, originalPos.lat, originalPos.lng) > 100; // Más de 100 metros
    
    if (wasMoved) {
      adjustedBuffers.add(ni);
    } else {
      adjustedBuffers.delete(ni);
    }
  });
}

function updateCoverageProgress() {
  updateAdjustedBuffers();
  
  const totalBuffers = editableBuffers.size;
  const emptyCount = emptyBuffers.size;
  const activeCount = totalBuffers - emptyCount;
  const adjustedCount = adjustedBuffers.size;
  const percentage = activeCount > 0 ? Math.round((adjustedCount / activeCount) * 100) : 0;
  
  // Actualizar toggle
  const progressText = document.getElementById('coverageProgressText');
  const subtitle = document.getElementById('coverageSubtitle');
  
  if (progressText) {
    progressText.textContent = `${percentage}%`;
    progressText.style.color = percentage === 100 ? 'var(--accent-green)' : 
                              percentage >= 75 ? 'var(--accent-blue)' : 
                              percentage >= 50 ? 'var(--accent-yellow)' : 
                              'var(--accent-red)';
  }
  
  if (subtitle) {
    subtitle.textContent = `${adjustedCount}/${activeCount} buffers ajustados`;
    subtitle.style.color = percentage === 100 ? 'var(--accent-green)' : 'var(--text-secondary)';
  }
  
  // Si llegamos al 100%, mostrar notificación especial
  if (percentage === 100 && activeCount > 0) {
    const togglePanel = document.getElementById('coverageTogglePanel');
    if (togglePanel) {
      togglePanel.style.borderColor = 'var(--accent-green)';
      togglePanel.style.boxShadow = '0 0 20px rgba(63, 185, 80, 0.5)';
    }
    
    // Mostrar notificación una sola vez
    if (!localStorage.getItem('coverage100_notified')) {
      showNotification("🎉 ¡Felicidades! Cobertura territorial completa al 100%", "success");
      localStorage.setItem('coverage100_notified', 'true');
    }
  } else {
    const togglePanel = document.getElementById('coverageTogglePanel');
    if (togglePanel) {
      togglePanel.style.borderColor = '';
      togglePanel.style.boxShadow = '';
    }
    localStorage.removeItem('coverage100_notified');
  }
  
  return { totalBuffers, adjustedCount, emptyCount, percentage };
}

function showCoverageProgressPanel() {
  const stats = updateCoverageProgress();
  
  // Eliminar panel anterior si existe
  document.querySelector('.coverage-progress-panel')?.remove();
  
  const panel = document.createElement('div');
  panel.className = 'coverage-progress-panel';
  panel.innerHTML = `
    <div class="coverage-progress-header">
      <h3>📊 Progreso de Cobertura</h3>
      <button class="close-btn" onclick="this.closest('.coverage-progress-panel').remove()">×</button>
    </div>
    
    <div class="coverage-progress-stats">
      <div class="progress-value">${stats.percentage}%</div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${stats.percentage}%"></div>
      </div>
      
      <div class="progress-details">
        <div class="progress-detail-item">
          <span class="detail-value">${stats.adjustedCount}</span>
          <span class="detail-label">Ajustados</span>
        </div>
        <div class="progress-detail-item">
          <span class="detail-value">${stats.emptyCount}</span>
          <span class="detail-label">Vacíos</span>
        </div>
        <div class="progress-detail-item">
          <span class="detail-value">${stats.totalBuffers}</span>
          <span class="detail-label">Totales</span>
        </div>
      </div>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button class="btn-action" onclick="scanAndRemoveEmptyBuffers()" style="width: 100%;">
        🗑️ Eliminar Buffers Vacíos
      </button>
      <button class="btn-action btn-sweep" onclick="performIntelligentSweep()" style="width: 100%;">
        🌀 Barrido Inteligente
      </button>
      <button class="btn-action" onclick="completeCoverage()" style="width: 100%;">
        🎯 Completar Cobertura
      </button>
      ${stats.percentage === 100 ? `
      <button class="btn-action btn-export" onclick="showExportModal()" style="width: 100%; background: var(--accent-green);">
        📤 Exportar Análisis Completo
      </button>
      ` : ''}
    </div>
  `;
  
  document.body.appendChild(panel);
  coverageProgressPanel = panel;
}

// ==================== MODIFICACIONES A FUNCIONES EXISTENTES ====================

// Modificar enableDeleteMode para usar nueva interfaz
function enableDeleteMode() {
  deleteMode = true;
  const btn = document.getElementById("btnDeleteBuffers");
  if (btn) btn.classList.add("active");
  
  document.body.classList.add('delete-mode-active');
  
  // Hacer los buffers personalizados clickeables para seleccionar para eliminar
  customBuffers.forEach(buffer => {
    buffer.circle.off('click');
    buffer.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (deleteMode) {
        selectBufferForDelete(buffer, true);
      }
    });
  });
  
  // También para buffers editables (núcleos)
  editableBuffers.forEach((data, ni) => {
    data.circle.off('click');
    data.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (deleteMode) {
        selectBufferForDelete({...data, name: `Núcleo ${ni}`}, false);
      }
    });
  });
  
  showNotification("🗑️ Modo borrado activado. Haz clic en un buffer y presiona Suprimir para eliminar.", "info");
}

// Modificar disableDeleteMode
function disableDeleteMode() {
  deleteMode = false;
  const btn = document.getElementById("btnDeleteBuffers");
  if (btn) btn.classList.remove("active");
  
  document.body.classList.remove('delete-mode-active');
  cancelDeleteSelection();
  
  // Restaurar comportamiento normal
  customBuffers.forEach(buffer => {
    buffer.circle.off('click');
    buffer.circle.on('click', (e) => { 
      L.DomEvent.stopPropagation(e); 
      showBufferPopup(buffer, true); 
    });
  });
  
  editableBuffers.forEach((data, ni) => {
    data.circle.off('click');
    data.circle.on('click', (e) => { 
      if (!editMode) showBufferPopup(data, false); 
    });
  });
}

// Modificar makeBufferDraggable para rastrear ajustes
function makeBufferDraggable(circle, data, isCustom, ni = null) {
  let isDragging = false;
  let startPos = null;
  
  circle.on('mousedown', function(e) {
    if (!editMode) return;
    isDragging = true; 
    data.isDragging = true;
    startPos = circle.getLatLng();
    map.dragging.disable();
    circle.setStyle({ weight: 4, fillOpacity: 0.3 });
    
    const onMove = (e) => { 
      if (isDragging) circle.setLatLng(e.latlng); 
    };
    
    const onUp = () => {
      isDragging = false; 
      data.isDragging = false;
      map.dragging.enable();
      circle.setStyle({ 
        weight: isCustom ? 2 : 3, 
        fillOpacity: isCustom ? 0.15 : 0.2 
      });
      map.off('mousemove', onMove); 
      map.off('mouseup', onUp);
      
      const endPos = circle.getLatLng();
      data.currentPos = endPos;
      if (isCustom) { 
        data.lat = endPos.lat; 
        data.lng = endPos.lng; 
      }
      
      // Marcar como ajustado si se movió significativamente
      if (startPos && haversineMeters(startPos.lat, startPos.lng, endPos.lat, endPos.lng) > 100) {
        if (ni !== null) {
          adjustedBuffers.add(ni);
          // Remover de buffers vacíos si estaba marcado como tal
          emptyBuffers.delete(ni);
          circle.removeClass('empty-buffer');
          circle.setStyle({ dashArray: null });
        }
        updateCoverageProgress();
      }
      
      markAsChanged();
      regenerateAnimations();
      showNotification("✅ Buffer reposicionado", "success");
    };
    
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
  });
}

// Modificar drawBuffersEditable para inicializar emptyBuffers
function drawBuffersEditable(nucleos, selected, nucleoStats) {
  const savedState = loadBuffersState();
  const savedPositions = new Map();
  if (savedState?.editableBuffers) savedState.editableBuffers.forEach(s => savedPositions.set(s.ni, { lat: s.currentLat, lng: s.currentLng }));
  
  selected.forEach(ni => {
    const n = nucleos[ni], st = nucleoStats[ni];
    const savedPos = savedPositions.get(ni);
    const lat = savedPos ? savedPos.lat : n.lat, lng = savedPos ? savedPos.lng : n.lng;
    const circle = L.circle([lat, lng], { 
      radius: BUFFER_RADIUS_M, 
      color: '#58a6ff', 
      fillColor: '#58a6ff', 
      weight: 2, 
      opacity: 0.6, 
      fillOpacity: 0.08, 
      renderer: canvasRenderer 
    });
    circle.addTo(layers.buffers);
    circle.on('click', (e) => { if (!editMode) showBufferPopup(editableBuffers.get(ni), false); });
    editableBuffers.set(ni, { 
      circle, 
      nucleo: n, 
      stats: st, 
      originalPos: { lat: n.lat, lng: n.lng }, 
      currentPos: { lat, lng }, 
      isDragging: false 
    });
    
    // Verificar si está vacío inicialmente
    const metrics = calculateBufferMetricsDetailed({lat, lng}, BUFFER_RADIUS_M);
    if (metrics.iesCount === 0) {
      emptyBuffers.add(ni);
      circle.setStyle({ 
        color: '#6e7681', 
        fillColor: '#6e7681',
        opacity: 0.3,
        fillOpacity: 0.05,
        weight: 1,
        dashArray: '5,5'
      });
      circle.addClass('empty-buffer');
    }
    
    // Verificar si fue movido (ajustado)
    if (savedPos && haversineMeters(lat, lng, n.lat, n.lng) > 100) {
      adjustedBuffers.add(ni);
    }
  });
  
  if (savedState?.customBuffers) savedState.customBuffers.forEach(s => restoreCustomBuffer(s));
  
  // Inicializar capa de cobertura
  setTimeout(() => {
    updateCoverageProgress();
    if (coverageLayerEnabled) {
      updateCoverageVisualization();
    }
  }, 1000);
}

// ==================== FUNCIONES NUEVAS PARA LA INTERFAZ ====================
window.scanAndRemoveEmptyBuffers = scanAndRemoveEmptyBuffers;
window.performIntelligentSweep = performIntelligentSweep;
window.showCoverageProgressPanel = showCoverageProgressPanel;
window.selectBufferForDelete = selectBufferForDelete;
window.confirmDeleteSelectedBuffer = confirmDeleteSelectedBuffer;
window.cancelDeleteSelection = cancelDeleteSelection;
