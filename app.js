/*************************************************
 * DECE Coverage Optimizer
 * - Optimización de núcleos mediante clustering
 * - Visualización de red vial
 * - Análisis de cobertura según Modelo DECE
 *************************************************/

// ===== Variables globales =====
let map;
let allData = { nucleos: [], satellites: [], todas: [] };
let nucleoStats = new Map();
let viasLayer = null;

const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup(),
  optimized: L.featureGroup(),
  vias: L.featureGroup()
};

const BUFFER_RADIUS_M = 7500;
const ECUADOR_CENTER = [-1.831239, -78.183406];
const ESTUDIANTES_POR_PROF = 450;
const GRID_CELL_DEG = 0.10;

const canvasRenderer = L.canvas({ padding: 0.5 });
const svgRenderer = L.svg({ padding: 0.5 });

let _initialized = false;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  if (_initialized) return;
  _initialized = true;
  
  initMap();
  setupControls();
  loadAllData();
});

// ===== Mapa =====
function initMap() {
  map = L.map('map', {
    center: ECUADOR_CENTER,
    zoom: 7,
    zoomControl: true,
    preferCanvas: true,
    renderer: canvasRenderer
  });

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri', maxZoom: 19 }
  );

  osmLayer.addTo(map);
  L.control.layers({ 'Mapa': osmLayer, 'Satélite': satelliteLayer }).addTo(map);

  // Añadir capas (excepto vías que se carga después)
  ['nucleos', 'satellites', 'buffers', 'connections', 'optimized'].forEach(k => {
    layers[k].addTo(map);
  });
}

// ===== Carga de datos =====
function loadAllData() {
  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');
  const subtext = document.getElementById('loadingSubtext');

  if (overlayText) overlayText.textContent = 'Cargando instituciones...';

  fetch('instituciones.csv')
    .then(r => r.text())
    .then(csvText => {
      const cleanedText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      
      Papa.parse(cleanedText, {
        delimiter: ';',
        skipEmptyLines: 'greedy',
        complete: (results) => {
          const rows = results.data || [];
          if (subtext) subtext.textContent = rows.length + ' registros encontrados';
          
          const { idx } = resolveColumnIndexes(rows[0] || []);
          const { data, bounds } = mapRowsToData(rows, idx);
          
          allData.todas = data;
          allData.nucleos = data.filter(d => [3, 4, 5].includes(d.cod));
          allData.satellites = data.filter(d => d.cod === 2);
          
          console.log('Núcleos:', allData.nucleos.length);
          console.log('Satélites:', allData.satellites.length);
          
          if (bounds && bounds.isValid()) {
            map.fitBounds(bounds.pad(0.10), { animate: false });
          }
          
          // Cargar vías
          if (overlayText) overlayText.textContent = 'Cargando red vial...';
          loadVias(() => {
            processData();
          });
        }
      });
    })
    .catch(err => {
      console.error('Error cargando CSV:', err);
      if (overlayText) overlayText.textContent = 'Error al cargar datos: ' + err.message;
    });
}

function loadVias(callback) {
  fetch('vias_principales.geojson')
    .then(r => r.json())
    .then(geojson => {
      viasLayer = L.geoJSON(geojson, {
        style: (feature) => {
          const highway = feature.properties?.highway || '';
          const isPrimary = ['primary', 'trunk', 'motorway'].includes(highway);
          return {
            color: isPrimary ? '#f0883e' : '#d29922',
            weight: isPrimary ? 2.5 : 1.5,
            opacity: isPrimary ? 0.8 : 0.5
          };
        },
        interactive: false
      });
      console.log('Vías cargadas:', geojson.features.length);
      callback();
    })
    .catch(err => {
      console.warn('No se pudo cargar vías:', err);
      callback();
    });
}

// ===== Resolución de columnas =====
function resolveColumnIndexes(headerRow) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const header = headerRow.map(norm);
  
  const findOne = (candidates) => {
    for (const c of candidates) {
      const i = header.indexOf(norm(c));
      if (i >= 0) return i;
    }
    for (const c of candidates) {
      const i = header.findIndex(h => h.includes(norm(c)));
      if (i >= 0) return i;
    }
    return -1;
  };

  return {
    idx: {
      lat: findOne(['latitud', 'lat']),
      lng: findOne(['longitud', 'lng', 'lon']),
      cod: findOne(['cod_gdece']),
      name: findOne(['nombre_institucion', 'nombre']),
      dist: findOne(['distrito']),
      zone: findOne(['zona']),
      students: findOne(['total estudiantes', 'total_estudiantes']),
      profs: findOne(['po_profdece', 'profdece']),
      amie: findOne(['amie']),
      provincia: findOne(['provincia']),
      canton: findOne(['canton'])
    }
  };
}

