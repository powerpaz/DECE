/**
 * ============================================================
 * SPATIAL INTEGRATION v3.0 - FUNCIONES GLOBALES
 * ============================================================
 */

// Variables globales
var spatialAnalytics = null;
var analysisResults = null;

// Inicializar cuando cargue
window.addEventListener('load', function() {
  console.log('🚀 Inicializando SpatialAnalytics...');
  
  if (typeof SpatialAnalytics !== 'undefined') {
    spatialAnalytics = new SpatialAnalytics();
    console.log('✅ SpatialAnalytics listo');
  } else {
    console.error('❌ SpatialAnalytics no encontrado');
  }
});

/**
 * ============================================================
 * FUNCIÓN 1: DETECTAR DENSIDAD CON HEATMAP
 * ============================================================
 */
function analyzeUrbanRuralDensity() {
  console.log('🔍 Ejecutando analyzeUrbanRuralDensity...');
  
  if (!spatialAnalytics) {
    spatialAnalytics = new SpatialAnalytics();
  }

  if (!globalData || !globalData.nucleos) {
    showNotification('❌ Espera a que carguen los datos primero', 'error');
    return;
  }

  showNotification('🔍 Analizando densidad...', 'info');

  try {
    var nucleos = globalData.nucleos;
    var result = spatialAnalytics.detectUrbanRuralDensity(nucleos);
    var classification = result.classification;
    var heatmapData = result.heatmapData;

    // Limpiar visualización anterior
    clearDensityVisualization();

    // Visualizar heatmap
    visualizeDensityHeatmap(heatmapData, nucleos);

    var urbanos = 0, rurales = 0;
    for (var key in classification) {
      if (classification[key] === 'URBANO') urbanos++;
      else rurales++;
    }

    showNotification('✅ ' + urbanos + ' zonas urbanas, ' + rurales + ' zonas rurales', 'success');
    showDensityPanel(classification, nucleos);

  } catch (error) {
    console.error('Error:', error);
    showNotification('❌ Error: ' + error.message, 'error');
  }
}

/**
 * Visualizar heatmap de densidad
 */
