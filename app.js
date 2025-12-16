/*************************************************
 * VARIABLES GLOBALES
 *************************************************/
let map;

let layers = {
    nucleos: L.featureGroup(),
    satellites: L.featureGroup(),
    buffers: L.featureGroup(),
    connections: L.featureGroup()
};

const BUFFER_RADIUS_M = 7500; // 7.5 km
const ECUADOR_CENTER = [-1.831239, -78.183406];

// Aproximación para prefiltrar por grados (acelera el "núcleo más cercano")
const DEG_LAT_PER_M = 1 / 111320; // ~ grados por metro en latitud

/*************************************************
 * INICIALIZACIÓN
 *************************************************/
document.addEventListener('DOMContentLoaded', init);

function init() {
    initMap();
    loadCSVData();
    setupControls();
}

/*************************************************
 * Inicializar Mapa
 *************************************************/
function initMap() {
    map = L.map('map', {
        center: ECUADOR_CENTER,
        zoom: 7,
        zoomControl: true,
        preferCanvas: true
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 19
    });

    osmLayer.addTo(map);

    L.control.layers({
        'OpenStreetMap': osmLayer,
        'Satélite': satelliteLayer
    }).addTo(map);

    Object.values(layers).forEach(layer => layer.addTo(map));
}

/*************************************************
 * CARGA CSV (robusta)
 *************************************************/
function loadCSVData() {
    const overlayText = document.querySelector('#loadingOverlay .loading-text');

    if (!window.Papa) {
        overlayText.textContent = 'Falta PapaParse. Revisa index.html (script de PapaParse).';
        console.error('PapaParse no está cargado. Agrega papaparse.min.js antes de app.js');
        return;
    }

    overlayText.textContent = 'Cargando CSV...';

    Papa.parse("DECE_CRUCE_X_Y_NUC_SAT.csv", {
        download: true,
        skipEmptyLines: true,
        worker: true,            // evita congelar UI con CSV grande
        complete: (results) => {
            // Si el CSV viene con ; y Papa lo tomó como 1 columna, reintenta
            if (isLikelyBadDelimiter(results.data)) {
                overlayText.textContent = 'Detecté separador “;”. Reintentando...';
                Papa.parse("DECE_CRUCE_X_Y_NUC_SAT.csv", {
                    download: true,
                    skipEmptyLines: true,
                    worker: true,
                    delimiter: ';',
                    complete: (r2) => {
                        const data = mapCSVToData(r2.data);
                        processData(data);
                    },
                    error: (err2) => {
                        console.error(err2);
                        overlayText.textContent = 'Error al cargar CSV (reintento con ;).';
                    }
                });
                return;
            }

            const data = mapCSVToData(results.data);
            processData(data);
        },
        error: (err) => {
            console.error(err);
            overlayText.textContent = 'Error al cargar el archivo CSV (ver consola).';
        }
    });
}

function isLikelyBadDelimiter(rows) {
    if (!rows || rows.length < 2) return false;
    // Si las filas vienen como [ "a;b;c;d" ] (1 sola columna) es muy probable que el separador sea ;
    const first = rows[0];
    if (!Array.isArray(first)) return false;
    if (first.length != 1) return false;
    const cell = String(first[0] ?? '');
    return cell.includes(';') && cell.split(';').length > 5;
}

/*************************************************
 * MAPEO CSV → MODELO INTERNO
 * Columnas Excel:
 * E (4) = latitud
 * F (5) = longitud
 *************************************************/
function mapCSVToData(rows) {
    const data = [];

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!Array.isArray(r)) continue;

        const lat = parseFloat(r[4]);
        const lng = parseFloat(r[5]);
        const cod = Number(r[6]);

        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
        if (![2, 3, 4, 5].includes(cod)) continue;

        data.push({
            lat,
            lng,
            cod,
            name: r[0] || 'IE sin nombre',
            dist: r[1] || 'N/D',
            zone: r[2] || 'N/D',
            students: Number(r[7]) || 0,
            profs: Number(r[8]) || 0
        });
    }

    return data;
}

/*************************************************
 * PROCESAR DATOS
 *************************************************/
