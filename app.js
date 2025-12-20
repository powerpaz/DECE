/*************************************************
 * DECE Coverage App - v7.1 BUGFIX CRÍTICO 🔧
 * ✅ FIX: Invalid LatLng object error
 * ✅ Validación exhaustiva de coordenadas
 * ✅ Mejor detección de columnas
 * ✅ Logs detallados de debugging
 *************************************************/

// ========== CONFIGURACIÓN GLOBAL ==========
const CONFIG = {
  BUFFER_RADIUS_M: 7500,
  ORPHAN_MAX_DISTANCE_M: 7000,
  ECUADOR_CENTER: [-1.831239, -78.183406],
  GRID_CELL_DEG: 0.10,
  TARGET_COVERAGE: 0.97,
  MAX_BUFFERS: 220,
  MIN_SATS_PER_BUFFER: 3,
  TOP_N_BUFFERS: 120,
  ENABLE_NETWORK_ANIMATION: true,
  MAX_CONNECTIONS_FOR_ANIM: 6000,
  ASSUMED_SPEED_KMH: 30,
  DEBOUNCE_DELAY: 300,
  CACHE_MAX_SIZE: 10000,
  STORAGE_KEY: 'dece_buffers_state'
};

// ========== ESTADO GLOBAL ==========
let map;
const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup(),
  animations: L.featureGroup()
};

let editMode = false;
let addMode = false;
let deleteMode = false;
let editableBuffers = new Map();
let customBuffers = [];
let customBufferCounter = 0;
let globalData = null;
let metricsPanel = null;
let hasUnsavedChanges = false;
let _initialized = false;

// ========== CACHÉ Y OPTIMIZACIÓN ==========
let orphanAnalysisCache = null;
let analyzeOrphansTimer = null;
let regenerateAnimationsTimer = null;
const distanceCache = new Map();

// ========== FUNCIONES AUXILIARES ==========
function getCachedDistance(lat1, lng1, lat2, lng2) {
  const key = `${lat1.toFixed(6)},${lng1.toFixed(6)}-${lat2.toFixed(6)},${lng2.toFixed(6)}`;
  if (distanceCache.has(key)) return distanceCache.get(key);
  
  const dist = haversineMeters(lat1, lng1, lat2, lng2);
  
  if (distanceCache.size > CONFIG.CACHE_MAX_SIZE) {
    const firstKey = distanceCache.keys().next().value;
    distanceCache.delete(firstKey);
  }
  
  distanceCache.set(key, dist);
  return dist;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ========== VALIDACIÓN CRÍTICA DE COORDENADAS ==========
function isValidLatLng(lat, lng) {
  if (lat === undefined || lng === undefined) return false;
  if (lat === null || lng === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function parseCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  
  // Convertir a string y limpiar
  let str = String(value).trim();
  
  // Reemplazar coma decimal por punto
  str = str.replace(',', '.');
  
  // Eliminar espacios internos
  str = str.replace(/\s+/g, '');
  
  const num = parseFloat(str);
  
  return Number.isFinite(num) ? num : null;
}

// ========== NOTIFICACIONES ==========
function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  const existing = document.querySelector('.notification-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `notification-toast notification-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    padding: 12px 24px;
    background: ${type === 'success' ? '#3fb950' : type === 'error' ? '#f85149' : '#58a6ff'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== STORAGE ==========
function loadBuffersState() {
  try {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    console.log('[STORAGE] Estado cargado:', data);
    return data;
  } catch (e) {
    console.error('[STORAGE] Error cargando:', e);
    return null;
  }
}

function saveBuffersState() {
  try {
    const state = {
      editableBuffers: Array.from(editableBuffers.entries()).map(([ni, data]) => ({
        ni,
        lat: data.circle.getLatLng().lat,
        lng: data.circle.getLatLng().lng,
        originalLat: data.nucleo.lat,
        originalLng: data.nucleo.lng
      })),
      customBuffers: customBuffers.map(b => ({
        id: b.id,
        name: b.name,
        lat: b.circle.getLatLng().lat,
        lng: b.circle.getLatLng().lng,
        originalLat: b.originalPos.lat,
        originalLng: b.originalPos.lng
      })),
      timestamp: Date.now()
    };
    
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    hasUnsavedChanges = false;
    updateSaveButtonState();
    showNotification('✅ Cambios guardados exitosamente', 'success');
    console.log('[STORAGE] Estado guardado');
  } catch (e) {
    console.error('[STORAGE] Error guardando:', e);
    showNotification('❌ Error al guardar cambios', 'error');
  }
}

function resetAllBuffersState() {
  if (!confirm('¿Reiniciar todas las posiciones de buffers? Esta acción no se puede deshacer.')) return;
  
  localStorage.removeItem(CONFIG.STORAGE_KEY);
  hasUnsavedChanges = false;
  showNotification('🔄 Reiniciando...', 'info');
  setTimeout(() => location.reload(), 500);
}

function markAsChanged() {
  hasUnsavedChanges = true;
  updateSaveButtonState();
}

function updateSaveButtonState() {
  const btn = document.getElementById('btnSaveChanges');
  if (!btn) return;
  
  if (hasUnsavedChanges) {
    btn.classList.add('has-changes');
    btn.style.background = 'linear-gradient(135deg, #f0883e 0%, #d87028 100%)';
  } else {
    btn.classList.remove('has-changes');
    btn.style.background = '';
  }
}

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
  if (_initialized) return;
  _initialized = true;
  
  console.log('[INIT] Iniciando aplicación DECE Optimizer v7.1');
  
  initMap();
  setupControls();
  setupEditControls();
  loadCSV();
});

function initMap() {
  try {
    console.log('[MAP] Inicializando mapa...');
    const canvasRenderer = L.canvas({ padding: 0.5 });
    
    map = L.map('map', {
      center: CONFIG.ECUADOR_CENTER,
      zoom: 7,
      zoomControl: true,
      preferCanvas: true,
      renderer: canvasRenderer
    });
    
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 19
    });
    
    L.control.layers({
      'OpenStreetMap': osmLayer,
      'Satélite': satLayer
    }).addTo(map);
    
    Object.values(layers).forEach(layer => layer.addTo(map));
    
    console.log('[MAP] ✅ Mapa inicializado correctamente');
  } catch (error) {
    console.error('[MAP] ❌ Error al inicializar:', error);
    showNotification('❌ Error al inicializar el mapa', 'error');
  }
}