function visualizeDensityHeatmap(heatmapData, nucleos) {
  // Crear capa si no existe
  if (!window.densityLayer) {
    window.densityLayer = L.featureGroup().addTo(map);
  }
  window.densityLayer.clearLayers();

  // Generar grid de densidad
  var gridData = spatialAnalytics.generateDensityGrid(nucleos);

  // Dibujar celdas de densidad
  gridData.forEach(function(cell) {
    var cellSize = 0.02;
    var bounds = [
      [cell.lat - cellSize/2, cell.lng - cellSize/2],
      [cell.lat + cellSize/2, cell.lng + cellSize/2]
    ];

    var intensity = Math.min(cell.density / 3, 1);
    var color = cell.isUrban 
      ? 'rgba(255, 87, 87, ' + (intensity * 0.5) + ')' 
      : 'rgba(78, 205, 196, ' + (intensity * 0.3) + ')';

    L.rectangle(bounds, {
      color: 'transparent',
      fillColor: color,
      fillOpacity: 1,
      weight: 0
    }).addTo(window.densityLayer);
  });

  // Marcadores de núcleos
  heatmapData.forEach(function(point, idx) {
    var isUrban = point.type === 'URBANO';
    var color = isUrban ? '#FF5757' : '#4ECDC4';

    L.circleMarker([point.lat, point.lng], {
      radius: isUrban ? 12 : 10,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9
    }).bindPopup(
      '<strong>' + point.codigo_amie + '</strong><br/>' +
      '<span style="color:' + color + '; font-weight:bold;">' + point.type + '</span><br/>' +
      'Dist. promedio: ' + (point.avgDistance/1000).toFixed(2) + ' km'
    ).addTo(window.densityLayer);

    // Aura para urbanos
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

  addDensityLegend();
  console.log('✅ Heatmap visualizado');
}

/**
 * Leyenda de densidad
 */
function addDensityLegend() {
  if (window.densityLegend) {
    map.removeControl(window.densityLegend);
  }

  window.densityLegend = L.control({ position: 'bottomright' });
  
  window.densityLegend.onAdd = function() {
    var div = L.DomUtil.create('div', 'density-legend');
    div.innerHTML = 
      '<div style="background: rgba(22,27,34,0.95); padding: 12px 15px; border-radius: 8px; color: white; font-size: 12px;">' +
        '<strong style="display:block; margin-bottom:8px;">🗺️ Clasificación</strong>' +
        '<div style="display:flex; align-items:center; margin:5px 0;">' +
          '<span style="width:16px; height:16px; background:#FF5757; border-radius:50%; margin-right:8px;"></span>' +
          'URBANO (denso)' +
        '</div>' +
        '<div style="display:flex; align-items:center; margin:5px 0;">' +
          '<span style="width:16px; height:16px; background:#4ECDC4; border-radius:50%; margin-right:8px;"></span>' +
          'RURAL (disperso)' +
        '</div>' +
      '</div>';
    return div;
  };

  window.densityLegend.addTo(map);
}

function clearDensityVisualization() {
  if (window.densityLayer) {
    window.densityLayer.clearLayers();
  }
  if (window.densityLegend) {
    map.removeControl(window.densityLegend);
    window.densityLegend = null;
  }
}

/**
 * ============================================================
 * FUNCIÓN 2: BUFFERS ÓPTIMOS
 * ============================================================
 */
function generateOptimalBuffers() {
  console.log('📏 Ejecutando generateOptimalBuffers...');
  
  if (!spatialAnalytics) {
    spatialAnalytics = new SpatialAnalytics();
  }

  if (!Object.keys(spatialAnalytics.classification).length) {
    showNotification('❌ Primero ejecuta "Detectar Densidad"', 'error');
    return;
  }

  if (!globalData || !globalData.nucleos || !globalData.satellites) {
    showNotification('❌ Faltan datos', 'error');
    return;
  }

  showNotification('📏 Calculando cobertura óptima...', 'info');

  try {
    var nucleos = globalData.nucleos;
    var satellites = globalData.satellites;

    clearDensityVisualization();

    var optimalBuffers = spatialAnalytics.generateOptimalBuffers(nucleos, satellites);

    visualizeOptimalBuffers(optimalBuffers);

    var stats = spatialAnalytics.getStatistics();
    showNotification(
      '✅ ' + optimalBuffers.length + ' buffers óptimos (' + stats.reduccion_porcentaje + '% menos)', 
      'success'
    );

    showBuffersPanel(optimalBuffers, nucleos.length);

  } catch (error) {
    console.error('Error:', error);
    showNotification('❌ Error: ' + error.message, 'error');
  }
}

/**
 * Visualizar buffers óptimos
 */
function visualizeOptimalBuffers(buffers) {
  layers.buffers.clearLayers();

  buffers.forEach(function(buffer, idx) {
    var isUrban = buffer.tipo_zona === 'URBANO';
    var color = isUrban ? '#FF6B6B' : '#4ECDC4';
    
    // Buffer
    L.circle([buffer.lat, buffer.lng], {
      radius: buffer.buffer_radius_m,
      color: color,
      fillColor: color,
      fillOpacity: 0.2,
      weight: 3,
      dashArray: isUrban ? null : '10, 5'
    }).bindPopup(
      '<div style="min-width: 180px;">' +
        '<strong>' + buffer.nucleo_id + '</strong>' +
        '<hr style="margin: 8px 0;">' +
        '<div>Tipo: <span style="color:' + color + '; font-weight:bold;">' + buffer.tipo_zona + '</span></div>' +
        '<div>Radio: <strong>' + buffer.buffer_radius_km + ' km</strong></div>' +
        '<div>Cobertura: <strong>+' + buffer.new_coverage + ' satélites</strong></div>' +
      '</div>'
    ).addTo(layers.buffers);

    // Centro
    L.circleMarker([buffer.lat, buffer.lng], {
      radius: 8,
      fillColor: color,
      color: '#fff',
      weight: 2,
      fillOpacity: 1
    }).addTo(layers.buffers);
  });

  addBuffersLegend(buffers.length);
  console.log('✅ ' + buffers.length + ' buffers visualizados');
}

function addBuffersLegend(count) {
  if (window.densityLegend) {
    map.removeControl(window.densityLegend);
  }

  window.densityLegend = L.control({ position: 'bottomright' });
  
  window.densityLegend.onAdd = function() {
    var div = L.DomUtil.create('div', 'buffers-legend');
    div.innerHTML = 
      '<div style="background: rgba(22,27,34,0.95); padding: 12px 15px; border-radius: 8px; color: white; font-size: 12px;">' +
        '<strong style="display:block; margin-bottom:8px;">📊 Cobertura Óptima</strong>' +
        '<div style="display:flex; align-items:center; margin:5px 0;">' +
          '<span style="width:16px; height:16px; background:#FF6B6B; border-radius:50%; margin-right:8px;"></span>' +
          'Urbano (3.5 km)' +
        '</div>' +
        '<div style="display:flex; align-items:center; margin:5px 0;">' +
          '<span style="width:16px; height:16px; background:#4ECDC4; border-radius:50%; margin-right:8px;"></span>' +
          'Rural (7.5 km)' +
        '</div>' +
        '<div style="margin-top:10px; padding:8px; background:rgba(56,239,125,0.2); border-radius:5px; text-align:center;">' +
          '<div style="font-size:20px; font-weight:bold; color:#38ef7d;">' + count + '</div>' +
          '<div style="font-size:10px;">buffers seleccionados</div>' +
        '</div>' +
      '</div>';
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
  console.log('🔗 Ejecutando executeSpatialJoin...');
  
  if (!spatialAnalytics || !spatialAnalytics.optimizedBuffers.length) {
    showNotification('❌ Primero genera los buffers óptimos', 'error');
    return;
  }

  showNotification('🔗 Ejecutando spatial join...', 'info');

  try {
    var nucleos = globalData.nucleos || [];
    var satellites = globalData.satellites || [];

    var results = spatialAnalytics.spatialJoin(nucleos, satellites, []);
    analysisResults = results;

    showNotification('✅ Spatial join: ' + results.length + ' buffers analizados', 'success');
    showJoinPanel(results);

  } catch (error) {
    console.error('Error:', error);
    showNotification('❌ Error: ' + error.message, 'error');
  }
}

/**
 * ============================================================
 * FUNCIÓN 4: EXPORTAR
 * ============================================================
 */
function showExportMenu() {
  console.log('📥 Abriendo menú de exportación...');
  
  if (!analysisResults || !analysisResults.length) {
    showNotification('❌ Primero ejecuta el análisis completo', 'error');
    return;
  }

  var modal = document.createElement('div');
  modal.id = 'exportModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999;';
  
  modal.innerHTML = 
    '<div style="background:white; padding:30px; border-radius:12px; min-width:300px;">' +
      '<h3 style="margin:0 0 20px 0; text-align:center;">📥 Exportar Resultados</h3>' +
      
      '<button onclick="exportResultsAs(\'csv\')" style="display:block; width:100%; padding:12px; margin-bottom:10px; background:linear-gradient(135deg,#667eea,#764ba2); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px;">' +
        '📄 Exportar CSV' +
      '</button>' +

      '<button onclick="exportResultsAs(\'html\')" style="display:block; width:100%; padding:12px; margin-bottom:10px; background:linear-gradient(135deg,#f093fb,#f5576c); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px;">' +
        '🌐 Exportar HTML' +
      '</button>' +

      '<button onclick="exportResultsAs(\'json\')" style="display:block; width:100%; padding:12px; margin-bottom:10px; background:linear-gradient(135deg,#4facfe,#00f2fe); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px;">' +
        '📋 Exportar JSON' +
      '</button>' +

      '<button onclick="closeExportModal()" style="display:block; width:100%; padding:12px; margin-top:10px; background:#e0e0e0; color:#333; border:none; border-radius:8px; cursor:pointer;">' +
        '✕ Cancelar' +
      '</button>' +
    '</div>';

  document.body.appendChild(modal);
}

function closeExportModal() {
  var modal = document.getElementById('exportModal');
  if (modal) modal.remove();
}

function exportResultsAs(format) {
  if (!spatialAnalytics) return;

  var timestamp = new Date().toISOString().split('T')[0];
  var content, filename, mimeType;

  if (format === 'csv') {
    content = spatialAnalytics.exportCSV();
    filename = 'dece-cobertura-' + timestamp + '.csv';
    mimeType = 'text/csv';
  } else if (format === 'html') {
    content = spatialAnalytics.exportHTML();
    filename = 'dece-cobertura-' + timestamp + '.html';
    mimeType = 'text/html';
  } else if (format === 'json') {
    content = JSON.stringify(spatialAnalytics.exportJSON(), null, 2);
    filename = 'dece-cobertura-' + timestamp + '.json';
    mimeType = 'application/json';
  }

  spatialAnalytics.downloadFile(content, filename, mimeType);
  showNotification('✅ ' + format.toUpperCase() + ' descargado', 'success');
  closeExportModal();
}

/**
 * ============================================================
 * PANELES DE RESULTADOS
 * ============================================================
 */
function showDensityPanel(classification, nucleos) {
  removeResultsPanel();

  var urbanos = 0, rurales = 0;
  for (var key in classification) {
    if (classification[key] === 'URBANO') urbanos++;
    else rurales++;
  }

  var items = '';
  for (var idx in classification) {
    var type = classification[idx];
    var nucleo = nucleos[idx];
    var color = type === 'URBANO' ? '#FF5757' : '#4ECDC4';
    items += '<div style="border-left:4px solid ' + color + '; background:' + color + '20; padding:8px; margin:4px 0; border-radius:4px;">' +
      '<strong>' + (nucleo.codigo_amie || 'NUC_'+idx) + '</strong>' +
      '<span style="background:' + color + '; color:white; padding:2px 8px; border-radius:10px; font-size:10px; margin-left:8px;">' + type + '</span>' +
    '</div>';
  }

  var html = 
    '<div style="padding:20px;">' +
      '<h3 style="margin:0 0 15px 0;">🗺️ Clasificación de Densidad</h3>' +
      '<div style="display:flex; gap:20px; margin-bottom:15px;">' +
        '<div style="text-align:center;"><div style="font-size:24px; font-weight:bold; color:#FF5757;">' + urbanos + '</div><div style="font-size:11px;">Urbanos</div></div>' +
        '<div style="text-align:center;"><div style="font-size:24px; font-weight:bold; color:#4ECDC4;">' + rurales + '</div><div style="font-size:11px;">Rurales</div></div>' +
      '</div>' +
      '<div style="max-height:250px; overflow-y:auto;">' + items + '</div>' +
      '<button onclick="removeResultsPanel()" style="margin-top:15px; padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer;">Cerrar</button>' +
    '</div>';

  createResultsPanel(html);
}

function showBuffersPanel(buffers, totalNucleos) {
  removeResultsPanel();

  var stats = spatialAnalytics.getStatistics();
  var rows = '';
  buffers.forEach(function(b, i) {
    var color = b.tipo_zona === 'URBANO' ? '#FF6B6B' : '#4ECDC4';
    rows += '<tr>' +
      '<td style="padding:6px;">' + (i+1) + '</td>' +
      '<td style="padding:6px;">' + b.nucleo_id + '</td>' +
      '<td style="padding:6px;"><span style="background:' + color + '; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">' + b.tipo_zona + '</span></td>' +
      '<td style="padding:6px;"><strong>+' + b.new_coverage + '</strong></td>' +
    '</tr>';
  });

  var html = 
    '<div style="padding:20px;">' +
      '<h3 style="margin:0 0 15px 0;">📊 Buffers Óptimos</h3>' +
      '<div style="background:#e8f5e9; padding:12px; border-radius:8px; margin-bottom:15px; border-left:4px solid #4caf50;">' +
        '<strong>✅ ' + buffers.length + '</strong> de ' + totalNucleos + ' núcleos (' + stats.reduccion_porcentaje + '% reducción)' +
      '</div>' +
      '<div style="max-height:250px; overflow-y:auto;">' +
        '<table style="width:100%; font-size:12px; border-collapse:collapse;">' +
          '<thead><tr style="background:#f5f5f5;"><th style="padding:8px;">#</th><th style="padding:8px;">Código</th><th style="padding:8px;">Zona</th><th style="padding:8px;">+Cob</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<button onclick="removeResultsPanel()" style="margin-top:15px; padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer;">Cerrar</button>' +
    '</div>';

  createResultsPanel(html);
}

function showJoinPanel(results) {
  removeResultsPanel();

  var rows = '';
  results.forEach(function(r) {
    var color = r.tipo_zona === 'URBANO' ? '#FF6B6B' : '#4ECDC4';
    rows += '<tr>' +
      '<td style="padding:6px;">' + r.codigo_amie + '</td>' +
      '<td style="padding:6px;"><span style="background:' + color + '; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">' + r.tipo_zona + '</span></td>' +
      '<td style="padding:6px;"><strong>' + r.num_satelites + '</strong></td>' +
    '</tr>';
  });

  var html = 
    '<div style="padding:20px;">' +
      '<h3 style="margin:0 0 15px 0;">🔗 Spatial Join</h3>' +
      '<p style="color:#666; font-size:12px; margin-bottom:15px;">' + results.length + ' buffers con satélites asociados</p>' +
      '<div style="max-height:250px; overflow-y:auto;">' +
        '<table style="width:100%; font-size:12px; border-collapse:collapse;">' +
          '<thead><tr style="background:#f5f5f5;"><th style="padding:8px;">Código</th><th style="padding:8px;">Zona</th><th style="padding:8px;">Satélites</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<button onclick="removeResultsPanel()" style="margin-top:15px; padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer;">Cerrar</button>' +
    '</div>';

  createResultsPanel(html);
}

function createResultsPanel(html) {
  var panel = document.createElement('div');
  panel.id = 'resultsPanel';
  panel.style.cssText = 'position:fixed; right:20px; bottom:20px; z-index:1000; background:white; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.2); max-width:380px;';
  panel.innerHTML = html;
  document.body.appendChild(panel);
}

function removeResultsPanel() {
  var panel = document.getElementById('resultsPanel');
  if (panel) panel.remove();
}

// Hacer funciones globales
window.analyzeUrbanRuralDensity = analyzeUrbanRuralDensity;
window.generateOptimalBuffers = generateOptimalBuffers;
window.executeSpatialJoin = executeSpatialJoin;
window.showExportMenu = showExportMenu;
window.exportResultsAs = exportResultsAs;
window.closeExportModal = closeExportModal;
window.removeResultsPanel = removeResultsPanel;

console.log('📦 SpatialIntegration cargado');
