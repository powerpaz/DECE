/*************************************************
 * DECE Coverage App - v7.0 FIXED
 * ✅ Mantiene posiciones originales de buffers
 * ✅ Núcleos y satélites visibles
 * ✅ Selector de mapa base funcional
 * ✅ Malla de barrido inteligente
 * ✅ Detección de buffers vacíos
 * ✅ Zonas sin cobertura
 *************************************************/

let map;
const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup(),
  coverage: L.featureGroup(),
  animations: L.featureGroup(),
  uncoveredZones: L.featureGroup(),
  coverageGrid: L.featureGroup()
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

// Nuevas constantes para análisis
const GRID_MESH_SIZE = 0.05;
const UNCOVERED_ZONE_COLOR = '#ff6b6b';
const PARTIALLY_COVERED_COLOR = '#feca57';
const WELL_COVERED_COLOR = '#48dbfb';

let editMode = false;
let addMode = false;
let deleteMode = false;
let selectedDeleteTarget = null;
let _deleteKeyListenerBound = false;
let editableBuffers = new Map();
let customBuffers = [];
let customBufferCounter = 0;
let globalData = null;
let metricsPanel = null;
let hasUnsavedChanges = false;
let animationLines = [];
let _connectionAnimTimer = null;
let _initialized = false;

// Nuevas variables para análisis
let emptyBuffers = [];
let uncoveredPoints = [];
let coverageGridData = new Map();
let currentSatCandidates = null;
let currentSelected = null;

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

// ==================== ANÁLISIS DE COBERTURA ====================

function analyzeEmptyBuffers() {
  emptyBuffers = [];
  const allBuffers = [];
  
  editableBuffers.forEach((bufferData, ni) => {
    const pos = bufferData.circle.getLatLng();
    allBuffers.push({
      type: 'editable',
      ni: ni,
      lat: pos.lat,
      lng: pos.lng,
      circle: bufferData.circle,
      nucleo: bufferData.nucleo
    });
  });
  
  customBuffers.forEach(buffer => {
    const pos = buffer.circle.getLatLng();
    allBuffers.push({
      type: 'custom',
      id: buffer.id,
      lat: pos.lat,
      lng: pos.lng,
      circle: buffer.circle,
      name: buffer.name
    });
  });
  
  allBuffers.forEach(buffer => {
    let hasNucleos = false;
    let hasSatellites = false;
    let nucleosCount = 0;
    let satellitesCount = 0;
    
    if (globalData && globalData.nucleos) {
      globalData.nucleos.forEach(nucleo => {
        const dist = haversineMeters(buffer.lat, buffer.lng, nucleo.lat, nucleo.lng);
        if (dist <= BUFFER_RADIUS_M) {
          hasNucleos = true;
          nucleosCount++;
        }
      });
    }
    
    if (globalData && globalData.satellites) {
      globalData.satellites.forEach(satellite => {
        const dist = haversineMeters(buffer.lat, buffer.lng, satellite.lat, satellite.lng);
        if (dist <= BUFFER_RADIUS_M) {
          hasSatellites = true;
          satellitesCount++;
        }
      });
    }
    
    if (!hasNucleos && !hasSatellites) {
      emptyBuffers.push({
        ...buffer,
        reason: 'No contiene núcleos ni satélites',
        nucleosCount: 0,
        satellitesCount: 0
      });
    }
  });
  
  console.log(`✓ Análisis completado: ${emptyBuffers.length} buffers vacíos de ${allBuffers.length} totales`);
  updateCoverageStats();
  return emptyBuffers;
}

