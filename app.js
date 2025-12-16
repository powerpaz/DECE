/*************************************************
 * DECE Coverage App (Leaflet + CSV)
 * v3: "tipo redes"
 * - CSV robusto (delimiter ';' + BOM) y detección de columnas por encabezado
 * - Procesamiento por lotes para no congelar
 * - Indexación espacial (grid) para asignación rápida de satélites
 * - Conexiones animadas (SVG) SOLO para Top N núcleos (performance-safe)
 * - Halo pulsante para Top N núcleos (absorción)
 *************************************************/

// ===== Variables globales =====
let map;

const layers = {
  nucleos: L.featureGroup(),         // canvas
  satellites: L.featureGroup(),      // canvas
  buffers: L.featureGroup(),         // canvas
  connections: L.featureGroup(),     // canvas (todas las conexiones, estáticas)
  connectionsAnim: L.layerGroup(),   // svg (solo top núcleos, animadas)
  nucleoHalo: L.layerGroup()         // svg (solo top núcleos, halo)
};

const BUFFER_RADIUS_M = 7500; // 7.5 km
const ECUADOR_CENTER = [-1.831239, -78.183406];

// Renderers
const canvasRenderer = L.canvas({ padding: 0.5 });
const svgRenderer = L.svg({ padding: 0.5 });

// Grid size ~ 0.10° (~11 km). Buffer=7.5 km => revisar celda y vecinas
const GRID_CELL_DEG = 0.10;

// Top núcleos para animación/halo
const TOP_ANIM_NUCLEOS = 12;

// Guard para evitar doble init
let _initialized = false;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  if (_initialized) return;
  _initialized = true;

  initMap();
  setupControls();
  loadCSV();
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
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri', maxZoom: 19 }
  );

  osmLayer.addTo(map);
  L.control.layers({ 'OpenStreetMap': osmLayer, 'Satélite': satelliteLayer }).addTo(map);

  Object.values(layers).forEach(layer => layer.addTo(map));
}

// ===== CSV =====
function loadCSV() {
  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');

  if (!window.Papa) {
    if (overlayText) overlayText.textContent = 'Falta PapaParse. Revisa index.html.';
    console.error('PapaParse no está cargado');
    return;
  }

  if (overlayText) overlayText.textContent = 'Cargando CSV…';

  // Usar fetch primero para mejor control del archivo
  fetch('DECE_CRUCE_X_Y_NUC_SAT.csv')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
    })
    .then(csvText => {
      // Limpiar BOM y normalizar saltos de línea
      const cleanedText = csvText
        .replace(/^\uFEFF/, '')  // Remover BOM
        .replace(/\r\n/g, '\n')  // Normalizar CRLF a LF
        .replace(/\r/g, '\n');   // Por si hay CR sueltos

      if (overlayText) overlayText.textContent = 'Procesando CSV…';

      Papa.parse(cleanedText, {
        delimiter: ';',
        skipEmptyLines: 'greedy',
        complete: (results) => {
          if (results.errors && results.errors.length) {
            console.warn('PapaParse warnings/errors:', results.errors.slice(0, 5));
          }

          const rows = results.data || [];
          if (!rows.length) {
            if (overlayText) overlayText.textContent = 'CSV vacío o no se pudo leer.';
            return;
          }

          console.log(`CSV cargado: ${rows.length} filas`);
          console.log('Encabezados:', rows[0]);

          if (overlayText) overlayText.textContent = 'Preparando columnas…';

          const { idx, issues } = resolveColumnIndexes(rows[0] || []);
          if (issues.length) {
            console.warn('Column issues:', issues);
          }
          console.log('Índices detectados:', idx);

          const { data, bounds } = mapRowsToData(rows, idx);

          if (!data.length) {
            if (overlayText) overlayText.textContent = 'No hay registros válidos (revisa LAT/LON y COD_GDECE).';
            console.error('No valid data after mapping.');
            return;
          }

          console.log(`Datos válidos: ${data.length} registros`);

          if (bounds && bounds.isValid()) {
            map.fitBounds(bounds.pad(0.10), { animate: false });
          }

          processData(data);
        },
        error: (err) => {
          console.error('PapaParse error:', err);
          if (overlayText) overlayText.textContent = 'Error al procesar CSV.';
        }
      });
    })
    .catch(err => {
      console.error('Fetch error:', err);
      if (overlayText) overlayText.textContent = `Error al descargar CSV: ${err.message}`;
    });
}