function setupControls() {
  const toggleStats = document.getElementById('toggleStats');
  const toggleLegend = document.getElementById('toggleLegend');
  const statsPanel = document.getElementById('statsPanel');
  const legendPanel = document.getElementById('legendPanel');
  
  if (toggleStats && statsPanel) {
    toggleStats.addEventListener('click', () => {
      statsPanel.classList.toggle('active');
      if (legendPanel) legendPanel.classList.remove('active');
    });
  }
  
  if (toggleLegend && legendPanel) {
    toggleLegend.addEventListener('click', () => {
      legendPanel.classList.toggle('active');
      if (statsPanel) statsPanel.classList.remove('active');
    });
  }
  
  const layerToggles = [
    { id: 'toggleBuffers', layer: layers.buffers },
    { id: 'toggleConnections', layer: layers.connections },
    { id: 'toggleNucleos', layer: layers.nucleos },
    { id: 'toggleSatellites', layer: layers.satellites }
  ];
  
  layerToggles.forEach(({ id, layer }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        if (e.target.checked) {
          map.addLayer(layer);
        } else {
          map.removeLayer(layer);
        }
      });
    }
  });
  
  setTimeout(() => {
    if (statsPanel) statsPanel.classList.add('active');
  }, 500);
  
  console.log('[CONTROLS] ✅ Controles configurados');
}

function setupEditControls() {
  const btnEdit = document.getElementById('btnEditBuffers');
  const btnAdd = document.getElementById('btnAddBuffers');
  const btnDelete = document.getElementById('btnDeleteBuffers');
  const btnSave = document.getElementById('btnSaveChanges');
  const btnComplete = document.getElementById('btnCompleteCoverage');
  const btnExport = document.getElementById('btnExportResults');
  const btnOptimize = document.getElementById('btnOptimizar');
  
  if (btnEdit) btnEdit.addEventListener('click', toggleEditMode);
  if (btnAdd) btnAdd.addEventListener('click', toggleAddMode);
  if (btnDelete) btnDelete.addEventListener('click', toggleDeleteMode);
  if (btnSave) btnSave.addEventListener('click', saveBuffersState);
  if (btnComplete) btnComplete.addEventListener('click', completeCoverage);
  if (btnExport) btnExport.addEventListener('click', showExportModal);
  if (btnOptimize) btnOptimize.addEventListener('click', optimizeNucleos);
  
  console.log('[CONTROLS] ✅ Controles de edición configurados');
}

// ========== MODOS DE EDICIÓN ==========
function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('btnEditBuffers');
  
  if (editMode && addMode) toggleAddMode();
  
  if (editMode) {
    if (btn) btn.classList.add('active');
    enableBufferEditing();
    showNotification('🖊️ Modo edición activado - Arrastra los buffers', 'info');
  } else {
    if (btn) btn.classList.remove('active');
    disableBufferEditing();
    closeMetricsPanel();
    showNotification('Modo edición desactivado', 'info');
  }
}

function toggleAddMode() {
  addMode = !addMode;
  const btn = document.getElementById('btnAddBuffers');
  
  if (addMode && editMode) toggleEditMode();
  if (addMode && deleteMode) toggleDeleteMode();
  
  if (addMode) {
    if (btn) btn.classList.add('active');
    map.getContainer().style.cursor = 'crosshair';
    map.on('click', onMapClickAddBuffer);
    showNotification('➕ Click en el mapa para crear un buffer personalizado', 'info');
  } else {
    if (btn) btn.classList.remove('active');
    map.getContainer().style.cursor = '';
    map.off('click', onMapClickAddBuffer);
  }
}

function toggleDeleteMode() {
  deleteMode = !deleteMode;
  const btn = document.getElementById('btnDeleteBuffers');
  
  if (deleteMode && editMode) toggleEditMode();
  if (deleteMode && addMode) toggleAddMode();
  
  if (deleteMode) {
    if (btn) btn.classList.add('active');
    map.getContainer().style.cursor = 'not-allowed';
    enableDeleteMode();
    showNotification('🗑️ Click en un buffer personalizado para eliminarlo', 'info');
  } else {
    if (btn) btn.classList.remove('active');
    map.getContainer().style.cursor = '';
    disableDeleteMode();
  }
}

function enableBufferEditing() {
  editableBuffers.forEach((data, ni) => {
    data.circle.dragging.enable();
    data.circle.setStyle({ color: '#f0883e', fillColor: '#f0883e' });
    
    data.circle.on('dragstart', () => {
      closeMetricsPanel();
    });
    
    data.circle.on('drag', () => {
      debounceAnalyzeOrphans();
      debounceRegenerateAnimations();
    });
    
    data.circle.on('dragend', () => {
      markAsChanged();
      analyzeOrphans();
      regenerateAnimations();
      showBufferMetrics(data, false);
    });
    
    data.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      showBufferMetrics(data, false);
    });
  });
  
  customBuffers.forEach(buffer => {
    buffer.circle.dragging.enable();
    buffer.circle.setStyle({ color: '#c78dff', fillColor: '#c78dff' });
    
    buffer.circle.on('dragstart', () => {
      closeMetricsPanel();
    });
    
    buffer.circle.on('drag', () => {
      debounceAnalyzeOrphans();
      debounceRegenerateAnimations();
    });
    
    buffer.circle.on('dragend', () => {
      markAsChanged();
      analyzeOrphans();
      regenerateAnimations();
      showBufferMetrics(buffer, true);
    });
    
    buffer.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      showBufferMetrics(buffer, true);
    });
  });
}

function disableBufferEditing() {
  editableBuffers.forEach((data, ni) => {
    data.circle.dragging.disable();
    data.circle.setStyle({ color: '#58a6ff', fillColor: '#58a6ff' });
    data.circle.off('click');
    data.circle.off('dragstart');
    data.circle.off('drag');
    data.circle.off('dragend');
  });
  
  customBuffers.forEach(buffer => {
    buffer.circle.dragging.disable();
    buffer.circle.setStyle({ color: '#a371f7', fillColor: '#a371f7' });
    buffer.circle.off('click');
    buffer.circle.off('dragstart');
    buffer.circle.off('drag');
    buffer.circle.off('dragend');
  });
}

