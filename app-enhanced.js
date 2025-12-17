/*************************************************
 * DECE Coverage App - v5.0 ENHANCED
 * ✅ Buffers visibles y ARRASTRABLES
 * ✅ Modo edición con botón lápiz
 * ✅ Métricas en tiempo real al arrastrar/click
 * ✅ Sin afectar lógica original
 *************************************************/

let map;

const layers = {
  nucleos: L.featureGroup(),
  satellites: L.featureGroup(),
  buffers: L.featureGroup(),
  connections: L.featureGroup()
};

// ===== Parámetros base =====
const BUFFER_RADIUS_M = 7500;
const ECUADOR_CENTER = [-1.831239, -78.183406];
const canvasRenderer = L.canvas({ padding: 0.5 });
const GRID_CELL_DEG = 0.10;

// ===== Política "buffers necesarios" =====
const BUFFER_SELECTION_POLICY = "cover";
const TARGET_COVERAGE = 0.97;
const MAX_BUFFERS = 220;
const MIN_SATS_PER_BUFFER = 3;
const TOP_N_BUFFERS = 120;

// ===== "Tipo redes" =====
const ENABLE_NETWORK_ANIMATION = true;
const ENABLE_NUCLEO_PULSE = false;
const MAX_CONNECTIONS_FOR_ANIM = 6000;
const ASSUMED_SPEED_KMH = 30;

// ===== NUEVO: Estado de edición =====
let editMode = false;
let editableBuffers = new Map();
let globalData = null;
let metricsPanel = null;

// Estado interno
let _initialized = false;
let _connectionAnimTimer = null;
let _pulseTimer = null;
let _pulsePhase = 0;

document.addEventListener("DOMContentLoaded", () => {
  if (_initialized) return;
  _initialized = true;

  initMap();
  setupControls();
  setupEditControls();
  loadCSV();
});

function initMap() {
  map = L.map("map", {
    center: ECUADOR_CENTER,
    zoom: 7,
    zoomControl: true,
    preferCanvas: true,
    renderer: canvasRenderer
  });

  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19
  });

  const satelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "© Esri", maxZoom: 19 }
  );

  osmLayer.addTo(map);

  L.control.layers({
    "OpenStreetMap": osmLayer,
    "Satélite": satelliteLayer
  }).addTo(map);

  Object.values(layers).forEach(layer => layer.addTo(map));
}

function setupEditControls() {
  const editBtn = document.getElementById("btnEditBuffers");
  if (!editBtn) {
    console.warn("Botón de edición no encontrado");
    return;
  }

  editBtn.addEventListener("click", toggleEditMode);
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById("btnEditBuffers");
  
  if (editMode) {
    btn.classList.add("active");
    enableBufferEditing();
    showNotification("🖊️ Modo edición activado. Arrastra los buffers para ajustar posición.", "info");
  } else {
    btn.classList.remove("active");
    disableBufferEditing();
    closeMetricsPanel();
    showNotification("Modo edición desactivado.", "info");
  }
}

function enableBufferEditing() {
  editableBuffers.forEach((data, ni) => {
    const circle = data.circle;
    if (!circle) return;
    
    circle.setStyle({ 
      color: '#f0883e',
      fillColor: '#f0883e',
      weight: 3,
      fillOpacity: 0.2,
      className: 'editable-buffer'
    });
    
    makeBufferDraggable(circle, ni, data);
    
    circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (editMode && !data.isDragging) {
        showBufferMetrics(ni, data);
      }
    });
  });
}

function disableBufferEditing() {
  editableBuffers.forEach((data, ni) => {
    const circle = data.circle;
    if (!circle) return;
    
    circle.setStyle({ 
      color: '#58a6ff',
      fillColor: '#58a6ff',
      weight: 2,
      fillOpacity: 0.08
    });
    
    circle.off('mousedown');
    circle.off('click');
    circle.dragging?.disable();
  });
}

