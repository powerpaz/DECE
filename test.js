/* TEST DE FUNCIONES CRÍTICAS */

console.log("=== INICIANDO TESTS ===");

// Test 1: Verificar que las funciones existen
document.addEventListener("DOMContentLoaded", () => {
  console.log("1. Verificando funciones...");
  console.log("   - toggleEditMode:", typeof toggleEditMode);
  console.log("   - toggleAddMode:", typeof toggleAddMode);
  console.log("   - toggleDeleteMode:", typeof toggleDeleteMode);
  console.log("   - makeBufferDraggable:", typeof makeBufferDraggable);
  
  // Test 2: Verificar botones
  console.log("2. Verificando botones...");
  console.log("   - btnEditBuffers:", document.getElementById("btnEditBuffers") ? "✓" : "✗");
  console.log("   - btnAddBuffers:", document.getElementById("btnAddBuffers") ? "✓" : "✗");
  console.log("   - btnDeleteBuffers:", document.getElementById("btnDeleteBuffers") ? "✓" : "✗");
  
  // Test 3: Simular click en Editar después de 5 segundos
  setTimeout(() => {
    console.log("3. Simulando click en Editar...");
    const btn = document.getElementById("btnEditBuffers");
    if (btn) {
      btn.click();
      console.log("   - Click ejecutado");
      console.log("   - editMode:", editMode);
    }
  }, 5000);
});