function enableDeleteMode() {
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
  
  editableBuffers.forEach((data, ni) => {
    data.circle.off('click');
    data.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (deleteMode) {
        showNotification('⚠️ Los buffers de núcleo no se pueden eliminar', 'error');
      }
    });
  });
}

function disableDeleteMode() {
  customBuffers.forEach(buffer => {
    buffer.circle.off('click');
    buffer.circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      showBufferPopup(buffer, true);
    });
    buffer.circle.setStyle({ color: '#a371f7', fillColor: '#a371f7' });
  });
  
  editableBuffers.forEach((data, ni) => {
    data.circle.off('click');
    data.circle.on('click', (e) => {
      if (!editMode) showBufferPopup(data, false);
    });
  });
}

// ========== DEBOUNCE ==========
function debounceAnalyzeOrphans() {
  if (analyzeOrphansTimer) clearTimeout(analyzeOrphansTimer);
  analyzeOrphansTimer = setTimeout(() => {
    analyzeOrphans();
  }, CONFIG.DEBOUNCE_DELAY);
}

function debounceRegenerateAnimations() {
  if (regenerateAnimationsTimer) clearTimeout(regenerateAnimationsTimer);
  regenerateAnimationsTimer = setTimeout(() => {
    regenerateAnimations();
  }, CONFIG.DEBOUNCE_DELAY);
}