// Índices por encabezados (tolerante a variaciones)
function resolveColumnIndexes(headerRow) {
  const norm = (s) => String(s ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remover acentos

  const header = headerRow.map(norm);
  console.log('Encabezados normalizados:', header);

  const findOne = (candidates) => {
    for (const c of candidates) {
      const normalized = norm(c);
      const i = header.indexOf(normalized);
      if (i >= 0) return i;
    }
    // Búsqueda parcial si no hay match exacto
    for (const c of candidates) {
      const normalized = norm(c);
      const i = header.findIndex(h => h.includes(normalized) || normalized.includes(h));
      if (i >= 0) return i;
    }
    return -1;
  };

  const idx = {
    lat: findOne(['latitud', 'latitude', 'lat']),
    lng: findOne(['longitud', 'longitude', 'lon', 'lng']),
    cod: findOne(['cod_gdece', 'cod gdece']),
    name: findOne(['nombre_institucion', 'nombre institucion', 'nombre']),
    dist: findOne(['distrito']),
    zone: findOne(['zona']),
    students: findOne(['total estudiantes', 'total_estudiantes']),
    profs: findOne(['po_profdece', 'profdece'])
  };

  const issues = [];
  if (idx.lat < 0) issues.push('No encuentro columna de LATITUD.');
  if (idx.lng < 0) issues.push('No encuentro columna de LONGITUD.');
  if (idx.cod < 0) issues.push('No encuentro columna COD_GDECE.');

  console.log('Índices encontrados:', idx);
  console.log('Problemas:', issues);

  return { idx, issues };
}

// Parsear número con coma o punto decimal
function parseNum(val) {
  if (val == null || val === '') return NaN;
  // Reemplazar coma por punto para soporte de formato europeo
  const cleaned = String(val).replace(',', '.').trim();
  return parseFloat(cleaned);
}

function mapRowsToData(rows, idx) {
  const data = [];
  const bounds = L.latLngBounds();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;

    const lat = parseNum(r[idx.lat]);
    const lng = parseNum(r[idx.lng]);
    const cod = Number(r[idx.cod]);

    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    if (![2, 3, 4, 5].includes(cod)) continue;

    const item = {
      lat,
      lng,
      cod,
      name: idx.name >= 0 ? (r[idx.name] || 'IE sin nombre') : 'IE sin nombre',
      dist: idx.dist >= 0 ? (r[idx.dist] || 'N/D') : 'N/D',
      zone: idx.zone >= 0 ? (r[idx.zone] || 'N/D') : 'N/D',
      students: idx.students >= 0 ? (parseNum(r[idx.students]) || 0) : 0,
      profs: idx.profs >= 0 ? (parseNum(r[idx.profs]) || 0) : 0
    };

    data.push(item);
    bounds.extend([lat, lng]);
  }

  return { data, bounds };
}

