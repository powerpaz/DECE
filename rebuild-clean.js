// SCRIPT PARA RECONSTRUIR APP.JS LIMPIO
// Este script crea una versión sin loops infinitos

const fs = require('fs');

console.log('🔧 Reconstruyendo app.js sin loops...');

// Leer el archivo actual
let content = fs.readFileSync('app.js', 'utf8');

// Problema 1: assignOrphanSatellites se llama múltiples veces
// Solo debe llamarse UNA VEZ en processData, después de que todo está listo

// Buscar y eliminar todas las llamadas duplicadas
content = content.replace(/assignOrphanSatellites\(satellites, nucleos, satCandidates, selected\);/g, '// assignOrphanSatellites removido temporalmente');

// Restaurar SOLO la llamada correcta en processData
content = content.replace(
    /\/\/ assignOrphanSatellites removido temporalmente\n  \/\/ Luego identificar núcleos huérfanos/,
    `assignOrphanSatellites(globalData.satellites, globalData.nucleos, satCandidates, result.selected);
  // Luego identificar núcleos huérfanos`
);

fs.writeFileSync('app.js', content);
console.log('✅ app.js reconstruido');