function parseNum(val) {
  if (val == null || val === '') return NaN;
  return parseFloat(String(val).replace(',', '.').trim());
}

function mapRowsToData(rows, idx) {
  const data = [];
  const bounds = L.latLngBounds();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;

    const lat = parseNum(r[idx.lat]);
    const lng = parseNum(r[idx.lng]);
    const cod = parseInt(r[idx.cod]) || 0;

    if (isNaN(lat) || isNaN(lng)) continue;
    if (![1, 2, 3, 4, 5].includes(cod)) continue;

    const item = {
      lat, lng, cod,
      name: r[idx.name] || 'Sin nombre',
      dist: r[idx.dist] || 'N/D',
      zone: r[idx.zone] || 'N/D',
      students: parseNum(r[idx.students]) || 0,
      profs: parseNum(r[idx.profs]) || 0,
      amie: r[idx.amie] || '',
      provincia: r[idx.provincia] || '',
      canton: r[idx.canton] || ''
    };

    data.push(item);
    bounds.extend([lat, lng]);
  }

  return { data, bounds };
}

// ===== Procesamiento principal =====
function processData() {
  Object.values(layers).forEach(l => l.clearLayers());
  nucleoStats.clear();

  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');

  const { nucleos, satellites } = allData;

  if (!nucleos.length && !satellites.length) {
    if (overlayText) overlayText.textContent = 'Sin datos para mostrar.';
    return;
  }

  // Construir grid espacial
  const grid = buildGridIndex(nucleos);

  // Inicializar stats
  for (const n of nucleos) {
    const k = keyLatLng(n.lat, n.lng);
    nucleoStats.set(k, { nucleo: n, satellites: [], totalStudents: n.students || 0 });
  }

  if (overlayText) overlayText.textContent = 'Analizando cobertura...';

  // Asignar satélites
  let satCovered = 0;
  for (const s of satellites) {
    const { bestNucleo, bestDist } = findClosestNucleo(s, grid);
    s.covered = !!bestNucleo;
    s.assignedNucleo = bestNucleo;
    s.distance = bestDist;

    if (bestNucleo) {
      satCovered++;
      const k = keyLatLng(bestNucleo.lat, bestNucleo.lng);
      const st = nucleoStats.get(k);
      if (st) {
        st.satellites.push(s);
        st.totalStudents += (s.students || 0);
      }
    }
  }

  // Núcleos activos (con satélites)
  const nucleosActivos = Array.from(nucleoStats.entries())
    .filter(([k, st]) => st.satellites.length > 0)
    .map(([k, st]) => st.nucleo);

  if (overlayText) overlayText.textContent = 'Dibujando buffers...';

  // Dibujar buffers solo de núcleos activos
  drawBuffers(nucleosActivos);

  // Dibujar satélites y conexiones
  if (overlayText) overlayText.textContent = 'Dibujando instituciones...';
  drawSatellites(satellites);
  drawNucleos(nucleos);

  // Calcular estadísticas
  const totalStudents = allData.todas.reduce((s, d) => s + (d.students || 0), 0);
  const profActuales = allData.todas.reduce((s, d) => s + (d.profs || 0), 0);
  const profNecesarios = Math.ceil(totalStudents / ESTUDIANTES_POR_PROF);
  const coveragePercent = satellites.length > 0 
    ? ((satCovered / satellites.length) * 100).toFixed(1) 
    : '0.0';

  updateStatistics({
    totalNucleos: nucleos.length,
    totalSatellites: satellites.length,
    nucleosActivos: nucleosActivos.length,
    sinCobertura: satellites.length - satCovered,
    coveragePercent,
    totalStudents,
    profActuales,
    profNecesarios
  });

  updateTopNucleos(nucleoStats);

  overlay?.classList.add('hidden');
  setTimeout(() => document.getElementById('statsPanel')?.classList.add('active'), 300);
}

