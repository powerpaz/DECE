/**
 * ============================================================
 * INTEGRATION MODULE
 * ============================================================
 * Integra SpatialAnalytics con la lógica existente de app.js
 * ============================================================
 */

// Variables globales para el análisis
let spatialAnalytics = null;
let analysisResults = null;

/**
 * Inicializar el módulo de análisis espacial
 */
function initSpatialAnalytics() {
  console.log('⚙️ Inicializando SpatialAnalytics...');
  
  if (typeof SpatialAnalytics === 'undefined') {
    console.error('❌ SpatialAnalytics no está cargado. Incluye spatialAnalytics.js');
    return false;
  }

  spatialAnalytics = new SpatialAnalytics();
  
  // Crear botones en la interfaz
  createAnalysisButtons();
  
  console.log('✅ SpatialAnalytics inicializado');
  return true;
}

/**
 * Vincular botones de análisis existentes en el HTML
 * (tanto en la barra superior como en el panel lateral)
 */
function createAnalysisButtons() {
  // Vincular botones existentes en el HTML (panel lateral)
  const btnDensity = document.getElementById('btnAnalyzeDensity');
  const btnDynamicBuffers = document.getElementById('btnDynamicBuffers');
  const btnSpatialJoin = document.getElementById('btnSpatialJoin');
  const btnExport = document.getElementById('btnExportResults');

  if (btnDensity) {
    btnDensity.onclick = analyzeUrbanRuralDensity;
    console.log('✅ Botón Analizar Densidad vinculado');
  }

  if (btnDynamicBuffers) {
    btnDynamicBuffers.onclick = generateDynamicBuffers;
    console.log('✅ Botón Buffers Dinámicos vinculado');
  }

  if (btnSpatialJoin) {
    btnSpatialJoin.onclick = executeSpatialJoin;
    console.log('✅ Botón Spatial Join vinculado');
  }

  if (btnExport) {
    btnExport.onclick = showExportMenu;
    console.log('✅ Botón Exportar vinculado');
  }

  console.log('✅ Botones de análisis configurados');
}

/**
 * FUNCIÓN 1: Detectar Densidad Urbano-Rural
 */
