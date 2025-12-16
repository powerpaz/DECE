// Global Variables
let map;
let layers = {
    nucleos: L.featureGroup(),
    satellites: L.featureGroup(),
    microsatellites: L.featureGroup(),
    buffers: L.featureGroup(),
    connections: L.featureGroup(),
    microconnections: L.featureGroup()
};

const BUFFER_RADIUS_M = 7500; // 7.5 km
const MICRO_RADIUS_NUCLEO = 15000; // 15 km para microsatélites a núcleos
const MICRO_RADIUS_SAT = 10000; // 10 km para microsatélites a satellites
const ECUADOR_CENTER = [-1.831239, -78.183406];

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    initMap();
    processData();
    setupControls();
}

// Initialize Map
function initMap() {
    map = L.map('map', {
        center: ECUADOR_CENTER,
        zoom: 7,
        zoomControl: true,
        preferCanvas: true
    });

    // Dark base layer
    const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CartoDB',
        subdomains: 'abcd',
        maxZoom: 20
    });

    // Satellite layer
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 19
    });

    // Add default layer
    darkLayer.addTo(map);

    // Layer control
    L.control.layers({
        'Dark': darkLayer,
        'Satellite': satelliteLayer
    }).addTo(map);

    // Add feature groups to map
    Object.values(layers).forEach(layer => layer.addTo(map));
}