// ===== Grid espacial =====
function buildGridIndex(nucleos) {
  const grid = new Map();
  for (const n of nucleos) {
    const k = gridKey(n.lat, n.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(n);
  }
  return grid;
}

function gridKey(lat, lng) {
  return `${Math.floor(lat / GRID_CELL_DEG)}|${Math.floor(lng / GRID_CELL_DEG)}`;
}

function keyLatLng(lat, lng) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function findClosestNucleo(satellite, grid) {
  const [gx, gy] = gridKey(satellite.lat, satellite.lng).split('|').map(Number);
  let bestNucleo = null;
  let bestDist = BUFFER_RADIUS_M;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const candidates = grid.get(`${gx + dx}|${gy + dy}`);
      if (!candidates) continue;
      
      for (const n of candidates) {
        const d = haversineDistance(satellite.lat, satellite.lng, n.lat, n.lng);
        if (d <= BUFFER_RADIUS_M && d < bestDist) {
          bestDist = d;
          bestNucleo = n;
        }
      }
    }
  }
  return { bestNucleo, bestDist };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ===== Dibujo de elementos =====
function drawBuffers(nucleosActivos) {
  for (const n of nucleosActivos) {
    const k = keyLatLng(n.lat, n.lng);
    const st = nucleoStats.get(k);
    const satCount = st ? st.satellites.length : 0;
    
    const opacity = Math.min(0.2 + satCount * 0.015, 0.5);
    const fillOpacity = Math.min(0.05 + satCount * 0.005, 0.12);

    L.circle([n.lat, n.lng], {
      radius: BUFFER_RADIUS_M,
      fillColor: '#58a6ff',
      color: '#58a6ff',
      weight: 1.5,
      opacity,
      fillOpacity,
      interactive: false,
      renderer: canvasRenderer
    }).addTo(layers.buffers);
  }
}

function drawSatellites(satellites) {
  for (const s of satellites) {
    const color = s.covered ? '#58a6ff' : '#6e7681';
    
    L.circleMarker([s.lat, s.lng], {
      radius: 5,
      fillColor: color,
      color: '#fff',
      weight: 1.5,
      fillOpacity: 0.8,
      renderer: canvasRenderer
    }).bindPopup(createSatellitePopup(s))
      .addTo(layers.satellites);

    // Conexión
    if (s.covered && s.assignedNucleo) {
      L.polyline([[s.assignedNucleo.lat, s.assignedNucleo.lng], [s.lat, s.lng]], {
        color: '#58a6ff',
        weight: 1,
        opacity: 0.25,
        dashArray: '4, 8',
        interactive: false,
        renderer: canvasRenderer
      }).addTo(layers.connections);
    }
  }
}

function drawNucleos(nucleos) {
  for (const n of nucleos) {
    const k = keyLatLng(n.lat, n.lng);
    const st = nucleoStats.get(k);
    const satCount = st ? st.satellites.length : 0;
    const radius = 6 + Math.min(8, Math.sqrt(satCount + 1) * 1.5);

    L.circleMarker([n.lat, n.lng], {
      radius,
      fillColor: '#f85149',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
      renderer: canvasRenderer
    }).bindPopup(createNucleoPopup(n, st))
      .addTo(layers.nucleos);
  }
}

// ===== Popups =====
function createNucleoPopup(nucleo, stats) {
  const totalStudents = stats?.totalStudents || nucleo.students || 0;
  const satCount = stats?.satellites.length || 0;
  const profNecesarios = Math.ceil(totalStudents / ESTUDIANTES_POR_PROF);
  const actuales = nucleo.profs || 0;
  const deficit = profNecesarios - actuales;

  return `
    <div class="popup-title">🏛️ Núcleo DECE</div>
    <div class="popup-row"><span class="popup-label">Institución:</span><span class="popup-value">${escapeHTML(nucleo.name).slice(0,40)}</span></div>
    <div class="popup-row"><span class="popup-label">Distrito:</span><span class="popup-value">${escapeHTML(nucleo.dist)}</span></div>
    <div class="popup-row"><span class="popup-label">Satélites:</span><span class="popup-value" style="color:#58a6ff">${satCount}</span></div>
    <div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value" style="color:#d29922">${totalStudents.toLocaleString()}</span></div>
    <div class="popup-row"><span class="popup-label">Prof. necesarios:</span><span class="popup-value">${profNecesarios}</span></div>
    <div class="popup-row"><span class="popup-label">Prof. actuales:</span><span class="popup-value">${actuales}</span></div>
    ${deficit > 0 ? `<div class="popup-row"><span class="popup-label">Déficit:</span><span class="popup-value" style="color:#f85149">-${deficit}</span></div>` : ''}
  `;
}

