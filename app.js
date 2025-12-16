/*************************************************
 * DECE Coverage Optimizer v2.0
 * Basado en metodología K-means (Lemenkova, 2013)
 * Criterios Modelo de Gestión DECE:
 * - Distancia máxima: 7.5 km
 * - Razón: 1 profesional / 450 estudiantes
 * - Tiempo desplazamiento: ≤ 1 hora
 *************************************************/

const CONFIG = {
  BUFFER_RADIUS_M: 7500,
  PROF_RATIO: 450,
  MAX_TRAVEL_TIME_MIN: 60,
  AVG_SPEED_KMH: 30,
  GRID_CELL_DEG: 0.10,
  CLUSTER_RADIUS: 6000,
  MIN_CLUSTER_SIZE: 2
};

const ECUADOR_CENTER = [-1.831239, -78.183406];

let map;
let allData = { nucleos: [], satellites: [], todas: [] };
let nucleoStats = new Map();
let optimizationData = null;
let viasData = null;

const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup(),
  optimized: L.featureGroup(),
  vias: L.featureGroup(),
  uncovered: L.featureGroup()
};

const canvasRenderer = L.canvas({ padding: 0.5 });

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupControls();
  loadAllData();
});

function initMap() {
  map = L.map('map', {
    center: ECUADOR_CENTER,
    zoom: 7,
    preferCanvas: true,
    renderer: canvasRenderer
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  Object.keys(layers).forEach(k => {
    if (k !== 'vias') layers[k].addTo(map);
  });
}

async function loadAllData() {
  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');
  const subtext = document.getElementById('loadingSubtext');

  try {
    if (overlayText) overlayText.textContent = 'Cargando instituciones...';
    const csvResponse = await fetch('instituciones.csv');
    const csvText = await csvResponse.text();
    parseCSV(csvText);
    if (subtext) subtext.textContent = allData.todas.length + ' registros';

    if (overlayText) overlayText.textContent = 'Cargando red vial...';
    try {
      const viasResponse = await fetch('vias_principales.geojson');
      viasData = await viasResponse.json();
    } catch (e) { console.warn('No vías:', e); }

    try {
      const optResponse = await fetch('optimization_data.json');
      optimizationData = await optResponse.json();
    } catch (e) { console.warn('No optimization data'); }

    if (overlayText) overlayText.textContent = 'Analizando cobertura...';
    processData();
  } catch (err) {
    console.error('Error:', err);
    if (overlayText) overlayText.textContent = 'Error: ' + err.message;
  }
}

function parseCSV(csvText) {
  const cleanedText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const results = Papa.parse(cleanedText, { delimiter: ';', skipEmptyLines: 'greedy' });
  const rows = results.data || [];
  if (rows.length < 2) return;

  const { idx } = resolveColumnIndexes(rows[0]);
  const bounds = L.latLngBounds();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;

    const lat = parseNum(r[idx.lat]);
    const lng = parseNum(r[idx.lng]);
    const cod = parseInt(r[idx.cod]) || 0;

    if (isNaN(lat) || isNaN(lng) || ![1,2,3,4,5].includes(cod)) continue;

    allData.todas.push({
      lat, lng, cod,
      name: r[idx.name] || 'Sin nombre',
      dist: r[idx.dist] || 'N/D',
      zone: r[idx.zone] || 'N/D',
      students: parseNum(r[idx.students]) || 0,
      profs: parseNum(r[idx.profs]) || 0
    });
    bounds.extend([lat, lng]);
  }

  allData.nucleos = allData.todas.filter(d => [3,4,5].includes(d.cod));
  allData.satellites = allData.todas.filter(d => d.cod === 2);
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.05), { animate: false });
}

function resolveColumnIndexes(headerRow) {
  const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const header = headerRow.map(norm);
  const findOne = candidates => {
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
      profs: findOne(['po_profdece', 'profdece'])
    }
  };
}

function parseNum(val) {
  if (val == null || val === '') return NaN;
  return parseFloat(String(val).replace(',', '.').trim());
}