// Process Data
function processData() {
    console.log('Processing', DECE_DATA.length, 'institutions');

    // Filter data by COD_GDECE
    const nucleos = DECE_DATA.filter(d => [3, 4, 5].includes(d.cod));
    const satellites = DECE_DATA.filter(d => d.cod === 2);
    const microsatellites = DECE_DATA.filter(d => d.cod === 1);

    console.log('Nucleos:', nucleos.length, '| Satellites:', satellites.length, '| Microsatellites:', microsatellites.length);

    // Process nucleos and build connections
    const nucleoStats = new Map();

    nucleos.forEach(nucleo => {
        const key = `${nucleo.lat},${nucleo.lng}`;
        nucleoStats.set(key, {
            nucleo: nucleo,
            satellites: [],
            microsatellites: [],
            totalStudents: nucleo.students
        });

        // Draw buffer
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

    // Process satellites and find closest nucleo
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

        // Draw satellite marker
        const satelliteMarker = L.circleMarker([satellite.lat, satellite.lng], {
            radius: 5,
            fillColor: closestNucleo ? '#58a6ff' : '#6e7681',
            color: '#ffffff',
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.7
        });

        satelliteMarker.bindPopup(createSatellitePopup(satellite, closestNucleo, minDistance));
        satelliteMarker.addTo(layers.satellites);

        // If covered, draw connection
        if (closestNucleo) {
            satellitesCovered++;

            const key = `${closestNucleo.lat},${closestNucleo.lng}`;
            const stats = nucleoStats.get(key);
            stats.satellites.push(satellite);
            stats.totalStudents += satellite.students;

            // Draw connection line
            const line = L.polyline(
                [[closestNucleo.lat, closestNucleo.lng], [satellite.lat, satellite.lng]],
                {
                    color: '#58a6ff',
                    weight: 1,
                    opacity: 0.3,
                    dashArray: '4, 6'
                }
            );
            line.addTo(layers.connections);
        }

        satellitesList.push({
            institution: satellite,
            connected: closestNucleo !== null
        });
    });

    // Process MICROSATELLITES (COD 1)
    let microsCoveredByNucleo = 0;
    let microsCoveredBySatellite = 0;
    let microsIsolated = 0;

    microsatellites.forEach(micro => {
        let connected = false;
        let connectionType = null;
        let connectionTarget = null;
        let connectionDistance = Infinity;

        // 1. Try to connect to closest NUCLEO within 15 km
        nucleos.forEach(nucleo => {
            const distance = calculateDistance(
                micro.lat, micro.lng,
                nucleo.lat, nucleo.lng
            );

            if (distance <= MICRO_RADIUS_NUCLEO && distance < connectionDistance) {
                connectionDistance = distance;
                connectionTarget = nucleo;
                connectionType = 'nucleo';
            }
        });

        // 2. If no nucleo found, try SATELLITE within 10 km
        if (!connectionTarget) {
            satellites.forEach(satellite => {
                const distance = calculateDistance(
                    micro.lat, micro.lng,
                    satellite.lat, satellite.lng
                );

                if (distance <= MICRO_RADIUS_SAT && distance < connectionDistance) {
                    connectionDistance = distance;
                    connectionTarget = satellite;
                    connectionType = 'satellite';
                }
            });
        }

        // Determine color based on connection
        let color, status;
        if (connectionType === 'nucleo') {
            color = '#d29922'; // Yellow/orange
            status = 'Conectado a Núcleo';
            microsCoveredByNucleo++;
            connected = true;

            // Add to nucleo stats
            const key = `${connectionTarget.lat},${connectionTarget.lng}`;
            const stats = nucleoStats.get(key);
            stats.microsatellites.push(micro);
            stats.totalStudents += micro.students;
        } else if (connectionType === 'satellite') {
            color = '#f0883e'; // Orange
            status = 'Conectado a Satellite';
            microsCoveredBySatellite++;
            connected = true;
        } else {
            color = '#6e7681'; // Gray
            status = 'Aislado';
            microsIsolated++;
        }

        // Draw microsatellite marker
        const microMarker = L.circleMarker([micro.lat, micro.lng], {
            radius: 3,
            fillColor: color,
            color: '#ffffff',
            weight: 1,
            opacity: 0.7,
            fillOpacity: 0.6
        });

        microMarker.bindPopup(createMicrosatellitePopup(micro, connectionTarget, connectionType, connectionDistance, status));
        microMarker.addTo(layers.microsatellites);

        // Draw connection if connected
        if (connected && connectionTarget) {
            const line = L.polyline(
                [[connectionTarget.lat, connectionTarget.lng], [micro.lat, micro.lng]],
                {
                    color: color,
                    weight: 0.8,
                    opacity: 0.25,
                    dashArray: '2, 4'
                }
            );
            line.addTo(layers.microconnections);
        }
    });

    // Draw nucleo markers
    nucleos.forEach(nucleo => {
        const key = `${nucleo.lat},${nucleo.lng}`;
        const stats = nucleoStats.get(key);

        const nucleoMarker = L.circleMarker([nucleo.lat, nucleo.lng], {
            radius: 8,
            fillColor: '#f85149',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        });

        nucleoMarker.bindPopup(createNucleoPopup(nucleo, stats));
        nucleoMarker.addTo(layers.nucleos);
    });

    // Calculate total coverage
    const totalCovered = satellitesCovered + microsCoveredByNucleo + microsCoveredBySatellite;
    const totalToConnect = satellites.length + microsatellites.length;
    const coveragePercent = ((totalCovered / totalToConnect) * 100).toFixed(1);

    // Update statistics
    updateStatistics({
        totalNucleos: nucleos.length,
        totalSatellites: satellites.length,
        totalMicrosatellites: microsatellites.length,
        satellitesCovered: satellitesCovered,
        microsCoveredByNucleo: microsCoveredByNucleo,
        microsCoveredBySatellite: microsCoveredBySatellite,
        microsIsolated: microsIsolated,
        totalCovered: totalCovered,
        coveragePercent: coveragePercent,
        totalStudents: DECE_DATA.reduce((sum, d) => sum + d.students, 0)
    });

    // Update top nucleos
    updateTopNucleos(nucleoStats);

    // Hide loading
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// Calculate Distance (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
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

// Create Popups
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
                <span class="popup-label">Zona:</span>
                <span class="popup-value">${nucleo.zone}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Satellites:</span>
                <span class="popup-value" style="color: #58a6ff;">${stats.satellites.length}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Microsatellites:</span>
                <span class="popup-value" style="color: #d29922;">${stats.microsatellites.length}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Estudiantes totales:</span>
                <span class="popup-value" style="color: #d29922;">${stats.totalStudents.toLocaleString()}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Prof. necesarios:</span>
                <span class="popup-value">${profesionalesNecesarios}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Prof. actuales:</span>
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
                <span class="popup-label">Status:</span>
                <span class="popup-value" style="color: ${covered ? '#3fb950' : '#f85149'};">
                    ${covered ? '✓ Cubierto' : '✗ Sin cobertura'}
                </span>
            </div>
            ${covered ? `
            <div class="popup-row">
                <span class="popup-label">Núcleo:</span>
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

function createMicrosatellitePopup(micro, target, type, distance, status) {
    const distanceKm = target ? (distance / 1000).toFixed(2) : '-';
    const connected = type !== null;

    return `
        <div class="popup-title">⭐ Microsatélite</div>
        <div class="popup-content">
            <div class="popup-row">
                <span class="popup-label">Institución:</span>
                <span class="popup-value">${micro.name}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distrito:</span>
                <span class="popup-value">${micro.dist}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Status:</span>
                <span class="popup-value" style="color: ${connected ? '#d29922' : '#6e7681'};">
                    ${status}
                </span>
            </div>
            ${connected ? `
            <div class="popup-row">
                <span class="popup-label">Conectado a:</span>
                <span class="popup-value">${type === 'nucleo' ? '🏛️ Núcleo' : '📍 Satellite'}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Institución:</span>
                <span class="popup-value">${target.name.substring(0, 25)}...</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Distancia:</span>
                <span class="popup-value">${distanceKm} km</span>
            </div>
            ` : `
            <div class="popup-row">
                <span class="popup-label">Nota:</span>
                <span class="popup-value">No hay núcleo/satellite dentro de 15km</span>
            </div>
            `}
            <div class="popup-row">
                <span class="popup-label">Estudiantes:</span>
                <span class="popup-value" style="color: #d29922;">${micro.students.toLocaleString()}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Tipo:</span>
                <span class="popup-value">COD_GDECE 1</span>
            </div>
        </div>
    `;
}

// Update Statistics
function updateStatistics(stats) {
    document.getElementById('totalNucleos').textContent = stats.totalNucleos.toLocaleString();
    document.getElementById('totalSatellites').textContent = stats.totalSatellites.toLocaleString();
    document.getElementById('totalMicrosatellites').textContent = stats.totalMicrosatellites.toLocaleString();
    document.getElementById('totalStudents').textContent = stats.totalStudents.toLocaleString();
    document.getElementById('coveragePercent').textContent = stats.coveragePercent + '%';
    
    // Update micro stats
    document.getElementById('microsByNucleo').textContent = stats.microsCoveredByNucleo.toLocaleString();
    document.getElementById('microsBySatellite').textContent = stats.microsCoveredBySatellite.toLocaleString();
    document.getElementById('microsIsolated').textContent = stats.microsIsolated.toLocaleString();
}

// Update Top Nucleos
function updateTopNucleos(nucleoStats) {
    const sortedNucleos = Array.from(nucleoStats.values())
        .sort((a, b) => {
            const totalA = a.satellites.length + a.microsatellites.length;
            const totalB = b.satellites.length + b.microsatellites.length;
            return totalB - totalA;
        })
        .slice(0, 10);

    const html = sortedNucleos.map((stats, index) => {
        const profesionalesNecesarios = Math.ceil(stats.totalStudents / 450);
        const totalInstitutions = stats.satellites.length + stats.microsatellites.length;
        return `
            <div class="top-item" onclick="flyToLocation(${stats.nucleo.lat}, ${stats.nucleo.lng})">
                <div class="top-item-header">
                    <span class="top-rank">#${index + 1}</span>
                    <span class="top-name">${stats.nucleo.name}</span>
                    <span class="top-count">${totalInstitutions}</span>
                </div>
                <div class="top-desc">
                    ${stats.satellites.length} satellites + ${stats.microsatellites.length} micros • ${stats.totalStudents.toLocaleString()} est. • ${profesionalesNecesarios} prof.
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('topNucleos').innerHTML = html;
}

// Fly to Location
function flyToLocation(lat, lng) {
    map.flyTo([lat, lng], 12, {
        duration: 1.5
    });
}

// Setup Controls
function setupControls() {
    // Toggle panels
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

    // Layer toggles
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

    document.getElementById('toggleMicrosatellites').addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(layers.microsatellites);
        } else {
            map.removeLayer(layers.microsatellites);
        }
    });

    document.getElementById('toggleMicroconnections').addEventListener('change', (e) => {
        if (e.target.checked) {
            map.addLayer(layers.microconnections);
        } else {
            map.removeLayer(layers.microconnections);
        }
    });

    // Show stats panel on load
    setTimeout(() => {
        document.getElementById('statsPanel').classList.add('active');
    }, 500);
}
