/**
 * MOTOR DE CÁLCULO DE AVALÚOS LEEZAR V3.0
 * Autor: Dev Leezar (Gemi)
 * Fecha: Enero 2026
 * * Este módulo es "agnóstico": funciona en el navegador (para ver cambios en vivo)
 * y en el servidor (para generar el PDF final).
 */

// --- CONSTANTES Y FACTORES (Basados en Ross-Heidecke) ---
const FACTORES_DEMERITO = {
    "NUEVO": 1.00,
    "MUY_BUENO": 0.975,
    "BUENO": 0.932,
    "REGULAR": 0.845,
    "MALO": 0.655,
    "RUINOSO": 0.350
};

// Tabla de Vida Útil Probable (VUP) según Clases (Ejemplo simplificado IMIC)
const VIDA_UTIL_PROBABLE = {
    "HABITACIONAL_LUJO": 80,
    "HABITACIONAL_MEDIA": 70,
    "HABITACIONAL_INTERES_SOCIAL": 60,
    "INDUSTRIAL_LIGERA": 50,
    "COMERCIAL": 65
};

/**
 * Calcula el Factor de Edad (Depreciación) usando Ross-Heidecke
 * Fórmula: [1 - ((Edad/VUP)^1.4)]
 */
function calcularFactorEdad(edad, vidaUtil) {
    if (vidaUtil <= 0) return 0;
    if (edad >= vidaUtil) return 0.10; // Valor de rescate mínimo
    
    // Fórmula exacta de Ross-Heidecke con curvatura 1.4 (Estándar Valuatorio)
    const relacion = edad / vidaUtil;
    const depreciacion = Math.pow(relacion, 1.4);
    return Number((1 - depreciacion).toFixed(4));
}

/**
 * FUNCIÓN MAESTRA: Calcular Valor Neto de Reposición (VNR)
 * @param {Object} datos - Datos del inmueble (Input del Capturista/Predial)
 * @param {Object} manualCostos - Objeto con precios Varela/IMIC (Inyección de Dependencia)
 */
export function calcularVNR(datos, manualCostos) {
    
    const reporte = {
        subtotales: {},
        valorTotal: 0,
        desglose: []
    };

    // 1. CÁLCULO DE TERRENO (Inyectado desde Boleta Predial)
    const valorTerreno = datos.superficieTerreno * datos.valorSueloZona;
    reporte.subtotales.terreno = valorTerreno;
    reporte.desglose.push({ concepto: "Terreno", valor: valorTerreno });

    // 2. CÁLCULO DE CONSTRUCCIONES (Iteramos por tipos)
    let valorConstrucciones = 0;
    
    datos.construcciones.forEach((construccion, index) => {
        // Buscamos el precio base en el Manual cargado (Varela/IMIC)
        // Ejemplo: "C-HAB-MED" -> $12,500/m2
        const precioBase = manualCostos[construccion.tipo] || 0; 
        
        // Calculamos Valor Nuevo
        const valorNuevo = construccion.superficie * precioBase;
        
        // Aplicamos Factores (La Magia Matemática)
        const vidaUtil = VIDA_UTIL_PROBABLE[construccion.clase] || 70;
        const F_Edad = calcularFactorEdad(construccion.edad, vidaUtil);
        const F_Conservacion = FACTORES_DEMERITO[construccion.estadoConservacion] || 1.0;
        
        // VNR = ValorNuevo * F_Edad * F_Conservacion
        const valorNeto = valorNuevo * F_Edad * F_Conservacion;
        
        valorConstrucciones += valorNeto;
        
        reporte.desglose.push({
            concepto: `Construcción Tipo ${index + 1} (${construccion.tipo})`,
            calculo: `$${precioBase} x ${construccion.superficie}m² x ${F_Edad} (Edad) x ${F_Conservacion} (Cons)`,
            valor: valorNeto
        });
    });

    reporte.subtotales.construcciones = valorConstrucciones;

    // 3. INSTALACIONES ESPECIALES (Bombas, Elevadores, etc.)
    let valorInstalaciones = 0;
    if (datos.instalaciones) {
        datos.instalaciones.forEach(inst => {
            const precioInst = manualCostos[inst.clave] || 0;
            const valorElem = precioInst * inst.cantidad;
            // También se deprecian (usamos lógica similar o directa)
            valorInstalaciones += valorElem * (inst.factorEstado || 1.0);
        });
    }
    reporte.subtotales.instalaciones = valorInstalaciones;

    // TOTAL FINAL
    reporte.valorTotal = valorTerreno + valorConstrucciones + valorInstalaciones;
    
    return reporte;
}