function identifyUncoveredZones() {
  uncoveredPoints = [];
  
  if (!globalData) return uncoveredPoints;
  
  const allBufferPositions = [];
  
  editableBuffers.forEach((bufferData) => {
    const pos = bufferData.circle.getLatLng();
    allBufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  
  customBuffers.forEach(buffer => {
    const pos = buffer.circle.getLatLng();
    allBufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  
  const allPoints = [
    ...globalData.nucleos.map(n => ({ ...n, type: 'nucleo' })),
    ...globalData.satellites.map(s => ({ ...s, type: 'satellite' }))
  ];
  
  allPoints.forEach(point => {
    let isCovered = false;
    
    for (let buffer of allBufferPositions) {
      const dist = haversineMeters(point.lat, point.lng, buffer.lat, buffer.lng);
      if (dist <= BUFFER_RADIUS_M) {
        isCovered = true;
        break;
      }
    }
    
    if (!isCovered) {
      uncoveredPoints.push(point);
    }
  });
  
  console.log(`✓ Zonas sin cobertura: ${uncoveredPoints.length} puntos`);
  updateCoverageStats();
  return uncoveredPoints;
}

function createCoverageGrid() {
  if (!globalData) return;
  
  coverageGridData.clear();
  layers.coverageGrid.clearLayers();
  
  const allPoints = [...globalData.nucleos, ...globalData.satellites];
  if (allPoints.length === 0) return;
  
  let minLat = allPoints[0].lat, maxLat = allPoints[0].lat;
  let minLng = allPoints[0].lng, maxLng = allPoints[0].lng;
  
  allPoints.forEach(p => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });
  
  minLat -= GRID_MESH_SIZE * 2;
  maxLat += GRID_MESH_SIZE * 2;
  minLng -= GRID_MESH_SIZE * 2;
  maxLng += GRID_MESH_SIZE * 2;
  
  const bufferPositions = [];
  editableBuffers.forEach((bufferData) => {
    const pos = bufferData.circle.getLatLng();
    bufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  customBuffers.forEach(buffer => {
    const pos = buffer.circle.getLatLng();
    bufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  
  for (let lat = minLat; lat < maxLat; lat += GRID_MESH_SIZE) {
    for (let lng = minLng; lng < maxLng; lng += GRID_MESH_SIZE) {
      let pointsInCell = 0;
      let coveredPoints = 0;
      
      allPoints.forEach(point => {
        if (point.lat >= lat && point.lat < lat + GRID_MESH_SIZE &&
            point.lng >= lng && point.lng < lng + GRID_MESH_SIZE) {
          pointsInCell++;
          
          for (let buffer of bufferPositions) {
            const dist = haversineMeters(point.lat, point.lng, buffer.lat, buffer.lng);
            if (dist <= BUFFER_RADIUS_M) {
              coveredPoints++;
              break;
            }
          }
        }
      });
      
      if (pointsInCell > 0) {
        const coverageRatio = coveredPoints / pointsInCell;
        let color, opacity;
        
        if (coverageRatio === 0) {
          color = UNCOVERED_ZONE_COLOR;
          opacity = 0.4;
        } else if (coverageRatio < 1) {
          color = PARTIALLY_COVERED_COLOR;
          opacity = 0.3;
        } else {
          color = WELL_COVERED_COLOR;
          opacity = 0.1;
        }
        
        const bounds = [
          [lat, lng],
          [lat + GRID_MESH_SIZE, lng + GRID_MESH_SIZE]
        ];
        
        const rectangle = L.rectangle(bounds, {
          color: color,
          fillColor: color,
          weight: 1,
          opacity: opacity * 1.5,
          fillOpacity: opacity,
          renderer: canvasRenderer
        });
        
        rectangle.bindPopup(`
          <div class="popup-title">📊 Celda de Cobertura</div>
          <div class="popup-content">
            <div class="popup-row">
              <span class="popup-label">Puntos totales:</span>
              <span class="popup-value">${pointsInCell}</span>
            </div>
            <div class="popup-row">
              <span class="popup-label">Puntos cubiertos:</span>
              <span class="popup-value">${coveredPoints}</span>
            </div>
            <div class="popup-row">
              <span class="popup-label">Cobertura:</span>
              <span class="popup-value">${(coverageRatio * 100).toFixed(1)}%</span>
            </div>
          </div>
        `);
        
        rectangle.addTo(layers.coverageGrid);
        
        coverageGridData.set(`${lat},${lng}`, {
          pointsInCell,
          coveredPoints,
          coverageRatio
        });
      }
    }
  }
  
  console.log(`✓ Malla creada: ${coverageGridData.size} celdas`);
}

function drawUncoveredZones() {
  layers.uncoveredZones.clearLayers();
  
  uncoveredPoints.forEach(point => {
    const color = point.type === 'nucleo' ? '#ff6b6b' : '#ff9ff3';
    const size = point.type === 'nucleo' ? 8 : 5;
    
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: size,
      fillColor: color,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
      renderer: canvasRenderer,
      className: 'uncovered-marker pulsing'
    });
    
    marker.bindPopup(`
      <div class="popup-title">⚠️ ${point.type === 'nucleo' ? 'Núcleo' : 'Satélite'} Sin Cobertura</div>
      <div class="popup-content">
        <div class="popup-row">
          <span class="popup-label">Institución:</span>
          <span class="popup-value">${escapeHTML(point.name)}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Distrito:</span>
          <span class="popup-value">${escapeHTML(point.dist)}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Estudiantes:</span>
          <span class="popup-value" style="color:#d29922">${(point.students || 0).toLocaleString()}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Estado:</span>
          <span class="popup-value" style="color:#f85149">⚠️ Requiere cobertura</span>
        </div>
      </div>
    `);
    
    marker.addTo(layers.uncoveredZones);
  });
}

function highlightEmptyBuffers() {
  emptyBuffers.forEach(buffer => {
    if (buffer.circle) {
      buffer.circle.setStyle({
        color: '#f85149',
        fillColor: '#f85149',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.15,
        dashArray: '10, 10'
      });
    }
  });
}

function showEmptyBuffersPanel() {
  analyzeEmptyBuffers();
  
  if (emptyBuffers.length === 0) {
    showNotification("✓ No hay buffers vacíos", "success");
    return;
  }
  
  const panel = document.createElement('div');
  panel.className = 'empty-buffers-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <h3>⚠️ Buffers Vacíos Detectados</h3>
      <button class="close-btn" onclick="this.closest('.empty-buffers-panel').remove()">×</button>
    </div>
    <div class="panel-content">
      <div class="summary-box">
        <div class="summary-icon">📊</div>
        <div class="summary-text">
          <div class="summary-number">${emptyBuffers.length}</div>
          <div class="summary-label">Buffers sin núcleos ni satélites</div>
        </div>
      </div>
      <div class="empty-buffers-list">
        ${emptyBuffers.map((buffer, idx) => `
          <div class="empty-buffer-item" onclick="flyToBuffer(${buffer.lat}, ${buffer.lng})">
            <div class="buffer-item-header">
              <span class="buffer-number">#${idx + 1}</span>
              <span class="buffer-type">${buffer.type === 'custom' ? '🔷 Personalizado' : '🔵 Original'}</span>
            </div>
            <div class="buffer-item-body">
              <div class="buffer-name">${buffer.type === 'custom' ? buffer.name : `Núcleo: ${escapeHTML(buffer.nucleo?.name || 'N/A')}`}</div>
              <div class="buffer-coords">📍 ${buffer.lat.toFixed(4)}, ${buffer.lng.toFixed(4)}</div>
              <div class="buffer-status">⚠️ ${buffer.reason}</div>
            </div>
            <div class="buffer-item-actions">
              <button class="btn-mini" onclick="event.stopPropagation(); deleteEmptyBuffer(${idx})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Eliminar
              </button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="panel-actions">
        <button class="btn-primary" onclick="deleteAllEmptyBuffers()">
          🗑️ Eliminar Todos los Buffers Vacíos
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  highlightEmptyBuffers();
}

function flyToBuffer(lat, lng) {
  if (map) {
    map.flyTo([lat, lng], 13, {
      duration: 1.5,
      easeLinearity: 0.5
    });
  }
}

function deleteEmptyBuffer(index) {
  if (index >= 0 && index < emptyBuffers.length) {
    const buffer = emptyBuffers[index];
    
    if (buffer.type === 'custom') {
      const customIndex = customBuffers.findIndex(b => b.id === buffer.id);
      if (customIndex >= 0) {
        const customBuffer = customBuffers[customIndex];
        if (customBuffer.circle) {
          map.removeLayer(customBuffer.circle);
        }
        customBuffers.splice(customIndex, 1);
      }
    } else {
      const bufferData = editableBuffers.get(buffer.ni);
      if (bufferData && bufferData.circle) {
        map.removeLayer(bufferData.circle);
        editableBuffers.delete(buffer.ni);
      }
    }
    
    markAsChanged();
    showNotification("✓ Buffer eliminado", "success");
    
    emptyBuffers.splice(index, 1);
    if (emptyBuffers.length === 0) {
      const panel = document.querySelector('.empty-buffers-panel');
      if (panel) panel.remove();
      showNotification("✓ Todos los buffers vacíos eliminados", "success");
    } else {
      const panel = document.querySelector('.empty-buffers-panel');
      if (panel) panel.remove();
      showEmptyBuffersPanel();
    }
    
    updateCoverageAnalysis();
  }
}

function deleteAllEmptyBuffers() {
  if (emptyBuffers.length === 0) return;
  
  if (!confirm(`¿Estás seguro de que quieres eliminar ${emptyBuffers.length} buffers vacíos?`)) {
    return;
  }
  
  let deletedCount = 0;
  
  emptyBuffers.forEach(buffer => {
    if (buffer.type === 'custom') {
      const customIndex = customBuffers.findIndex(b => b.id === buffer.id);
      if (customIndex >= 0) {
        const customBuffer = customBuffers[customIndex];
        if (customBuffer.circle) {
          map.removeLayer(customBuffer.circle);
        }
        customBuffers.splice(customIndex, 1);
        deletedCount++;
      }
    } else {
      const bufferData = editableBuffers.get(buffer.ni);
      if (bufferData && bufferData.circle) {
        map.removeLayer(bufferData.circle);
        editableBuffers.delete(buffer.ni);
        deletedCount++;
      }
    }
  });
  
  emptyBuffers = [];
  markAsChanged();
  
  const panel = document.querySelector('.empty-buffers-panel');
  if (panel) panel.remove();
  
  showNotification(`✓ ${deletedCount} buffers vacíos eliminados`, "success");
  updateCoverageAnalysis();
}

function updateCoverageAnalysis() {
  console.log("🔄 Actualizando análisis...");
  
  analyzeEmptyBuffers();
  identifyUncoveredZones();
  
  if (map.hasLayer(layers.coverageGrid)) {
    createCoverageGrid();
  }
  
  if (map.hasLayer(layers.uncoveredZones)) {
    drawUncoveredZones();
  }
  
  updateCoverageStats();
  
  console.log("✓ Análisis actualizado");
}

function updateCoverageStats() {
  const statsEl = document.getElementById('emptyBuffersCount');
  if (statsEl) {
    statsEl.textContent = emptyBuffers.length;
  }
  
  const uncoveredEl = document.getElementById('uncoveredPointsCount');
  if (uncoveredEl) {
    uncoveredEl.textContent = uncoveredPoints.length;
  }
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
            <div class="summary-card warning"><div class="summary-icon">⚠️</div><div class="summary-value">${emptyBuffers.length}</div><div class="summary-label">Buffers Vacíos</div></div>
            <div class="summary-card warning"><div class="summary-icon">🚫</div><div class="summary-value">${uncoveredPoints.length}</div><div class="summary-label">Sin Cobertura</div></div>
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
      result.totalStudents += inst.students || 0;
      if (inst.type === 'nucleo') result.nucleosCount++;
      else if (inst.type === 'satellite') result.satellitesCount++;
    }
  });
  return result;
}

function exportToExcel() {
  const data = window._exportData || performSpatialJoin();
  if (!data) return;
  
  const workbook = XLSX.utils.book_new();
  
  const summaryData = [
    ['Métrica', 'Valor'],
    ['Fecha de Exportación', data.exportDate],
    ['Total de Buffers', data.summary.totalBuffers],
    ['Buffers Originales', data.summary.originalBuffers],
    ['Buffers Personalizados', data.summary.customBuffers],
    ['AMIEs Cubiertas', data.summary.totalAMIEs],
    ['Total Núcleos', data.summary.totalNucleos],
    ['Total Satélites', data.summary.totalSatellites],
    ['Total Estudiantes', data.summary.totalStudents],
    ['Porcentaje de Cobertura', data.summary.coveragePercent + '%'],
    ['Buffers Vacíos', emptyBuffers.length],
    ['Puntos Sin Cobertura', uncoveredPoints.length]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  
  const buffersData = [
    ['Buffer ID', 'Nombre', 'Tipo', 'Lat Centro', 'Lng Centro', 'Radio (m)', 'Lat Original', 'Lng Original', 'Movido', 'AMIEs', 'Núcleos', 'Satélites', 'Estudiantes'],
    ...data.buffers.map(b => [
      b.bufferId, b.bufferName, b.isCustom ? 'Personalizado' : 'Original',
      b.centerLat.toFixed(6), b.centerLng.toFixed(6), b.radiusMeters,
      b.originalLat.toFixed(6), b.originalLng.toFixed(6), b.wasMoved ? 'Sí' : 'No',
      b.totalAMIEs, b.nucleosCount, b.satellitesCount, b.totalStudents
    ])
  ];
  const buffersSheet = XLSX.utils.aoa_to_sheet(buffersData);
  XLSX.utils.book_append_sheet(workbook, buffersSheet, 'Buffers');
  
  const detailData = [['Buffer', 'AMIE', 'Nombre Institución', 'Tipo', 'Distrito', 'Estudiantes', 'Distancia (km)']];
  data.buffers.forEach(buffer => {
    buffer.institutions.forEach(inst => {
      detailData.push([
        buffer.bufferName, inst.amie, inst.name, inst.typeName, inst.distrito, inst.students, inst.distanceKm
      ]);
    });
  });
  const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle Instituciones');
  
  if (emptyBuffers.length > 0) {
    const emptyBuffersData = [
      ['Buffer', 'Tipo', 'Latitud', 'Longitud', 'Razón'],
      ...emptyBuffers.map(b => [
        b.type === 'custom' ? (b.name || 'Buffer Personalizado') : `Núcleo: ${b.nucleo?.name || 'N/A'}`,
        b.type === 'custom' ? 'Personalizado' : 'Original',
        b.lat.toFixed(6),
        b.lng.toFixed(6),
        b.reason
      ])
    ];
    const emptySheet = XLSX.utils.aoa_to_sheet(emptyBuffersData);
    XLSX.utils.book_append_sheet(workbook, emptySheet, 'Buffers Vacíos');
  }
  
  if (uncoveredPoints.length > 0) {
    const uncoveredData = [
      ['Tipo', 'AMIE', 'Nombre', 'Distrito', 'Estudiantes', 'Latitud', 'Longitud'],
      ...uncoveredPoints.map(p => [
        p.type === 'nucleo' ? 'Núcleo' : 'Satélite',
        p.amie,
        p.name,
        p.dist,
        p.students || 0,
        p.lat.toFixed(6),
        p.lng.toFixed(6)
      ])
    ];
    const uncoveredSheet = XLSX.utils.aoa_to_sheet(uncoveredData);
    XLSX.utils.book_append_sheet(workbook, uncoveredSheet, 'Sin Cobertura');
  }
  
  const fecha = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `DECE_Analisis_${fecha}.xlsx`);
  showNotification("✓ Archivo Excel generado", "success");
  document.querySelector('.export-modal')?.remove();
}

function exportToCSV() {
  const data = window._exportData || performSpatialJoin();
  if (!data) return;
  
  let csv = 'Buffer ID,Nombre,Tipo,Lat Centro,Lng Centro,Radio(m),AMIEs,Núcleos,Satélites,Estudiantes\n';
  data.buffers.forEach(b => {
    csv += `"${b.bufferId}","${b.bufferName}","${b.isCustom ? 'Personalizado' : 'Original'}",${b.centerLat.toFixed(6)},${b.centerLng.toFixed(6)},${b.radiusMeters},${b.totalAMIEs},${b.nucleosCount},${b.satellitesCount},${b.totalStudents}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const fecha = new Date().toISOString().split('T')[0];
  link.download = `DECE_Analisis_${fecha}.csv`;
  link.click();
  showNotification("✓ Archivo CSV generado", "success");
  document.querySelector('.export-modal')?.remove();
}

function exportToJSON() {
  const data = window._exportData || performSpatialJoin();
  if (!data) return;
  
  const exportData = {
    ...data,
    emptyBuffers: emptyBuffers.map(b => ({
      type: b.type,
      name: b.type === 'custom' ? b.name : b.nucleo?.name,
      lat: b.lat,
      lng: b.lng,
      reason: b.reason
    })),
    uncoveredPoints: uncoveredPoints.map(p => ({
      type: p.type,
      amie: p.amie,
      name: p.name,
      dist: p.dist,
      students: p.students || 0,
      lat: p.lat,
      lng: p.lng
    }))
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const fecha = new Date().toISOString().split('T')[0];
  link.download = `DECE_Analisis_${fecha}.json`;
  link.click();
  showNotification("✓ Archivo JSON generado", "success");
  document.querySelector('.export-modal')?.remove();
}

// ==================== EDIT MODE ====================
function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById("btnEditBuffers");
  if (editMode) {
    btn?.classList.add("active");
    showNotification("✏️ Modo edición activado - Arrastra los buffers", "info");
    editableBuffers.forEach(data => makeBufferDraggable(data.circle, data, false));
    customBuffers.forEach(buffer => makeBufferDraggable(buffer.circle, buffer, true));
  } else {
    btn?.classList.remove("active");
    showNotification("✓ Modo edición desactivado", "success");
    editableBuffers.forEach(data => { if (data.circle.dragging) data.circle.dragging.disable(); });
    customBuffers.forEach(buffer => { if (buffer.circle.dragging) buffer.circle.dragging.disable(); });
  }
}

function toggleAddMode() {
  addMode = !addMode;
  const btn = document.getElementById("btnAddBuffers");
  if (addMode) {
    btn?.classList.add("active");
    showNotification("➕ Haz clic en el mapa para añadir buffers", "info");
    map.on('click', onMapClickForAdd);
  } else {
    btn?.classList.remove("active");
    showNotification("✓ Modo añadir desactivado", "success");
    map.off('click', onMapClickForAdd);
  }
}

function toggleDeleteMode() {
  deleteMode = !deleteMode;
  const btn = document.getElementById("btnDeleteBuffers");
  if (deleteMode) {
    btn?.classList.add("active");
    showNotification("🗑️ Haz clic en un buffer para eliminarlo", "info");
  } else {
    btn?.classList.remove("active");
    showNotification("✓ Modo eliminar desactivado", "success");
  }
}

function makeBufferDraggable(circle, data, isCustom) {
  if (!circle.dragging) {
    circle.dragging = new L.Handler.MarkerDrag(circle);
  }
  circle.dragging.enable();
  
  circle.on('dragstart', () => {
    data.isDragging = true;
  });
  
  circle.on('dragend', () => {
    const newPos = circle.getLatLng();
    data.currentPos = { lat: newPos.lat, lng: newPos.lng };
    if (!isCustom) {
      data.adjusted = true;
      circle._adjusted = true;
    }
    data.isDragging = false;
    
    markAsChanged();
    showNotification("📍 Buffer reposicionado", "success");
    updateCoverageOverlay();
    regenerateAnimations();
    
    setTimeout(() => {
      updateCoverageAnalysis();
    }, 500);
  });
}

function onMapClickForAdd(e) {
  customBufferCounter++;
  const newBuffer = {
    id: `custom_${customBufferCounter}`,
    lat: e.latlng.lat,
    lng: e.latlng.lng,
    name: `Buffer Personalizado ${customBufferCounter}`,
    isCustom: true
  };
  
  const circle = L.circle([e.latlng.lat, e.latlng.lng], {
    radius: BUFFER_RADIUS_M,
    color: '#a371f7',
    fillColor: '#a371f7',
    weight: 2,
    opacity: 0.7,
    fillOpacity: 0.15,
    renderer: canvasRenderer
  });
  
  circle.addTo(layers.buffers);
  
  newBuffer.circle = circle;
  newBuffer.originalPos = { lat: e.latlng.lat, lng: e.latlng.lng };
  newBuffer.currentPos = { lat: e.latlng.lat, lng: e.latlng.lng };
  newBuffer.isDragging = false;
  newBuffer.adjusted = false;
  
  customBuffers.push(newBuffer);
  
  circle.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    if (deleteMode) {
      deleteCustomBuffer(newBuffer.id);
    } else if (!editMode) {
      showBufferPopup(newBuffer, true);
    }
  });
  
  if (editMode) {
    makeBufferDraggable(circle, newBuffer, true);
  }
  
  markAsChanged();
  showNotification("✓ Buffer personalizado añadido", "success");
  updateCoverageOverlay();
  regenerateAnimations();
  
  setTimeout(() => {
    updateCoverageAnalysis();
  }, 500);
}

function deleteCustomBuffer(bufferId) {
  const index = customBuffers.findIndex(b => b.id === bufferId);
  if (index >= 0) {
    const buffer = customBuffers[index];
    if (buffer.circle) {
      map.removeLayer(buffer.circle);
    }
    customBuffers.splice(index, 1);
    markAsChanged();
    showNotification("🗑️ Buffer eliminado", "success");
    updateCoverageOverlay();
    regenerateAnimations();
    
    setTimeout(() => {
      updateCoverageAnalysis();
    }, 500);
  }
}

function showBufferPopup(data, isCustom) {
  const popupContent = isCustom
    ? `<div class="buffer-popup"><h3>${data.name}</h3><p>Lat: ${data.lat.toFixed(4)}, Lng: ${data.lng.toFixed(4)}</p><p>Radio: ${(BUFFER_RADIUS_M / 1000).toFixed(1)} km</p></div>`
    : `<div class="buffer-popup"><h3>Núcleo: ${escapeHTML(data.nucleo.name)}</h3><p>Distrito: ${escapeHTML(data.nucleo.dist)}</p><p>Radio: ${(BUFFER_RADIUS_M / 1000).toFixed(1)} km</p></div>`;
  data.circle.bindPopup(popupContent).openPopup();
}

function updateCoverageOverlay() {
  layers.coverage.clearLayers();
  if (!globalData) return;
  
  const pointsMap = new Map();
  const { nucleos, satellites } = globalData;
  const allPoints = [...nucleos, ...satellites];
  
  allPoints.forEach((point, idx) => {
    let bestBuffer = null;
    let bestDist = BUFFER_RADIUS_M + 1;
    
    editableBuffers.forEach(data => {
      const pos = data.circle.getLatLng();
      const dist = haversineMeters(point.lat, point.lng, pos.lat, pos.lng);
      if (dist <= BUFFER_RADIUS_M && dist < bestDist) {
        bestDist = dist;
        bestBuffer = pos;
      }
    });
    
    customBuffers.forEach(buffer => {
      const pos = buffer.circle.getLatLng();
      const dist = haversineMeters(point.lat, point.lng, pos.lat, pos.lng);
      if (dist <= BUFFER_RADIUS_M && dist < bestDist) {
        bestDist = dist;
        bestBuffer = pos;
      }
    });
    
    if (bestBuffer) {
      const key = `${bestBuffer.lat.toFixed(5)},${bestBuffer.lng.toFixed(5)}`;
      if (!pointsMap.has(key)) pointsMap.set(key, []);
      pointsMap.get(key).push(point);
    }
  });
  
  pointsMap.forEach((points, key) => {
    if (points.length > 0) {
      const center = points[0];
      const [lat, lng] = key.split(',').map(Number);
      const poly = L.polygon(getVoronoiCell([lat, lng], points), {
        color: '#3fb950', fillColor: '#3fb950', weight: 1, opacity: 0.3, fillOpacity: 0.05, renderer: canvasRenderer
      });
      poly.addTo(layers.coverage);
    }
  });
}

function getVoronoiCell(center, points) {
  const angleStep = (2 * Math.PI) / 32;
  const poly = [];
  for (let i = 0; i < 32; i++) {
    const angle = i * angleStep;
    const r = BUFFER_RADIUS_M / 111000;
    poly.push([center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)]);
  }
  return poly;
}

function regenerateAnimations() {
  layers.connections.clearLayers();
  animationLines = [];
  if (!globalData) return;
  const { satellites } = globalData;
  
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

function resetBufferPosition(ni) {
  const data = editableBuffers.get(ni);
  if (!data) return;
  data.circle.setLatLng([data.originalPos.lat, data.originalPos.lng]);
  data.currentPos = data.originalPos;
  markAsChanged();
  updateCoverageOverlay();
  regenerateAnimations();
  showNotification("✓ Posición restaurada", "info");
}
window.resetBufferPosition = resetBufferPosition;

function resetAllBuffersState() { if (confirm('¿Reiniciar todos los buffers?')) { clearBuffersState(); location.reload(); } }
window.resetAllBuffersState = resetAllBuffersState;

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
  const nucleos = data.filter(d => [2, 3].includes(d.code));
  const satellites = data.filter(d => [4, 5].includes(d.code));
  globalData = { nucleos, satellites };
  
  console.log(`✓ Datos cargados: ${nucleos.length} núcleos, ${satellites.length} satélites`);
  
  const spatialIndex = buildSpatialIndex(satellites);
  const satCandidates = findCandidates(nucleos, satellites, spatialIndex);
  const { selected, uncovered } = setCoverGreedy(nucleos, satellites, satCandidates);
  const nucleoStats = buildNucleoStats(nucleos, satCandidates);
  
  // Guardar para uso posterior
  currentSatCandidates = satCandidates;
  currentSelected = selected;
  
  drawNucleos(nucleos, selected);
  drawBuffersEditable(nucleos, selected, nucleoStats);
  drawSatellites(satellites, satCandidates, selected);
  
  const stats = computeStatistics(nucleos, satellites, satCandidates, selected, nucleoStats);
  updateStatistics(stats);
  updateTopNucleos(nucleoStats);
  
  updateCoverageOverlay();
  regenerateAnimations();
  
  // Realizar análisis inicial
  setTimeout(() => {
    updateCoverageAnalysis();
  }, 1000);
  
  hideLoadingOverlay();
}

function buildSpatialIndex(satellites) {
  const grid = new Map();
  satellites.forEach((s, si) => {
    const cellLat = Math.floor(s.lat / GRID_CELL_DEG);
    const cellLng = Math.floor(s.lng / GRID_CELL_DEG);
    const key = `${cellLat},${cellLng}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(si);
  });
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
  layers.nucleos.clearLayers();
  nucleos.forEach((n, ni) => {
    const isSelected = selected.has(ni);
    const marker = L.circleMarker([n.lat, n.lng], { 
      radius: isSelected ? 10 : 6, 
      fillColor: isSelected ? '#3fb950' : '#58a6ff', 
      color: '#fff', 
      weight: 2, 
      opacity: 1, 
      fillOpacity: isSelected ? 0.9 : 0.7, 
      renderer: canvasRenderer 
    });
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
    circle.on('click', (e) => { 
      L.DomEvent.stopPropagation(e);
      if (deleteMode) {
        if (confirm('¿Eliminar este buffer original?')) {
          map.removeLayer(circle);
          editableBuffers.delete(ni);
          markAsChanged();
          showNotification("🗑️ Buffer eliminado", "success");
          updateCoverageOverlay();
          regenerateAnimations();
          updateCoverageAnalysis();
        }
      } else if (!editMode) {
        showBufferPopup(editableBuffers.get(ni), false);
      }
    });
    editableBuffers.set(ni, { circle, nucleo: n, stats: st, originalPos: { lat: n.lat, lng: n.lng }, currentPos: { lat, lng }, adjusted: false, isDragging: false });
    circle._adjusted = false;
  });
  
  if (savedState?.customBuffers) savedState.customBuffers.forEach(s => restoreCustomBuffer(s));
}

function restoreCustomBuffer(saved) {
  customBufferCounter++;
  const circle = L.circle([saved.lat, saved.lng], { 
    radius: BUFFER_RADIUS_M, 
    color: '#a371f7', 
    fillColor: '#a371f7', 
    weight: 2, 
    opacity: 0.7, 
    fillOpacity: 0.15, 
    renderer: canvasRenderer 
  });
  circle.addTo(layers.buffers);
  const buffer = { id: saved.id, circle, lat: saved.lat, lng: saved.lng, originalPos: { lat: saved.lat, lng: saved.lng }, currentPos: { lat: saved.lat, lng: saved.lng }, isCustom: true, isDragging: false, name: saved.name };
  customBuffers.push(buffer);
  buffer.adjusted = false;
  circle._adjusted = false;
  circle.on('click', (e) => { 
    L.DomEvent.stopPropagation(e); 
    if (deleteMode) {
      deleteCustomBuffer(buffer.id);
    } else if (!editMode) {
      showBufferPopup(buffer, true);
    }
  });
  if (editMode) makeBufferDraggable(circle, buffer, true);
}

function drawSatellites(satellites, satCandidates, selected) {
  layers.satellites.clearLayers();
  satellites.forEach((s, si) => {
    let isCovered = false, bestDist = BUFFER_RADIUS_M + 1;
    satCandidates[si]?.forEach(c => { if (selected.has(c.ni) && c.dist < bestDist) { bestDist = c.dist; isCovered = true; } });
    const marker = L.circleMarker([s.lat, s.lng], { 
      radius: 4, 
      fillColor: isCovered ? '#3fb950' : '#f85149', 
      color: '#fff', 
      weight: 1, 
      opacity: 1, 
      fillOpacity: 0.8, 
      renderer: canvasRenderer 
    });
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
  set("totalNucleos", stats.totalNucleos); 
  set("totalSatellites", stats.totalSatellites); 
  set("coveragePercent", stats.coveragePercent + "%"); 
  set("totalStudents", stats.totalStudents);
  set("nucleosActivos", stats.nucleosActivos); 
  set("sinCobertura", stats.sinCobertura);
  const fill = document.getElementById("coverageFill"); 
  if (fill) fill.style.width = Math.min(100, parseFloat(stats.coveragePercent)) + "%";
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
  document.getElementById("toggleStats")?.addEventListener("click", () => { 
    document.getElementById("statsPanel")?.classList.toggle("active"); 
    document.getElementById("legendPanel")?.classList.remove("active"); 
  });
  document.getElementById("toggleLegend")?.addEventListener("click", () => { 
    document.getElementById("legendPanel")?.classList.toggle("active"); 
    document.getElementById("statsPanel")?.classList.remove("active"); 
  });
  ["toggleBuffers", "toggleConnections", "toggleNucleos", "toggleSatellites", "toggleCoverage"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", (e) => { 
      const layer = [layers.buffers, layers.connections, layers.nucleos, layers.satellites, layers.coverage][i]; 
      e.target.checked ? map.addLayer(layer) : map.removeLayer(layer); 
    });
  });
  setTimeout(() => document.getElementById("statsPanel")?.classList.add("active"), 500);
}

// ==================== INICIALIZACIÓN ====================
document.addEventListener("DOMContentLoaded", () => {
  if (_initialized) return;
  _initialized = true;
  
  map = L.map("map", { preferCanvas: true, zoomControl: false }).setView(ECUADOR_CENTER, 8);
  
  // Mapas base con selector
  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
    attribution: "© OpenStreetMap", 
    maxZoom: 19 
  }).addTo(map);
  
  const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "© Esri",
    maxZoom: 19
  });
  
  const darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '© OpenStreetMap, © CartoDB',
    subdomains: "abcd",
    maxZoom: 20
  });
  
  // Control de capas base
  L.control.layers({
    "OpenStreetMap": osmLayer,
    "Satélite": satelliteLayer,
    "Modo Oscuro": darkLayer
  }, null, { position: 'topright' }).addTo(map);
  
  L.control.zoom({ position: "bottomright" }).addTo(map);
  
  // Añadir capas al mapa
  map.addLayer(layers.nucleos);
  map.addLayer(layers.satellites);
  map.addLayer(layers.buffers);
  map.addLayer(layers.connections);
  map.addLayer(layers.coverage);
  map.addLayer(layers.animations);
  
  setupControls();
  
  // Configurar botones de edición
  document.getElementById("btnEditBuffers")?.addEventListener("click", toggleEditMode);
  document.getElementById("btnAddBuffers")?.addEventListener("click", toggleAddMode);
  document.getElementById("btnDeleteBuffers")?.addEventListener("click", toggleDeleteMode);
  document.getElementById("btnSaveChanges")?.addEventListener("click", saveBuffersState);
  document.getElementById("btnExportResults")?.addEventListener("click", showExportModal);
  
  // Configurar botones nuevos
  document.getElementById("btnAnalyzeEmptyBuffers")?.addEventListener("click", showEmptyBuffersPanel);
  
  document.getElementById("btnToggleCoverageGrid")?.addEventListener("click", () => {
    if (map.hasLayer(layers.coverageGrid)) {
      map.removeLayer(layers.coverageGrid);
      document.getElementById("btnToggleCoverageGrid")?.classList.remove("active");
    } else {
      createCoverageGrid();
      map.addLayer(layers.coverageGrid);
      document.getElementById("btnToggleCoverageGrid")?.classList.add("active");
    }
  });
  
  document.getElementById("btnToggleUncoveredZones")?.addEventListener("click", () => {
    if (map.hasLayer(layers.uncoveredZones)) {
      map.removeLayer(layers.uncoveredZones);
      document.getElementById("btnToggleUncoveredZones")?.classList.remove("active");
    } else {
      identifyUncoveredZones();
      drawUncoveredZones();
      map.addLayer(layers.uncoveredZones);
      document.getElementById("btnToggleUncoveredZones")?.classList.add("active");
    }
  });
  
  // Cargar datos
  loadCSV();
});