// ========== CARGA DE DATOS ==========
function loadCSV() {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = document.querySelector('.loading-text');
  const subtextEl = document.getElementById('loadingSubtext');
  
  const setText = (main, sub = '') => {
    if (textEl) textEl.textContent = main;
    if (subtextEl) subtextEl.textContent = sub;
  };
  
  if (overlay) overlay.style.display = 'flex';
  
  if (!window.Papa) {
    console.error('[ERROR] ❌ PapaParse no disponible');
    setText('Error: PapaParse no cargado');
    showNotification('❌ Error: Falta librería PapaParse', 'error');
    return;
  }
  
  console.log('[CSV] ✅ PapaParse disponible');
  setText('Cargando CSV...', 'DECE_CRUCE_X_Y_NUC_SAT.csv');
  
  fetch('DECE_CRUCE_X_Y_NUC_SAT.csv', { cache: 'no-store' })
    .then(res => {
      console.log('[FETCH] Status:', res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(rawText => {
      console.log('[CSV] ✅ Archivo cargado, tamaño:', rawText.length, 'bytes');
      
      // Eliminar BOM si existe
      let text = rawText.replace(/^\uFEFF/, '');
      
      // Detectar delimitador
      const firstLine = text.split(/\r?\n/, 1)[0] || '';
      const semicolons = (firstLine.match(/;/g) || []).length;
      const commas = (firstLine.match(/,/g) || []).length;
      const delim = semicolons >= commas ? ';' : ',';
      
      console.log('[CSV] Delimitador detectado:', delim);
      console.log('[CSV] Primera línea (primeros 200 chars):', firstLine.substring(0, 200));
      
      setText('Procesando datos...', `Delimitador: ${delim}`);
      
      Papa.parse(text, {
        delimiter: delim,
        skipEmptyLines: 'greedy',
        worker: false, // Cambiado a false para mejor debugging
        complete: (results) => {
          console.log('[PARSE] ✅ Completado, filas:', results.data.length);
          try {
            handleParsed(results);
          } catch (e) {
            console.error('[ERROR] ❌ handleParsed:', e);
            console.error('[ERROR] Stack:', e.stack);
            setText('Error procesando CSV: ' + e.message);
            showNotification('❌ Error al procesar datos', 'error');
          }
        },
        error: (err) => {
          console.error('[ERROR] ❌ Papa.parse:', err);
          setText('Error leyendo CSV');
          showNotification('❌ Error al leer CSV', 'error');
        }
      });
    })
    .catch(err => {
      console.error('[ERROR] ❌ Fetch falló:', err);
      setText('Error cargando CSV: ' + err.message);
      showNotification('❌ Error al cargar archivo CSV', 'error');
    });
  
  function handleParsed(results) {
    const rows = results.data || [];
    if (!rows.length) {
      setText('CSV vacío');
      showNotification('❌ El archivo CSV está vacío', 'error');
      return;
    }
    
    console.log('[PARSE] Procesando', rows.length, 'filas');
    
    const resolved = resolveColumnIndexes(rows[0] || []);
    console.log('[PARSE] Índices de columnas:', resolved.idx);
    
    const mapped = mapRowsToData(rows, resolved.idx);
    
    if (!mapped.data.length) {
      setText('No hay registros válidos');
      showNotification('❌ No se encontraron datos válidos en el CSV', 'error');
      return;
    }
    
    console.log('[PARSE] ✅ Datos mapeados:', mapped.data.length, 'registros');
    console.log('[PARSE] Registros válidos:', mapped.validCount, '| Inválidos:', mapped.invalidCount);
    
    if (mapped.bounds?.isValid()) {
      map.fitBounds(mapped.bounds.pad(0.10), { animate: false });
    }
    
    processData(mapped.data);
  }
}

function resolveColumnIndexes(headerRow) {
  const norm = s => String(s ?? '').replace(/^\uFEFF/, '').trim().toLowerCase();
  const header = headerRow.map(norm);
  
  console.log('[HEADERS] Total columnas:', header.length);
  console.log('[HEADERS] Primeras 15 columnas:', header.slice(0, 15));
  
  const find = (candidates) => {
    for (let c of candidates) {
      const idx = header.findIndex(h => h.includes(c));
      if (idx >= 0) {
        console.log(`[COLUMN] ✅ Encontrada "${c}" en índice ${idx} (columna: "${headerRow[idx]}")`);
        return idx;
      }
    }
    console.warn(`[COLUMN] ⚠️ No encontrada ninguna de:`, candidates);
    return -1;
  };
  
  // CRÍTICO: Buscar coordenadas con múltiples variantes
  const idxLat = find(['latitud', 'lat', 'y']);
  const idxLon = find(['longitud', 'lng', 'lon', 'long', 'x']);
  const idxCodGdece = find(['cod_gdece', 'cod gdece', 'codgdece']);
  const idxCoordDece = find(['coord_dece', 'coord dece', 'coorddece']);
  
  if (idxLat === -1) {
    console.error('[COLUMN] ❌ CRÍTICO: No se encontró columna de LATITUD');
  }
  if (idxLon === -1) {
    console.error('[COLUMN] ❌ CRÍTICO: No se encontró columna de LONGITUD');
  }
  
  return {
    idx: {
      lat: idxLat,
      lon: idxLon,
      typeCode: idxCoordDece >= 0 ? idxCoordDece : idxCodGdece,
      codGDECE: idxCodGdece,
      name: find(['nombre_ie', 'nombre_institución', 'nombre_institucion', 'nombre institucion', 'nombre']),
      dist: find(['distrito']),
      students: find(['total estudiantes', 'total_estudiantes', 'estudiantes']),
      amie: find(['amie'])
    }
  };
}

function mapRowsToData(rows, idx) {
  const data = [];
  const bounds = L.latLngBounds();
  let validCount = 0;
  let invalidCount = 0;
  let coordErrors = 0;
  
  console.log('[MAP] Iniciando mapeo de datos...');
  console.log('[MAP] Índice lat:', idx.lat, '| Índice lon:', idx.lon);
  
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r?.length) continue;
    
    // CRÍTICO: Parsear coordenadas con validación
    const latRaw = r[idx.lat];
    const lngRaw = r[idx.lon];
    
    const lat = parseCoordinate(latRaw);
    const lng = parseCoordinate(lngRaw);
    
    // Validar coordenadas
    if (!isValidLatLng(lat, lng)) {
      if (coordErrors < 5) { // Solo mostrar primeros 5 errores
        console.warn(`[MAP] ⚠️ Fila ${i}: Coordenadas inválidas - lat:"${latRaw}"→${lat}, lng:"${lngRaw}"→${lng}`);
      }
      coordErrors++;
      invalidCount++;
      continue;
    }
    
    const typeCode = parseInt(String(r[idx.typeCode] || '').trim(), 10);
    const codGDECE = idx.codGDECE >= 0 ? parseInt(String(r[idx.codGDECE] || '').trim(), 10) : null;
    
    if (!Number.isFinite(typeCode)) {
      invalidCount++;
      continue;
    }
    
    const name = idx.name >= 0 ? String(r[idx.name] || '').trim() : '';
    const dist = idx.dist >= 0 ? String(r[idx.dist] || '').trim() : '';
    const students = idx.students >= 0 ? parseInt(String(r[idx.students] || '0').replace(/\D/g, ''), 10) || 0 : 0;
    const amie = idx.amie >= 0 ? String(r[idx.amie] || '').trim() : '';
    
    data.push({ lat, lng, code: typeCode, codGDECE, name, dist, students, amie });
    bounds.extend([lat, lng]);
    validCount++;
  }
  
  if (coordErrors > 5) {
    console.warn(`[MAP] ⚠️ Total de ${coordErrors} filas con coordenadas inválidas (mostrando solo primeras 5)`);
  }
  
  console.log(`[MAP] ✅ Válidos: ${validCount}, ❌ Inválidos: ${invalidCount}`);
  
  return { data, bounds, validCount, invalidCount };
}

function processData(data) {
  console.log('[PROCESS] Procesando', data.length, 'instituciones');
  
  // Limpiar capas anteriores
  layers.nucleos.clearLayers();
  layers.satellites.clearLayers();
  layers.buffers.clearLayers();
  layers.connections.clearLayers();
  layers.animations.clearLayers();
  editableBuffers.clear();
  
  // Detectar códigos de tipo
  const counts = {};
  data.forEach(d => {
    const c = Number(d.code);
    if (!Number.isFinite(c)) return;
    counts[c] = (counts[c] || 0) + 1;
  });
  
  console.log('[CODES] Distribución de códigos:', counts);
  
  const codes = Object.keys(counts).map(Number);
  const has013 = counts[0] && (counts[1] || counts[2] || counts[3]);
  const has235 = counts[2] && (counts[3] || counts[4] || counts[5]);
  
  let satelliteCodes = [];
  let nucleoCodes = [];
  
  if (has013 && !has235) {
    satelliteCodes = [0];
    nucleoCodes = [1, 2, 3];
  } else if (has235 && !has013) {
    satelliteCodes = [2];
    nucleoCodes = [3, 4, 5];
  } else if (has013 && has235) {
    const sorted = [...codes].sort((a,b) => (counts[b]||0) - (counts[a]||0));
    satelliteCodes = [sorted[0]];
    nucleoCodes = sorted.slice(1);
  } else {
    const sorted = [...codes].sort((a,b) => (counts[b]||0) - (counts[a]||0));
    satelliteCodes = [sorted[0]];
    nucleoCodes = sorted.slice(1);
  }
  
  console.log('[TYPES] Códigos satélite:', satelliteCodes, 'Códigos núcleo:', nucleoCodes);
  
  const satellites = data.filter(d => satelliteCodes.includes(d.code));
  const nucleos = data.filter(d => nucleoCodes.includes(d.code));
  
  console.log(`[TYPES] ${nucleos.length} núcleos, ${satellites.length} satélites`);
  
  if (nucleos.length === 0) {
    showNotification('❌ No se encontraron núcleos DECE', 'error');
    hideLoadingOverlay();
    return;
  }
  
  if (satellites.length === 0) {
    showNotification('⚠️ No se encontraron satélites', 'error');
  }
  
  // Dibujar núcleos con VALIDACIÓN
  let nucleoDrawn = 0;
  let nucleoSkipped = 0;
  
  nucleos.forEach((n, i) => {
    if (!isValidLatLng(n.lat, n.lng)) {
      console.warn(`[DRAW] ⚠️ Núcleo ${i} con coordenadas inválidas:`, n);
      nucleoSkipped++;
      return;
    }
    
    n.type = 'nucleo';
    const marker = L.circleMarker([n.lat, n.lng], {
      radius: 6,
      fillColor: '#58a6ff',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    });
    
    marker.bindPopup(createNucleoPopup(n, 0, n.students || 0));
    marker.addTo(layers.nucleos);
    nucleoDrawn++;
  });
  
  console.log(`[DRAW] ✅ Núcleos dibujados: ${nucleoDrawn}, ⚠️ Omitidos: ${nucleoSkipped}`);
  
  // Dibujar satélites con VALIDACIÓN
  let satDrawn = 0;
  let satSkipped = 0;
  
  satellites.forEach((s, i) => {
    if (!isValidLatLng(s.lat, s.lng)) {
      console.warn(`[DRAW] ⚠️ Satélite ${i} con coordenadas inválidas:`, s);
      satSkipped++;
      return;
    }
    
    s.type = 'satellite';
    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 4,
      fillColor: '#8b949e',
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    });
    
    marker.bindPopup(createSatellitePopup(s, null));
    marker.addTo(layers.satellites);
    satDrawn++;
  });
  
  console.log(`[DRAW] ✅ Satélites dibujados: ${satDrawn}, ⚠️ Omitidos: ${satSkipped}`);
  
  // Crear buffers para núcleos con VALIDACIÓN
  const savedState = loadBuffersState();
  let buffersCreated = 0;
  
  nucleos.forEach((n, ni) => {
    if (!isValidLatLng(n.lat, n.lng)) {
      console.warn(`[BUFFER] ⚠️ No se puede crear buffer para núcleo ${ni} - coordenadas inválidas`);
      return;
    }
    
    let bufferLat = n.lat;
    let bufferLng = n.lng;
    
    if (savedState?.editableBuffers) {
      const saved = savedState.editableBuffers.find(b => b.ni === ni);
      if (saved && isValidLatLng(saved.lat, saved.lng)) {
        bufferLat = saved.lat;
        bufferLng = saved.lng;
        console.log(`[RESTORE] Buffer ${ni} restaurado a [${bufferLat}, ${bufferLng}]`);
      }
    }
    
    const circle = L.circle([bufferLat, bufferLng], {
      radius: CONFIG.BUFFER_RADIUS_M,
      color: '#58a6ff',
      fillColor: '#58a6ff',
      fillOpacity: 0.15,
      weight: 2,
      opacity: 0.6
    });
    
    circle.addTo(layers.buffers);
    
    editableBuffers.set(ni, {
      nucleo: n,
      circle: circle
    });
    
    buffersCreated++;
  });
  
  console.log(`[BUFFER] ✅ Buffers creados: ${buffersCreated}`);
  
  // Restaurar buffers personalizados
  if (savedState?.customBuffers) {
    let customRestored = 0;
    savedState.customBuffers.forEach(saved => {
      if (isValidLatLng(saved.lat, saved.lng)) {
        createCustomBuffer(saved.lat, saved.lng, saved.id, saved.name);
        customRestored++;
      }
    });
    console.log(`[RESTORE] ✅ ${customRestored} buffers personalizados restaurados`);
  }
  
  globalData = {
    nucleos: nucleos.filter(n => isValidLatLng(n.lat, n.lng)),
    satellites: satellites.filter(s => isValidLatLng(s.lat, s.lng)),
    allInstitutions: [...nucleos, ...satellites].filter(i => isValidLatLng(i.lat, i.lng))
  };
  
  console.log('[PROCESS] ✅ Datos globales establecidos');
  console.log('[PROCESS] Núcleos válidos:', globalData.nucleos.length);
  console.log('[PROCESS] Satélites válidos:', globalData.satellites.length);
  
  analyzeOrphans();
  updateStatistics();
  
  hideLoadingOverlay();
  showNotification(`✅ ${globalData.nucleos.length} núcleos y ${globalData.satellites.length} satélites cargados`, 'success');
}

