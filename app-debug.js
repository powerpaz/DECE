// ========== ARCHIVO DE PRUEBA CON DIAGNÓSTICO ==========
console.log("🚀 app-debug.js CARGADO");

// Verificar que todo esté disponible
window.addEventListener('DOMContentLoaded', function() {
    console.log("✅ DOMContentLoaded");
    
    // Test 1: Leaflet
    if (typeof L !== 'undefined') {
        console.log("✅ Leaflet disponible:", L.version);
    } else {
        console.error("❌ Leaflet NO disponible");
        return;
    }
    
    // Test 2: Botones
    const btnEdit = document.getElementById("btnEditBuffers");
    const btnAdd = document.getElementById("btnAddBuffers");
    const btnDelete = document.getElementById("btnDeleteBuffers");
    
    console.log("btnEdit:", btnEdit ? "✅ Encontrado" : "❌ NO encontrado");
    console.log("btnAdd:", btnAdd ? "✅ Encontrado" : "❌ NO encontrado");
    console.log("btnDelete:", btnDelete ? "✅ Encontrado" : "❌ NO encontrado");
    
    // Test 3: Agregar listeners simples
    if (btnEdit) {
        btnEdit.addEventListener('click', function() {
            console.log("🔧 ¡CLICK EN EDITAR DETECTADO!");
            alert("Click en Editar detectado. Mira la consola.");
        });
    }
    
    if (btnDelete) {
        btnDelete.addEventListener('click', function() {
            console.log("🗑️ ¡CLICK EN ELIMINAR DETECTADO!");
            alert("Click en Eliminar detectado. Mira la consola.");
        });
    }
    
    // Test 4: Crear un mapa simple
    try {
        const map = L.map('map').setView([-1.831239, -78.183406], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        console.log("✅ Mapa creado correctamente");
        
        // Crear un círculo de prueba
        const circle = L.circle([-1.831239, -78.183406], {
            radius: 7500,
            color: 'red',
            fillOpacity: 0.2
        }).addTo(map);
        
        console.log("✅ Círculo de prueba creado");
        
        // Hacer el círculo arrastrable
        let isDragging = false;
        
        circle.on('mousedown', function(e) {
            console.log("🖱️ MOUSEDOWN en círculo");
            isDragging = true;
            map.dragging.disable();
            
            map.on('mousemove', function(e) {
                if (isDragging) {
                    console.log("🖱️ MOVIENDO círculo");
                    circle.setLatLng(e.latlng);
                }
            });
        });
        
        map.on('mouseup', function() {
            if (isDragging) {
                console.log("🖱️ MOUSEUP - fin arrastre");
                isDragging = false;
                map.dragging.enable();
                map.off('mousemove');
            }
        });
        
        console.log("✅ Arrastre configurado en círculo de prueba");
        console.log("🎯 PRUEBA: Arrastra el círculo rojo en el centro del mapa");
        
    } catch (e) {
        console.error("❌ Error creando mapa:", e);
    }
    
    console.log("\n=================================");
    console.log("📊 RESUMEN DIAGNÓSTICO");
    console.log("=================================");
    console.log("Si ves este mensaje, el JavaScript se está ejecutando.");
    console.log("Si NO puedes arrastrar el círculo rojo, el problema es en el código de arrastre.");
    console.log("=================================\n");
});