function makeBufferDraggable(circle, ni, data) {
  let isDragging = false;
  let startPos = null;
  
  circle.on('mousedown', function(e) {
    if (!editMode) return;
    
    isDragging = true;
    data.isDragging = true;
    startPos = circle.getLatLng();
    
    map.dragging.disable();
    circle.setStyle({ weight: 4, fillOpacity: 0.3 });
    
    const onMouseMove = function(e) {
      if (!isDragging) return;
      
      const newLatLng = e.latlng;
      circle.setLatLng(newLatLng);
      
      updateBufferMetricsLive(ni, newLatLng);
    };
    
    const onMouseUp = function(e) {
      if (!isDragging) return;
      
      isDragging = false;
      data.isDragging = false;
      
      map.dragging.enable();
      circle.setStyle({ weight: 3, fillOpacity: 0.2 });
      
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      
      const finalPos = circle.getLatLng();
      data.currentPos = finalPos;
      
      showNotification(`Buffer reposicionado: ${finalPos.lat.toFixed(5)}, ${finalPos.lng.toFixed(5)}`, "success");
      
      updateBufferMetricsLive(ni, finalPos);
    };
    
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
  });
}

function showBufferMetrics(ni, data) {
  const circle = data.circle;
  const nucleo = data.nucleo;
  const currentPos = circle.getLatLng();
  
  const metrics = calculateBufferMetrics(currentPos, BUFFER_RADIUS_M);
  
  if (!metricsPanel) {
    metricsPanel = document.createElement('div');
    metricsPanel.id = 'bufferMetricsPanel';
    metricsPanel.className = 'buffer-metrics-panel';
    document.body.appendChild(metricsPanel);
  }
  
  metricsPanel.innerHTML = `
    <div class="metrics-header">
      <h3>📊 Métricas del Buffer</h3>
      <button class="close-btn" onclick="closeMetricsPanel()">×</button>
    </div>
    <div class="metrics-content">
      <div class="metrics-nucleo">
        <strong>${escapeHTML(nucleo.name)}</strong>
        <div class="coords-info">
          <span>Original: ${nucleo.lat.toFixed(5)}, ${nucleo.lng.toFixed(5)}</span>
          <span>Actual: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)}</span>
        </div>
      </div>
      
      <div class="metrics-stats">
        <div class="metric-item highlight">
          <div class="metric-icon">🎯</div>
          <div class="metric-info">
            <div class="metric-value">${metrics.iesCount}</div>
            <div class="metric-label">IEs Cubiertas</div>
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-icon">👥</div>
          <div class="metric-info">
            <div class="metric-value">${metrics.totalStudents.toLocaleString()}</div>
            <div class="metric-label">Estudiantes</div>
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-icon">👨‍🏫</div>
          <div class="metric-info">
            <div class="metric-value">${metrics.profNecesarios}</div>
            <div class="metric-label">Prof. Necesarios</div>
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-icon">📏</div>
          <div class="metric-info">
            <div class="metric-value">${(BUFFER_RADIUS_M/1000).toFixed(1)} km</div>
            <div class="metric-label">Radio Buffer</div>
          </div>
        </div>
      </div>
      
      ${metrics.iesList.length > 0 ? `
        <div class="metrics-list">
          <h4>Instituciones Educativas Cubiertas:</h4>
          <div class="ie-list">
            ${metrics.iesList.map(ie => `
              <div class="ie-item">
                <div class="ie-name">${escapeHTML(ie.name)}</div>
                <div class="ie-details">
                  <span class="ie-dist">${(ie.dist/1000).toFixed(2)} km</span>
                  <span class="ie-students">${ie.students} est.</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '<div class="no-ies">⚠️ No hay IEs dentro de este buffer</div>'}
      
      <div class="metrics-actions">
        <button class="btn-reset" onclick="resetBufferPosition(${ni})">
          ↺ Restaurar Posición Original
        </button>
      </div>
    </div>
  `;
  
  metricsPanel.classList.add('show');
}

function updateBufferMetricsLive(ni, position) {
  if (!metricsPanel || !metricsPanel.classList.contains('show')) return;
  
  const metrics = calculateBufferMetrics(position, BUFFER_RADIUS_M);
  
  const statsContainer = metricsPanel.querySelector('.metrics-stats');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="metric-item highlight">
        <div class="metric-icon">🎯</div>
        <div class="metric-info">
          <div class="metric-value">${metrics.iesCount}</div>
          <div class="metric-label">IEs Cubiertas</div>
        </div>
      </div>
      
      <div class="metric-item">
        <div class="metric-icon">👥</div>
        <div class="metric-info">
          <div class="metric-value">${metrics.totalStudents.toLocaleString()}</div>
          <div class="metric-label">Estudiantes</div>
        </div>
      </div>
      
      <div class="metric-item">
        <div class="metric-icon">👨‍🏫</div>
        <div class="metric-info">
          <div class="metric-value">${metrics.profNecesarios}</div>
          <div class="metric-label">Prof. Necesarios</div>
        </div>
      </div>
      
      <div class="metric-item">
        <div class="metric-icon">📏</div>
        <div class="metric-info">
          <div class="metric-value">${(BUFFER_RADIUS_M/1000).toFixed(1)} km</div>
          <div class="metric-label">Radio Buffer</div>
        </div>
      </div>
    `;
  }
  
  const coordsInfo = metricsPanel.querySelector('.coords-info');
  if (coordsInfo) {
    const spans = coordsInfo.querySelectorAll('span');
    if (spans[1]) {
      spans[1].textContent = `Actual: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    }
  }
  
  const listContainer = metricsPanel.querySelector('.metrics-list');
  if (listContainer) {
    listContainer.innerHTML = metrics.iesList.length > 0 ? `
      <h4>Instituciones Educativas Cubiertas:</h4>
      <div class="ie-list">
        ${metrics.iesList.map(ie => `
          <div class="ie-item">
            <div class="ie-name">${escapeHTML(ie.name)}</div>
            <div class="ie-details">
              <span class="ie-dist">${(ie.dist/1000).toFixed(2)} km</span>
              <span class="ie-students">${ie.students} est.</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<div class="no-ies">⚠️ No hay IEs dentro de este buffer</div>';
  }
}