// ========== CONTINUACIÓN EN SIGUIENTE MENSAJE ==========
// (El archivo es muy largo, continúa en el siguiente bloque)
// ========== BUFFERS PERSONALIZADOS ==========
function onMapClickAddBuffer(e) {
  if (!addMode) return;
  createCustomBuffer(e.latlng.lat, e.latlng.lng);
  markAsChanged();
}

function createCustomBuffer(lat, lng, id = null, name = null) {
  // VALIDACIÓN CRÍTICA
  if (!isValidLatLng(lat, lng)) {
    console.error('[BUFFER] ❌ Intento de crear buffer con coordenadas inválidas:', lat, lng);
    showNotification('❌ Coordenadas inválidas para buffer', 'error');
    return null;
  }
  
  const bufferId = id || `custom_${++customBufferCounter}_${Date.now()}`;
  const bufferName = name || `Buffer Personalizado ${customBufferCounter}`;
  
  const circle = L.circle([lat, lng], {
    radius: CONFIG.BUFFER_RADIUS_M,
    color: '#a371f7',
    fillColor: '#a371f7',
    fillOpacity: 0.15,
    weight: 2,
    opacity: 0.6
  });
  
  circle.addTo(layers.buffers);
  
  const buffer = {
    id: bufferId,
    name: bufferName,
    circle: circle,
    originalPos: { lat, lng }
  };
  
  customBuffers.push(buffer);
  
  circle.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    if (!deleteMode) {
      showBufferPopup(buffer, true);
    }
  });
  
  console.log('[BUFFER] ✅ Buffer personalizado creado:', bufferId);
  analyzeOrphans();
  
  return buffer;
}

function deleteCustomBuffer(id) {
  const index = customBuffers.findIndex(b => b.id === id);
  if (index === -1) return;
  
  const buffer = customBuffers[index];
  layers.buffers.removeLayer(buffer.circle);
  customBuffers.splice(index, 1);
  
  markAsChanged();
  analyzeOrphans();
  
  console.log('[BUFFER] 🗑️ Buffer personalizado eliminado:', id);
  showNotification(`🗑️ Buffer "${buffer.name}" eliminado`, 'info');
}

// ========== ANÁLISIS DE COBERTURA ==========
function analyzeOrphans() {
  if (!globalData) return;
  
  console.log('[ANALYZE] Analizando cobertura...');
  
  const { satellites } = globalData;
  let covered = 0;
  let uncovered = 0;
  
  satellites.forEach((sat, si) => {
    let isCovered = false;
    let minDist = Infinity;
    
    // Verificar buffers de núcleos
    editableBuffers.forEach((data, ni) => {
      const bufferPos = data.circle.getLatLng();
      const dist = getCachedDistance(sat.lat, sat.lng, bufferPos.lat, bufferPos.lng);
      if (dist <= CONFIG.BUFFER_RADIUS_M) {
        isCovered = true;
        minDist = Math.min(minDist, dist);
      }
    });
    
    // Verificar buffers personalizados
    if (!isCovered) {
      customBuffers.forEach(buffer => {
        const bufferPos = buffer.circle.getLatLng();
        const dist = getCachedDistance(sat.lat, sat.lng, bufferPos.lat, bufferPos.lng);
        if (dist <= CONFIG.BUFFER_RADIUS_M) {
          isCovered = true;
          minDist = Math.min(minDist, dist);
        }
      });
    }
    
    if (isCovered) {
      covered++;
    } else {
      uncovered++;
    }
  });
  
  const coverage = satellites.length > 0 ? ((covered / satellites.length) * 100).toFixed(1) : 0;
  
  console.log(`[ANALYZE] Cobertura: ${coverage}% (${covered}/${satellites.length})`);
  
  updateStatistics();
  
  return { covered, uncovered, total: satellites.length, coverage };
}

