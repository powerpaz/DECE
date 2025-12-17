/**
 * ============================================================
 * SPATIAL INTEGRATION MODULE v3.0
 * ============================================================
 * ✅ Heatmap visual de densidad en el mapa
 * ✅ Buffers óptimos sin solapamiento
 * ✅ Integración completa con app.js
 * ============================================================
 */

let spatialAnalytics = null;
let analysisResults = null;
let heatmapLayer = null;
let densityCircles = [];

/**
 * Inicializar el módulo
 */
function initSpatialAnalytics() {
  console.log('⚙️ Inicializando SpatialAnalytics v3.0...');
  
  if (typeof SpatialAnalytics === 'undefined') {
    console.error('❌ SpatialAnalytics no está cargado');
    return false;
  }

  spatialAnalytics = new SpatialAnalytics();
  bindAnalysisButtons();
  
  console.log('✅ SpatialAnalytics v3.0 listo');
  return true;
}

/**
 * Vincular botones del panel
 */
function bindAnalysisButtons() {
  const btnDensity = document.getElementById('btnAnalyzeDensity');
  const btnDynamicBuffers = document.getElementById('btnDynamicBuffers');
  const btnSpatialJoin = document.getElementById('btnSpatialJoin');
  const btnExport = document.getElementById('btnExportResults');

  if (btnDensity) btnDensity.onclick = analyzeUrbanRuralDensity;
  if (btnDynamicBuffers) btnDynamicBuffers.onclick = generateOptimalBuffers;
  if (btnSpatialJoin) btnSpatialJoin.onclick = executeSpatialJoin;
  if (btnExport) btnExport.onclick = showExportMenu;

  console.log('✅ Botones vinculados');
}

/**
 * ============================================================
 * FUNCIÓN 1: ANALIZAR DENSIDAD CON HEATMAP VISUAL
 * ============================================================
 */