function processData() {
  Object.values(layers).forEach(l => l.clearLayers());
  nucleoStats.clear();

  const { nucleos, satellites } = allData;
  if (!nucleos.length && !satellites.length) {
    document.getElementById('loadingOverlay')?.classList.add('hidden');
    return;
  }

  const grid = buildGridIndex(nucleos);

  for (const n of nucleos) {
    const k = keyLatLng(n.lat, n.lng);
    nucleoStats.set(k, { nucleo: n, satellites: [], totalStudents: n.students || 0 });
  }

  let satCovered = 0;
  const uncoveredSats = [];

  for (const s of satellites) {
    const { bestNucleo, bestDist } = findBestNucleo(s, grid);
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
    } else {
      uncoveredSats.push(s);
    }
  }

  const nucleosActivos = Array.from(nucleoStats.entries())
    .filter(([k, st]) => st.satellites.length > 0)
    .map(([k, st]) => st.nucleo);

  drawBuffers(nucleosActivos);
  drawSatellites(satellites);
  drawNucleos(nucleos);
  drawConnections(satellites);

  if (optimizationData?.suggestions) {
    showOptimizationSuggestions(optimizationData.suggestions);
  }

  const totalStudents = allData.todas.reduce((s, d) => s + (d.students || 0), 0);
  const profActuales = allData.todas.reduce((s, d) => s + (d.profs || 0), 0);
  const profNecesarios = Math.ceil(totalStudents / CONFIG.PROF_RATIO);
  const coveragePercent = satellites.length > 0 ? ((satCovered / satellites.length) * 100).toFixed(1) : '0.0';
  const avgTravelTime = calculateAvgTravelTime(satellites.filter(s => s.covered));

  updateStatistics({
    totalNucleos: nucleos.length,
    totalSatellites: satellites.length,
    nucleosActivos: nucleosActivos.length,
    sinCobertura: uncoveredSats.length,
    coveragePercent,
    totalStudents,
    profActuales,
    profNecesarios,
    avgTravelTime
  });

  updateTopNucleos(nucleoStats);
  document.getElementById('loadingOverlay')?.classList.add('hidden');
  setTimeout(() => document.getElementById('statsPanel')?.classList.add('active'), 300);
}

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
  return Math.floor(lat / CONFIG.GRID_CELL_DEG) + '|' + Math.floor(lng / CONFIG.GRID_CELL_DEG);
}

function keyLatLng(lat, lng) {
  return lat.toFixed(6) + ',' + lng.toFixed(6);
}

function findBestNucleo(satellite, grid) {
  const parts = gridKey(satellite.lat, satellite.lng).split('|').map(Number);
  const gx = parts[0], gy = parts[1];
  let bestNucleo = null;
  let bestDist = CONFIG.BUFFER_RADIUS_M;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const candidates = grid.get((gx + dx) + '|' + (gy + dy));
      if (!candidates) continue;
      for (const n of candidates) {
        const d = haversineDistance(satellite.lat, satellite.lng, n.lat, n.lng);
        if (d <= CONFIG.BUFFER_RADIUS_M && d < bestDist) {
          bestDist = d;
          bestNucleo = n;
        }
      }
    }
  }
  return { bestNucleo, bestDist };
}