// ===== Procesamiento cobertura =====
function processData(data) {
  // Limpia capas
  Object.values(layers).forEach(l => l.clearLayers());

  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');

  const nucleos = data.filter(d => [3, 4, 5].includes(d.cod));
  const satellites = data.filter(d => d.cod === 2);

  if (!nucleos.length && !satellites.length) {
    if (overlayText) overlayText.textContent = 'Sin datos para dibujar (COD_GDECE 2/3/4/5).';
    return;
  }

  // Indice espacial para nucleos
  const grid = buildGridIndex(nucleos);

  // Stats por nucleo
  const nucleoStats = new Map();
  for (const n of nucleos) {
    const k = keyLatLng(n.lat, n.lng);
    nucleoStats.set(k, { nucleo: n, satellites: [], totalStudents: n.students || 0 });
  }

  // 1) PRIMERO: Asignar satelites para saber que nucleos absorben
  if (overlayText) overlayText.textContent = 'Analizando cobertura... 0 / ' + satellites.length.toLocaleString();
  assignSatellitesInBatches(satellites, grid, nucleoStats, 0, 280, (satCovered) => {

    // 2) Calcular nucleos que tienen satelites (para buffers optimizados)
    const nucleosConSatelites = Array.from(nucleoStats.entries())
      .filter(([k, st]) => st.satellites.length > 0)
      .map(([k, st]) => st.nucleo);
    
    console.log('Nucleos activos (con satelites): ' + nucleosConSatelites.length + ' de ' + nucleos.length);

    // 3) Dibujar buffers SOLO de nucleos que absorben satelites
    if (overlayText) overlayText.textContent = 'Dibujando ' + nucleosConSatelites.length + ' buffers activos...';
    drawBuffersInBatches(nucleosConSatelites, nucleoStats, 0, 450, () => {

      // 4) Nucleos por lotes + calculo top absorcion
      if (overlayText) overlayText.textContent = 'Dibujando nucleos... 0 / ' + nucleos.length.toLocaleString();
      const topKeys = computeTopNucleoKeys(nucleoStats, TOP_ANIM_NUCLEOS);

      drawNucleosInBatches(nucleos, nucleoStats, topKeys, 0, 450, () => {

        // 5) "Tipo redes": halo + conexiones animadas SOLO top nucleos (SVG)
        if (overlayText) overlayText.textContent = 'Generando red destacada (Top ' + TOP_ANIM_NUCLEOS + ')...';
        buildAnimatedOverlay(nucleoStats, topKeys);

        // UI final
        const coveragePercent = satellites.length > 0
          ? ((satCovered / satellites.length) * 100).toFixed(1)
          : '0.0';

        updateStatistics({
          totalNucleos: nucleos.length,
          totalSatellites: satellites.length,
          satellitesCovered: satCovered,
          coveragePercent,
          totalStudents: data.reduce((s, d) => s + (d.students || 0), 0),
          nucleosActivos: nucleosConSatelites.length
        });

        updateTopNucleos(nucleoStats);

        overlay?.classList.add('hidden');
      });
    });
  });
}

function computeTopNucleoKeys(nucleoStats, topN) {
  return new Set(
    Array.from(nucleoStats.entries())
      .sort((a, b) => (b[1].satellites.length) - (a[1].satellites.length))
      .slice(0, topN)
      .map(([k]) => k)
  );
}

// ===== Buffers =====
function drawBuffersInBatches(nucleos, nucleoStats, start, batchSize, done) {
  const overlayText = document.querySelector('#loadingOverlay .loading-text');

  const end = Math.min(start + batchSize, nucleos.length);
  for (let i = start; i < end; i++) {
    const n = nucleos[i];
    const k = keyLatLng(n.lat, n.lng);
    const st = nucleoStats.get(k);
    const satCount = st ? st.satellites.length : 0;
    
    // Opacidad y grosor proporcional a la cantidad de satelites
    const opacity = Math.min(0.15 + (satCount * 0.02), 0.5);
    const fillOpacity = Math.min(0.04 + (satCount * 0.008), 0.15);
    const weight = Math.min(1 + (satCount * 0.1), 3);
    
    L.circle([n.lat, n.lng], {
      radius: BUFFER_RADIUS_M,
      fillColor: '#58a6ff',
      color: '#58a6ff',
      weight: weight,
      opacity: opacity,
      fillOpacity: fillOpacity,
      interactive: false,
      renderer: canvasRenderer
    }).addTo(layers.buffers);
  }

  if (overlayText) overlayText.textContent = 'Dibujando buffers... ' + end.toLocaleString() + ' / ' + nucleos.length.toLocaleString();

  if (end < nucleos.length) requestAnimationFrame(() => drawBuffersInBatches(nucleos, nucleoStats, end, batchSize, done));
  else done();
}

