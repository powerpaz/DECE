// Variables Globales
let map;
let layers = {
    nucleos: L.featureGroup(),
    satellites: L.featureGroup(),
    buffers: L.featureGroup(),
    connections: L.featureGroup()
};

const BUFFER_RADIUS_M = 7500; // 7.5 km
const ECUADOR_CENTER = [-1.831239, -78.183406];

// Inicialización
document.addEventListener('DOMContentLoaded', init);

function init() {
    initMap();
    processData();
    setupControls();
}

// Inicializar Mapa
function initMap() {
    map = L.map('map', {
        center: ECUADOR_CENTER,
        zoom: 7,
        zoomControl: true,
        preferCanvas: true
    });

    // Capa OSM
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    // Capa Satelital
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 19
    });

    // Agregar capa por defecto
    osmLayer.addTo(map);

    // Control de capas
    L.control.layers({
        'OpenStreetMap': osmLayer,
        'Satélite': satelliteLayer
    }).addTo(map);

    // Agregar grupos de features al mapa
    Object.values(layers).forEach(layer => layer.addTo(map));
}

// Procesar Datos
function processData() {
    console.log('Procesando', window.DECE_DATA ? DECE_DATA.length : 0, 'instituciones');

    // Usar datos de ejemplo si no hay datos reales
    const data = window.DECE_DATA || generateSampleData();
    
    // Filtrar por COD_GDECE
    const nucleos = data.filter(d => [3, 4, 5].includes(d.cod));
    const satellites = data.filter(d => d.cod === 2);
    
    console.log('Núcleos:', nucleos.length, '| Satellites:', satellites.length);

    // Procesar núcleos y construir conexiones
    const nucleoStats = new Map();

    nucleos.forEach(nucleo => {
        const key = `${nucleo.lat},${nucleo.lng}`;
        nucleoStats.set(key, {
            nucleo: nucleo,
            satellites: [],
            totalStudents: nucleo.students
        });

        // Dibujar buffer
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

    // Procesar satellites y encontrar núcleo más cercano
    let satellitesCovered = 0;
    const satellitesList = [];

    satellites.forEach(satellite => {
        let closestNucleo = null;
        let minDistance = BUFFER_RADIUS_M;

        nucleos.forEach(nucleo => {
            const distance = calculateDistance(
                satellite.lat, satellite.lng,
                nucleo.lat, nucleo.lng
            );

            if (distance <= BUFFER_RADIUS_M && distance < minDistance) {
                minDistance = distance;
                closestNucleo = nucleo;
            }
        });

        // Determinar color según cobertura
        const isCovered = closestNucleo !== null;
        const color = isCovered ? '#58a6ff' : '#6e7681';

        // Dibujar marcador de satellite
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

        // Si está cubierto, dibujar conexión
        if (closestNucleo) {
            satellitesCovered++;

            const key = `${closestNucleo.lat},${closestNucleo.lng}`;
            const stats = nucleoStats.get(key);
            stats.satellites.push(satellite);
            stats.totalStudents += satellite.students;

            // Dibujar línea de conexión
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

        satellitesList.push({
            institution: satellite,
            connected: isCovered
        });
    });

    // Dibujar marcadores de núcleos
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

    // Calcular cobertura
    const coveragePercent = ((satellitesCovered / satellites.length) * 100).toFixed(1);

    // Actualizar estadísticas
    updateStatistics({
        totalNucleos: nucleos.length,
        totalSatellites: satellites.length,
        satellitesCovered: satellitesCovered,
        coveragePercent: coveragePercent,
        totalStudents: data.reduce((sum, d) => sum + d.students, 0)
    });

    // Actualizar top núcleos
    updateTopNucleos(nucleoStats);

    // Ocultar loading
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// Calcular Distancia (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio de la Tierra en metros
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

// Crear Popups
function createNucleoPopup(nucleo, stats) {
    const profesionalesNecesarios = Math.ceil(stats.totalStudents / 450);
    const deficit = profesionalesNecesarios - nucleo.profs;

    return `
        <div class="popup-title">🏛️ Núcleo DECE</div>
        <div class="popup-content">
            <div class="popup-row">
                <span class="popup-label">Institución:</span>
                <span class="popup-value">${nucleo.name}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distrito:</span>
                <span class="popup-value">${nucleo.dist}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Satellites conectados:</span>
                <span class="popup-value" style="color: #58a6ff;">${stats.satellites.length}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Estudiantes totales:</span>
                <span class="popup-value" style="color: #d29922;">${stats.totalStudents.toLocaleString()}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Profesionales necesarios:</span>
                <span class="popup-value">${profesionalesNecesarios}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Profesionales actuales:</span>
                <span class="popup-value" style="color: ${deficit > 0 ? '#f85149' : '#3fb950'};">${nucleo.profs}</span>
            </div>
            ${deficit > 0 ? `
            <div class="popup-row">
                <span class="popup-label">Déficit:</span>
                <span class="popup-value" style="color: #f85149;">${deficit}</span>
            </div>
            ` : ''}
        </div>
    `;
}

function createSatellitePopup(satellite, nucleo, distance) {
    const distanceKm = (distance / 1000).toFixed(2);
    const covered = nucleo !== null;

    return `
        <div class="popup-title">📍 Satellite</div>
        <div class="popup-content">
            <div class="popup-row">
                <span class="popup-label">Institución:</span>
                <span class="popup-value">${satellite.name}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distrito:</span>
                <span class="popup-value">${satellite.dist}</span>
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
                <span class="popup-value">${nucleo.name.substring(0, 30)}...</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distancia:</span>
                <span class="popup-value">${distanceKm} km</span>
            </div>
            ` : ''}
            <div class="popup-row">
                <span class="popup-label">Estudiantes:</span>
                <span class="popup-value" style="color: #d29922;">${satellite.students.toLocaleString()}</span>
            </div>
        </div>
    `;
}

// Actualizar Estadísticas
function updateStatistics(stats) {
    document.getElementById('totalNucleos').textContent = stats.totalNucleos.toLocaleString();
    document.getElementById('totalSatellites').textContent = stats.totalSatellites.toLocaleString();
    document.getElementById('coveragePercent').textContent = stats.coveragePercent + '%';
    document.getElementById('totalStudents').textContent = stats.totalStudents.toLocaleString();
}

// Actualizar Top Núcleos
function updateTopNucleos(nucleoStats) {
    const sortedNucleos = Array.from(nucleoStats.values())
        .sort((a, b) => b.satellites.length - a.satellites.length)
        .slice(0, 10);

    const html = sortedNucleos.map((stats, index) => {
        const profesionalesNecesarios = Math.ceil(stats.totalStudents / 450);
        return `
            <div class="top-item" onclick="flyToLocation(${stats.nucleo.lat}, ${stats.nucleo.lng})">
                <div class="top-item-header">
                    <span class="top-rank">#${index + 1}</span>
                    <span class="top-name">${stats.nucleo.name}</span>
                    <span class="top-count">${stats.satellites.length}</span>
                </div>
                <div class="top-desc">
                    ${stats.totalStudents.toLocaleString()} estudiantes • ${profesionalesNecesarios} prof. necesarios
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('topNucleos').innerHTML = html;
}

// Volar a Ubicación
function flyToLocation(lat, lng) {
    map.flyTo([lat, lng], 12, {
        duration: 1.5
    });
}

// Configurar Controles
function setupControls() {
    // Toggle de paneles
    document.getElementById('toggleStats').addEventListener('click', () => {
        const panel = document.getElementById('statsPanel');
        panel.classList.toggle('active');
        document.getElementById('legendPanel').classList.remove('active');
    });

    document.getElementById('toggleLegend').addEventListener('click', () => {
        const panel = document.getElementById('legendPanel');
        panel.classList.toggle('active');
        document.getElementById('statsPanel').classList.remove('active');
    });

    // Toggle de capas
    document.getElementById('toggleBuffers').addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(layers.buffers);
        } else {
            map.removeLayer(layers.buffers);
        }
    });

    document.getElementById('toggleConnections').addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(layers.connections);
        } else {
            map.removeLayer(layers.connections);
        }
    });

    document.getElementById('toggleNucleos').addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(layers.nucleos);
        } else {
            map.removeLayer(layers.nucleos);
        }
    });

    document.getElementById('toggleSatellites').addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(layers.satellites);
        } else {
            map.removeLayer(layers.satellites);
        }
    });

    // Mostrar panel de estadísticas al cargar
    setTimeout(() => {
        document.getElementById('statsPanel').classList.add('active');
    }, 500);
}