function calculateBufferMetrics(position, radius) {
  if (!globalData) return { iesCount: 0, totalStudents: 0, profNecesarios: 0, iesList: [] };
  
  const satellites = globalData.satellites;
  let iesCount = 0;
  let totalStudents = 0;
  let iesList = [];
  
  satellites.forEach(sat => {
    const dist = haversineMeters(position.lat, position.lng, sat.lat, sat.lng);
    if (dist <= radius) {
      iesCount++;
      const students = sat.students || 0;
      totalStudents += students;
      iesList.push({
        name: sat.name || 'Sin nombre',
        dist: dist,
        students: students
      });
    }
  });
  
  iesList.sort((a, b) => a.dist - b.dist);
  
  const profNecesarios = Math.ceil(totalStudents / 450);
  
  return {
    iesCount,
    totalStudents,
    profNecesarios,
    iesList
  };
}

function closeMetricsPanel() {
  if (metricsPanel) {
    metricsPanel.classList.remove('show');
  }
}

window.closeMetricsPanel = closeMetricsPanel;

function resetBufferPosition(ni) {
  const data = editableBuffers.get(ni);
  if (!data || !data.circle) return;
  
  const originalPos = data.originalPos || { lat: data.nucleo.lat, lng: data.nucleo.lng };
  data.circle.setLatLng([originalPos.lat, originalPos.lng]);
  data.currentPos = originalPos;
  
  showNotification("✓ Posición restaurada al núcleo original", "success");
  updateBufferMetricsLive(ni, originalPos);
}