function analyzeUrbanRuralDensity() {
  if (!globalData || !globalData.nucleos) {
    showNotification('❌ Primero carga los datos', 'error');
    return;
  }

  showNotification('🔍 Analizando densidad...', 'info');

  try {
    const nucleos = globalData.nucleos;
    const { classification, heatmapData } = spatialAnalytics.detectUrbanRuralDensity(nucleos);

    // Limpiar visualización anterior
    clearDensityVisualization();

    // Visualizar heatmap en el mapa
    visualizeDensityHeatmap(heatmapData, nucleos);

    const urbanos = Object.values(classification).filter(t => t === 'URBANO').length;
    const rurales = Object.values(classification).filter(t => t === 'RURAL').length;

    showNotification(`✅ ${urbanos} zonas urbanas, ${rurales} zonas rurales`, 'success');

    // Mostrar panel de resultados
    showDensityResults(classification, nucleos);

  } catch (error) {
    console.error('Error:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * Visualizar densidad como heatmap en el mapa
 */
function visualizeDensityHeatmap(heatmapData, nucleos) {
  // Crear capa de grupo si no existe
  if (!window.densityLayer) {
    window.densityLayer = L.featureGroup().addTo(map);
  }
  window.densityLayer.clearLayers();

  // Generar grid de densidad
  const gridData = spatialAnalytics.generateDensityGrid(nucleos);

  // Dibujar celdas de densidad como polígonos semi-transparentes
  gridData.forEach(cell => {
    const cellSize = 0.02; // grados
    const bounds = [
      [cell.lat - cellSize/2, cell.lng - cellSize/2],
      [cell.lat + cellSize/2, cell.lng + cellSize/2]
    ];

    // Color basado en densidad
    const intensity = Math.min(cell.density / 3, 1);
    const color = cell.isUrban 
      ? `rgba(255, 87, 87, ${intensity * 0.6})` 
      : `rgba(78, 205, 196, ${intensity * 0.4})`;

    L.rectangle(bounds, {
      color: 'transparent',
      fillColor: color,
      fillOpacity: 1,
      weight: 0
    }).addTo(window.densityLayer);
  });

  // Agregar marcadores de núcleos con su clasificación
  heatmapData.forEach((point, idx) => {
    const isUrban = point.type === 'URBANO';
    const color = isUrban ? '#FF5757' : '#4ECDC4';
    const radius = isUrban ? 12 : 10;

    // Círculo de clasificación
    L.circleMarker([point.lat, point.lng], {
      radius: radius,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9
    }).bindPopup(`
      <strong>${point.codigo_amie}</strong><br/>
      <span style="color:${color}; font-weight:bold;">${point.type}</span><br/>
      Distancia promedio: ${(point.avgDistance/1000).toFixed(2)} km
    `).addTo(window.densityLayer);

    // Efecto de "aura" para zonas densas
    if (isUrban) {
      L.circle([point.lat, point.lng], {
        radius: 2000,
        color: '#FF5757',
        fillColor: '#FF5757',
        fillOpacity: 0.15,
        weight: 0
      }).addTo(window.densityLayer);
    }
  });

  // Agregar leyenda
  addDensityLegend();

  console.log('✅ Heatmap de densidad visualizado');
}

/**
 * Agregar leyenda de densidad al mapa
 */
function addDensityLegend() {
  // Remover leyenda anterior si existe
  if (window.densityLegend) {
    map.removeControl(window.densityLegend);
  }

  window.densityLegend = L.control({ position: 'bottomright' });
  
  window.densityLegend.onAdd = function() {
    const div = L.DomUtil.create('div', 'density-legend');
    div.innerHTML = `
      <div style="background: rgba(22,27,34,0.95); padding: 12px 15px; border-radius: 8px; color: white; font-size: 12px;">
        <strong style="display:block; margin-bottom:8px;">🗺️ Clasificación de Densidad</strong>
        <div style="display:flex; align-items:center; margin:5px 0;">
          <span style="width:16px; height:16px; background:#FF5757; border-radius:50%; margin-right:8px;"></span>
          URBANO (alta densidad)
        </div>
        <div style="display:flex; align-items:center; margin:5px 0;">
          <span style="width:16px; height:16px; background:#4ECDC4; border-radius:50%; margin-right:8px;"></span>
          RURAL (baja densidad)
        </div>
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid #444; font-size:10px; color:#999;">
          Umbral: ${(spatialAnalytics.config.urbanDensityThreshold/1000).toFixed(1)} km
        </div>
      </div>
    `;
    return div;
  };

  window.densityLegend.addTo(map);
}

/**
 * Limpiar visualización de densidad
 */
function clearDensityVisualization() {
  if (window.densityLayer) {
    window.densityLayer.clearLayers();
  }
  if (window.densityLegend) {
    map.removeControl(window.densityLegend);
  }
}

/**
 * ============================================================
 * FUNCIÓN 2: BUFFERS ÓPTIMOS SIN SOLAPAMIENTO
 * ============================================================
 */
function generateOptimalBuffers() {
  if (!spatialAnalytics || !Object.keys(spatialAnalytics.classification).length) {
    showNotification('❌ Primero ejecuta "Detectar Densidad"', 'error');
    return;
  }

  if (!globalData || !globalData.nucleos || !globalData.satellites) {
    showNotification('❌ Faltan datos de núcleos o satélites', 'error');
    return;
  }

  showNotification('📏 Calculando cobertura óptima...', 'info');

  try {
    const nucleos = globalData.nucleos;
    const satellites = globalData.satellites;

    // Limpiar densidad anterior
    clearDensityVisualization();

    // Generar buffers optimizados
    const optimalBuffers = spatialAnalytics.generateOptimalBuffers(nucleos, satellites);

    // Visualizar en el mapa
    visualizeOptimalBuffers(optimalBuffers, satellites);

    const stats = spatialAnalytics.getStatistics();
    showNotification(
      `✅ ${optimalBuffers.length} buffers óptimos (${stats.reduccion_porcentaje}% menos)`, 
      'success'
    );

    // Mostrar panel de resultados
    showOptimalBuffersResults(optimalBuffers, nucleos.length);

  } catch (error) {
    console.error('Error:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * Visualizar buffers óptimos en el mapa
 */
function visualizeOptimalBuffers(buffers, satellites) {
  // Limpiar buffers anteriores
  layers.buffers.clearLayers();

  // Dibujar buffers optimizados
  buffers.forEach((buffer, idx) => {
    const isUrban = buffer.tipo_zona === 'URBANO';
    const color = isUrban ? '#FF6B6B' : '#4ECDC4';
    
    // Buffer principal
    const circle = L.circle([buffer.lat, buffer.lng], {
      radius: buffer.buffer_radius_m,
      color: color,
      fillColor: color,
      fillOpacity: 0.2,
      weight: 3,
      dashArray: isUrban ? null : '10, 5'
    }).bindPopup(`
      <div style="min-width: 200px;">
        <strong style="font-size: 14px;">${buffer.nucleo_id}</strong>
        <hr style="margin: 8px 0; border-color: #eee;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
          <span>Tipo:</span>
          <span style="color: ${color}; font-weight: bold;">${buffer.tipo_zona}</span>
          <span>Radio:</span>
          <span><strong>${buffer.buffer_radius_km} km</strong></span>
          <span>Cobertura nueva:</span>
          <span><strong>+${buffer.new_coverage} satélites</strong></span>
          <span>Total en buffer:</span>
          <span>${buffer.satellites_covered} satélites</span>
        </div>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #666;">
          Buffer #${idx + 1} de ${buffers.length} seleccionados
        </div>
      </div>
    `);

    circle.addTo(layers.buffers);

    // Marcador central
    L.circleMarker([buffer.lat, buffer.lng], {
      radius: 8,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 1
    }).addTo(layers.buffers);
  });

  // Agregar leyenda de optimización
  addOptimizationLegend(buffers.length, satellites.length);

  console.log(`✅ ${buffers.length} buffers óptimos visualizados`);
}

/**
 * Agregar leyenda de optimización
 */
function addOptimizationLegend(buffersCount, totalNucleos) {
  if (window.densityLegend) {
    map.removeControl(window.densityLegend);
  }

  window.densityLegend = L.control({ position: 'bottomright' });
  
  window.densityLegend.onAdd = function() {
    const reduction = ((1 - buffersCount/totalNucleos) * 100).toFixed(0);
    const div = L.DomUtil.create('div', 'optimization-legend');
    div.innerHTML = `
      <div style="background: rgba(22,27,34,0.95); padding: 12px 15px; border-radius: 8px; color: white; font-size: 12px;">
        <strong style="display:block; margin-bottom:8px;">📊 Cobertura Óptima</strong>
        <div style="display:flex; align-items:center; margin:5px 0;">
          <span style="width:16px; height:16px; background:#FF6B6B; border-radius:50%; margin-right:8px; border: 2px solid white;"></span>
          Urbano (3.5 km)
        </div>
        <div style="display:flex; align-items:center; margin:5px 0;">
          <span style="width:16px; height:16px; background:#4ECDC4; border-radius:50%; margin-right:8px; border: 2px dashed white;"></span>
          Rural (7.5 km)
        </div>
        <div style="margin-top:10px; padding:8px; background:rgba(56,239,125,0.2); border-radius:5px; text-align:center;">
          <div style="font-size:18px; font-weight:bold; color:#38ef7d;">${buffersCount}</div>
          <div style="font-size:10px;">buffers necesarios</div>
        </div>
        <div style="margin-top:5px; font-size:10px; color:#999; text-align:center;">
          ${reduction}% reducción vs ${totalNucleos} posibles
        </div>
      </div>
    `;
    return div;
  };

  window.densityLegend.addTo(map);
}

/**
 * ============================================================
 * FUNCIÓN 3: SPATIAL JOIN
 * ============================================================
 */
function executeSpatialJoin() {
  if (!spatialAnalytics || !spatialAnalytics.optimizedBuffers.length) {
    showNotification('❌ Primero genera los buffers óptimos', 'error');
    return;
  }

  showNotification('🔗 Ejecutando spatial join...', 'info');

  try {
    const nucleos = globalData.nucleos || [];
    const satellites = globalData.satellites || [];
    const institutions = globalData.institutions || [];

    const results = spatialAnalytics.spatialJoin(nucleos, satellites, institutions);
    analysisResults = results;

    showNotification(`✅ Spatial join completado: ${results.length} buffers`, 'success');
    showJoinResults(results);

  } catch (error) {
    console.error('Error:', error);
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * ============================================================
 * MOSTRAR RESULTADOS
 * ============================================================
 */
function showDensityResults(classification, nucleos) {
  const urbanos = Object.entries(classification).filter(([k,v]) => v === 'URBANO');
  const rurales = Object.entries(classification).filter(([k,v]) => v === 'RURAL');

  const html = `
    <div class="analysis-panel density-results">
      <h3>🗺️ Clasificación de Densidad</h3>
      <div class="stats-summary">
        <div class="stat">
          <strong style="color: #FF5757;">${urbanos.length}</strong>
          <span>Urbanos</span>
        </div>
        <div class="stat">
          <strong style="color: #4ECDC4;">${rurales.length}</strong>
          <span>Rurales</span>
        </div>
        <div class="stat">
          <strong>${nucleos.length}</strong>
          <span>Total</span>
        </div>
      </div>
      <div class="results-grid" style="max-height: 300px; overflow-y: auto;">
        ${Object.entries(classification).map(([idx, type]) => {
          const nucleo = nucleos[idx];
          const color = type === 'URBANO' ? '#FF5757' : '#4ECDC4';
          return `
            <div class="result-item" style="border-left: 4px solid ${color}; background: ${color}20; padding: 8px; margin: 4px 0; border-radius: 4px;">
              <strong>${nucleo.codigo_amie || 'NUC_'+idx}</strong>
              <span class="badge" style="background: ${color}; color: white; margin-left: 8px;">${type}</span>
            </div>
          `;
        }).join('')}
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="margin-top:15px; padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer;">
        Cerrar
      </button>
    </div>
  `;

  showResultsPanel(html);
}

function showOptimalBuffersResults(buffers, totalNucleos) {
  const stats = spatialAnalytics.getStatistics();
  
  const html = `
    <div class="analysis-panel buffers-results">
      <h3>📊 Buffers Óptimos Seleccionados</h3>
      <div class="highlight" style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #4caf50;">
        <strong>✅ Optimización:</strong> ${buffers.length} de ${totalNucleos} núcleos 
        (${stats.reduccion_porcentaje}% reducción)
      </div>
      <div style="max-height: 300px; overflow-y: auto;">
        <table class="results-table" style="width:100%; font-size:12px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:8px;">#</th>
              <th style="padding:8px;">Código</th>
              <th style="padding:8px;">Zona</th>
              <th style="padding:8px;">+Cobertura</th>
            </tr>
          </thead>
          <tbody>
            ${buffers.map((b, i) => `
              <tr>
                <td style="padding:6px;">${i+1}</td>
                <td style="padding:6px;">${b.nucleo_id}</td>
                <td style="padding:6px;">
                  <span style="background:${b.tipo_zona === 'URBANO' ? '#FF6B6B' : '#4ECDC4'}; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">
                    ${b.tipo_zona}
                  </span>
                </td>
                <td style="padding:6px;"><strong>+${b.new_coverage}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="margin-top:15px; padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer;">
        Cerrar
      </button>
    </div>
  `;

  showResultsPanel(html);
}

function showJoinResults(results) {
  const html = `
    <div class="analysis-panel join-results">
      <h3>🔗 Resultados Spatial Join</h3>
      <p style="color:#666; font-size:12px; margin-bottom:15px;">
        ${results.length} buffers analizados con sus satélites asociados
      </p>
      <div style="max-height: 300px; overflow-y: auto;">
        <table class="results-table" style="width:100%; font-size:12px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:8px;">Código</th>
              <th style="padding:8px;">Zona</th>
              <th style="padding:8px;">Satélites</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => `
              <tr>
                <td style="padding:6px;">${r.codigo_amie}</td>
                <td style="padding:6px;">
                  <span style="background:${r.tipo_zona === 'URBANO' ? '#FF6B6B' : '#4ECDC4'}; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">
                    ${r.tipo_zona}
                  </span>
                </td>
                <td style="padding:6px;"><strong>${r.num_satelites}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="margin-top:15px; padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer;">
        Cerrar
      </button>
    </div>
  `;

  showResultsPanel(html);
}

function showResultsPanel(html) {
  // Remover panel anterior
  const existing = document.querySelector('.analysis-results-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.className = 'analysis-results-container';
  container.style.cssText = `
    position: fixed; right: 20px; bottom: 20px; z-index: 1000;
    background: white; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    max-width: 400px; max-height: 500px; overflow: hidden;
  `;
  container.innerHTML = html;
  
  // Estilos para el panel interno
  const panel = container.querySelector('.analysis-panel');
  if (panel) {
    panel.style.cssText = 'padding: 20px;';
  }

  document.body.appendChild(container);
}

/**
 * ============================================================
 * EXPORTACIÓN
 * ============================================================
 */
function showExportMenu() {
  if (!analysisResults || !analysisResults.length) {
    showNotification('❌ Primero ejecuta el análisis completo', 'error');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-export';
  modal.innerHTML = `
    <div class="export-panel" style="background:white; padding:30px; border-radius:12px; min-width:300px;">
      <h3 style="margin:0 0 20px 0; text-align:center;">📥 Exportar Resultados</h3>
      
      <button class="export-btn" onclick="exportResultsAs('csv')" style="display:flex; align-items:center; gap:10px; width:100%; padding:12px; margin-bottom:10px; background:linear-gradient(135deg,#667eea,#764ba2); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px;">
        📄 Exportar como CSV
      </button>

      <button class="export-btn" onclick="exportResultsAs('html')" style="display:flex; align-items:center; gap:10px; width:100%; padding:12px; margin-bottom:10px; background:linear-gradient(135deg,#f093fb,#f5576c); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px;">
        🌐 Exportar como HTML
      </button>

      <button class="export-btn" onclick="exportResultsAs('json')" style="display:flex; align-items:center; gap:10px; width:100%; padding:12px; margin-bottom:10px; background:linear-gradient(135deg,#4facfe,#00f2fe); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px;">
        📋 Exportar como JSON
      </button>

      <button onclick="this.parentElement.parentElement.remove()" style="width:100%; padding:12px; margin-top:10px; background:#e0e0e0; color:#333; border:none; border-radius:8px; cursor:pointer;">
        ✕ Cancelar
      </button>
    </div>
  `;

  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); display: flex; align-items: center;
    justify-content: center; z-index: 9999;
  `;

  document.body.appendChild(modal);
}

function exportResultsAs(format) {
  if (!spatialAnalytics) return;

  const timestamp = new Date().toISOString().split('T')[0];
  let content, filename, mimeType;

  switch (format) {
    case 'csv':
      content = spatialAnalytics.exportCSV();
      filename = `dece-cobertura-optima-${timestamp}.csv`;
      mimeType = 'text/csv';
      break;
    case 'html':
      content = spatialAnalytics.exportHTML();
      filename = `dece-cobertura-optima-${timestamp}.html`;
      mimeType = 'text/html';
      break;
    case 'json':
      content = JSON.stringify(spatialAnalytics.exportJSON(), null, 2);
      filename = `dece-cobertura-optima-${timestamp}.json`;
      mimeType = 'application/json';
      break;
    default:
      return;
  }

  spatialAnalytics.downloadFile(content, filename, mimeType);
  showNotification(`✅ ${format.toUpperCase()} descargado`, 'success');

  const modal = document.querySelector('.modal-export');
  if (modal) modal.remove();
}

/**
 * Inicializar cuando el DOM esté listo
 */
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    if (typeof SpatialAnalytics !== 'undefined') {
      initSpatialAnalytics();
    }
  }, 1000);
});

// Exportar funciones globales
window.analyzeUrbanRuralDensity = analyzeUrbanRuralDensity;
window.generateOptimalBuffers = generateOptimalBuffers;
window.generateDynamicBuffers = generateOptimalBuffers; // Alias
window.executeSpatialJoin = executeSpatialJoin;
window.showExportMenu = showExportMenu;
window.exportResultsAs = exportResultsAs;
window.initSpatialAnalytics = initSpatialAnalytics;