function analyzeUrbanRuralDensity() {
  if (!globalData || !globalData.nucleos) {
    showNotification('❌ Primero carga datos con núcleos', 'error');
    return;
  }

  if (!spatialAnalytics) {
    showNotification('❌ SpatialAnalytics no inicializado', 'error');
    return;
  }

  showNotification('🔍 Detectando densidad urbano-rural...', 'info');

  try {
    const nucleos = globalData.nucleos;
    const classification = spatialAnalytics.detectUrbanRuralDensity(nucleos);

    const urbanos = Object.values(classification).filter(t => t === 'URBANO').length;
    const rurales = Object.values(classification).filter(t => t === 'RURAL').length;

    showNotification(
      `✅ Análisis completado: ${urbanos} zonas URBANAS, ${rurales} zonas RURALES`,
      'success'
    );

    // Actualizar UI con resultados
    updateDensityUI(classification, nucleos);

  } catch (error) {
    console.error('Error en análisis de densidad:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * FUNCIÓN 2: Generar Buffers Dinámicos
 */
function generateDynamicBuffers() {
  if (!spatialAnalytics || !Object.keys(spatialAnalytics.classification).length) {
    showNotification('❌ Primero ejecuta "Analizar Densidad"', 'error');
    return;
  }

  if (!globalData || !globalData.nucleos) {
    showNotification('❌ Faltan datos de núcleos', 'error');
    return;
  }

  showNotification('📏 Generando buffers dinámicos...', 'info');

  try {
    const nucleos = globalData.nucleos;
    const buffers = spatialAnalytics.generateDynamicBuffers(nucleos);

    // Visualizar buffers en el mapa
    visualizeDynamicBuffers(buffers);

    showNotification(
      `✅ ${buffers.length} buffers generados (3.5km urbano, 7.5km rural)`,
      'success'
    );

    updateBuffersUI(buffers);

  } catch (error) {
    console.error('Error en generación de buffers:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * FUNCIÓN 3: Ejecutar Spatial Join
 */
function executeSpatialJoin() {
  if (!spatialAnalytics || !Object.keys(spatialAnalytics.bufferRadius).length) {
    showNotification('❌ Primero ejecuta "Buffers Dinámicos"', 'error');
    return;
  }

  if (!globalData) {
    showNotification('❌ Faltan datos', 'error');
    return;
  }

  showNotification('🔗 Ejecutando spatial join...', 'info');

  try {
    const nucleos = globalData.nucleos || [];
    const satellites = globalData.satellites || [];
    const institutions = globalData.institutions || [];

    const results = spatialAnalytics.spatialJoin(nucleos, satellites, institutions);
    analysisResults = results;

    const stats = spatialAnalytics.getStatistics();

    showNotification(
      `✅ Spatial join completado: ${stats.total_puntos_cubierta} puntos cubiertos`,
      'success'
    );

    updateSpatialJoinUI(results, stats);

  } catch (error) {
    console.error('Error en spatial join:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * Mostrar menú de exportación
 */
function showExportMenu() {
  if (!analysisResults || !analysisResults.length) {
    showNotification('❌ Primero ejecuta el análisis completo', 'error');
    return;
  }

  // Crear modal de exportación
  const modal = document.createElement('div');
  modal.className = 'modal-export';
  modal.innerHTML = `
    <div class="export-panel">
      <h3>📥 Exportar Resultados</h3>
      
      <button class="export-btn" onclick="exportResultsAs('csv')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Exportar como CSV
      </button>

      <button class="export-btn" onclick="exportResultsAs('html')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
        </svg>
        Exportar como HTML
      </button>

      <button class="export-btn" onclick="exportResultsAs('json')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        </svg>
        Exportar como JSON
      </button>

      <button class="export-btn cancel" onclick="this.parentElement.parentElement.remove()">
        ✕ Cancelar
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex; align-items: center;
    justify-content: center; z-index: 9999;
  `;

  modal.querySelector('.export-panel').style.cssText = `
    background: white; padding: 30px; border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); min-width: 300px;
  `;
}

/**
 * Exportar resultados en formato especificado
 */
function exportResultsAs(format) {
  if (!spatialAnalytics) return;

  const timestamp = new Date().toISOString().split('T')[0];
  let content, filename, mimeType;

  switch (format.toLowerCase()) {
    case 'csv':
      content = spatialAnalytics.exportCSV();
      filename = `spatial-join-${timestamp}.csv`;
      mimeType = 'text/csv';
      break;

    case 'html':
      content = spatialAnalytics.exportHTML();
      filename = `spatial-join-${timestamp}.html`;
      mimeType = 'text/html';
      break;

    case 'json':
      content = JSON.stringify(spatialAnalytics.exportJSON(), null, 2);
      filename = `spatial-join-${timestamp}.json`;
      mimeType = 'application/json';
      break;

    default:
      showNotification('❌ Formato no soportado', 'error');
      return;
  }

  try {
    spatialAnalytics.downloadFile(content, filename, mimeType);
    showNotification(`✅ Archivo ${format.toUpperCase()} descargado: ${filename}`, 'success');
    
    // Cerrar modal
    const modal = document.querySelector('.modal-export');
    if (modal) modal.remove();

  } catch (error) {
    console.error('Error al descargar:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * =============================
 * FUNCIONES DE ACTUALIZACIÓN UI
 * =============================
 */

function updateDensityUI(classification, nucleos) {
  // Crear panel de resultados de densidad
  const panel = document.createElement('div');
  panel.className = 'analysis-panel analysis-density';
  panel.innerHTML = `
    <h3>🏙️ Clasificación de Densidad</h3>
    <div class="results-grid">
      ${nucleos.map((n, idx) => `
        <div class="result-item result-${classification[idx].toLowerCase()}">
          <strong>${n.codigo_amie || `NUC_${idx}`}</strong>
          <span class="badge">${classification[idx]}</span>
        </div>
      `).join('')}
    </div>
  `;

  addPanelToUI(panel);
}

function updateBuffersUI(buffers) {
  const panel = document.createElement('div');
  panel.className = 'analysis-panel analysis-buffers';
  panel.innerHTML = `
    <h3>📏 Buffers Dinámicos Generados</h3>
    <table class="results-table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Tipo</th>
          <th>Buffer</th>
        </tr>
      </thead>
      <tbody>
        ${buffers.map(b => `
          <tr class="row-${b.tipo_zona.toLowerCase()}">
            <td>${b.nucleo_id}</td>
            <td><span class="badge badge-${b.tipo_zona.toLowerCase()}">${b.tipo_zona}</span></td>
            <td>${b.buffer_radius_km} km</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  addPanelToUI(panel);
}

function updateSpatialJoinUI(results, stats) {
  const panel = document.createElement('div');
  panel.className = 'analysis-panel analysis-join';
  panel.innerHTML = `
    <h3>🔗 Resultados del Spatial Join</h3>
    
    <div class="stats-summary">
      <div class="stat">
        <strong>${stats.total_instituciones_cubierta}</strong>
        <span>Instituciones</span>
      </div>
      <div class="stat">
        <strong>${stats.total_satelites_cubierta}</strong>
        <span>Satélites</span>
      </div>
      <div class="stat">
        <strong>${stats.total_puntos_cubierta}</strong>
        <span>Total Puntos</span>
      </div>
    </div>

    <table class="results-table">
      <thead>
        <tr>
          <th>Código AMIE</th>
          <th>Tipo</th>
          <th>Buffer</th>
          <th>Inst.</th>
          <th>Sat.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => `
          <tr class="row-${r.tipo_zona.toLowerCase()}">
            <td>${r.codigo_amie}</td>
            <td><span class="badge badge-${r.tipo_zona.toLowerCase()}">${r.tipo_zona}</span></td>
            <td>${r.buffer_km} km</td>
            <td>${r.num_instituciones}</td>
            <td>${r.num_satelites}</td>
            <td><strong>${r.total_puntos}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  addPanelToUI(panel);
}

function addPanelToUI(panel) {
  // Buscar contenedor de resultados
  let resultsContainer = document.querySelector('.analysis-results');
  
  if (!resultsContainer) {
    resultsContainer = document.createElement('div');
    resultsContainer.className = 'analysis-results';
    const map = document.getElementById('map');
    if (map) map.parentElement.appendChild(resultsContainer);
  }

  // Limpiar panels anteriores del mismo tipo
  const sameType = resultsContainer.querySelector(`.${panel.className.split(' ')[1]}`);
  if (sameType) sameType.remove();

  resultsContainer.appendChild(panel);
}

/**
 * Visualizar buffers dinámicos en el mapa
 */
function visualizeDynamicBuffers(buffers) {
  // Limpiar buffers anteriores
  layers.buffers.clearLayers();

  buffers.forEach(buffer => {
    const color = buffer.tipo_zona === 'URBANO' ? '#FF6B6B' : '#4ECDC4';
    
    // Crear círculo de buffer
    L.circle([buffer.lat, buffer.lng], {
      radius: buffer.buffer_radius_m,
      color: color,
      fillColor: color,
      fillOpacity: 0.2,
      weight: 2,
      dashArray: '5, 5'
    }).bindPopup(`
      <strong>${buffer.nucleo_id}</strong><br/>
      Tipo: ${buffer.tipo_zona}<br/>
      Buffer: ${buffer.buffer_radius_km} km
    `).addTo(layers.buffers);
  });

  console.log(`✅ ${buffers.length} buffers visualizados en el mapa`);
}

/**
 * Inicializar cuando el DOM esté listo
 */
document.addEventListener('DOMContentLoaded', function() {
  // Esperar a que app.js inicialice completamente
  setTimeout(() => {
    if (typeof SpatialAnalytics !== 'undefined') {
      initSpatialAnalytics();
    }
  }, 1000);
});

// Exportar funciones globales
window.analyzeUrbanRuralDensity = analyzeUrbanRuralDensity;
window.generateDynamicBuffers = generateDynamicBuffers;
window.executeSpatialJoin = executeSpatialJoin;
window.showExportMenu = showExportMenu;
window.exportResultsAs = exportResultsAs;
window.initSpatialAnalytics = initSpatialAnalytics;