function completeCoverage() {
  if (!globalData) {
    showNotification('❌ Espera a que carguen los datos', 'error');
    return;
  }
  
  showNotification('🔄 Analizando cobertura...', 'info');
  
  const uncovered = findUncoveredSatellites();
  
  if (uncovered.length === 0) {
    showNotification('✅ ¡Cobertura completa al 100%!', 'success');
    return;
  }
  
  console.log('[COVERAGE] Satélites sin cobertura:', uncovered.length);
  
  const newBuffers = createOptimalBuffers(uncovered);
  
  newBuffers.forEach(pos => {
    createCustomBuffer(pos.lat, pos.lng);
  });
  
  setTimeout(() => {
    const result = analyzeOrphans();
    showNotification(
      `✅ Cobertura: ${result.coverage}%. ${newBuffers.length} buffers agregados.`,
      result.coverage >= 95 ? 'success' : 'info'
    );
    markAsChanged();
  }, 300);
}

function findUncoveredSatellites() {
  if (!globalData) return [];
  
  return globalData.satellites.filter(sat => {
    let covered = false;
    
    editableBuffers.forEach((data, ni) => {
      if (covered) return;
      const bufferPos = data.circle.getLatLng();
      const dist = getCachedDistance(sat.lat, sat.lng, bufferPos.lat, bufferPos.lng);
      if (dist <= CONFIG.BUFFER_RADIUS_M) covered = true;
    });
    
    if (covered) return false;
    
    customBuffers.forEach(buffer => {
      if (covered) return;
      const bufferPos = buffer.circle.getLatLng();
      const dist = getCachedDistance(sat.lat, sat.lng, bufferPos.lat, bufferPos.lng);
      if (dist <= CONFIG.BUFFER_RADIUS_M) covered = true;
    });
    
    return !covered;
  });
}