window.resetBufferPosition = resetBufferPosition;

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      ${type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '⚠'} ${message}
    </div>
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3500);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function loadCSV() {
  const overlay = document.getElementById("loadingOverlay");
  const overlayText = overlay ? overlay.querySelector(".loading-text") : null;
  const overlaySub = document.getElementById("loadingSubtext");

  if (!window.Papa) {
    if (overlayText) overlayText.textContent = "Falta PapaParse. Revisa index.html.";
    console.error("PapaParse no está cargado");
    return;
  }

  const url = "DECE_CRUCE_X_Y_NUC_SAT.csv";

  let watchdog = setTimeout(() => {
    if (overlayText && /CSV/i.test(overlayText.textContent)) {
      overlayText.textContent = "Tardando más de lo normal… (abre Console: F12 para ver errores/404)";
      if (overlaySub) overlaySub.textContent = `Verifica que exista: ${url}`;
    }
  }, 15000);

  const setMsg = (main, sub = "") => {
    if (overlayText) overlayText.textContent = main;
    if (overlaySub) overlaySub.textContent = sub;
  };

  setMsg("Verificando CSV…", url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  fetch(url, { cache: "no-store", signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} al descargar CSV`);
      setMsg("Descargando CSV…", "Leyendo contenido");
      return res.text();
    })
    .then((rawText) => {
      clearTimeout(timeout);

      let text = rawText.replace(/^\uFEFF/, "");

      const firstLine = text.split(/\r?\n/, 1)[0] || "";
      const semi = (firstLine.match(/;/g) || []).length;
      const comma = (firstLine.match(/,/g) || []).length;
      const delim = semi >= comma ? ";" : ",";

      setMsg("Parseando CSV…", `Delimiter detectado: ${delim}`);

      Papa.parse(text, {
        delimiter: delim,
        skipEmptyLines: "greedy",
        worker: true,
        complete: (results) => {
          clearTimeout(watchdog);
          try {
            handleParsed(results);
          } catch (e) {
            console.error(e);
            setMsg("Error procesando CSV (JS).", "Revisa Console (F12) para el detalle.");
          }
        },
        error: (err) => {
          clearTimeout(watchdog);
          console.error(err);
          setMsg("Error leyendo CSV (PapaParse).", "Revisa Console (F12) para el detalle.");
        }
      });
    })
    .catch((err) => {
      clearTimeout(timeout);
      clearTimeout(watchdog);
      console.error(err);

      const hint =
        err && String(err).includes("AbortError")
          ? "Se agotó el tiempo de descarga (45s)."
          : "No se pudo descargar el CSV.";

      setMsg("Error cargando CSV.", `${hint} Verifica nombre/ruta: ${url}`);
    });

  function handleParsed(results) {
    const rows = results.data || [];
    if (!rows.length) {
      setMsg("CSV vacío o no se pudo leer.", "");
      return;
    }

    setMsg("Preparando columnas…", "Detectando LAT/LON/COD_GDECE");

    const resolved = resolveColumnIndexes(rows[0] || []);
    const idx = resolved.idx;
    if (resolved.issues.length) console.warn("Column issues:", resolved.issues);

    const mapped = mapRowsToData(rows, idx);
    const data = mapped.data;
    const bounds = mapped.bounds;

    if (!data.length) {
      setMsg("No hay registros válidos.", "Revisa LAT/LON y COD_GDECE (2/3/4/5).");
      return;
    }

    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.10), { animate: false });
    }

    processData(data);
  }
}

function parseNumberES(v) {
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;

  s = s.replace(/\s+/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }

  return parseFloat(s);
}

function resolveColumnIndexes(headerRow) {
  const norm = (s) => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
  const header = headerRow.map(norm);

  const findOne = (candidates) => {
    for (let c of candidates) {
      const idx = header.findIndex(h => h.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const lat = findOne(["lat", "latitud", "y"]);
  const lon = findOne(["lon", "longitud", "lng", "x"]);
  const code = findOne(["cod_gdece", "codgdece", "codigo"]);
  const name = findOne(["nombre_ie", "institucion", "ie"]);
  const dist = findOne(["distrito"]);
  const students = findOne(["estudiantes", "alumnos", "student"]);

  const issues = [];
  if (lat < 0) issues.push("No se encontró columna LAT/LATITUD/Y");
  if (lon < 0) issues.push("No se encontró columna LON/LONGITUD/X");
  if (code < 0) issues.push("No se encontró columna COD_GDECE");

  return {
    idx: { lat, lon, code, name, dist, students },
    issues
  };
}

function mapRowsToData(rows, idx) {
  const data = [];
  const bounds = L.latLngBounds();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;

    const lat = parseNumberES(r[idx.lat]);
    const lng = parseNumberES(r[idx.lon]);
    const codeRaw = r[idx.code];

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (codeRaw === null || codeRaw === undefined) continue;

    const codeVal = parseInt(String(codeRaw).trim(), 10);
    if (![2, 3, 4, 5].includes(codeVal)) continue;

    const name = idx.name >= 0 ? String(r[idx.name] || "").trim() : "";
    const dist = idx.dist >= 0 ? String(r[idx.dist] || "").trim() : "";
    const students = idx.students >= 0 ? parseNumberES(r[idx.students]) : 0;

    data.push({ lat, lng, code: codeVal, name, dist, students });
    bounds.extend([lat, lng]);
  }

  return { data, bounds };
}

function processData(data) {
  layers.nucleos.clearLayers();
  layers.satellites.clearLayers();
  layers.buffers.clearLayers();
  layers.connections.clearLayers();
  editableBuffers.clear();
  stopAnimations();

  const nucleos = data.filter(d => [3, 4, 5].includes(d.code));
  const satellites = data.filter(d => d.code === 2);

  globalData = { nucleos, satellites };

  if (!nucleos.length || !satellites.length) {
    hideLoadingOverlay();
    console.warn("No hay núcleos o satélites suficientes");
    return;
  }

  const spatialIndex = buildSpatialIndex(satellites);
  const satCandidates = findCandidates(nucleos, satellites, spatialIndex);

  let selected, policy;
  if (BUFFER_SELECTION_POLICY === "cover") {
    const result = setCoverGreedy(nucleos, satellites, satCandidates);
    selected = result.selected;
    policy = "Set Cover Greedy";
  } else if (BUFFER_SELECTION_POLICY === "used") {
    selected = new Set();
    for (let si = 0; si < satCandidates.length; si++) {
      const cands = satCandidates[si] || [];
      if (cands.length > 0) selected.add(cands[0].ni);
    }
    policy = "Used (closest)";
  } else {
    const nucleoStats = buildNucleoStats(nucleos, satCandidates);
    const sorted = nucleoStats
      .map((st, ni) => ({ ni, k: st.satIdx.length }))
      .sort((a, b) => b.k - a.k)
      .slice(0, TOP_N_BUFFERS);
    selected = new Set(sorted.map(x => x.ni));
    policy = `Top ${TOP_N_BUFFERS}`;
  }

  const nucleoStats = buildNucleoStats(nucleos, satCandidates);

  drawNucleos(nucleos, selected);
  drawBuffersEditable(nucleos, selected, nucleoStats);
  drawSatellites(satellites, satCandidates, selected);
  drawConnections(nucleos, satellites, satCandidates, selected);

  const stats = computeStatistics(nucleos, satellites, satCandidates, selected, nucleoStats);
  updateStatistics(stats);
  updateTopNucleosFromStats(nucleoStats);

  hideLoadingOverlay();
  console.log(`✓ Cargado: ${nucleos.length} núcleos, ${satellites.length} satélites. Policy: ${policy}`);
}

function buildSpatialIndex(satellites) {
  const grid = new Map();
  for (let i = 0; i < satellites.length; i++) {
    const s = satellites[i];
    const cellLat = Math.floor(s.lat / GRID_CELL_DEG);
    const cellLng = Math.floor(s.lng / GRID_CELL_DEG);
    const key = `${cellLat},${cellLng}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  return grid;
}

function findCandidates(nucleos, satellites, spatialIndex) {
  const satCandidates = Array.from({ length: satellites.length }, () => []);

  for (let ni = 0; ni < nucleos.length; ni++) {
    const n = nucleos[ni];
    const cellLat = Math.floor(n.lat / GRID_CELL_DEG);
    const cellLng = Math.floor(n.lng / GRID_CELL_DEG);

    for (let dLat = -2; dLat <= 2; dLat++) {
      for (let dLng = -2; dLng <= 2; dLng++) {
        const key = `${cellLat + dLat},${cellLng + dLng}`;
        const indices = spatialIndex.get(key) || [];
        for (let i = 0; i < indices.length; i++) {
          const si = indices[i];
          const s = satellites[si];
          const dist = haversineMeters(n.lat, n.lng, s.lat, s.lng);
          if (dist <= BUFFER_RADIUS_M) {
            satCandidates[si].push({ ni, dist });
          }
        }
      }
    }
  }

  for (let si = 0; si < satCandidates.length; si++) {
    satCandidates[si].sort((a, b) => a.dist - b.dist);
  }

  return satCandidates;
}

function setCoverGreedy(nucleos, satellites, satCandidates) {
  const uncovered = new Set();
  for (let si = 0; si < satellites.length; si++) {
    if (satCandidates[si] && satCandidates[si].length > 0) {
      uncovered.add(si);
    }
  }

  const selected = new Set();
  const nucleoStats = buildNucleoStats(nucleos, satCandidates);

  while (uncovered.size > 0 && selected.size < MAX_BUFFERS) {
    const coverage = (uncovered.size / satellites.length);
    if (coverage <= (1 - TARGET_COVERAGE)) break;

    let bestNi = -1;
    let bestCount = 0;

    for (let ni = 0; ni < nucleos.length; ni++) {
      if (selected.has(ni)) continue;

      const st = nucleoStats[ni];
      if (st.satIdx.length < MIN_SATS_PER_BUFFER) continue;

      let localCount = 0;
      for (let i = 0; i < st.satIdx.length; i++) {
        if (uncovered.has(st.satIdx[i])) localCount++;
      }

      if (localCount > bestCount) {
        bestCount = localCount;
        bestNi = ni;
      }
    }

    if (bestNi < 0) break;

    selected.add(bestNi);
    const st = nucleoStats[bestNi];
    for (let i = 0; i < st.satIdx.length; i++) {
      uncovered.delete(st.satIdx[i]);
    }
  }

  return { selected, uncovered };
}

function buildNucleoStats(nucleos, satCandidates) {
  const stats = nucleos.map(n => ({ satIdx: [], totalStudents: 0, nucleo: n }));

  for (let si = 0; si < satCandidates.length; si++) {
    const cands = satCandidates[si] || [];
    if (!cands.length) continue;

    const ni = cands[0].ni;
    stats[ni].satIdx.push(si);
  }

  for (let ni = 0; ni < stats.length; ni++) {
    const st = stats[ni];
    for (let i = 0; i < st.satIdx.length; i++) {
      const si = st.satIdx[i];
      st.totalStudents += globalData.satellites[si].students || 0;
    }
  }

  return stats;
}

function drawNucleos(nucleos, selected) {
  nucleos.forEach((n, ni) => {
    const isSelected = selected.has(ni);
    
    const marker = L.circleMarker([n.lat, n.lng], {
      radius: isSelected ? 8 : 6,
      fillColor: isSelected ? '#3fb950' : '#58a6ff',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: isSelected ? 0.9 : 0.7,
      renderer: canvasRenderer
    });

    marker.bindPopup(createNucleoPopup(n, 0, 0, null));
    marker.addTo(layers.nucleos);
  });
}

function drawBuffersEditable(nucleos, selected, nucleoStats) {
  selected.forEach(ni => {
    const n = nucleos[ni];
    const st = nucleoStats[ni];

    const circle = L.circle([n.lat, n.lng], {
      radius: BUFFER_RADIUS_M,
      color: '#58a6ff',
      fillColor: '#58a6ff',
      weight: 2,
      opacity: 0.6,
      fillOpacity: 0.08,
      renderer: canvasRenderer
    });

    circle.addTo(layers.buffers);

    editableBuffers.set(ni, {
      circle: circle,
      nucleo: n,
      stats: st,
      originalPos: { lat: n.lat, lng: n.lng },
      currentPos: { lat: n.lat, lng: n.lng },
      isDragging: false
    });
  });
}

function drawSatellites(satellites, satCandidates, selected) {
  satellites.forEach((s, si) => {
    const cands = satCandidates[si] || [];
    let bestDist = BUFFER_RADIUS_M + 1;
    let isCovered = false;

    for (let c = 0; c < cands.length; c++) {
      if (selected.has(cands[c].ni) && cands[c].dist < bestDist) {
        bestDist = cands[c].dist;
        isCovered = true;
      }
    }

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

function drawConnections(nucleos, satellites, satCandidates, selected) {
  const lines = [];

  for (let si = 0; si < satCandidates.length; si++) {
    const cands = satCandidates[si] || [];
    if (!cands.length) continue;

    let bestNi = -1;
    let bestDist = BUFFER_RADIUS_M + 1;

    for (let c = 0; c < cands.length; c++) {
      if (selected.has(cands[c].ni) && cands[c].dist < bestDist) {
        bestDist = cands[c].dist;
        bestNi = cands[c].ni;
      }
    }

    if (bestNi < 0) continue;

    const s = satellites[si];
    const n = nucleos[bestNi];

    const line = L.polyline(
      [[s.lat, s.lng], [n.lat, n.lng]],
      {
        color: '#58a6ff',
        weight: 1,
        opacity: 0.3,
        dashArray: '5,5',
        renderer: canvasRenderer
      }
    );

    line.addTo(layers.connections);
    lines.push(line);
  }

  if (ENABLE_NETWORK_ANIMATION && lines.length <= MAX_CONNECTIONS_FOR_ANIM) {
    startConnectionAnimation(lines);
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.style.opacity = "0";
    setTimeout(() => { overlay.style.display = "none"; }, 500);
  }
}

function createNucleoPopup(n, satCount, totalStudents, stats) {
  const profNecesarios = Math.ceil(totalStudents / 450);
  const actuales = n.students ? Math.ceil(n.students / 450) : 0;
  const deficit = Math.max(0, profNecesarios - actuales);

  return (
    '<div class="popup-title">🏛️ Núcleo DECE</div>' +
    '<div class="popup-content">' +
      '<div class="popup-row"><span class="popup-label">Institución:</span> <span class="popup-value">' + escapeHTML(n.name) + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Distrito:</span> <span class="popup-value">' + escapeHTML(n.dist) + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Satélites (closest):</span> <span class="popup-value" style="color:#58a6ff">' + satCount + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Estudiantes totales:</span> <span class="popup-value" style="color:#d29922">' + Number(totalStudents || 0).toLocaleString() + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Prof. necesarios:</span> <span class="popup-value">' + profNecesarios + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Prof. actuales:</span> <span class="popup-value" style="color:' + (deficit > 0 ? "#f85149" : "#3fb950") + '">' + actuales + '</span></div>' +
      (deficit > 0 ? '<div class="popup-row"><span class="popup-label">Déficit:</span> <span class="popup-value" style="color:#f85149">' + deficit + '</span></div>' : '') +
    '</div>'
  );
}

function createSatellitePopup(s, distMetersOrNull) {
  const covered = distMetersOrNull !== null;
  const km = covered ? (distMetersOrNull / 1000).toFixed(2) : "-";
  const min = covered ? ((distMetersOrNull / 1000) / ASSUMED_SPEED_KMH * 60).toFixed(0) : "-";

  return (
    '<div class="popup-title">📍 Satélite</div>' +
    '<div class="popup-content">' +
      '<div class="popup-row"><span class="popup-label">Institución:</span> <span class="popup-value">' + escapeHTML(s.name) + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Distrito:</span> <span class="popup-value">' + escapeHTML(s.dist) + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Estado:</span> <span class="popup-value" style="color:' + (covered ? "#3fb950" : "#f85149") + '">' + (covered ? "✓ Cubierto" : "✗ Sin cobertura") + '</span></div>' +
      (covered
        ? '<div class="popup-row"><span class="popup-label">Distancia:</span> <span class="popup-value">' + km + ' km</span></div>' +
          '<div class="popup-row"><span class="popup-label">Tiempo est.:</span> <span class="popup-value">' + min + ' min</span></div>'
        : ''
      ) +
      '<div class="popup-row"><span class="popup-label">Estudiantes:</span> <span class="popup-value" style="color:#d29922">' + Number(s.students || 0).toLocaleString() + '</span></div>' +
    '</div>'
  );
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateStatistics(stats) {
  setText("totalNucleos", stats.totalNucleos);
  setText("totalSatellites", stats.totalSatellites);
  setText("coveragePercent", (stats.coveragePercent ?? "0.0") + "%");
  setText("totalStudents", stats.totalStudents);

  setText("nucleosActivos", stats.nucleosActivos);
  setText("sinCobertura", stats.sinCobertura);

  setText("profActuales", stats.profActuales);
  setText("profNecesarios", stats.profNecesarios);
  setText("profDeficit", stats.profDeficit);

  const fill = document.getElementById("coverageFill");
  if (fill) fill.style.width = Math.max(0, Math.min(100, Number(stats.coveragePercent || 0))) + "%";

  const avg = document.getElementById("avgTravelTime");
  if (avg) {
    if (Number.isFinite(stats.avgTravelMin)) {
      avg.textContent = `${stats.avgTravelMin.toFixed(0)} min`;
    } else {
      avg.textContent = "-";
    }
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === null || value === undefined || Number.isNaN(value)) {
    el.textContent = "-";
    return;
  }
  if (typeof value === "number") el.textContent = value.toLocaleString();
  else el.textContent = String(value);
}

function updateTopNucleosFromStats(nucleoStats) {
  const container = document.getElementById("topNucleos");
  if (!container) return;

  const sorted = nucleoStats
    .map((st, i) => ({ st, i }))
    .sort((a, b) => b.st.satIdx.length - a.st.satIdx.length)
    .slice(0, 10);

  container.innerHTML = sorted.map((x, idx) => {
    const st = x.st;
    const n = st.nucleo;
    const profNecesarios = Math.ceil((st.totalStudents || 0) / 450);

    return (
      '<div class="top-item" onclick="flyToLocation(' + n.lat + ',' + n.lng + ')">' +
        '<div class="top-item-header">' +
          '<span class="top-rank">#' + (idx + 1) + '</span>' +
          '<span class="top-name">' + escapeHTML(n.name) + '</span>' +
          '<span class="top-count">' + st.satIdx.length + '</span>' +
        '</div>' +
        '<div class="top-desc">' + Number(st.totalStudents || 0).toLocaleString() + ' estudiantes • ' + profNecesarios + ' prof. necesarios</div>' +
      '</div>'
    );
  }).join("");
}

function flyToLocation(lat, lng) {
  map.flyTo([lat, lng], 12, { duration: 1.2 });
}

function computeStatistics(nucleos, satellites, satCandidates, selected, nucleoStats) {
  let covered = 0;
  let totalStudents = 0;

  for (let si = 0; si < satellites.length; si++) {
    const cands = satCandidates[si] || [];
    let isCovered = false;
    for (let c = 0; c < cands.length; c++) {
      if (selected.has(cands[c].ni)) {
        isCovered = true;
        break;
      }
    }
    if (isCovered) {
      covered++;
      totalStudents += satellites[si].students || 0;
    }
  }

  const coveragePercent = satellites.length > 0 ? ((covered / satellites.length) * 100).toFixed(1) : "0.0";
  const profNecesarios = Math.ceil(totalStudents / 450);

  const avgTravelMin = estimateAvgTravelMinutes(nucleos, satellites, satCandidates, selected);

  return {
    totalNucleos: nucleos.length,
    totalSatellites: satellites.length,
    coveragePercent: coveragePercent,
    totalStudents: totalStudents,
    nucleosActivos: selected.size,
    sinCobertura: satellites.length - covered,
    profActuales: 0,
    profNecesarios: profNecesarios,
    profDeficit: profNecesarios,
    avgTravelMin: avgTravelMin
  };
}

function estimateAvgTravelMinutes(nucleos, satellites, satCandidates, selected) {
  let sumMin = 0;
  let count = 0;

  for (let si = 0; si < satellites.length; si++) {
    const cand = satCandidates[si] || [];
    let bestDist = BUFFER_RADIUS_M + 1;

    for (let c = 0; c < cand.length; c++) {
      if (selected.has(cand[c].ni) && cand[c].dist < bestDist) {
        bestDist = cand[c].dist;
      }
    }

    if (bestDist <= BUFFER_RADIUS_M) {
      const km = bestDist / 1000;
      const minutes = (km / ASSUMED_SPEED_KMH) * 60;
      sumMin += minutes;
      count++;
    }
  }

  if (!count) return NaN;
  return sumMin / count;
}

function setupControls() {
  const byId = (id) => document.getElementById(id);

  const statsBtn = byId("toggleStats");
  const legendBtn = byId("toggleLegend");

  if (statsBtn) {
    statsBtn.addEventListener("click", () => {
      const sp = byId("statsPanel");
      const lp = byId("legendPanel");
      if (sp) sp.classList.toggle("active");
      if (lp) lp.classList.remove("active");
    });
  }

  if (legendBtn) {
    legendBtn.addEventListener("click", () => {
      const lp = byId("legendPanel");
      const sp = byId("statsPanel");
      if (lp) lp.classList.toggle("active");
      if (sp) sp.classList.remove("active");
    });
  }

  bindLayerToggle("toggleBuffers", layers.buffers);
  bindLayerToggle("toggleConnections", layers.connections);
  bindLayerToggle("toggleNucleos", layers.nucleos);
  bindLayerToggle("toggleSatellites", layers.satellites);

  setTimeout(() => {
    const sp = byId("statsPanel");
    if (sp) sp.classList.add("active");
  }, 500);
}

function bindLayerToggle(id, layer) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("change", (e) => {
    if (e.target.checked) map.addLayer(layer);
    else map.removeLayer(layer);
  });
}

function startConnectionAnimation(lines) {
  let offset = 0;
  _connectionAnimTimer = setInterval(() => {
    offset = (offset + 1) % 1000;
    for (let i = 0; i < lines.length; i++) {
      lines[i].setStyle({ dashOffset: String(offset) });
    }
  }, 80);
}

function stopAnimations() {
  if (_connectionAnimTimer) {
    clearInterval(_connectionAnimTimer);
    _connectionAnimTimer = null;
  }
  if (_pulseTimer) {
    clearInterval(_pulseTimer);
    _pulseTimer = null;
  }
}