// ===== Satélites + conexiones (canvas) =====
function assignSatellitesInBatches(satellites, grid, nucleoStats, start, batchSize, done) {
  const overlayText = document.querySelector('#loadingOverlay .loading-text');

  if (assignSatellitesInBatches._covered == null) assignSatellitesInBatches._covered = 0;

  const end = Math.min(start + batchSize, satellites.length);

  for (let i = start; i < end; i++) {
    const s = satellites[i];

    const { bestNucleo, bestDist } = findClosestNucleo(s, grid);

    const covered = !!bestNucleo;
    const color = covered ? '#58a6ff' : '#6e7681';

    L.circleMarker([s.lat, s.lng], {
      radius: 5,
      fillColor: color,
      color: '#ffffff',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.8,
      renderer: canvasRenderer
    }).bindPopup(createSatellitePopup(s, bestNucleo, bestDist))
      .addTo(layers.satellites);

    if (covered) {
      assignSatellitesInBatches._covered++;

      const k = keyLatLng(bestNucleo.lat, bestNucleo.lng);
      const st = nucleoStats.get(k);
      if (st) {
        st.satellites.push(s);
        st.totalStudents += (s.students || 0);
      }

      // Conexión estática (canvas) para todos
      L.polyline([[bestNucleo.lat, bestNucleo.lng], [s.lat, s.lng]], {
        color: '#58a6ff',
        weight: 1.5,
        opacity: 0.25,
        dashArray: '5, 10',
        interactive: false,
        renderer: canvasRenderer
      }).addTo(layers.connections);
    }
  }

  if (overlayText) overlayText.textContent = `Asignando satélites… ${end.toLocaleString()} / ${satellites.length.toLocaleString()}`;

  if (end < satellites.length) {
    requestAnimationFrame(() => assignSatellitesInBatches(satellites, grid, nucleoStats, end, batchSize, done));
  } else {
    const satellitesCovered = assignSatellitesInBatches._covered || 0;
    assignSatellitesInBatches._covered = null;
    done(satellitesCovered);
  }
}

// ===== Núcleos =====
function drawNucleosInBatches(nucleos, nucleoStats, topKeys, start, batchSize, done) {
  const overlayText = document.querySelector('#loadingOverlay .loading-text');

  const end = Math.min(start + batchSize, nucleos.length);

  for (let i = start; i < end; i++) {
    const n = nucleos[i];
    const k = keyLatLng(n.lat, n.lng);
    const st = nucleoStats.get(k);

    const satCount = st ? st.satellites.length : 0;

    // Radio base + énfasis proporcional (sin exagerar)
    const radius = 7 + Math.min(10, Math.sqrt(satCount + 1));

    L.circleMarker([n.lat, n.lng], {
      radius,
      fillColor: '#f85149',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
      renderer: canvasRenderer
    }).bindPopup(createNucleoPopup(n, st))
      .addTo(layers.nucleos);

    // Halo solo top núcleos (SVG)
    if (topKeys.has(k)) {
      L.circleMarker([n.lat, n.lng], {
        radius: radius + 9,
        color: '#f85149',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0,
        interactive: false,
        renderer: svgRenderer,
        className: 'nucleo-halo'
      }).addTo(layers.nucleoHalo);
    }
  }

  if (overlayText) overlayText.textContent = `Dibujando núcleos… ${end.toLocaleString()} / ${nucleos.length.toLocaleString()}`;

  if (end < nucleos.length) requestAnimationFrame(() => drawNucleosInBatches(nucleos, nucleoStats, topKeys, end, batchSize, done));
  else done();
}