function createOptimalBuffers(uncoveredSats) {
  const newBuffers = [];
  const remaining = [...uncoveredSats];
  
  while (remaining.length > 0 && newBuffers.length < 50) {
    let bestPos = null;
    let bestScore = 0;
    
    remaining.forEach(sat => {
      let score = 0;
      remaining.forEach(other => {
        const dist = getCachedDistance(sat.lat, sat.lng, other.lat, other.lng);
        if (dist <= CONFIG.BUFFER_RADIUS_M) {
          score++;
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestPos = { lat: sat.lat, lng: sat.lng };
      }
    });
    
    if (!bestPos || bestScore === 0) break;
    
    newBuffers.push(bestPos);
    
    for (let i = remaining.length - 1; i >= 0; i--) {
      const dist = getCachedDistance(remaining[i].lat, remaining[i].lng, bestPos.lat, bestPos.lng);
      if (dist <= CONFIG.BUFFER_RADIUS_M) {
        remaining.splice(i, 1);
      }
    }
  }
  
  console.log('[OPTIMIZE] Buffers óptimos calculados:', newBuffers.length);
  
  return newBuffers;
}

// ========== EXPORTACIÓN Y OTRAS FUNCIONES ==========
// (Funciones de exportación, popups, estadísticas, etc.)
// Las mismas del archivo anterior pero con validaciones añadidas

function showExportModal() {
  if (!globalData) {
    showNotification('❌ No hay datos para exportar', 'error');
    return;
  }
  
  const data = prepareExportData();
  window._exportData = data;
  
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-header">
        <h2>📊 Exportar Resultados</h2>
        <button class="export-modal-close" onclick="this.closest('.export-modal').remove()">×</button>
      </div>
      <div class="export-modal-body">
        <div class="export-summary">
          <div class="export-stat">
            <span class="export-stat-value">${data.summary.totalBuffers}</span>
            <span class="export-stat-label">Buffers</span>
          </div>
          <div class="export-stat">
            <span class="export-stat-value">${data.summary.totalAMIEs}</span>
            <span class="export-stat-label">Instituciones</span>
          </div>
          <div class="export-stat">
            <span class="export-stat-value">${data.summary.coveragePercent}%</span>
            <span class="export-stat-label">Cobertura</span>
          </div>
        </div>
        <div class="export-options">
          <button class="export-btn export-btn-excel" onclick="exportToExcel()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>Descargar Excel</span>
          </button>
          <button class="export-btn export-btn-csv" onclick="exportToCSV()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>Descargar CSV</span>
          </button>
          <button class="export-btn export-btn-json" onclick="exportToJSON()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>Descargar JSON</span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  document.body.appendChild(modal);
}

function prepareExportData() {
  const allInstitutions = globalData.allInstitutions;
  const buffers = [];
  const totalAMIEsCovered = new Set();
  let totalStudentsCovered = 0;
  
  editableBuffers.forEach((data, ni) => {
    const bufferPos = data.circle.getLatLng();
    const result = spatialJoinBuffer(bufferPos, CONFIG.BUFFER_RADIUS_M, allInstitutions);
    
    result.institutions.forEach(inst => {
      if (inst.amie) totalAMIEsCovered.add(inst.amie);
    });
    
    totalStudentsCovered += result.totalStudents;
    
    buffers.push({
      bufferId: `buffer_nucleo_${ni}`,
      bufferName: data.nucleo.name || `Núcleo ${ni}`,
      isCustom: false,
      centerLat: bufferPos.lat,
      centerLng: bufferPos.lng,
      radiusMeters: CONFIG.BUFFER_RADIUS_M,
      originalLat: data.nucleo.lat,
      originalLng: data.nucleo.lng,
      wasMoved: bufferPos.lat !== data.nucleo.lat || bufferPos.lng !== data.nucleo.lng,
      totalAMIEs: result.institutions.length,
      nucleosCount: result.nucleosCount,
      satellitesCount: result.satellitesCount,
      totalStudents: result.totalStudents,
      institutions: result.institutions
    });
  });
  
  customBuffers.forEach(buffer => {
    const bufferPos = buffer.circle.getLatLng();
    const result = spatialJoinBuffer(bufferPos, CONFIG.BUFFER_RADIUS_M, allInstitutions);
    
    result.institutions.forEach(inst => {
      if (inst.amie) totalAMIEsCovered.add(inst.amie);
    });
    
    totalStudentsCovered += result.totalStudents;
    
    buffers.push({
      bufferId: buffer.id,
      bufferName: buffer.name,
      isCustom: true,
      centerLat: bufferPos.lat,
      centerLng: bufferPos.lng,
      radiusMeters: CONFIG.BUFFER_RADIUS_M,
      originalLat: buffer.originalPos.lat,
      originalLng: buffer.originalPos.lng,
      wasMoved: bufferPos.lat !== buffer.originalPos.lat || bufferPos.lng !== buffer.originalPos.lng,
      totalAMIEs: result.institutions.length,
      nucleosCount: result.nucleosCount,
      satellitesCount: result.satellitesCount,
      totalStudents: result.totalStudents,
      institutions: result.institutions
    });
  });
  
  const allSatellites = buffers.reduce((sum, b) => sum + b.satellitesCount, 0);
  
  return {
    exportDate: new Date().toISOString(),
    summary: {
      totalBuffers: buffers.length,
      originalBuffers: buffers.filter(b => !b.isCustom).length,
      customBuffers: buffers.filter(b => b.isCustom).length,
      totalAMIEs: totalAMIEsCovered.size,
      totalNucleos: new Set(buffers.flatMap(b => 
        b.institutions.filter(i => i.type === 'nucleo').map(i => i.amie)
      )).size,
      totalSatellites: allSatellites,
      totalStudents: totalStudentsCovered,
      coveragePercent: globalData.satellites.length > 0 
        ? ((allSatellites / globalData.satellites.length) * 100).toFixed(1) 
        : 0
    },
    buffers
  };
}

function spatialJoinBuffer(center, radius, institutions) {
  const result = {
    institutions: [],
    nucleosCount: 0,
    satellitesCount: 0,
    totalStudents: 0
  };
  
  institutions.forEach(inst => {
    const dist = getCachedDistance(center.lat, center.lng, inst.lat, inst.lng);
    
    if (dist <= radius) {
      result.institutions.push({
        amie: inst.amie || '',
        name: inst.name || '',
        type: inst.type,
        typeName: inst.type === 'nucleo' ? 'Núcleo' : 'Satélite',
        codGDECE: inst.codGDECE ?? inst.code,
        lat: inst.lat,
        lng: inst.lng,
        distanceMeters: Math.round(dist),
        distanceKm: (dist / 1000).toFixed(2),
        students: inst.students || 0,
        distrito: inst.dist || ''
      });
      
      if (inst.type === 'nucleo') {
        result.nucleosCount++;
      } else {
        result.satellitesCount++;
      }
      
      result.totalStudents += inst.students || 0;
    }
  });
  
  result.institutions.sort((a, b) => a.distanceMeters - b.distanceMeters);
  
  return result;
}

function exportToExcel() {
  const data = window._exportData;
  if (!data) return;
  
  if (!window.XLSX) {
    showNotification('❌ Librería XLSX no disponible', 'error');
    return;
  }
  
  showNotification('📊 Generando Excel...', 'info');
  
  try {
    const wb = XLSX.utils.book_new();
    
    const summaryData = [
      ['REPORTE DE ANÁLISIS ESPACIAL DECE'],
      ['Fecha:', data.exportDate],
      [''],
      ['MÉTRICAS'],
      ['Total Buffers:', data.summary.totalBuffers],
      ['Buffers Originales:', data.summary.originalBuffers],
      ['Buffers Personalizados:', data.summary.customBuffers],
      ['Total AMIEs:', data.summary.totalAMIEs],
      ['Núcleos:', data.summary.totalNucleos],
      ['Satélites:', data.summary.totalSatellites],
      ['Estudiantes:', data.summary.totalStudents],
      ['Cobertura:', data.summary.coveragePercent + '%']
    ];
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Resumen');
    
    const buffersHeaders = [
      'ID Buffer', 'Nombre', 'Tipo', 'Lat Centro', 'Lng Centro', 'Radio (m)',
      'Fue Movido', 'Total AMIEs', 'Núcleos', 'Satélites', 'Estudiantes'
    ];
    
    const buffersData = data.buffers.map(b => [
      b.bufferId, b.bufferName, b.isCustom ? 'Personalizado' : 'Original',
      b.centerLat, b.centerLng, b.radiusMeters, b.wasMoved ? 'Sí' : 'No',
      b.totalAMIEs, b.nucleosCount, b.satellitesCount, b.totalStudents
    ]);
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([buffersHeaders, ...buffersData]), 'Buffers');
    
    const instHeaders = [
      'Buffer', 'AMIE', 'Nombre', 'Tipo', 'COD_GDECE', 'Lat', 'Lng',
      'Distancia(m)', 'Distancia(km)', 'Estudiantes', 'Distrito'
    ];
    
    const instData = [];
    data.buffers.forEach(buffer => {
      buffer.institutions.forEach(inst => {
        instData.push([
          buffer.bufferName, inst.amie, inst.name, inst.typeName, inst.codGDECE,
          inst.lat, inst.lng, inst.distanceMeters, inst.distanceKm, inst.students, inst.distrito
        ]);
      });
    });
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([instHeaders, ...instData]), 'Instituciones');
    
    XLSX.writeFile(wb, `DECE_Analysis_${formatDateForFilename()}.xlsx`);
    
    showNotification('✅ Excel descargado exitosamente', 'success');
    document.querySelector('.export-modal')?.remove();
  } catch (error) {
    console.error('[EXPORT] Error:', error);
    showNotification('❌ Error al generar Excel', 'error');
  }
}

