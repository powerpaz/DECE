/*************************************************
 * DECE Coverage App - v7.0 ENHANCED PRO
 * ✅ Capa de Control de Cobertura Inteligente
 * ✅ Detección de Buffers Vacíos
 * ✅ Malla de Barrido Inteligente
 * ✅ Visualización de Zonas sin Cobertura
 * ✅ Panel de Análisis de Buffers Vacíos
 *************************************************/

let map;
const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup(),
  coverage: L.featureGroup(),
  animations: L.featureGroup(),
  uncoveredZones: L.featureGroup(), // NUEVA CAPA: Zonas sin cobertura
  coverageGrid: L.featureGroup()    // NUEVA CAPA: Malla de barrido
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

// NUEVAS CONSTANTES para la malla inteligente
const GRID_MESH_SIZE = 0.05; // Tamaño de celda de la malla (en grados)
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

// NUEVAS VARIABLES para análisis de cobertura
let emptyBuffers = []; // Buffers sin núcleos ni satélites
let uncoveredPoints = []; // Puntos sin cobertura
let coverageGridData = new Map(); // Malla de análisis de cobertura

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

// ==================== NUEVAS FUNCIONES: ANÁLISIS DE COBERTURA ====================

/**
 * Analiza todos los buffers para identificar cuáles están vacíos
 * (sin núcleos ni satélites dentro)
 */
function analyzeEmptyBuffers() {
  emptyBuffers = [];
  const allBuffers = [];
  
  // Recopilar todos los buffers (editables y personalizados)
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
  
  // Analizar cada buffer
  allBuffers.forEach(buffer => {
    let hasNucleos = false;
    let hasSatellites = false;
    let nucleosCount = 0;
    let satellitesCount = 0;
    
    // Verificar núcleos dentro del buffer
    if (globalData && globalData.nucleos) {
      globalData.nucleos.forEach(nucleo => {
        const dist = haversineMeters(buffer.lat, buffer.lng, nucleo.lat, nucleo.lng);
        if (dist <= BUFFER_RADIUS_M) {
          hasNucleos = true;
          nucleosCount++;
        }
      });
    }
    
    // Verificar satélites dentro del buffer
    if (globalData && globalData.satellites) {
      globalData.satellites.forEach(satellite => {
        const dist = haversineMeters(buffer.lat, buffer.lng, satellite.lat, satellite.lng);
        if (dist <= BUFFER_RADIUS_M) {
          hasSatellites = true;
          satellitesCount++;
        }
      });
    }
    
    // Si el buffer está vacío, agregarlo a la lista
    if (!hasNucleos && !hasSatellites) {
      emptyBuffers.push({
        ...buffer,
        reason: 'No contiene núcleos ni satélites',
        nucleosCount: 0,
        satellitesCount: 0
      });
    } else {
      // Guardar información incluso para buffers no vacíos
      buffer.nucleosCount = nucleosCount;
      buffer.satellitesCount = satellitesCount;
    }
  });
  
  console.log(`✓ Análisis completado: ${emptyBuffers.length} buffers vacíos de ${allBuffers.length} totales`);
  return emptyBuffers;
}

/**
 * Identifica zonas sin cobertura donde hay núcleos y satélites
 */