// Generar Datos de Ejemplo (REEMPLAZAR CON TUS DATOS REALES)
function generateSampleData() {
    const data = [];
    
    // Generar núcleos de ejemplo en Ecuador
    for (let i = 0; i < 20; i++) {
        data.push({
            lat: -1.5 + Math.random() * 2,
            lng: -78 + Math.random() * 4,
            cod: [3, 4, 5][Math.floor(Math.random() * 3)],
            name: `Núcleo DECE ${i + 1}`,
            dist: `Distrito ${Math.floor(Math.random() * 10) + 1}`,
            zone: `Zona ${Math.floor(Math.random() * 5) + 1}`,
            students: Math.floor(Math.random() * 800) + 200,
            profs: Math.floor(Math.random() * 3) + 1
        });
    }
    
    // Generar satellites de ejemplo
    for (let i = 0; i < 50; i++) {
        data.push({
            lat: -1.5 + Math.random() * 2,
            lng: -78 + Math.random() * 4,
            cod: 2,
            name: `Satellite ${i + 1}`,
            dist: `Distrito ${Math.floor(Math.random() * 10) + 1}`,
            zone: `Zona ${Math.floor(Math.random() * 5) + 1}`,
            students: Math.floor(Math.random() * 400) + 50,
            profs: Math.floor(Math.random() * 2) + 1
        });
    }
    
    return data;
}