// ===== Overlay animado “tipo redes” =====
function buildAnimatedOverlay(nucleoStats, topKeys) {
  layers.connectionsAnim.clearLayers();

  // Solo conexiones de los núcleos top
  for (const [k, st] of nucleoStats.entries()) {
    if (!topKeys.has(k)) continue;

    const n = st.nucleo;
    // Para no sobrecargar: animar como máximo 220 conexiones por núcleo top
    const maxLines = 220;
    const sats = st.satellites.slice(0, maxLines);

    for (const s of sats) {
      L.polyline([[n.lat, n.lng], [s.lat, s.lng]], {
        color: '#58a6ff',
        weight: 2.2,
        opacity: 0.85,
        interactive: false,
        renderer: svgRenderer,
        className: 'connection-anim'
      }).addTo(layers.connectionsAnim);
    }
  }
}

// ===== Spatial index (grid) =====
function buildGridIndex(nucleos) {
  const grid = new Map();
  for (const n of nucleos) {
    const k = gridKey(n.lat, n.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(n);
  }
  return grid;
}

function findClosestNucleo(satellite, grid) {
  const baseKey = gridKey(satellite.lat, satellite.lng);
  const [gx, gy] = baseKey.split('|').map(Number);

  let bestNucleo = null;
  let bestDist = BUFFER_RADIUS_M;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const k = `${gx + dx}|${gy + dy}`;
      const candidates = grid.get(k);
      if (!candidates) continue;

      for (const n of candidates) {
        const d = calculateDistance(satellite.lat, satellite.lng, n.lat, n.lng);
        if (d <= BUFFER_RADIUS_M && d < bestDist) {
          bestDist = d;
          bestNucleo = n;
        }
      }
    }
  }
  return { bestNucleo, bestDist };
}

function gridKey(lat, lng) {
  const gx = Math.floor(lat / GRID_CELL_DEG);
  const gy = Math.floor(lng / GRID_CELL_DEG);
  return `${gx}|${gy}`;
}

function keyLatLng(lat, lng) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

// ===== Haversine =====
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ===== Popups =====
function createNucleoPopup(nucleo, stats) {
  const totalStudents = stats ? stats.totalStudents : (nucleo.students || 0);
  const satCount = stats ? stats.satellites.length : 0;

  const profNecesarios = Math.ceil(totalStudents / 450);
  const actuales = nucleo.profs || 0;
  const deficit = profNecesarios - actuales;

  return `
    <div class="popup-title">🏛️ Núcleo DECE</div>
    <div class="popup-content">
      <div class="popup-row"><span class="popup-label">Institución:</span> <span class="popup-value">${escapeHTML(nucleo.name)}</span></div>
      <div class="popup-row"><span class="popup-label">Distrito:</span> <span class="popup-value">${escapeHTML(nucleo.dist)}</span></div>
      <div class="popup-row"><span class="popup-label">Satélites conectados:</span> <span class="popup-value" style="color:#58a6ff">${satCount}</span></div>
      <div class="popup-row"><span class="popup-label">Estudiantes totales:</span> <span class="popup-value" style="color:#d29922">${Number(totalStudents).toLocaleString()}</span></div>
      <div class="popup-row"><span class="popup-label">Prof. necesarios:</span> <span class="popup-value">${profNecesarios}</span></div>
      <div class="popup-row"><span class="popup-label">Prof. actuales:</span> <span class="popup-value" style="color:${deficit>0?'#f85149':'#3fb950'}">${actuales}</span></div>
      ${deficit > 0 ? `<div class="popup-row"><span class="popup-label">Déficit:</span> <span class="popup-value" style="color:#f85149">${deficit}</span></div>` : ''}
    </div>
  `;
}