function exportToCSV() {
  const data = window._exportData;
  if (!data) return;
  
  showNotification('📄 Generando CSV...', 'info');
  
  try {
    const headers = [
      'Buffer_ID', 'Buffer_Nombre', 'Buffer_Tipo', 'Buffer_Lat', 'Buffer_Lng',
      'AMIE', 'Institucion_Nombre', 'Institucion_Tipo', 'COD_GDECE',
      'Inst_Lat', 'Inst_Lng', 'Distancia_m', 'Distancia_km', 'Estudiantes', 'Distrito'
    ];
    
    const rows = [];
    data.buffers.forEach(buffer => {
      buffer.institutions.forEach(inst => {
        rows.push([
          buffer.bufferId, `"${buffer.bufferName}"`, buffer.isCustom ? 'Personalizado' : 'Original',
          buffer.centerLat, buffer.centerLng, inst.amie, `"${inst.name}"`, inst.typeName,
          inst.codGDECE, inst.lat, inst.lng, inst.distanceMeters, inst.distanceKm,
          inst.students, `"${inst.distrito}"`
        ].join(','));
      });
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    downloadFile(csv, `DECE_Analysis_${formatDateForFilename()}.csv`, 'text/csv;charset=utf-8;');
    
    showNotification('✅ CSV descargado exitosamente', 'success');
    document.querySelector('.export-modal')?.remove();
  } catch (error) {
    console.error('[EXPORT] Error:', error);
    showNotification('❌ Error al generar CSV', 'error');
  }
}

function exportToJSON() {
  const data = window._exportData;
  if (!data) return;
  
  showNotification('📋 Generando JSON...', 'info');
  
  try {
    downloadFile(
      JSON.stringify(data, null, 2),
      `DECE_Analysis_${formatDateForFilename()}.json`,
      'application/json'
    );
    
    showNotification('✅ JSON descargado exitosamente', 'success');
    document.querySelector('.export-modal')?.remove();
  } catch (error) {
    console.error('[EXPORT] Error:', error);
    showNotification('❌ Error al generar JSON', 'error');
  }
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function formatDateForFilename() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

// ========== POPUPS Y MÉTRICAS ==========
function showBufferPopup(data, isCustom) {
  const bufferPos = data.circle.getLatLng();
  const result = spatialJoinBuffer(bufferPos, CONFIG.BUFFER_RADIUS_M, globalData.allInstitutions);
  
  const popup = `
    <div class="buffer-popup">
      <h3>${isCustom ? '🟣' : '🔵'} ${isCustom ? data.name : data.nucleo.name}</h3>
      <div class="popup-metrics">
        <div class="metric">
          <span class="metric-label">Instituciones:</span>
          <span class="metric-value">${result.institutions.length}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Satélites:</span>
          <span class="metric-value">${result.satellitesCount}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Estudiantes:</span>
          <span class="metric-value">${result.totalStudents.toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;
  
  data.circle.bindPopup(popup).openPopup();
}

function showBufferMetrics(data, isCustom) {
  const bufferPos = data.circle.getLatLng();
  const result = spatialJoinBuffer(bufferPos, CONFIG.BUFFER_RADIUS_M, globalData.allInstitutions);
  
  closeMetricsPanel();
  
  metricsPanel = L.control({ position: 'bottomleft' });
  
  metricsPanel.onAdd = function() {
    const div = L.DomUtil.create('div', 'metrics-panel');
    div.innerHTML = `
      <div class="metrics-header">
        <h3>${isCustom ? '🟣' : '🔵'} ${isCustom ? data.name : data.nucleo.name}</h3>
        <button class="metrics-close" onclick="closeMetricsPanel()">×</button>
      </div>
      <div class="metrics-body">
        <div class="metrics-summary">
          <div class="metric-box">
            <div class="metric-value">${result.institutions.length}</div>
            <div class="metric-label">Instituciones</div>
          </div>
          <div class="metric-box">
            <div class="metric-value">${result.satellitesCount}</div>
            <div class="metric-label">Satélites</div>
          </div>
          <div class="metric-box">
            <div class="metric-value">${result.totalStudents.toLocaleString()}</div>
            <div class="metric-label">Estudiantes</div>
          </div>
        </div>
        <div class="institutions-list">
          <h4>Instituciones cercanas</h4>
          <div class="institutions-scroll">
            ${result.institutions.slice(0, 10).map(inst => `
              <div class="institution-item">
                <div class="inst-icon">${inst.type === 'nucleo' ? '🏛️' : '📍'}</div>
                <div class="inst-info">
                  <div class="inst-name">${escapeHTML(inst.name)}</div>
                  <div class="inst-details">
                    ${inst.distanceKm} km • ${inst.students} estudiantes
                  </div>
                </div>
              </div>
            `).join('')}
            ${result.institutions.length > 10 ? `
              <div class="inst-more">
                +${result.institutions.length - 10} más...
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  
  metricsPanel.addTo(map);
}

function closeMetricsPanel() {
  if (metricsPanel) {
    map.removeControl(metricsPanel);
    metricsPanel = null;
  }
}

function createNucleoPopup(n, satCount, totalStudents) {
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

// ========== ESTADÍSTICAS ==========
function updateStatistics() {
  if (!globalData) return;
  
  const result = analyzeOrphans();
  
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
  };
  
  set('totalNucleos', globalData.nucleos.length);
  set('totalSatellites', globalData.satellites.length);
  set('coveragePercent', result.coverage);
  set('nucleosActivos', editableBuffers.size + customBuffers.length);
  set('sinCobertura', result.uncovered);
  
  const totalStudents = globalData.allInstitutions.reduce((sum, inst) => sum + (inst.students || 0), 0);
  set('totalStudents', totalStudents);
  
  const fill = document.getElementById('coverageFill');
  if (fill) {
    fill.style.width = Math.min(100, parseFloat(result.coverage)) + '%';
  }
}

function optimizeNucleos() {
  showNotification('🔄 Optimizando núcleos...', 'info');
  
  setTimeout(() => {
    analyzeOrphans();
    updateStatistics();
    showNotification('✅ Optimización completada', 'success');
  }, 500);
}

// ========== UTILIDADES ==========
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 500);
  }
}

function flyToLocation(lat, lng) {
  map.flyTo([lat, lng], 13, {
    duration: 1.5
  });
}

function regenerateAnimations() {
  console.log('[ANIM] Regenerating animations...');
}

// ========== EXPOSICIÓN GLOBAL ==========
window.showExportModal = showExportModal;
window.exportToExcel = exportToExcel;
window.exportToCSV = exportToCSV;
window.exportToJSON = exportToJSON;
window.resetAllBuffersState = resetAllBuffersState;
window.closeMetricsPanel = closeMetricsPanel;
window.flyToLocation = flyToLocation;

console.log('[APP] ✅ DECE Optimizer v7.1 (BUGFIX) cargado correctamente');