function calculateAvgTravelTime(covered) {
  if (!covered.length) return 0;
  const total = covered.reduce((sum, s) => sum + (s.distance / 1000 / CONFIG.AVG_SPEED_KMH * 60), 0);
  return (total / covered.length).toFixed(1);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function drawBuffers(nucleosActivos) {
  for (const n of nucleosActivos) {
    const k = keyLatLng(n.lat, n.lng);
    const st = nucleoStats.get(k);
    const count = st ? st.satellites.length : 0;
    L.circle([n.lat, n.lng], {
      radius: CONFIG.BUFFER_RADIUS_M,
      fillColor: '#58a6ff',
      color: '#58a6ff',
      weight: 1.5,
      opacity: Math.min(0.15 + count * 0.02, 0.4),
      fillOpacity: Math.min(0.03 + count * 0.008, 0.12),
      interactive: false,
      renderer: canvasRenderer
    }).addTo(layers.buffers);
  }
}

function drawSatellites(satellites) {
  for (const s of satellites) {
    const color = s.covered ? '#58a6ff' : '#f85149';
    const layer = s.covered ? layers.satellites : layers.uncovered;
    L.circleMarker([s.lat, s.lng], {
      radius: s.covered ? 5 : 6,
      fillColor: color,
      color: s.covered ? '#fff' : '#ff6b6b',
      weight: s.covered ? 1.5 : 2,
      fillOpacity: 0.85,
      renderer: canvasRenderer
    }).bindPopup(createSatellitePopup(s)).addTo(layer);
  }
  layers.uncovered.addTo(map);
}

function drawNucleos(nucleos) {
  for (const n of nucleos) {
    const k = keyLatLng(n.lat, n.lng);
    const st = nucleoStats.get(k);
    const count = st ? st.satellites.length : 0;
    const active = count > 0;
    L.circleMarker([n.lat, n.lng], {
      radius: 5 + Math.min(8, Math.sqrt(count + 1) * 1.5),
      fillColor: active ? '#f85149' : '#6e7681',
      color: '#fff',
      weight: 2,
      fillOpacity: active ? 0.9 : 0.5,
      renderer: canvasRenderer
    }).bindPopup(createNucleoPopup(n, st)).addTo(layers.nucleos);
  }
}

function drawConnections(satellites) {
  for (const s of satellites) {
    if (s.covered && s.assignedNucleo) {
      const n = s.assignedNucleo;
      L.polyline([[n.lat, n.lng], [s.lat, s.lng]], {
        color: '#58a6ff',
        weight: 1,
        opacity: 0.2,
        dashArray: '4, 8',
        interactive: false,
        renderer: canvasRenderer
      }).addTo(layers.connections);
    }
  }
}

function showOptimizationSuggestions(suggestions) {
  layers.optimized.clearLayers();
  for (const sug of suggestions) {
    L.circleMarker([sug.lat, sug.lng], {
      radius: 14,
      fillColor: '#a371f7',
      color: '#fff',
      weight: 3,
      fillOpacity: 0.9
    }).bindPopup(
      '<div class="popup-title">💡 Ubicación Sugerida</div>' +
      '<div class="popup-row"><span class="popup-label">Satélites:</span><span class="popup-value" style="color:#a371f7">' + sug.satellites_count + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value">' + sug.students.toLocaleString() + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Prof. necesarios:</span><span class="popup-value">' + sug.profs_needed + '</span></div>' +
      (sug.nearest_existing ? '<div class="popup-row"><span class="popup-label">Reubicar desde:</span><span class="popup-value">' + escapeHTML(sug.nearest_existing).slice(0,25) + '...</span></div>' : '')
    ).addTo(layers.optimized);

    L.circle([sug.lat, sug.lng], {
      radius: CONFIG.BUFFER_RADIUS_M,
      fillColor: '#a371f7',
      color: '#a371f7',
      weight: 2,
      opacity: 0.4,
      fillOpacity: 0.06,
      dashArray: '8, 8',
      interactive: false
    }).addTo(layers.optimized);
  }
}

function optimizarNucleos() {
  const overlay = document.getElementById('loadingOverlay');
  const overlayText = overlay?.querySelector('.loading-text');
  overlay?.classList.remove('hidden');
  if (overlayText) overlayText.textContent = 'Ejecutando algoritmo K-means...';

  setTimeout(() => {
    if (optimizationData?.suggestions) {
      showOptimizationSuggestions(optimizationData.suggestions);
      const total = optimizationData.suggestions.reduce((s, sug) => s + sug.satellites_count, 0);
      setTimeout(() => {
        overlay?.classList.add('hidden');
        alert('📊 Optimización K-means\n\nCobertura: ' + optimizationData.summary.coverage_pct + '%\nSin cobertura: ' + optimizationData.summary.uncovered + '\nSugerencias: ' + optimizationData.suggestions.length + '\nPotencial: +' + total + ' satélites\n\nMarcados en MORADO en el mapa.');
      }, 500);
    } else {
      overlay?.classList.add('hidden');
      alert('No hay datos de optimización disponibles');
    }
  }, 100);
}

function createNucleoPopup(nucleo, stats) {
  const total = stats?.totalStudents || nucleo.students || 0;
  const count = stats?.satellites.length || 0;
  const need = Math.ceil(total / CONFIG.PROF_RATIO);
  const actual = nucleo.profs || 0;
  const deficit = need - actual;
  let avgTime = 'N/A';
  if (stats?.satellites.length > 0) {
    const t = stats.satellites.reduce((s, sat) => s + (sat.distance / 1000 / CONFIG.AVG_SPEED_KMH * 60), 0);
    avgTime = (t / stats.satellites.length).toFixed(0) + ' min';
  }
  return '<div class="popup-title">🏛️ Núcleo DECE</div>' +
    '<div class="popup-row"><span class="popup-label">Institución:</span><span class="popup-value">' + escapeHTML(nucleo.name).slice(0,40) + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Distrito:</span><span class="popup-value">' + escapeHTML(nucleo.dist) + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Satélites:</span><span class="popup-value" style="color:#58a6ff">' + count + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value" style="color:#d29922">' + total.toLocaleString() + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Prof. necesarios:</span><span class="popup-value">' + need + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Prof. actuales:</span><span class="popup-value">' + actual + '</span></div>' +
    (deficit > 0 ? '<div class="popup-row"><span class="popup-label">Déficit:</span><span class="popup-value" style="color:#f85149">-' + deficit + '</span></div>' : '') +
    '<div class="popup-row"><span class="popup-label">Tiempo desplaz.:</span><span class="popup-value">' + avgTime + '</span></div>';
}

function createSatellitePopup(sat) {
  const km = sat.distance ? (sat.distance / 1000).toFixed(2) : 'N/A';
  const timeMin = sat.distance ? ((sat.distance / 1000) / CONFIG.AVG_SPEED_KMH * 60).toFixed(0) : 'N/A';
  const timeColor = timeMin !== 'N/A' && parseFloat(timeMin) > CONFIG.MAX_TRAVEL_TIME_MIN ? '#f85149' : '#3fb950';
  return '<div class="popup-title">📍 Satélite</div>' +
    '<div class="popup-row"><span class="popup-label">Institución:</span><span class="popup-value">' + escapeHTML(sat.name).slice(0,40) + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Distrito:</span><span class="popup-value">' + escapeHTML(sat.dist) + '</span></div>' +
    '<div class="popup-row"><span class="popup-label">Estado:</span><span class="popup-value" style="color:' + (sat.covered ? '#3fb950' : '#f85149') + '">' + (sat.covered ? '✓ Cubierto' : '✗ Sin cobertura') + '</span></div>' +
    (sat.covered ? '<div class="popup-row"><span class="popup-label">Distancia:</span><span class="popup-value">' + km + ' km</span></div><div class="popup-row"><span class="popup-label">Tiempo:</span><span class="popup-value" style="color:' + timeColor + '">' + timeMin + ' min</span></div>' : '') +
    '<div class="popup-row"><span class="popup-label">Estudiantes:</span><span class="popup-value" style="color:#d29922">' + (sat.students || 0).toLocaleString() + '</span></div>';
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

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
  const deficit = stats.profNecesarios - stats.profActuales;
  const deficitEl = document.getElementById('profDeficit');
  if (deficitEl) {
    deficitEl.textContent = deficit > 0 ? '-' + deficit.toLocaleString() : '+' + Math.abs(deficit).toLocaleString();
    deficitEl.style.color = deficit > 0 ? '#f85149' : '#3fb950';
  }
  const fill = document.getElementById('coverageFill');
  if (fill) fill.style.width = stats.coveragePercent + '%';
  const avgTimeEl = document.getElementById('avgTravelTime');
  if (avgTimeEl && stats.avgTravelTime) avgTimeEl.textContent = stats.avgTravelTime + ' min';
}

function updateTopNucleos(nucleoStats) {
  const container = document.getElementById('topNucleos');
  if (!container) return;
  const sorted = Array.from(nucleoStats.values()).sort((a, b) => b.satellites.length - a.satellites.length).slice(0, 10);
  container.innerHTML = sorted.map((s, i) => {
    const profNec = Math.ceil((s.totalStudents || 0) / CONFIG.PROF_RATIO);
    const avgTime = s.satellites.length > 0 ? (s.satellites.reduce((sum, sat) => sum + (sat.distance || 0), 0) / s.satellites.length / 1000 / CONFIG.AVG_SPEED_KMH * 60).toFixed(0) : 0;
    return '<div class="top-item" onclick="flyTo(' + s.nucleo.lat + ',' + s.nucleo.lng + ')">' +
      '<div class="top-item-header"><span class="top-rank">#' + (i + 1) + '</span><span class="top-name">' + escapeHTML(s.nucleo.name) + '</span><span class="top-count">' + s.satellites.length + '</span></div>' +
      '<div class="top-desc">' + s.totalStudents.toLocaleString() + ' est. • ' + profNec + ' prof. • ~' + avgTime + ' min</div></div>';
  }).join('');
}

function flyTo(lat, lng) { map.flyTo([lat, lng], 13, { duration: 1 }); }

function setupControls() {
  const byId = id => document.getElementById(id);
  byId('toggleStats')?.addEventListener('click', () => { byId('statsPanel')?.classList.toggle('active'); byId('legendPanel')?.classList.remove('active'); });
  byId('toggleLegend')?.addEventListener('click', () => { byId('legendPanel')?.classList.toggle('active'); byId('statsPanel')?.classList.remove('active'); });
  byId('btnOptimizar')?.addEventListener('click', optimizarNucleos);
  bindLayerToggle('toggleNucleos', layers.nucleos);
  bindLayerToggle('toggleSatellites', layers.satellites);
  bindLayerToggle('toggleBuffers', layers.buffers);
  bindLayerToggle('toggleConnections', layers.connections);
  bindLayerToggle('toggleUncovered', layers.uncovered);
  bindLayerToggle('toggleSuggestions', layers.optimized);
  byId('toggleViasPrincipales')?.addEventListener('change', e => {
    if (e.target.checked && viasData) {
      const vl = L.geoJSON(viasData, {
        style: f => {
          const hw = f.properties?.highway || '';
          const p = ['primary', 'trunk', 'motorway'].includes(hw);
          return { color: p ? '#f0883e' : '#d29922', weight: p ? 2 : 1.2, opacity: p ? 0.7 : 0.4 };
        },
        interactive: false
      });
      layers.vias.addLayer(vl);
      map.addLayer(layers.vias);
    } else {
      map.removeLayer(layers.vias);
      layers.vias.clearLayers();
    }
  });
}

function bindLayerToggle(id, layer) {
  document.getElementById(id)?.addEventListener('change', e => {
    if (e.target.checked) map.addLayer(layer);
    else map.removeLayer(layer);
  });
}