function identifyUncoveredZones() {
  uncoveredPoints = [];
  
  if (!globalData) return uncoveredPoints;
  
  const allBufferPositions = [];
  
  // Recopilar posiciones de todos los buffers
  editableBuffers.forEach((bufferData) => {
    const pos = bufferData.circle.getLatLng();
    allBufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  
  customBuffers.forEach(buffer => {
    const pos = buffer.circle.getLatLng();
    allBufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  
  // Verificar cada núcleo y satélite
  const allPoints = [
    ...globalData.nucleos.map(n => ({ ...n, type: 'nucleo' })),
    ...globalData.satellites.map(s => ({ ...s, type: 'satellite' }))
  ];
  
  allPoints.forEach(point => {
    let isCovered = false;
    
    // Verificar si está cubierto por algún buffer
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
  
  console.log(`✓ Zonas sin cobertura identificadas: ${uncoveredPoints.length} puntos`);
  return uncoveredPoints;
}

/**
 * Crea una malla de barrido inteligente para visualizar cobertura
 */
function createCoverageGrid() {
  if (!globalData) return;
  
  coverageGridData.clear();
  layers.coverageGrid.clearLayers();
  
  // Calcular límites geográficos
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
  
  // Expandir límites un poco
  minLat -= GRID_MESH_SIZE * 2;
  maxLat += GRID_MESH_SIZE * 2;
  minLng -= GRID_MESH_SIZE * 2;
  maxLng += GRID_MESH_SIZE * 2;
  
  // Recopilar posiciones de buffers
  const bufferPositions = [];
  editableBuffers.forEach((bufferData) => {
    const pos = bufferData.circle.getLatLng();
    bufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  customBuffers.forEach(buffer => {
    const pos = buffer.circle.getLatLng();
    bufferPositions.push({ lat: pos.lat, lng: pos.lng });
  });
  
  // Crear malla de celdas
  for (let lat = minLat; lat < maxLat; lat += GRID_MESH_SIZE) {
    for (let lng = minLng; lng < maxLng; lng += GRID_MESH_SIZE) {
      const cellCenter = { lat: lat + GRID_MESH_SIZE / 2, lng: lng + GRID_MESH_SIZE / 2 };
      
      // Contar puntos en esta celda
      let pointsInCell = 0;
      let coveredPoints = 0;
      
      allPoints.forEach(point => {
        if (point.lat >= lat && point.lat < lat + GRID_MESH_SIZE &&
            point.lng >= lng && point.lng < lng + GRID_MESH_SIZE) {
          pointsInCell++;
          
          // Verificar si este punto está cubierto
          for (let buffer of bufferPositions) {
            const dist = haversineMeters(point.lat, point.lng, buffer.lat, buffer.lng);
            if (dist <= BUFFER_RADIUS_M) {
              coveredPoints++;
              break;
            }
          }
        }
      });
      
      // Si hay puntos en la celda, visualizar
      if (pointsInCell > 0) {
        const coverageRatio = coveredPoints / pointsInCell;
        let color, opacity;
        
        if (coverageRatio === 0) {
          color = UNCOVERED_ZONE_COLOR; // Rojo - sin cobertura
          opacity = 0.4;
        } else if (coverageRatio < 1) {
          color = PARTIALLY_COVERED_COLOR; // Amarillo - cobertura parcial
          opacity = 0.3;
        } else {
          color = WELL_COVERED_COLOR; // Azul - bien cubierto
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
  
  console.log(`✓ Malla de cobertura creada: ${coverageGridData.size} celdas`);
}

/**
 * Visualiza las zonas sin cobertura en el mapa
 */
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

/**
 * Resalta los buffers vacíos en el mapa
 */
function highlightEmptyBuffers() {
  emptyBuffers.forEach(buffer => {
    if (buffer.circle) {
      // Cambiar el estilo del círculo para indicar que está vacío
      buffer.circle.setStyle({
        color: '#f85149',
        fillColor: '#f85149',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.15,
        dashArray: '10, 10' // Línea discontinua
      });
      
      // Añadir clase CSS para animación
      const circleElement = buffer.circle.getElement();
      if (circleElement) {
        circleElement.classList.add('empty-buffer');
      }
    }
  });
}

/**
 * Muestra el panel de análisis de buffers vacíos
 */
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

/**
 * Vuela hacia un buffer específico en el mapa
 */
function flyToBuffer(lat, lng) {
  if (map) {
    map.flyTo([lat, lng], 13, {
      duration: 1.5,
      easeLinearity: 0.5
    });
  }
}

/**
 * Elimina un buffer vacío específico
 */
function deleteEmptyBuffer(index) {
  if (index >= 0 && index < emptyBuffers.length) {
    const buffer = emptyBuffers[index];
    
    if (buffer.type === 'custom') {
      // Eliminar buffer personalizado
      const customIndex = customBuffers.findIndex(b => b.id === buffer.id);
      if (customIndex >= 0) {
        const customBuffer = customBuffers[customIndex];
        if (customBuffer.circle) {
          map.removeLayer(customBuffer.circle);
        }
        customBuffers.splice(customIndex, 1);
      }
    } else {
      // Eliminar buffer editable
      const bufferData = editableBuffers.get(buffer.ni);
      if (bufferData && bufferData.circle) {
        map.removeLayer(bufferData.circle);
        editableBuffers.delete(buffer.ni);
      }
    }
    
    markAsChanged();
    showNotification("✓ Buffer eliminado", "success");
    
    // Actualizar el panel
    emptyBuffers.splice(index, 1);
    if (emptyBuffers.length === 0) {
      const panel = document.querySelector('.empty-buffers-panel');
      if (panel) panel.remove();
      showNotification("✓ Todos los buffers vacíos han sido eliminados", "success");
    } else {
      const panel = document.querySelector('.empty-buffers-panel');
      if (panel) panel.remove();
      showEmptyBuffersPanel();
    }
    
    // Recalcular cobertura
    updateCoverageAnalysis();
  }
}

/**
 * Elimina todos los buffers vacíos
 */
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
  
  // Recalcular cobertura
  updateCoverageAnalysis();
}

/**
 * Actualiza el análisis de cobertura completo
 */
function updateCoverageAnalysis() {
  console.log("🔄 Actualizando análisis de cobertura...");
  
  // Analizar buffers vacíos
  analyzeEmptyBuffers();
  
  // Identificar zonas sin cobertura
  identifyUncoveredZones();
  
  // Crear/actualizar malla de cobertura
  createCoverageGrid();
  
  // Redibujar zonas sin cobertura
  drawUncoveredZones();
  
  // Actualizar estadísticas
  updateCoverageStats();
  
  console.log("✓ Análisis de cobertura actualizado");
}

/**
 * Actualiza las estadísticas de cobertura en la interfaz
 */
function updateCoverageStats() {
  const totalBuffers = editableBuffers.size + customBuffers.length;
  const totalPoints = globalData ? (globalData.nucleos.length + globalData.satellites.length) : 0;
  const uncoveredCount = uncoveredPoints.length;
  const coveragePercent = totalPoints > 0 ? (((totalPoints - uncoveredCount) / totalPoints) * 100).toFixed(1) : "0.0";
  
  // Actualizar en el panel de estadísticas si existe
  const statsEl = document.getElementById('emptyBuffersCount');
  if (statsEl) {
    statsEl.textContent = emptyBuffers.length;
  }
  
  const uncoveredEl = document.getElementById('uncoveredPointsCount');
  if (uncoveredEl) {
    uncoveredEl.textContent = uncoveredCount;
  }
  
  console.log(`📊 Estadísticas: ${totalBuffers} buffers, ${emptyBuffers.length} vacíos, ${uncoveredCount} puntos sin cobertura (${coveragePercent}% cubierto)`);
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
            <div class="summary-card warning"><div class="summary-icon">🚫</div><div class="summary-value">${uncoveredPoints.length}</div><div class="summary-label">Puntos Sin Cobertura</div></div>
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
              <thead><tr><th>Buffer</th><th>Tipo</th><th>AMIEs</th><th>Núcleos</th><th>Satélites</th><th>Estudiantes</th><th>Estado</th></tr></thead>
              <tbody>
                ${exportData.buffers.slice(0, 5).map(b => {
                  const isEmpty = b.nucleosCount === 0 && b.satellitesCount === 0;
                  return `<tr class="${isEmpty ? 'empty-row' : ''}">
                    <td>${b.bufferName}</td>
                    <td><span class="type-badge ${b.isCustom ? 'custom' : 'original'}">${b.isCustom ? 'Personalizado' : 'Original'}</span></td>
                    <td>${b.totalAMIEs}</td>
                    <td>${b.nucleosCount}</td>
                    <td>${b.satellitesCount}</td>
                    <td>${b.totalStudents.toLocaleString()}</td>
                    <td><span class="status-badge ${isEmpty ? 'empty' : 'active'}">${isEmpty ? '⚠️ Vacío' : '✓ Activo'}</span></td>
                  </tr>`;
                }).join('')}
                ${exportData.buffers.length > 5 ? `<tr class="more-rows"><td colspan="7">... y ${exportData.buffers.length - 5} buffers más</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function performSpatialJoin() {
  if (!globalData) return null;
  const buffers = [];
  let totalAMIEsSet = new Set(), totalNucleos = 0, totalSatellites = 0, totalStudents = 0;
  
  editableBuffers.forEach((bufferData, ni) => {
    const pos = bufferData.circle.getLatLng();
    const nucleosInBuffer = [], satellitesInBuffer = [];
    let bufferStudents = 0;
    
    globalData.nucleos.forEach(nucleo => {
      const dist = haversineMeters(pos.lat, pos.lng, nucleo.lat, nucleo.lng);
      if (dist <= BUFFER_RADIUS_M) {
        nucleosInBuffer.push({ ...nucleo, distanceKm: (dist / 1000).toFixed(2) });
        bufferStudents += nucleo.students || 0;
        totalAMIEsSet.add(nucleo.amie);
      }
    });
    
    globalData.satellites.forEach(satellite => {
      const dist = haversineMeters(pos.lat, pos.lng, satellite.lat, satellite.lng);
      if (dist <= BUFFER_RADIUS_M) {
        satellitesInBuffer.push({ ...satellite, distanceKm: (dist / 1000).toFixed(2) });
        bufferStudents += satellite.students || 0;
        totalAMIEsSet.add(satellite.amie);
      }
    });
    
    totalNucleos += nucleosInBuffer.length;
    totalSatellites += satellitesInBuffer.length;
    totalStudents += bufferStudents;
    
    buffers.push({
      bufferName: `Buffer_${ni + 1}`,
      bufferType: 'Original',
      isCustom: false,
      centerLat: pos.lat,
      centerLng: pos.lng,
      radiusMeters: BUFFER_RADIUS_M,
      nucleosCount: nucleosInBuffer.length,
      satellitesCount: satellitesInBuffer.length,
      totalAMIEs: new Set([...nucleosInBuffer.map(n => n.amie), ...satellitesInBuffer.map(s => s.amie)]).size,
      totalStudents: bufferStudents,
      nucleos: nucleosInBuffer,
      satellites: satellitesInBuffer
    });
  });
  
  customBuffers.forEach((buffer, idx) => {
    const pos = buffer.circle.getLatLng();
    const nucleosInBuffer = [], satellitesInBuffer = [];
    let bufferStudents = 0;
    
    globalData.nucleos.forEach(nucleo => {
      const dist = haversineMeters(pos.lat, pos.lng, nucleo.lat, nucleo.lng);
      if (dist <= BUFFER_RADIUS_M) {
        nucleosInBuffer.push({ ...nucleo, distanceKm: (dist / 1000).toFixed(2) });
        bufferStudents += nucleo.students || 0;
        totalAMIEsSet.add(nucleo.amie);
      }
    });
    
    globalData.satellites.forEach(satellite => {
      const dist = haversineMeters(pos.lat, pos.lng, satellite.lat, satellite.lng);
      if (dist <= BUFFER_RADIUS_M) {
        satellitesInBuffer.push({ ...satellite, distanceKm: (dist / 1000).toFixed(2) });
        bufferStudents += satellite.students || 0;
        totalAMIEsSet.add(satellite.amie);
      }
    });
    
    totalNucleos += nucleosInBuffer.length;
    totalSatellites += satellitesInBuffer.length;
    totalStudents += bufferStudents;
    
    buffers.push({
      bufferName: buffer.name || `Buffer_Custom_${idx + 1}`,
      bufferType: 'Personalizado',
      isCustom: true,
      centerLat: pos.lat,
      centerLng: pos.lng,
      radiusMeters: BUFFER_RADIUS_M,
      nucleosCount: nucleosInBuffer.length,
      satellitesCount: satellitesInBuffer.length,
      totalAMIEs: new Set([...nucleosInBuffer.map(n => n.amie), ...satellitesInBuffer.map(s => s.amie)]).size,
      totalStudents: bufferStudents,
      nucleos: nucleosInBuffer,
      satellites: satellitesInBuffer
    });
  });
  
  const totalPoints = globalData.nucleos.length + globalData.satellites.length;
  const coveragePercent = totalPoints > 0 ? (((totalPoints - uncoveredPoints.length) / totalPoints) * 100).toFixed(1) : "0.0";
  
  return {
    buffers,
    summary: {
      totalBuffers: buffers.length,
      emptyBuffers: emptyBuffers.length,
      totalAMIEs: totalAMIEsSet.size,
      totalNucleos,
      totalSatellites,
      totalStudents,
      coveragePercent,
      uncoveredPoints: uncoveredPoints.length
    }
  };
}

function exportToExcel() {
  const data = performSpatialJoin();
  if (!data) return;
  
  const workbook = XLSX.utils.book_new();
  
  // Hoja 1: Resumen
  const summaryData = [
    ['Métrica', 'Valor'],
    ['Total de Buffers', data.summary.totalBuffers],
    ['Buffers Vacíos', data.summary.emptyBuffers],
    ['AMIEs Cubiertas', data.summary.totalAMIEs],
    ['Total Núcleos', data.summary.totalNucleos],
    ['Total Satélites', data.summary.totalSatellites],
    ['Total Estudiantes', data.summary.totalStudents],
    ['Porcentaje de Cobertura', data.summary.coveragePercent + '%'],
    ['Puntos Sin Cobertura', data.summary.uncoveredPoints]
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  
  // Hoja 2: Buffers
  const buffersData = [
    ['Buffer', 'Tipo', 'Latitud', 'Longitud', 'Radio (m)', 'Núcleos', 'Satélites', 'AMIEs', 'Estudiantes', 'Estado'],
    ...data.buffers.map(b => [
      b.bufferName,
      b.bufferType,
      b.centerLat.toFixed(6),
      b.centerLng.toFixed(6),
      b.radiusMeters,
      b.nucleosCount,
      b.satellitesCount,
      b.totalAMIEs,
      b.totalStudents,
      (b.nucleosCount === 0 && b.satellitesCount === 0) ? 'VACÍO' : 'Activo'
    ])
  ];
  const buffersSheet = XLSX.utils.aoa_to_sheet(buffersData);
  XLSX.utils.book_append_sheet(workbook, buffersSheet, 'Buffers');
  
  // Hoja 3: Detalle de Instituciones
  const detailData = [['Buffer', 'Tipo Institución', 'AMIE', 'Nombre', 'Distrito', 'Estudiantes', 'Distancia (km)']];
  data.buffers.forEach(buffer => {
    buffer.nucleos.forEach(n => {
      detailData.push([buffer.bufferName, 'Núcleo', n.amie, n.name, n.dist, n.students || 0, n.distanceKm]);
    });
    buffer.satellites.forEach(s => {
      detailData.push([buffer.bufferName, 'Satélite', s.amie, s.name, s.dist, s.students || 0, s.distanceKm]);
    });
  });
  const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle Instituciones');
  
  // Hoja 4: Buffers Vacíos
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
  
  // Hoja 5: Puntos Sin Cobertura
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
  XLSX.writeFile(workbook, `DECE_Analisis_Cobertura_${fecha}.xlsx`);
  showNotification("✓ Archivo Excel generado", "success");
  document.querySelector('.export-modal')?.remove();
}

function exportToCSV() {
  const data = performSpatialJoin();
  if (!data) return;
  
  let csv = 'Buffer,Tipo,Latitud,Longitud,Radio(m),Núcleos,Satélites,AMIEs,Estudiantes,Estado\n';
  data.buffers.forEach(b => {
    const isEmpty = (b.nucleosCount === 0 && b.satellitesCount === 0) ? 'VACÍO' : 'Activo';
    csv += `"${b.bufferName}","${b.bufferType}",${b.centerLat.toFixed(6)},${b.centerLng.toFixed(6)},${b.radiusMeters},${b.nucleosCount},${b.satellitesCount},${b.totalAMIEs},${b.totalStudents},"${isEmpty}"\n`;
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
  const data = performSpatialJoin();
  if (!data) return;
  
  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      version: '7.0 Enhanced Pro',
      bufferRadiusMeters: BUFFER_RADIUS_M
    },
    summary: data.summary,
    buffers: data.buffers,
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

// Resto del código original continúa aquí...
// (Incluiría todas las demás funciones del archivo original)

// ==================== INICIALIZACIÓN ====================
document.addEventListener("DOMContentLoaded", async () => {
  if (_initialized) return;
  _initialized = true;
  
  map = L.map("map", { preferCanvas: true, zoomControl: false }).setView(ECUADOR_CENTER, 8);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap, &copy; CartoDB',
    subdomains: "abcd",
    maxZoom: 20
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  
  // Añadir las nuevas capas al mapa
  map.addLayer(layers.nucleos);
  map.addLayer(layers.satellites);
  map.addLayer(layers.buffers);
  map.addLayer(layers.connections);
  map.addLayer(layers.coverage);
  map.addLayer(layers.animations);
  
  // Las nuevas capas se añaden pero no se muestran por defecto
  // map.addLayer(layers.uncoveredZones);
  // map.addLayer(layers.coverageGrid);
  
  setupControls();
  setupEditControls();
  
  try {
    const csvResp = await fetch("DECE_CRUCE_X_Y_NUC_SAT.csv");
    const csvText = await csvResp.text();
    globalData = parseCSV(csvText);
    
    const { nucleos, satellites } = globalData;
    const satCandidates = buildSatCandidates(nucleos, satellites);
    const { selected, uncovered } = setCoverGreedy(nucleos, satellites, satCandidates);
    const nucleoStats = buildNucleoStats(nucleos, satCandidates);
    
    drawNucleos(nucleos, selected);
    drawBuffersEditable(nucleos, selected, nucleoStats);
    drawSatellites(satellites, satCandidates, selected);
    
    const stats = computeStatistics(nucleos, satellites, satCandidates, selected, nucleoStats);
    updateStatistics(stats);
    updateTopNucleos(nucleoStats);
    
    // Realizar análisis de cobertura inicial
    updateCoverageAnalysis();
    
    hideLoadingOverlay();
  } catch (err) {
    console.error("Error loading data:", err);
    showNotification("❌ Error al cargar los datos", "error");
  }
  
  // Configurar botones adicionales
  const btnAnalyzeEmpty = document.getElementById('btnAnalyzeEmptyBuffers');
  if (btnAnalyzeEmpty) {
    btnAnalyzeEmpty.addEventListener('click', showEmptyBuffersPanel);
  }
  
  const btnToggleGrid = document.getElementById('btnToggleCoverageGrid');
  if (btnToggleGrid) {
    btnToggleGrid.addEventListener('click', () => {
      if (map.hasLayer(layers.coverageGrid)) {
        map.removeLayer(layers.coverageGrid);
        btnToggleGrid.classList.remove('active');
      } else {
        createCoverageGrid();
        map.addLayer(layers.coverageGrid);
        btnToggleGrid.classList.add('active');
      }
    });
  }
  
  const btnToggleUncovered = document.getElementById('btnToggleUncoveredZones');
  if (btnToggleUncovered) {
    btnToggleUncovered.addEventListener('click', () => {
      if (map.hasLayer(layers.uncoveredZones)) {
        map.removeLayer(layers.uncoveredZones);
        btnToggleUncovered.classList.remove('active');
      } else {
        identifyUncoveredZones();
        drawUncoveredZones();
        map.addLayer(layers.uncoveredZones);
        btnToggleUncovered.classList.add('active');
      }
    });
  }
});

// ==================== UTILIDADES ====================
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function flyToLocation(lat, lng) {
  if (map) map.flyTo([lat, lng], 12, { duration: 1.5 });
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const nucleos = [], satellites = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;
    
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() || '';
    });
    
    const lat = parseFloat(row.LATITUD_IE);
    const lng = parseFloat(row.LONGITUD_IE);
    if (isNaN(lat) || isNaN(lng)) continue;
    
    const obj = {
      amie: row.AMIE_IE || '',
      name: row.NOMBRE_IE || '',
      dist: row.DISTRITO || '',
      lat,
      lng,
      students: parseInt(row.TOTAL_ESTUDIANTES) || 0
    };
    
    if (row.TIPO_UBICACION === 'NUCLEO') nucleos.push(obj);
    else if (row.TIPO_UBICACION === 'SATELITE') satellites.push(obj);
  }
  
  return { nucleos, satellites };
}

function buildSatCandidates(nucleos, satellites) {
  const satCandidates = Array.from({ length: satellites.length }, () => []);
  const spatialIndex = new Map();
  
  satellites.forEach((s, si) => {
    const cellLat = Math.floor(s.lat / GRID_CELL_DEG);
    const cellLng = Math.floor(s.lng / GRID_CELL_DEG);
    const key = `${cellLat},${cellLng}`;
    if (!spatialIndex.has(key)) spatialIndex.set(key, []);
    spatialIndex.get(key).push(si);
  });
  
  nucleos.forEach((n, ni) => {
    const cellLat = Math.floor(n.lat / GRID_CELL_DEG);
    const cellLng = Math.floor(n.lng / GRID_CELL_DEG);
    for (let dLat = -2; dLat <= 2; dLat++) {
      for (let dLng = -2; dLng <= 2; dLng++) {
        const neighbors = spatialIndex.get(`${cellLat + dLat},${cellLng + dLng}`) || [];
        neighbors.forEach(si => {
          const dist = haversineMeters(n.lat, n.lng, satellites[si].lat, satellites[si].lng);
          if (dist <= BUFFER_RADIUS_M) {
            satCandidates[si].push({ ni, dist });
          }
        });
      }
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
      const count = nucleoStats[ni].satIdx.filter(si => uncovered.has(si)).length;
      if (count > bestCount) {
        bestCount = count;
        bestNi = ni;
      }
    });
    
    if (bestNi < 0) break;
    selected.add(bestNi);
    nucleoStats[bestNi].satIdx.forEach(si => uncovered.delete(si));
  }
  
  return { selected, uncovered };
}

function buildNucleoStats(nucleos, satCandidates) {
  const stats = nucleos.map(n => ({ satIdx: [], totalStudents: 0, nucleo: n }));
  satCandidates.forEach((cands, si) => {
    if (cands.length > 0) stats[cands[0].ni].satIdx.push(si);
  });
  stats.forEach(st => {
    st.satIdx.forEach(si => {
      st.totalStudents += globalData.satellites[si].students || 0;
    });
  });
  return stats;
}

function drawNucleos(nucleos, selected) {
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
    marker.bindPopup(createNucleoPopup(n));
    marker.addTo(layers.nucleos);
  });
}

function drawBuffersEditable(nucleos, selected, nucleoStats) {
  const savedState = loadBuffersState();
  const savedPositions = new Map();
  if (savedState?.editableBuffers) {
    savedState.editableBuffers.forEach(s => savedPositions.set(s.ni, { lat: s.currentLat, lng: s.currentLng }));
  }
  
  selected.forEach(ni => {
    const n = nucleos[ni];
    const st = nucleoStats[ni];
    const savedPos = savedPositions.get(ni);
    const lat = savedPos ? savedPos.lat : n.lat;
    const lng = savedPos ? savedPos.lng : n.lng;
    
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
      if (!editMode) showBufferPopup(editableBuffers.get(ni), false);
    });
    
    editableBuffers.set(ni, {
      circle,
      nucleo: n,
      stats: st,
      originalPos: { lat: n.lat, lng: n.lng },
      currentPos: { lat, lng },
      adjusted: false,
      isDragging: false
    });
    
    circle._adjusted = false;
  });
  
  if (savedState?.customBuffers) {
    savedState.customBuffers.forEach(s => restoreCustomBuffer(s));
  }
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
  
  const buffer = {
    id: saved.id,
    circle,
    lat: saved.lat,
    lng: saved.lng,
    originalPos: { lat: saved.lat, lng: saved.lng },
    currentPos: { lat: saved.lat, lng: saved.lng },
    isCustom: true,
    isDragging: false,
    name: saved.name
  };
  
  customBuffers.push(buffer);
  buffer.adjusted = false;
  circle._adjusted = false;
  
  circle.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    showBufferPopup(buffer, true);
  });
  
  if (editMode) makeBufferDraggable(circle, buffer, true);
}

function drawSatellites(satellites, satCandidates, selected) {
  satellites.forEach((s, si) => {
    let isCovered = false;
    let bestDist = BUFFER_RADIUS_M + 1;
    
    satCandidates[si]?.forEach(c => {
      if (selected.has(c.ni) && c.dist < bestDist) {
        bestDist = c.dist;
        isCovered = true;
      }
    });
    
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

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 500);
  }
}

function createNucleoPopup(n) {
  return `
    <div class="popup-title">🏛️ Núcleo DECE</div>
    <div class="popup-content">
      <div class="popup-row">
        <span class="popup-label">Institución:</span>
        <span class="popup-value">${escapeHTML(n.name)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Distrito:</span>
        <span class="popup-value">${escapeHTML(n.dist)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Estudiantes:</span>
        <span class="popup-value" style="color:#d29922">${(n.students || 0).toLocaleString()}</span>
      </div>
    </div>
  `;
}

function createSatellitePopup(s, distMetersOrNull) {
  const covered = distMetersOrNull !== null;
  return `
    <div class="popup-title">📍 Satélite</div>
    <div class="popup-content">
      <div class="popup-row">
        <span class="popup-label">Institución:</span>
        <span class="popup-value">${escapeHTML(s.name)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Distrito:</span>
        <span class="popup-value">${escapeHTML(s.dist)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Estado:</span>
        <span class="popup-value" style="color:${covered ? '#3fb950' : '#f85149'}">
          ${covered ? '✓ Cubierto' : '✗ Sin cobertura'}
        </span>
      </div>
      ${covered ? `
      <div class="popup-row">
        <span class="popup-label">Distancia:</span>
        <span class="popup-value">${(distMetersOrNull / 1000).toFixed(2)} km</span>
      </div>
      ` : ''}
      <div class="popup-row">
        <span class="popup-label">Estudiantes:</span>
        <span class="popup-value" style="color:#d29922">${(s.students || 0).toLocaleString()}</span>
      </div>
    </div>
  `;
}

function updateStatistics(stats) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  };
  
  set('totalNucleos', stats.totalNucleos);
  set('totalSatellites', stats.totalSatellites);
  set('coveragePercent', stats.coveragePercent + '%');
  set('totalStudents', stats.totalStudents);
  set('nucleosActivos', stats.nucleosActivos);
  set('sinCobertura', stats.sinCobertura);
  
  const fill = document.getElementById('coverageFill');
  if (fill) {
    fill.style.width = Math.min(100, parseFloat(stats.coveragePercent)) + '%';
  }
}

function computeStatistics(nucleos, satellites, satCandidates, selected, nucleoStats) {
  let covered = 0;
  let totalStudents = 0;
  
  satellites.forEach((s, si) => {
    if (satCandidates[si]?.some(c => selected.has(c.ni))) {
      covered++;
      totalStudents += s.students || 0;
    }
  });
  
  return {
    totalNucleos: nucleos.length,
    totalSatellites: satellites.length,
    coveragePercent: satellites.length > 0 ? ((covered / satellites.length) * 100).toFixed(1) : '0.0',
    totalStudents,
    nucleosActivos: selected.size,
    sinCobertura: satellites.length - covered
  };
}

function updateTopNucleos(nucleoStats) {
  const container = document.getElementById('topNucleos');
  if (!container) return;
  
  const sorted = nucleoStats
    .map((st, i) => ({ st, i }))
    .sort((a, b) => b.st.satIdx.length - a.st.satIdx.length)
    .slice(0, 10);
  
  container.innerHTML = sorted.map((x, idx) => `
    <div class="top-item" onclick="flyToLocation(${x.st.nucleo.lat}, ${x.st.nucleo.lng})">
      <div class="top-item-header">
        <span class="top-rank">#${idx + 1}</span>
        <span class="top-name">${escapeHTML(x.st.nucleo.name)}</span>
        <span class="top-count">${x.st.satIdx.length}</span>
      </div>
      <div class="top-desc">${x.st.totalStudents.toLocaleString()} est.</div>
    </div>
  `).join('');
}

function setupControls() {
  document.getElementById('toggleStats')?.addEventListener('click', () => {
    document.getElementById('statsPanel')?.classList.toggle('active');
    document.getElementById('legendPanel')?.classList.remove('active');
  });
  
  document.getElementById('toggleLegend')?.addEventListener('click', () => {
    document.getElementById('legendPanel')?.classList.toggle('active');
    document.getElementById('statsPanel')?.classList.remove('active');
  });
  
  ['toggleBuffers', 'toggleConnections', 'toggleNucleos', 'toggleSatellites', 'toggleCoverage'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        const layer = [layers.buffers, layers.connections, layers.nucleos, layers.satellites, layers.coverage][i];
        e.target.checked ? map.addLayer(layer) : map.removeLayer(layer);
      });
    }
  });
  
  setTimeout(() => document.getElementById('statsPanel')?.classList.add('active'), 500);
}

function setupEditControls() {
  const btnEdit = document.getElementById('btnEditBuffers');
  const btnAdd = document.getElementById('btnAddBuffers');
  const btnDelete = document.getElementById('btnDeleteBuffers');
  const btnSave = document.getElementById('btnSaveChanges');
  const btnExport = document.getElementById('btnExportResults');
  
  if (btnEdit) {
    btnEdit.addEventListener('click', toggleEditMode);
  }
  
  if (btnAdd) {
    btnAdd.addEventListener('click', toggleAddMode);
  }
  
  if (btnDelete) {
    btnDelete.addEventListener('click', toggleDeleteMode);
  }
  
  if (btnSave) {
    btnSave.addEventListener('click', saveBuffersState);
  }
  
  if (btnExport) {
    btnExport.addEventListener('click', showExportModal);
  }
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('btnEditBuffers');
  
  if (editMode) {
    btn?.classList.add('active');
    showNotification('✏️ Modo edición activado - Arrastra los buffers', 'info');
    
    editableBuffers.forEach((data) => {
      makeBufferDraggable(data.circle, data, false);
    });
    
    customBuffers.forEach((buffer) => {
      makeBufferDraggable(buffer.circle, buffer, true);
    });
  } else {
    btn?.classList.remove('active');
    showNotification('✓ Modo edición desactivado', 'success');
    
    editableBuffers.forEach((data) => {
      data.circle.dragging?.disable();
    });
    
    customBuffers.forEach((buffer) => {
      buffer.circle.dragging?.disable();
    });
  }
}

function toggleAddMode() {
  addMode = !addMode;
  const btn = document.getElementById('btnAddBuffers');
  
  if (addMode) {
    btn?.classList.add('active');
    showNotification('➕ Haz clic en el mapa para añadir buffers', 'info');
    map.on('click', onMapClickForAdd);
  } else {
    btn?.classList.remove('active');
    showNotification('✓ Modo añadir desactivado', 'success');
    map.off('click', onMapClickForAdd);
  }
}

function toggleDeleteMode() {
  deleteMode = !deleteMode;
  const btn = document.getElementById('btnDeleteBuffers');
  
  if (deleteMode) {
    btn?.classList.add('active');
    showNotification('🗑️ Haz clic en un buffer para eliminarlo', 'info');
  } else {
    btn?.classList.remove('active');
    showNotification('✓ Modo eliminar desactivado', 'success');
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
    data.adjusted = true;
    circle._adjusted = true;
    data.isDragging = false;
    
    markAsChanged();
    showNotification('📍 Buffer reposicionado', 'success');
    
    // Actualizar análisis de cobertura después de mover un buffer
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
  circle._adjusted = false;
  
  customBuffers.push(newBuffer);
  
  circle.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    if (deleteMode) {
      deleteCustomBuffer(newBuffer.id);
    } else {
      showBufferPopup(newBuffer, true);
    }
  });
  
  if (editMode) {
    makeBufferDraggable(circle, newBuffer, true);
  }
  
  markAsChanged();
  showNotification('✓ Buffer personalizado añadido', 'success');
  
  // Actualizar análisis de cobertura
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
    showNotification('🗑️ Buffer eliminado', 'success');
    
    // Actualizar análisis de cobertura
    setTimeout(() => {
      updateCoverageAnalysis();
    }, 500);
  }
}

function showBufferPopup(bufferData, isCustom) {
  if (!bufferData) return;
  
  const pos = bufferData.circle.getLatLng();
  let html = `
    <div class="popup-title">${isCustom ? '🔷' : '🔵'} ${isCustom ? 'Buffer Personalizado' : 'Buffer Original'}</div>
    <div class="popup-content">
  `;
  
  if (!isCustom && bufferData.nucleo) {
    html += `
      <div class="popup-row">
        <span class="popup-label">Núcleo:</span>
        <span class="popup-value">${escapeHTML(bufferData.nucleo.name)}</span>
      </div>
    `;
  }
  
  if (isCustom) {
    html += `
      <div class="popup-row">
        <span class="popup-label">Nombre:</span>
        <span class="popup-value">${escapeHTML(bufferData.name)}</span>
      </div>
    `;
  }
  
  html += `
    <div class="popup-row">
      <span class="popup-label">Posición:</span>
      <span class="popup-value">${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}</span>
    </div>
    <div class="popup-row">
      <span class="popup-label">Radio:</span>
      <span class="popup-value">${(BUFFER_RADIUS_M / 1000).toFixed(1)} km</span>
    </div>
  `;
  
  // Calcular cobertura del buffer
  let nucleosInBuffer = 0;
  let satellitesInBuffer = 0;
  let studentsInBuffer = 0;
  
  if (globalData) {
    globalData.nucleos.forEach(nucleo => {
      const dist = haversineMeters(pos.lat, pos.lng, nucleo.lat, nucleo.lng);
      if (dist <= BUFFER_RADIUS_M) {
        nucleosInBuffer++;
        studentsInBuffer += nucleo.students || 0;
      }
    });
    
    globalData.satellites.forEach(satellite => {
      const dist = haversineMeters(pos.lat, pos.lng, satellite.lat, satellite.lng);
      if (dist <= BUFFER_RADIUS_M) {
        satellitesInBuffer++;
        studentsInBuffer += satellite.students || 0;
      }
    });
  }
  
  const isEmpty = nucleosInBuffer === 0 && satellitesInBuffer === 0;
  
  html += `
    <div class="popup-row">
      <span class="popup-label">Núcleos:</span>
      <span class="popup-value">${nucleosInBuffer}</span>
    </div>
    <div class="popup-row">
      <span class="popup-label">Satélites:</span>
      <span class="popup-value">${satellitesInBuffer}</span>
    </div>
    <div class="popup-row">
      <span class="popup-label">Estudiantes:</span>
      <span class="popup-value" style="color:#d29922">${studentsInBuffer.toLocaleString()}</span>
    </div>
    <div class="popup-row">
      <span class="popup-label">Estado:</span>
      <span class="popup-value" style="color:${isEmpty ? '#f85149' : '#3fb950'}">
        ${isEmpty ? '⚠️ Vacío' : '✓ Activo'}
      </span>
    </div>
  `;
  
  html += '</div>';
  
  bufferData.circle.bindPopup(html).openPopup();
}