function createSatellitePopup(satellite, nucleo, distance) {
  const km = (distance / 1000).toFixed(2);
  const covered = !!nucleo;

  return `
    <div class="popup-title">📍 Satélite</div>
    <div class="popup-content">
      <div class="popup-row"><span class="popup-label">Institución:</span> <span class="popup-value">${escapeHTML(satellite.name)}</span></div>
      <div class="popup-row"><span class="popup-label">Distrito:</span> <span class="popup-value">${escapeHTML(satellite.dist)}</span></div>
      <div class="popup-row"><span class="popup-label">Estado:</span>
        <span class="popup-value" style="color:${covered?'#3fb950':'#f85149'}">${covered?'✓ Cubierto':'✗ Sin cobertura'}</span>
      </div>
      ${covered ? `
      <div class="popup-row"><span class="popup-label">Núcleo asignado:</span> <span class="popup-value">${escapeHTML(nucleo.name).slice(0,40)}${nucleo.name && nucleo.name.length>40?'…':''}</span></div>
      <div class="popup-row"><span class="popup-label">Distancia:</span> <span class="popup-value">${km} km</span></div>
      ` : ''}
      <div class="popup-row"><span class="popup-label">Estudiantes:</span> <span class="popup-value" style="color:#d29922">${Number(satellite.students||0).toLocaleString()}</span></div>
    </div>
  `;
}

function escapeHTML(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ===== UI: estadísticas + top =====
function updateStatistics(stats) {
  const elN = document.getElementById('totalNucleos');
  const elS = document.getElementById('totalSatellites');
  const elC = document.getElementById('coveragePercent');
  const elT = document.getElementById('totalStudents');
  const elA = document.getElementById('nucleosActivos');

  if (elN) elN.textContent = Number(stats.totalNucleos || 0).toLocaleString();
  if (elS) elS.textContent = Number(stats.totalSatellites || 0).toLocaleString();
  if (elC) elC.textContent = (stats.coveragePercent ?? '0.0') + '%';
  if (elT) elT.textContent = Number(stats.totalStudents || 0).toLocaleString();
  if (elA) elA.textContent = Number(stats.nucleosActivos || 0).toLocaleString();
}

function updateTopNucleos(nucleoStats) {
  const container = document.getElementById('topNucleos');
  if (!container) return;

  const sorted = Array.from(nucleoStats.values())
    .sort((a, b) => (b.satellites?.length || 0) - (a.satellites?.length || 0))
    .slice(0, 10);

  container.innerHTML = sorted.map((s, i) => {
    const profNecesarios = Math.ceil((s.totalStudents || 0) / 450);
    return `
      <div class="top-item" onclick="flyToLocation(${s.nucleo.lat}, ${s.nucleo.lng})">
        <div class="top-item-header">
          <span class="top-rank">#${i + 1}</span>
          <span class="top-name">${escapeHTML(s.nucleo.name)}</span>
          <span class="top-count">${s.satellites.length}</span>
        </div>
        <div class="top-desc">${Number(s.totalStudents||0).toLocaleString()} estudiantes • ${profNecesarios} prof. necesarios</div>
      </div>
    `;
  }).join('');
}

function flyToLocation(lat, lng) {
  map.flyTo([lat, lng], 12, { duration: 1.2 });
}

// ===== Controles =====
function setupControls() {
  const byId = (id) => document.getElementById(id);

  const statsBtn = byId('toggleStats');
  const legendBtn = byId('toggleLegend');

  if (statsBtn) statsBtn.addEventListener('click', () => {
    byId('statsPanel')?.classList.toggle('active');
    byId('legendPanel')?.classList.remove('active');
  });

  if (legendBtn) legendBtn.addEventListener('click', () => {
    byId('legendPanel')?.classList.toggle('active');
    byId('statsPanel')?.classList.remove('active');
  });

  // Conecta los toggles existentes a las capas nuevas también
  bindLayerToggleMulti('toggleBuffers', [layers.buffers]);
  bindLayerToggleMulti('toggleConnections', [layers.connections, layers.connectionsAnim]); // incluye animadas
  bindLayerToggleMulti('toggleNucleos', [layers.nucleos, layers.nucleoHalo]);             // incluye halo
  bindLayerToggleMulti('toggleSatellites', [layers.satellites]);

  setTimeout(() => byId('statsPanel')?.classList.add('active'), 500);
}

function bindLayerToggleMulti(id, layerList) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener('change', (e) => {
    for (const layer of layerList) {
      if (!layer) continue;
      if (e.target.checked) map.addLayer(layer);
      else map.removeLayer(layer);
    }
  });
}