function processData(data) {
    // Limpia capas (por si recargas)
    Object.values(layers).forEach(l => l.clearLayers());

    console.log('Procesando', data.length, 'instituciones');

    const nucleos = data.filter(d => [3, 4, 5].includes(d.cod));
    const satellites = data.filter(d => d.cod === 2);

    console.log('Núcleos:', nucleos.length, '| Satélites:', satellites.length);

    const nucleoStats = new Map();

    nucleos.forEach(nucleo => {
        const key = `${nucleo.lat},${nucleo.lng}`;
        nucleoStats.set(key, {
            nucleo: nucleo,
            satellites: [],
            totalStudents: nucleo.students
        });

        const buffer = L.circle([nucleo.lat, nucleo.lng], {
            radius: BUFFER_RADIUS_M,
            fillColor: '#f85149',
            color: '#f85149',
            weight: 2,
            opacity: 0.4,
            fillOpacity: 0.08
        });
        buffer.addTo(layers.buffers);
    });

    let satellitesCovered = 0;
    const overlayText = document.querySelector('#loadingOverlay .loading-text');

    // Procesamiento por lotes (evita "se quedó pegado")
    const chunkSize = 300;
    let idx = 0;

    function processChunk() {
        const end = Math.min(idx + chunkSize, satellites.length);

        for (; idx < end; idx++) {
            const satellite = satellites[idx];

            let closestNucleo = null;
            let minDistance = BUFFER_RADIUS_M;

            // Prefiltro por bbox en grados (aceleración)
            const latTol = BUFFER_RADIUS_M * DEG_LAT_PER_M;
            const lonTol = latTol / Math.max(0.2, Math.cos(satellite.lat * Math.PI / 180));

            for (let j = 0; j < nucleos.length; j++) {
                const nucleo = nucleos[j];

                if (Math.abs(satellite.lat - nucleo.lat) > latTol) continue;
                if (Math.abs(satellite.lng - nucleo.lng) > lonTol) continue;

                const distance = calculateDistance(
                    satellite.lat, satellite.lng,
                    nucleo.lat, nucleo.lng
                );

                if (distance <= BUFFER_RADIUS_M && distance < minDistance) {
                    minDistance = distance;
                    closestNucleo = nucleo;
                }
            }

            const isCovered = closestNucleo !== null;
            const color = isCovered ? '#58a6ff' : '#6e7681';

            const satelliteMarker = L.circleMarker([satellite.lat, satellite.lng], {
                radius: 6,
                fillColor: color,
                color: '#ffffff',
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.8
            });

            satelliteMarker.bindPopup(createSatellitePopup(satellite, closestNucleo, minDistance));
            satelliteMarker.addTo(layers.satellites);

            if (closestNucleo) {
                satellitesCovered++;

                const key = `${closestNucleo.lat},${closestNucleo.lng}`;
                const stats = nucleoStats.get(key);
                if (stats) {
                    stats.satellites.push(satellite);
                    stats.totalStudents += satellite.students;
                }

                const line = L.polyline(
                    [[closestNucleo.lat, closestNucleo.lng], [satellite.lat, satellite.lng]],
                    {
                        color: '#58a6ff',
                        weight: 2,
                        opacity: 0.6,
                        dashArray: '5, 10'
                    }
                );
                line.addTo(layers.connections);
            }
        }

        overlayText.textContent = `Procesando satélites… ${idx.toLocaleString()} / ${satellites.length.toLocaleString()}`;

        if (idx < satellites.length) {
            requestAnimationFrame(processChunk);
            return;
        }

        // Dibujar núcleos al final (sobre los satélites)
        nucleos.forEach(nucleo => {
            const key = `${nucleo.lat},${nucleo.lng}`;
            const stats = nucleoStats.get(key);

            const nucleoMarker = L.circleMarker([nucleo.lat, nucleo.lng], {
                radius: 10,
                fillColor: '#f85149',
                color: '#ffffff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9
            });

            nucleoMarker.bindPopup(createNucleoPopup(nucleo, stats));
            nucleoMarker.addTo(layers.nucleos);
        });

        const coveragePercent = satellites.length > 0
            ? ((satellitesCovered / satellites.length) * 100).toFixed(1)
            : '0.0';

        updateStatistics({
            totalNucleos: nucleos.length,
            totalSatellites: satellites.length,
            satellitesCovered: satellitesCovered,
            coveragePercent: coveragePercent,
            totalStudents: data.reduce((sum, d) => sum + (d.students || 0), 0)
        });

        updateTopNucleos(nucleoStats);

        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    overlayText.textContent = 'Procesando satélites…';
    requestAnimationFrame(processChunk);
}

/*************************************************
 * Calcular Distancia (Haversine)
 *************************************************/
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/*************************************************
 * Popups
 *************************************************/
function createNucleoPopup(nucleo, stats) {
    const totalStudents = stats ? stats.totalStudents : (nucleo.students || 0);
    const satellitesLen = stats ? stats.satellites.length : 0;

    const profesionalesNecesarios = Math.ceil(totalStudents / 450);
    const deficit = profesionalesNecesarios - (nucleo.profs || 0);

    return `
        <div class="popup-title">🏛️ Núcleo DECE</div>
        <div class="popup-content">
            <div class="popup-row">
                <span class="popup-label">Institución:</span>
                <span class="popup-value">${escapeHTML(nucleo.name)}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distrito:</span>
                <span class="popup-value">${escapeHTML(nucleo.dist)}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Satélites conectados:</span>
                <span class="popup-value" style="color: #58a6ff;">${satellitesLen}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Estudiantes totales:</span>
                <span class="popup-value" style="color: #d29922;">${Number(totalStudents).toLocaleString()}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Profesionales necesarios:</span>
                <span class="popup-value">${profesionalesNecesarios}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Profesionales actuales:</span>
                <span class="popup-value" style="color: ${deficit > 0 ? '#f85149' : '#3fb950'};">${nucleo.profs || 0}</span>
            </div>
            ${deficit > 0 ? `
            <div class="popup-row">
                <span class="popup-label">Déficit:</span>
                <span class="popup-value" style="color: #f85149;">${deficit}</span>
            </div>` : ''}
        </div>
    `;
}

function createSatellitePopup(satellite, nucleo, distance) {
    const distanceKm = (distance / 1000).toFixed(2);
    const covered = nucleo !== null;

    return `
        <div class="popup-title">📍 Satélite</div>
        <div class="popup-content">
            <div class="popup-row">
                <span class="popup-label">Institución:</span>
                <span class="popup-value">${escapeHTML(satellite.name)}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distrito:</span>
                <span class="popup-value">${escapeHTML(satellite.dist)}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Estado:</span>
                <span class="popup-value" style="color: ${covered ? '#3fb950' : '#f85149'};">
                    ${covered ? '✓ Cubierto' : '✗ Sin cobertura'}
                </span>
            </div>
            ${covered ? `
            <div class="popup-row">
                <span class="popup-label">Núcleo asignado:</span>
                <span class="popup-value">${escapeHTML(nucleo.name).slice(0, 40)}${nucleo.name && nucleo.name.length>40?'…':''}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distancia:</span>
                <span class="popup-value">${distanceKm} km</span>
            </div>` : ''}
            <div class="popup-row">
                <span class="popup-label">Estudiantes:</span>
                <span class="popup-value" style="color: #d29922;">${Number(satellite.students || 0).toLocaleString()}</span>
            </div>
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

/*************************************************
 * Estadísticas
 *************************************************/
function updateStatistics(stats) {
    const elN = document.getElementById('totalNucleos');
    const elS = document.getElementById('totalSatellites');
    const elC = document.getElementById('coveragePercent');
    const elT = document.getElementById('totalStudents');

    if (elN) elN.textContent = Number(stats.totalNucleos || 0).toLocaleString();
    if (elS) elS.textContent = Number(stats.totalSatellites || 0).toLocaleString();
    if (elC) elC.textContent = (stats.coveragePercent ?? '0.0') + '%';
    if (elT) elT.textContent = Number(stats.totalStudents || 0).toLocaleString();
}

/*************************************************
 * Top Núcleos
 *************************************************/
function updateTopNucleos(nucleoStats) {
    const container = document.getElementById('topNucleos');
    if (!container) return;

    const sortedNucleos = Array.from(nucleoStats.values())
        .sort((a, b) => b.satellites.length - a.satellites.length)
        .slice(0, 10);

    const html = sortedNucleos.map((stats, index) => {
        const profesionalesNecesarios = Math.ceil((stats.totalStudents || 0) / 450);
        return `
            <div class="top-item" onclick="flyToLocation(${stats.nucleo.lat}, ${stats.nucleo.lng})">
                <div class="top-item-header">
                    <span class="top-rank">#${index + 1}</span>
                    <span class="top-name">${escapeHTML(stats.nucleo.name)}</span>
                    <span class="top-count">${stats.satellites.length}</span>
                </div>
                <div class="top-desc">
                    ${Number(stats.totalStudents || 0).toLocaleString()} estudiantes • ${profesionalesNecesarios} prof. necesarios
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/*************************************************
 * Volar a ubicación
 *************************************************/
function flyToLocation(lat, lng) {
    map.flyTo([lat, lng], 12, { duration: 1.5 });
}

/*************************************************
 * Controles (con guards)
 *************************************************/
function setupControls() {
    const qs = (id) => document.getElementById(id);

    const btnStats = qs('toggleStats');
    const btnLegend = qs('toggleLegend');

    if (btnStats) btnStats.addEventListener('click', () => {
        const p = qs('statsPanel');
        if (p) p.classList.toggle('active');
        const l = qs('legendPanel');
        if (l) l.classList.remove('active');
    });

    if (btnLegend) btnLegend.addEventListener('click', () => {
        const p = qs('legendPanel');
        if (p) p.classList.toggle('active');
        const s = qs('statsPanel');
        if (s) s.classList.remove('active');
    });

    bindLayerToggle('toggleBuffers', layers.buffers);
    bindLayerToggle('toggleConnections', layers.connections);
    bindLayerToggle('toggleNucleos', layers.nucleos);
    bindLayerToggle('toggleSatellites', layers.satellites);

    setTimeout(() => {
        const p = qs('statsPanel');
        if (p) p.classList.add('active');
    }, 500);
}

function bindLayerToggle(id, layer) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
        if (e.target.checked) map.addLayer(layer);
        else map.removeLayer(layer);
    });
}
