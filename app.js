/*************************************************
 * DECE Coverage App (Leaflet + CSV) - v4.3
 * Objetivo: dejar SOLO buffers “necesarios” cubriendo 95–98% de satélites
 *
 * ✅ CSV robusto:
 *   - delimiter ';' (y fallback automático si viene con ',')
 *   - soporta coma decimal (ej: -2,893852)
 *   - quita BOM
 * ✅ Rendimiento:
 *   - preferCanvas + indexación por grilla
 * ✅ Limpieza:
 *   - Set Cover Greedy (policy='cover') para seleccionar núcleos mínimos
 * ✅ “Tipo redes”:
 *   - animación ligera de conexiones (dashOffset)
 *   - resalta/pulsa top núcleos seleccionados (sin matar rendimiento)
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

// Grid (grados). 0.10° ≈ 11 km aprox.
const GRID_CELL_DEG = 0.10;

// ===== Política “buffers necesarios” =====
const BUFFER_SELECTION_POLICY = "cover"; // 'cover' | 'used' | 'top'
const TARGET_COVERAGE = 0.97;            // 0.95–0.98 recomendado
const MAX_BUFFERS = 220;                 // 180–300
const MIN_SATS_PER_BUFFER = 3;           // 2–6 (sube = más limpio)
const TOP_N_BUFFERS = 120;               // solo si policy='top'

// ===== “Tipo redes” (animación ligera) =====
const ENABLE_NETWORK_ANIMATION = true;
const ENABLE_NUCLEO_PULSE = false;
const MAX_CONNECTIONS_FOR_ANIM = 6000;   // si tienes más, se apaga para no freír el navegador

// ===== Estimación de tiempo =====
const ASSUMED_SPEED_KMH = 30; // velocidad “promedio” transporte regular (ajústalo)

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
  loadCSV();
});

/* =========================
   MAPA
========================= */
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

/* =========================
   CSV
========================= */
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

  // Watchdog: si se queda “pensando” demasiado, damos una pista útil.
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

  // 1) Descarga con fetch (más confiable que Papa.download en algunos casos)
  // 2) Parse con Papa en worker (sin bloquear UI)
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

      // Quita BOM si viene con UTF-8 BOM
      let text = rawText.replace(/^\uFEFF/, "");

      // Adivina delimitador mirando la primera línea
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

  // ===== Handler común =====
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


// Normaliza número con coma decimal / miles
function parseNumberES(v) {
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;

  // quita espacios y caracteres raros comunes
  s = s.replace(/\s+/g, "");

  // 1.234,56 -> 1234.56
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    // -2,893 -> -2.893
    s = s.replace(",", ".");
  }

  return parseFloat(s);
}

