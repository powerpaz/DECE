/**
 * ============================================================
 * SPATIAL ANALYTICS MODULE v3.0 - OPTIMIZADO
 * ============================================================
 * ✅ Heatmap visual para densidad urbano-rural
 * ✅ Algoritmo de cobertura óptima (sin solapamiento)
 * ✅ Buffers estratégicos mínimos necesarios
 * ✅ Spatial join inteligente
 * ============================================================
 */

class SpatialAnalytics {
  constructor() {
    this.data = null;
    this.classification = {};
    this.bufferRadius = {};
    this.joinResults = [];
    this.optimizedBuffers = [];
    this.densityGrid = [];
    this.heatmapLayer = null;
    
    this.config = {
      urbanDensityThreshold: 2500,
      urbanBufferRadius: 3500,
      ruralBufferRadius: 7500,
      knn: 3,
      minCoverageTarget: 0.95,
      maxOverlapPercent: 0.15,
      gridCellSize: 0.02
    };
  }

  /**
   * ALGORITMO 1: Detección de Densidad con datos para Heatmap
   */
  detectUrbanRuralDensity(nucleos) {
    console.log('🔍 Analizando densidad espacial...');
    
    if (!nucleos || nucleos.length < 2) {
      console.warn('⚠️ Se requieren al menos 2 núcleos');
      return { classification: {}, heatmapData: [] };
    }

    const classification = {};
    const heatmapData = [];
    const coords = nucleos.map((n, idx) => ({ idx, lat: n.lat, lng: n.lng }));

    nucleos.forEach((nucleo, idx) => {
      let distances = [];
      coords.forEach((other, oIdx) => {
        if (oIdx === idx) return;
        const dist = this.haversineMeters(nucleo.lat, nucleo.lng, other.lat, other.lng);
        distances.push({ idx: oIdx, dist });
      });

      distances.sort((a, b) => a.dist - b.dist);
      const kNearest = distances.slice(0, this.config.knn);
      const avgDistance = kNearest.reduce((sum, d) => sum + d.dist, 0) / kNearest.length;

      const isUrban = avgDistance < this.config.urbanDensityThreshold;
      classification[idx] = isUrban ? 'URBANO' : 'RURAL';

      const intensity = Math.max(0.1, 1 - (avgDistance / 10000));
      
      heatmapData.push({
        lat: nucleo.lat,
        lng: nucleo.lng,
        intensity: intensity,
        type: classification[idx],
        avgDistance: avgDistance,
        codigo_amie: nucleo.codigo_amie || `NUC_${idx}`
      });
    });

    this.classification = classification;
    this.densityGrid = heatmapData;

    const urbanos = Object.values(classification).filter(t => t === 'URBANO').length;
    const rurales = Object.values(classification).filter(t => t === 'RURAL').length;

    console.log(`✅ Clasificación: ${urbanos} URBANO, ${rurales} RURAL`);

    return { classification, heatmapData };
  }

  /**
   * Genera grid de densidad para heatmap
   */
  generateDensityGrid(nucleos) {
    if (!nucleos.length) return [];

    const lats = nucleos.map(n => n.lat);
    const lngs = nucleos.map(n => n.lng);
    const minLat = Math.min(...lats) - 0.1;
    const maxLat = Math.max(...lats) + 0.1;
    const minLng = Math.min(...lngs) - 0.1;
    const maxLng = Math.max(...lngs) + 0.1;

    const grid = [];
    const cellSize = this.config.gridCellSize;

    for (let lat = minLat; lat <= maxLat; lat += cellSize) {
      for (let lng = minLng; lng <= maxLng; lng += cellSize) {
        let density = 0;
        nucleos.forEach(n => {
          const dist = this.haversineMeters(lat, lng, n.lat, n.lng);
          if (dist < 5000) {
            density += Math.exp(-dist / 2000);
          }
        });

        if (density > 0.1) {
          grid.push({
            lat: lat,
            lng: lng,
            density: density,
            isUrban: density > 1.5
          });
        }
      }
    }

    return grid;
  }

