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
 * MAPA BASE
 *************************************************/
function initMap() {
    map = L.map('map', {
        center: ECUADOR_CENTER,
        zoom: 7,
        zoomControl: true,
        preferCanvas: true
    });

    const osmLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap', maxZoom: 19 }
    );

    const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: '© Esri', maxZoom: 19 }
    );

    osmLayer.addTo(map);

    L.control.layers({
        'OpenStreetMap': osmLayer,
        'Satélite': satelliteLayer
    }).addTo(map);

    Object.values(layers).forEach(layer => layer.addTo(map));
}

/*************************************************
 * CARGA CSV
 *************************************************/
function loadCSVData() {
    Papa.parse("DECE_CRUCE_X_Y_NUC_SAT.csv", {
        download: true,
        skipEmptyLines: true,
        complete: (results) => {
            const data = mapCSVToData(results.data);
            processData(data);
        },
        error: (err) => {
            console.error(err);
            document.querySelector('#loadingOverlay .loading-text').innerText =
                'Error al cargar el archivo CSV';
        }
    });
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

        const lat = parseFloat(r[4]);
        const lng = parseFloat(r[5]);
        const cod = Number(r[6]);

        if (isNaN(lat) || isNaN(lng)) continue;
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
 * PROCESAMIENTO PRINCIPAL
 *************************************************/
function processData(data) {

    const nucleos = data.filter(d => [3, 4, 5].includes(d.cod));
    const satellites = data.filter(d => d.cod === 2);

    const nucleoStats = new Map();

    nucleos.forEach(n => {
        const key = `${n.lat},${n.lng}`;
        nucleoStats.set(key, {
            nucleo: n,
            satellites: [],
            totalStudents: n.students
        });

        L.circle([n.lat, n.lng], {
            radius: BUFFER_RADIUS_M,
            color: '#f85149',
            fillColor: '#f85149',
            weight: 2,
            opacity: 0.4,
            fillOpacity: 0.08
        }).addTo(layers.buffers);
    });

    let satellitesCovered = 0;

    satellites.forEach(s => {
        let closest = null;
        let minDist = BUFFER_RADIUS_M;

        nucleos.forEach(n => {
            const d = calculateDistance(s.lat, s.lng, n.lat, n.lng);
            if (d <= BUFFER_RADIUS_M && d < minDist) {
                minDist = d;
                closest = n;
            }
        });

        const covered = closest !== null;
        const color = covered ? '#58a6ff' : '#6e7681';

        L.circleMarker([s.lat, s.lng], {
            radius: 6,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            fillOpacity: 0.8
        })
        .bindPopup(createSatellitePopup(s, closest, minDist))
        .addTo(layers.satellites);

        if (covered) {
            satellitesCovered++;
            const key = `${closest.lat},${closest.lng}`;
            const stats = nucleoStats.get(key);
            stats.satellites.push(s);
            stats.totalStudents += s.students;

            L.polyline(
                [[closest.lat, closest.lng], [s.lat, s.lng]],
                { color: '#58a6ff', weight: 2, opacity: 0.6, dashArray: '5,10' }
            ).addTo(layers.connections);
        }
    });

    nucleos.forEach(n => {
        const key = `${n.lat},${n.lng}`;
        const stats = nucleoStats.get(key);

        L.circleMarker([n.lat, n.lng], {
            radius: 10,
            fillColor: '#f85149',
            color: '#ffffff',
            weight: 3,
            fillOpacity: 0.9
        })
        .bindPopup(createNucleoPopup(n, stats))
        .addTo(layers.nucleos);
    });

    updateStatistics({
        totalNucleos: nucleos.length,
        totalSatellites: satellites.length,
        satellitesCovered,
        coveragePercent: ((satellitesCovered / satellites.length) * 100).toFixed(1),
        totalStudents: data.reduce((s, d) => s + d.students, 0)
    });

    updateTopNucleos(nucleoStats);

    document.getElementById('loadingOverlay').classList.add('hidden');
}

/*************************************************
 * DISTANCIA HAVERSINE
 *************************************************/
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/*************************************************
 * POPUPS
 *************************************************/
function createNucleoPopup(n, stats) {
    const profNecesarios = Math.ceil(stats.totalStudents / 450);
    const deficit = profNecesarios - n.profs;

    return `
    <div class="popup-title">🏛️ Núcleo DECE</div>
    <div class="popup-row"><b>${n.name}</b></div>
    <div class="popup-row">Distrito: ${n.dist}</div>
    <div class="popup-row">Satélites: ${stats.satellites.length}</div>
    <div class="popup-row">Estudiantes: ${stats.totalStudents}</div>
    <div class="popup-row">Prof. necesarios: ${profNecesarios}</div>
    <div class="popup-row" style="color:${deficit>0?'#f85149':'#3fb950'}">
        Prof. actuales: ${n.profs}
    </div>`;
}

function createSatellitePopup(s, n, d) {
    return `
    <div class="popup-title">📍 Satélite</div>
    <div class="popup-row"><b>${s.name}</b></div>
    <div class="popup-row">Estado:
        <span style="color:${n?'#3fb950':'#f85149'}">
            ${n?'Cubierto':'Sin cobertura'}
        </span>
    </div>
    ${n ? `<div class="popup-row">Distancia: ${(d/1000).toFixed(2)} km</div>` : ''}
    `;
}

/*************************************************
 * ESTADÍSTICAS Y TOP
 *************************************************/
function updateStatistics(s) {
    document.getElementById('totalNucleos').textContent = s.totalNucleos;
    document.getElementById('totalSatellites').textContent = s.totalSatellites;
    document.getElementById('coveragePercent').textContent = s.coveragePercent + '%';
    document.getElementById('totalStudents').textContent = s.totalStudents;
}

function updateTopNucleos(mapStats) {
    const top = [...mapStats.values()]
        .sort((a, b) => b.satellites.length - a.satellites.length)
        .slice(0, 10);

    document.getElementById('topNucleos').innerHTML = top.map((s, i) => `
        <div class="top-item" onclick="map.flyTo([${s.nucleo.lat},${s.nucleo.lng}],12)">
            <b>#${i+1}</b> ${s.nucleo.name} (${s.satellites.length})
        </div>
    `).join('');
}

/*************************************************
 * CONTROLES
 *************************************************/
function setupControls() {
    document.getElementById('toggleBuffers').onchange = e =>
        e.target.checked ? map.addLayer(layers.buffers) : map.removeLayer(layers.buffers);

    document.getElementById('toggleConnections').onchange = e =>
        e.target.checked ? map.addLayer(layers.connections) : map.removeLayer(layers.connections);

    document.getElementById('toggleNucleos').onchange = e =>
        e.target.checked ? map.addLayer(layers.nucleos) : map.removeLayer(layers.nucleos);

    document.getElementById('toggleSatellites').onchange = e =>
        e.target.checked ? map.addLayer(layers.satellites) : map.removeLayer(layers.satellites);
}