// Detecta columnas por encabezado
function resolveColumnIndexes(headerRow) {
  const norm = (s) => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
  const header = headerRow.map(norm);

  const findOne = (candidates) => {
    for (let j = 0; j < candidates.length; j++) {
      const c = candidates[j];
      const i = header.indexOf(norm(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const idx = {
    lat: findOne(["latitud", "lat", "latitude"]),
    lng: findOne(["longitud", "lon", "lng", "longitude"]),
    cod: findOne(["cod_gdece", "cod gdece", "codgdece"]),
    name: findOne(["nombre_institución", "nombre_institucion", "nombre", "nombre ie"]),
    dist: findOne(["distrito", "dirección distrital", "direccion distrital"]),
    zone: findOne(["zona"]),
    students: findOne(["total estudiantes", "total_estudiantes", "total_estudiante", "matricula", "estudiantes"]),
    profs: findOne(["po_profdece", "profdece", "profesionales", "profesional", "num_prof"])
  };

  const issues = [];
  if (idx.lat < 0) issues.push("No encuentro columna LATITUD.");
  if (idx.lng < 0) issues.push("No encuentro columna LONGITUD.");
  if (idx.cod < 0) issues.push("No encuentro columna COD_GDECE.");

  return { idx, issues };
}

function mapRowsToData(rows, idx) {
  const data = [];
  const bounds = L.latLngBounds();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;

    const lat = parseNumberES(r[idx.lat]);
    const lng = parseNumberES(r[idx.lng]);
    const cod = Number(String(r[idx.cod] ?? "").trim());

    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    if ([2, 3, 4, 5].indexOf(cod) === -1) continue; // ignora cod=1

    const item = {
      lat,
      lng,
      cod,
      name: idx.name >= 0 ? (r[idx.name] || "IE sin nombre") : "IE sin nombre",
      dist: idx.dist >= 0 ? (r[idx.dist] || "N/D") : "N/D",
      zone: idx.zone >= 0 ? (r[idx.zone] || "N/D") : "N/D",
      students: idx.students >= 0 ? (parseNumberES(r[idx.students]) || 0) : 0,
      profs: idx.profs >= 0 ? (parseNumberES(r[idx.profs]) || 0) : 0
    };

    data.push(item);
    bounds.extend([lat, lng]);
  }

  return { data, bounds };
}

/* =========================
   CORE
========================= */
function processData(data) {
  stopAnimations();
  Object.values(layers).forEach(l => l.clearLayers());

  const overlay = document.getElementById("loadingOverlay");
  const overlayText = overlay ? overlay.querySelector(".loading-text") : null;

  const nucleos = data.filter(d => d.cod === 3 || d.cod === 4 || d.cod === 5);
  const satellites = data.filter(d => d.cod === 2);

  if (!nucleos.length && !satellites.length) {
    if (overlayText) overlayText.textContent = "Sin datos para dibujar (COD_GDECE 2/3/4/5).";
    return;
  }

  if (overlayText) overlayText.textContent = "Indexando núcleos…";
  const nucleoGrid = buildGridIndex(nucleos);

  if (overlayText) overlayText.textContent = "Calculando coberturas…";
  const satCandidates = new Array(satellites.length);

  // Stats por núcleo (closest assignment, útil para “Top 10” y métricas)
  const nucleoStats = nucleos.map(n => ({
    nucleo: n,
    satIdx: [],
    totalStudents: n.students || 0
  }));

  // Para promedio de distancia/tiempo (solo por closest dentro de buffer, luego filtramos por selected)
  const closestForSat = new Array(satellites.length).fill(null);

  for (let si = 0; si < satellites.length; si++) {
    const s = satellites[si];
    const candidates = findNucleosWithin(s, nucleos, nucleoGrid);
    satCandidates[si] = candidates;

    // closest (sin selección todavía)
    let bestNi = -1;
    let bestDist = BUFFER_RADIUS_M + 1;
    for (let c = 0; c < candidates.length; c++) {
      if (candidates[c].dist < bestDist) {
        bestDist = candidates[c].dist;
        bestNi = candidates[c].ni;
      }
    }
    if (bestNi >= 0) {
      nucleoStats[bestNi].satIdx.push(si);
      nucleoStats[bestNi].totalStudents += (s.students || 0);
      closestForSat[si] = { ni: bestNi, dist: bestDist };
    }
  }

  if (overlayText) overlayText.textContent = "Seleccionando buffers necesarios (cover)…";
  const selected = selectNeededNucleos({
    policy: BUFFER_SELECTION_POLICY,
    nucleos,
    satellites,
    nucleoStats,
    satCandidates
  });

  if (overlayText) overlayText.textContent = "Dibujando mapa (limpio)…";
  const drawRefs = {
    nucleoLayers: new Map(), // ni -> circleMarker layer (para pulso)
    connectionLayers: []     // para animación
  };

  drawAllSatellites(satellites, selected, satCandidates);
  drawSelectedNucleos(nucleos, nucleoStats, selected, drawRefs);
  const connectionCount = drawSelectedBuffersAndConnections(nucleos, satellites, satCandidates, selected, drawRefs);

  const coveredBySelected = countCoveredBySelected(satCandidates, selected);
  const uncovered = satellites.length - coveredBySelected;
  const coveragePercent = satellites.length
    ? ((coveredBySelected / satellites.length) * 100).toFixed(1)
    : "0.0";

  // Profesionales: totales “ideales” según estudiantes totales
  const totalStudents = data.reduce((sum, d) => sum + (d.students || 0), 0);
  const profNecesarios = Math.ceil(totalStudents / 450);
  const profActuales = nucleos.reduce((sum, n) => sum + (n.profs || 0), 0);
  const profDeficit = profNecesarios - profActuales;

  // Tiempo promedio estimado SOLO de satélites cubiertos por selected
  const avgMin = estimateAvgTravelMinutes(nucleos, satellites, satCandidates, selected);

  updateStatistics({
    totalNucleos: nucleos.length,
    nucleosActivos: selected.size,
    totalSatellites: satellites.length,
    sinCobertura: uncovered,
    coveragePercent,
    totalStudents,
    profActuales,
    profNecesarios,
    profDeficit,
    avgTravelMin: avgMin
  });

  updateTopNucleosFromStats(nucleoStats);

  // Animaciones “tipo redes” (seguras)
  if (ENABLE_NETWORK_ANIMATION && connectionCount > 0 && connectionCount <= MAX_CONNECTIONS_FOR_ANIM) {
    startConnectionAnimation(drawRefs.connectionLayers);
  }
  if (ENABLE_NUCLEO_PULSE) {
    startNucleoPulse(drawRefs.nucleoLayers, nucleos, nucleoStats, selected);
  }

  if (overlay) overlay.classList.add("hidden");
}

/* =========================
   SELECCIÓN “BUFFERS NECESARIOS”
========================= */
function selectNeededNucleos(args) {
  const policy = args.policy;
  const nucleos = args.nucleos;
  const satellites = args.satellites;
  const nucleoStats = args.nucleoStats;
  const satCandidates = args.satCandidates;

  if (!satellites.length || !nucleos.length) return new Set();

  if (policy === "top") {
    const order = nucleoStats
      .map((st, i) => ({ i, k: st.satIdx.length }))
      .sort((a, b) => b.k - a.k)
      .slice(0, TOP_N_BUFFERS)
      .filter(x => x.k >= MIN_SATS_PER_BUFFER)
      .map(x => x.i);
    return new Set(order);
  }

  if (policy === "used") {
    const used = [];
    for (let i = 0; i < nucleoStats.length; i++) {
      if (nucleoStats[i].satIdx.length >= MIN_SATS_PER_BUFFER) used.push(i);
    }
    if (used.length > MAX_BUFFERS) {
      used.sort((a, b) => nucleoStats[b].satIdx.length - nucleoStats[a].satIdx.length);
      return new Set(used.slice(0, MAX_BUFFERS));
    }
    return new Set(used);
  }

  // policy === "cover" (set cover greedy)
  const total = satellites.length;
  const target = Math.ceil(total * TARGET_COVERAGE);

  const uncovered = new Array(total).fill(true);
  let uncoveredCount = total;

  // coverSets[ni] = [si,...] satélites dentro del buffer del núcleo ni
  const coverSets = new Array(nucleos.length);
  for (let ni = 0; ni < nucleos.length; ni++) coverSets[ni] = [];

  for (let si = 0; si < total; si++) {
    const cand = satCandidates[si] || [];
    for (let c = 0; c < cand.length; c++) {
      coverSets[cand[c].ni].push(si);
    }
  }

  const selected = new Set();

  while ((total - uncoveredCount) < target && selected.size < MAX_BUFFERS) {
    let bestNi = -1;
    let bestGain = 0;

    for (let ni = 0; ni < coverSets.length; ni++) {
      if (selected.has(ni)) continue;
      if (coverSets[ni].length < MIN_SATS_PER_BUFFER) continue;

      let gain = 0;
      const arr = coverSets[ni];
      for (let k = 0; k < arr.length; k++) {
        if (uncovered[arr[k]]) gain++;
      }

      if (gain > bestGain) {
        bestGain = gain;
        bestNi = ni;
      }
    }

    if (bestNi < 0 || bestGain === 0) break;

    selected.add(bestNi);

    const arr = coverSets[bestNi];
    for (let k = 0; k < arr.length; k++) {
      const si = arr[k];
      if (uncovered[si]) {
        uncovered[si] = false;
        uncoveredCount--;
      }
    }
  }

  return selected;
}

function countCoveredBySelected(satCandidates, selected) {
  let covered = 0;
  for (let si = 0; si < satCandidates.length; si++) {
    const cand = satCandidates[si] || [];
    let ok = false;
    for (let c = 0; c < cand.length; c++) {
      if (selected.has(cand[c].ni)) {
        ok = true;
        break;
      }
    }
    if (ok) covered++;
  }
  return covered;
}

/* =========================
   DIBUJO
========================= */
function drawAllSatellites(satellites, selected, satCandidates) {
  for (let si = 0; si < satellites.length; si++) {
    const s = satellites[si];

    let covered = false;
    let bestDist = BUFFER_RADIUS_M + 1;

    const cand = satCandidates[si] || [];
    for (let c = 0; c < cand.length; c++) {
      if (selected.has(cand[c].ni) && cand[c].dist < bestDist) {
        bestDist = cand[c].dist;
        covered = true;
      }
    }

    const color = covered ? "#58a6ff" : "#6e7681";

    L.circleMarker([s.lat, s.lng], {
      radius: 5,
      fillColor: color,
      color: "#ffffff",
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.85,
      renderer: canvasRenderer
    })
      .bindPopup(createSatellitePopup(s, covered ? bestDist : null))
      .addTo(layers.satellites);
  }
}

function drawSelectedNucleos(nucleos, nucleoStats, selected, drawRefs) {
  for (let ni = 0; ni < nucleos.length; ni++) {
    const n = nucleos[ni];
    const st = nucleoStats[ni];

    const isSelected = selected.has(ni);
    const radius = isSelected ? 8 : 6;

    const layer = L.circleMarker([n.lat, n.lng], {
      radius,
      fillColor: isSelected ? "#f85149" : "#444c56",
      color: "#ffffff",
      weight: isSelected ? 2 : 1,
      opacity: 1,
      fillOpacity: isSelected ? 0.95 : 0.6,
      renderer: canvasRenderer
    })
      .bindPopup(createNucleoPopup(n, st, isSelected))
      .addTo(layers.nucleos);

    drawRefs.nucleoLayers.set(ni, layer);
  }
}

function drawSelectedBuffersAndConnections(nucleos, satellites, satCandidates, selected, drawRefs) {
  // Buffers solo seleccionados
  selected.forEach((ni) => {
    const n = nucleos[ni];
    L.circle([n.lat, n.lng], {
      radius: BUFFER_RADIUS_M,
      fillColor: "#58a6ff",
      color: "#58a6ff",
      weight: 1,
      opacity: 0.25,
      fillOpacity: 0.05,
      interactive: false,
      renderer: canvasRenderer
    }).addTo(layers.buffers);
  });

  // Conexiones: cada satélite al núcleo seleccionado más cercano (si existe)
  let connectionCount = 0;

  for (let si = 0; si < satellites.length; si++) {
    const s = satellites[si];
    const cand = satCandidates[si] || [];

    let bestNi = -1;
    let bestDist = BUFFER_RADIUS_M + 1;

    for (let c = 0; c < cand.length; c++) {
      if (selected.has(cand[c].ni) && cand[c].dist < bestDist) {
        bestDist = cand[c].dist;
        bestNi = cand[c].ni;
      }
    }

    if (bestNi >= 0) {
      const n = nucleos[bestNi];

      const line = L.polyline([[n.lat, n.lng], [s.lat, s.lng]], {
        color: "#58a6ff",
        weight: 1.5,
        opacity: 0.25,
        dashArray: "6, 10",
        dashOffset: "0",
        interactive: false,
        renderer: canvasRenderer
      }).addTo(layers.connections);

      drawRefs.connectionLayers.push(line);
      connectionCount++;
    }
  }

  return connectionCount;
}

/* =========================
   INDEXACIÓN GRILLA
========================= */
function buildGridIndex(nucleos) {
  const grid = new Map();
  for (let i = 0; i < nucleos.length; i++) {
    const n = nucleos[i];
    const k = gridKey(n.lat, n.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  return grid;
}

function findNucleosWithin(satellite, nucleos, grid) {
  const baseKey = gridKey(satellite.lat, satellite.lng);
  const [gxStr, gyStr] = baseKey.split("|");
  const gx = Number(gxStr);
  const gy = Number(gyStr);

  const out = [];

  // vecinos de celda (3x3)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const k = (gx + dx) + "|" + (gy + dy);
      const idxList = grid.get(k);
      if (!idxList) continue;

      for (let t = 0; t < idxList.length; t++) {
        const ni = idxList[t];
        const n = nucleos[ni];
        const d = calculateDistance(satellite.lat, satellite.lng, n.lat, n.lng);
        if (d <= BUFFER_RADIUS_M) out.push({ ni, dist: d });
      }
    }
  }

  return out;
}

function gridKey(lat, lng) {
  const gx = Math.floor(lat / GRID_CELL_DEG);
  const gy = Math.floor(lng / GRID_CELL_DEG);
  return gx + "|" + gy;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dphi = (lat2 - lat1) * Math.PI / 180;
  const dlambda = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dphi / 2) * Math.sin(dphi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dlambda / 2) * Math.sin(dlambda / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* =========================
   POPUPS
========================= */
function createNucleoPopup(n, st, isSelected) {
  const satCount = st ? st.satIdx.length : 0;
  const totalStudents = st ? st.totalStudents : (n.students || 0);

  const profNecesarios = Math.ceil((totalStudents || 0) / 450);
  const actuales = n.profs || 0;
  const deficit = profNecesarios - actuales;

  return (
    '<div class="popup-title">🏛️ Núcleo DECE</div>' +
    '<div class="popup-content">' +
      '<div class="popup-row"><span class="popup-label">Institución:</span> <span class="popup-value">' + escapeHTML(n.name) + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Distrito:</span> <span class="popup-value">' + escapeHTML(n.dist) + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Seleccionado:</span> <span class="popup-value" style="color:' + (isSelected ? "#3fb950" : "#6e7681") + '">' + (isSelected ? "Sí (buffer visible)" : "No (buffer oculto)") + '</span></div>' +
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

/* =========================
   MÉTRICAS UI
========================= */
function updateStatistics(stats) {
  setText("totalNucleos", stats.totalNucleos);
  setText("totalSatellites", stats.totalSatellites);
  setText("coveragePercent", (stats.coveragePercent ?? "0.0") + "%");
  setText("totalStudents", stats.totalStudents);

  // extra IDs que tienes en tu HTML (si existen)
  setText("nucleosActivos", stats.nucleosActivos);
  setText("sinCobertura", stats.sinCobertura);

  setText("profActuales", stats.profActuales);
  setText("profNecesarios", stats.profNecesarios);
  setText("profDeficit", stats.profDeficit);

  // barra de cobertura (si existe)
  const fill = document.getElementById("coverageFill");
  if (fill) fill.style.width = Math.max(0, Math.min(100, Number(stats.coveragePercent || 0))) + "%";

  // tiempo promedio (si existe)
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

/* =========================
   TIEMPO PROMEDIO (solo satélites cubiertos por selected)
========================= */
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

/* =========================
   CONTROLES
========================= */
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

/* =========================
   ANIMACIONES “TIPO REDES”
========================= */
function startConnectionAnimation(lines) {
  let offset = 0;
  _connectionAnimTimer = setInterval(() => {
    offset = (offset + 1) % 1000;
    for (let i = 0; i < lines.length; i++) {
      lines[i].setStyle({ dashOffset: String(offset) });
    }
  }, 80);
}

function startNucleoPulse(nucleoLayers, nucleos, nucleoStats, selected) {
  // pulso solo en top 8 núcleos seleccionados por absorción (closest)
  const top = nucleoStats
    .map((st, ni) => ({ ni, k: st.satIdx.length }))
    .filter(x => selected.has(x.ni))
    .sort((a, b) => b.k - a.k)
    .slice(0, 8)
    .map(x => x.ni);

  if (!top.length) return;

  _pulsePhase = 0;
  _pulseTimer = setInterval(() => {
    _pulsePhase += 0.25;

    for (let i = 0; i < top.length; i++) {
      const ni = top[i];
      const layer = nucleoLayers.get(ni);
      if (!layer) continue;

      // pulso suave: sube/baja radio un poco
      const base = layer.options.radius || 10;
      const delta = 1.2 * (1 + Math.sin(_pulsePhase + i)) * 0.5; // 0..1.2
      layer.setStyle({ opacity: 1, fillOpacity: 0.95 });
      layer.setRadius(Math.max(6, base + delta));
    }
  }, 120);
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