  /**
   * ALGORITMO 2: Buffers Óptimos con Cobertura Máxima y Solapamiento Mínimo
   */
  generateOptimalBuffers(nucleos, satellites) {
    console.log('📏 Calculando buffers óptimos...');
    
    if (!nucleos.length || !satellites.length) {
      console.warn('⚠️ Se requieren núcleos y satélites');
      return [];
    }

    // Paso 1: Calcular cobertura de cada núcleo
    const coverage = new Map();
    
    nucleos.forEach((nucleo, nIdx) => {
      const tipo = this.classification[nIdx] || 'RURAL';
      const radius = tipo === 'URBANO' 
        ? this.config.urbanBufferRadius 
        : this.config.ruralBufferRadius;
      
      const coveredSats = new Set();
      satellites.forEach((sat, sIdx) => {
        const dist = this.haversineMeters(nucleo.lat, nucleo.lng, sat.lat, sat.lng);
        if (dist <= radius) {
          coveredSats.add(sIdx);
        }
      });
      
      coverage.set(nIdx, {
        covered: coveredSats,
        radius: radius,
        tipo: tipo,
        nucleo: nucleo
      });
    });

    // Paso 2: Algoritmo Greedy optimizado
    const selectedBuffers = [];
    const coveredSatellites = new Set();
    const usedNucleos = new Set();
    const totalSatellites = satellites.length;
    const targetCoverage = Math.floor(totalSatellites * this.config.minCoverageTarget);

    console.log(`🎯 Objetivo: cubrir ${targetCoverage} de ${totalSatellites} satélites`);

    while (coveredSatellites.size < targetCoverage) {
      let bestNucleo = null;
      let bestScore = -Infinity;

      coverage.forEach((data, nIdx) => {
        if (usedNucleos.has(nIdx)) return;

        let newCoverage = 0;
        data.covered.forEach(sIdx => {
          if (!coveredSatellites.has(sIdx)) newCoverage++;
        });

        if (newCoverage === 0) return;

        // Penalizar solapamiento
        let overlapPenalty = 0;
        selectedBuffers.forEach(existing => {
          const dist = this.haversineMeters(
            data.nucleo.lat, data.nucleo.lng,
            existing.lat, existing.lng
          );
          const combinedRadius = data.radius + existing.buffer_radius_m;
          if (dist < combinedRadius * 0.7) {
            overlapPenalty += (combinedRadius - dist) / combinedRadius;
          }
        });

        const score = newCoverage - (overlapPenalty * 5);

        if (score > bestScore) {
          bestScore = score;
          bestNucleo = nIdx;
        }
      });

      if (bestNucleo === null) break;

      const data = coverage.get(bestNucleo);
      usedNucleos.add(bestNucleo);
      
      let newCount = 0;
      data.covered.forEach(sIdx => {
        if (!coveredSatellites.has(sIdx)) newCount++;
        coveredSatellites.add(sIdx);
      });

      const buffer = {
        nucleo_index: bestNucleo,
        nucleo_id: data.nucleo.codigo_amie || `NUC_${bestNucleo}`,
        tipo_zona: data.tipo,
        lat: data.nucleo.lat,
        lng: data.nucleo.lng,
        buffer_radius_m: data.radius,
        buffer_radius_km: (data.radius / 1000).toFixed(1),
        satellites_covered: data.covered.size,
        new_coverage: newCount
      };

      selectedBuffers.push(buffer);
      this.bufferRadius[bestNucleo] = data.radius;

      console.log(`  ✓ Buffer #${selectedBuffers.length}: ${buffer.nucleo_id} (${buffer.tipo_zona}) - +${newCount} satélites`);
    }

    const finalCoverage = (coveredSatellites.size / totalSatellites * 100).toFixed(1);
    console.log(`\n📊 RESULTADO:`);
    console.log(`   Buffers: ${selectedBuffers.length} de ${nucleos.length} (${((selectedBuffers.length/nucleos.length)*100).toFixed(0)}%)`);
    console.log(`   Cobertura: ${finalCoverage}%`);

    this.optimizedBuffers = selectedBuffers;
    return selectedBuffers;
  }

  /**
   * Genera todos los buffers (sin optimización)
   */
  generateDynamicBuffers(nucleos) {
    if (!Object.keys(this.classification).length) {
      console.warn('⚠️ Primero ejecuta detectUrbanRuralDensity()');
      return [];
    }

    const buffers = [];
    nucleos.forEach((nucleo, idx) => {
      const type = this.classification[idx] || 'RURAL';
      const radius = type === 'URBANO' 
        ? this.config.urbanBufferRadius 
        : this.config.ruralBufferRadius;

      this.bufferRadius[idx] = radius;

      buffers.push({
        nucleo_index: idx,
        nucleo_id: nucleo.codigo_amie || `NUC_${idx}`,
        tipo_zona: type,
        lat: nucleo.lat,
        lng: nucleo.lng,
        buffer_radius_m: radius,
        buffer_radius_km: (radius / 1000).toFixed(1)
      });
    });

    return buffers;
  }