function createSatellitePopup(sat) {
  const km = sat.distance ? (sat.distance / 1000).toFixed(2) : 'N/A';
  return `
    <div class="popup-title">📍 Satélite</div>
    <div class="popup-row"><span class="popup-label">Institución:</span><span class="popup-value">${escapeHTML(sat.name).slice(0,40)}</span></div>
    <div class="popup-row"><span class="popup-label">Distrito:</span><span class="popup-value">${escapeHTML(sat.dist)}</span></div>
    <div class="popup-row"><span class="popup-label">Estado:</span><span class="popup-value" style="color:${sat.covered ? '#3fb950' : '#f85149'}">${sat.covered ? '✓ Cubierto' : '✗ Sin cobertura'}</span></div>
    ${sat.covered ? `<div class="popup-row"><span class="popup-label">Distancia:</span><span class="popup-value">${km} km</span></div>` : ''}
    <div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value" style="color:#d29922">${(sat.students || 0).toLocaleString()}</span></div>
  `;
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// ===== UI Updates =====
function updateStatistics(stats) {
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  
  setEl('totalNucleos', stats.totalNucleos.toLocaleString());
  setEl('totalSatellites', stats.totalSatellites.toLocaleString());
  setEl('nucleosActivos', stats.nucleosActivos.toLocaleString());
  setEl('sinCobertura', stats.sinCobertura.toLocaleString());
  setEl('coveragePercent', stats.coveragePercent + '%');
  setEl('totalStudents', stats.totalStudents.toLocaleString());
  setEl('profActuales', stats.profActuales.toLocaleString());
  setEl('profNecesarios', stats.profNecesarios.toLocaleString());
  setEl('profDeficit', (stats.profNecesarios - stats.profActuales).toLocaleString());

  const fill = document.getElementById('coverageFill');
  if (fill) fill.style.width = stats.coveragePercent + '%';
}

function updateTopNucleos(nucleoStats) {
  const container = document.getElementById('topNucleos');
  if (!container) return;

  const sorted = Array.from(nucleoStats.values())
    .sort((a, b) => b.satellites.length - a.satellites.length)
    .slice(0, 10);

  container.innerHTML = sorted.map((s, i) => {
    const profNec = Math.ceil((s.totalStudents || 0) / ESTUDIANTES_POR_PROF);
    return `
      <div class="top-item" onclick="flyTo(${s.nucleo.lat}, ${s.nucleo.lng})">
        <div class="top-item-header">
          <span class="top-rank">#${i + 1}</span>
          <span class="top-name">${escapeHTML(s.nucleo.name)}</span>
          <span class="top-count">${s.satellites.length}</span>
        </div>
        <div class="top-desc">${s.totalStudents.toLocaleString()} est. • ${profNec} prof. nec.</div>
      </div>
    `;
  }).join('');
}

function flyTo(lat, lng) {
  map.flyTo([lat, lng], 13, { duration: 1 });
}

// ===== Optimización de núcleos =====
function optimizarNucleos() {
  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');
  
  overlay?.classList.remove('hidden');
  if (overlayText) overlayText.textContent = 'Optimizando ubicación de núcleos...';

  setTimeout(() => {
    // Encontrar satélites sin cobertura
    const sinCobertura = allData.satellites.filter(s => !s.covered);
    
    if (sinCobertura.length === 0) {
      alert('¡Todos los satélites ya tienen cobertura!');
      overlay?.classList.add('hidden');
      return;
    }

    // Clustering simple: agrupar satélites sin cobertura cercanos
    const clusters = clusterSatellites(sinCobertura, BUFFER_RADIUS_M * 0.8);
    
    layers.optimized.clearLayers();

    let sugeridos = 0;
    for (const cluster of clusters) {
      if (cluster.length < 2) continue; // Solo clusters con 2+ satélites
      
      // Centroide del cluster
      const centroid = {
        lat: cluster.reduce((s, c) => s + c.lat, 0) / cluster.length,
        lng: cluster.reduce((s, c) => s + c.lng, 0) / cluster.length
      };

      // Verificar si hay un núcleo cercano que podría reubicarse
      const nucleoCercano = findNearestNucleoToPoint(centroid, allData.nucleos, BUFFER_RADIUS_M * 2);
      
      // Marcar sugerencia
      L.circleMarker([centroid.lat, centroid.lng], {
        radius: 12,
        fillColor: '#a371f7',
        color: '#fff',
        weight: 3,
        fillOpacity: 0.9
      }).bindPopup(`
        <div class="popup-title">💡 Núcleo Sugerido</div>
        <div class="popup-row"><span class="popup-label">Satélites a cubrir:</span><span class="popup-value" style="color:#a371f7">${cluster.length}</span></div>
        <div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value">${cluster.reduce((s, c) => s + (c.students || 0), 0).toLocaleString()}</span></div>
        ${nucleoCercano ? `<div class="popup-row"><span class="popup-label">Reubicar desde:</span><span class="popup-value">${escapeHTML(nucleoCercano.name).slice(0,25)}</span></div>` : ''}
      `).addTo(layers.optimized);

      // Buffer sugerido
      L.circle([centroid.lat, centroid.lng], {
        radius: BUFFER_RADIUS_M,
        fillColor: '#a371f7',
        color: '#a371f7',
        weight: 2,
        opacity: 0.5,
        fillOpacity: 0.08,
        dashArray: '8, 8',
        interactive: false
      }).addTo(layers.optimized);

      sugeridos++;
    }

    if (overlayText) overlayText.textContent = `Se sugieren ${sugeridos} nuevas ubicaciones`;
    
    setTimeout(() => {
      overlay?.classList.add('hidden');
      if (sugeridos > 0) {
        alert(`Optimización completada:\n\n• ${sugeridos} ubicaciones sugeridas (marcadas en morado)\n• Potencial para cubrir ${sinCobertura.length} satélites adicionales\n\nLas sugerencias aparecen en el mapa.`);
      }
    }, 1000);
  }, 100);
}

function clusterSatellites(satellites, maxDist) {
  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < satellites.length; i++) {
    if (visited.has(i)) continue;
    
    const cluster = [satellites[i]];
    visited.add(i);

    for (let j = i + 1; j < satellites.length; j++) {
      if (visited.has(j)) continue;
      
      // Verificar si está cerca de algún miembro del cluster
      const nearCluster = cluster.some(c => 
        haversineDistance(c.lat, c.lng, satellites[j].lat, satellites[j].lng) <= maxDist
      );

      if (nearCluster) {
        cluster.push(satellites[j]);
        visited.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters.sort((a, b) => b.length - a.length);
}

function findNearestNucleoToPoint(point, nucleos, maxDist) {
  let nearest = null;
  let minDist = maxDist;

  for (const n of nucleos) {
    const d = haversineDistance(point.lat, point.lng, n.lat, n.lng);
    if (d < minDist) {
      minDist = d;
      nearest = n;
    }
  }

  return nearest;
}

// ===== Controles =====
function setupControls() {
  const byId = (id) => document.getElementById(id);

  byId('toggleStats')?.addEventListener('click', () => {
    byId('statsPanel')?.classList.toggle('active');
    byId('legendPanel')?.classList.remove('active');
  });

  byId('toggleLegend')?.addEventListener('click', () => {
    byId('legendPanel')?.classList.toggle('active');
    byId('statsPanel')?.classList.remove('active');
  });

  byId('btnOptimizar')?.addEventListener('click', optimizarNucleos);

  // Toggles de capas
  bindLayerToggle('toggleNucleos', layers.nucleos);
  bindLayerToggle('toggleSatellites', layers.satellites);
  bindLayerToggle('toggleBuffers', layers.buffers);
  bindLayerToggle('toggleConnections', layers.connections);
  
  byId('toggleViasPrincipales')?.addEventListener('change', (e) => {
    if (e.target.checked && viasLayer) {
      viasLayer.addTo(map);
    } else if (viasLayer) {
      map.removeLayer(viasLayer);
    }
  });
}

function bindLayerToggle(id, layer) {
  document.getElementById(id)?.addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(layer);
    else map.removeLayer(layer);
  });
}