  /**
   * ALGORITMO 3: Spatial Join
   */
  spatialJoin(nucleos, satellites, institutions = []) {
    console.log('🔗 Ejecutando spatial join...');
    
    const buffersToUse = this.optimizedBuffers.length > 0 
      ? this.optimizedBuffers 
      : this.generateDynamicBuffers(nucleos);

    const results = [];

    buffersToUse.forEach(buffer => {
      const satsInside = satellites.filter(sat => {
        const dist = this.haversineMeters(buffer.lat, buffer.lng, sat.lat, sat.lng);
        return dist <= buffer.buffer_radius_m;
      });

      const instsInside = (institutions || []).filter(inst => {
        const dist = this.haversineMeters(buffer.lat, buffer.lng, inst.lat, inst.lng);
        return dist <= buffer.buffer_radius_m;
      });

      results.push({
        codigo_amie: buffer.nucleo_id,
        tipo_zona: buffer.tipo_zona,
        buffer_km: buffer.buffer_radius_km,
        num_instituciones: instsInside.length,
        num_satelites: satsInside.length,
        total_puntos: satsInside.length + instsInside.length,
        instituciones: instsInside.map(i => i.codigo_amie || 'N/A').join('; '),
        satelites: satsInside.map(s => s.codigo_amie || 'N/A').join('; '),
        fecha_analisis: new Date().toISOString().split('T')[0],
        ubicacion_lat: buffer.lat,
        ubicacion_lng: buffer.lng
      });
    });

    this.joinResults = results;
    console.log(`✅ Spatial join: ${results.length} buffers analizados`);

    return results;
  }

  // Utilidades
  haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  getStatistics() {
    const urbanos = Object.values(this.classification).filter(t => t === 'URBANO').length;
    const rurales = Object.values(this.classification).filter(t => t === 'RURAL').length;
    
    return {
      total_nucleos: Object.keys(this.classification).length,
      zonas_urbanas: urbanos,
      zonas_rurales: rurales,
      buffers_optimizados: this.optimizedBuffers.length,
      reduccion_porcentaje: this.optimizedBuffers.length > 0 
        ? ((1 - this.optimizedBuffers.length / Object.keys(this.classification).length) * 100).toFixed(1)
        : 0,
      resultados_join: this.joinResults.length
    };
  }

  // Exportación
  exportJSON() {
    return {
      clasificacion: this.classification,
      buffers_optimizados: this.optimizedBuffers,
      spatial_join_resultados: this.joinResults,
      estadisticas: this.getStatistics(),
      timestamp: new Date().toISOString()
    };
  }

  exportCSV() {
    if (!this.joinResults.length) return '';

    const headers = ['CODIGO_AMIE','TIPO_ZONA','BUFFER_KM','NUM_SATELITES','TOTAL_PUNTOS','LATITUD','LONGITUD'];
    const rows = this.joinResults.map(r => [
      r.codigo_amie, r.tipo_zona, r.buffer_km, r.num_satelites, r.total_puntos, r.ubicacion_lat, r.ubicacion_lng
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  exportHTML() {
    const stats = this.getStatistics();
    const rows = this.joinResults.map(r => `
      <tr>
        <td>${r.codigo_amie}</td>
        <td><span class="badge badge-${r.tipo_zona.toLowerCase()}">${r.tipo_zona}</span></td>
        <td>${r.buffer_km} km</td>
        <td>${r.num_satelites}</td>
        <td><strong>${r.total_puntos}</strong></td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte DECE - Cobertura Óptima</title>
  <style>
    body{font-family:'Segoe UI',sans-serif;margin:20px;background:#f0f2f5}
    .container{max-width:1000px;margin:0 auto;background:white;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)}
    h1{color:#1a73e8;border-bottom:3px solid #1a73e8;padding-bottom:15px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:25px 0}
    .stat-card{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:20px;border-radius:10px;text-align:center}
    .stat-card.success{background:linear-gradient(135deg,#11998e,#38ef7d)}
    .stat-card h3{margin:0 0 8px 0;font-size:13px;opacity:0.9}
    .stat-card .value{font-size:32px;font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:25px}
    th{background:#1a73e8;color:white;padding:14px;text-align:left}
    td{padding:12px;border-bottom:1px solid #e0e0e0}
    tr:hover{background:#f8f9fa}
    .badge{padding:5px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .badge-urbano{background:#ff6b6b;color:white}
    .badge-rural{background:#4ecdc4;color:white}
    .highlight{background:#e8f5e9;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #4caf50}
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Reporte de Cobertura Óptima DECE</h1>
    <div class="highlight">
      <strong>✅ Optimización:</strong> ${stats.buffers_optimizados} buffers de ${stats.total_nucleos} posibles 
      (${stats.reduccion_porcentaje}% reducción)
    </div>
    <div class="stats">
      <div class="stat-card"><h3>Total Núcleos</h3><div class="value">${stats.total_nucleos}</div></div>
      <div class="stat-card success"><h3>Buffers Óptimos</h3><div class="value">${stats.buffers_optimizados}</div></div>
      <div class="stat-card"><h3>Urbanos</h3><div class="value">${stats.zonas_urbanas}</div></div>
      <div class="stat-card"><h3>Rurales</h3><div class="value">${stats.zonas_rurales}</div></div>
    </div>
    <h2>📋 Buffers Seleccionados</h2>
    <table>
      <thead><tr><th>Código</th><th>Zona</th><th>Radio</th><th>Satélites</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:center;color:#666;margin-top:30px">DECE Optimizer v3.0 | ${new Date().toLocaleDateString('es-ES')}</p>
  </div>
</body>
</html>`;
  }

  downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpatialAnalytics;
}
