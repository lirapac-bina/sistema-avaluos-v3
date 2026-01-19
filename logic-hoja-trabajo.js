// logic-hoja-trabajo.js
// Lógica principal de la Hoja de Trabajo (Cálculo de Avalúos)

// --- 1. CONFIGURACIÓN SEGURA (Base64) ---
const apiKeyEncoded = "QUl6YVN5QkRYM2hZVzJ1LU9oWUpXSjlCMmdBQW50VjBPWnlrZms0";

const firebaseConfig = {
    apiKey: atob(apiKeyEncoded), // Aquí se descifra la llave mágica
    authDomain: "sistema-hipoteca-facil.firebaseapp.com",
    projectId: "sistema-hipoteca-facil",
    storageBucket: "sistema-hipoteca-facil.firebasestorage.app",
    messagingSenderId: "880781885603",
    appId: "1:880781885603:web:8a74a7f811974940ccbf16"
};

// Inicializar Firebase (Solo si no existe ya para evitar errores)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase inicializado en Hoja de Trabajo (Modo Seguro).");
}

// Instancia de Firestore
const db = firebase.firestore();

// ---------------------------------------------------------
// A PARTIR DE AQUÍ SIGUE TU CÓDIGO NORMAL (VARIABLES GLOBALES...)

// --- 2. VARIABLES GLOBALES ---
let expedienteId = null;
let expedienteData = null;
let saveTimeout = null;

// --- 3. DEFINICIÓN MAESTRA DE SECCIONES (Los 22 Puntos) ---
// En el futuro, esto podría venir de la colección "Catalogos" en Firebase
const SECCIONES_MAESTRAS = [
    { id: 1, categoria: "I. Identificación", nombre: "Dirección" },
    { id: 2, categoria: "I. Identificación", nombre: "Geolocalización" },
    { id: 3, categoria: "I. Identificación", nombre: "Tipo / Clase" },
    { id: 4, categoria: "II. El Inmueble", nombre: "Características / Superficies" },
    { id: 5, categoria: "II. El Inmueble", nombre: "Acabados Obra Negra" },
    { id: 6, categoria: "II. El Inmueble", nombre: "Acabados Espacios" },
    { id: 7, categoria: "II. El Inmueble", nombre: "Detalles Específicos" },
    { id: 8, categoria: "II. El Inmueble", nombre: "Carpintería" },
    // ... Puedes agregar las 22 aquí ...
    { id: 16, categoria: "IV. Legal y Cierre", nombre: "Legal / Fuentes" },
    { id: 22, categoria: "IV. Legal y Cierre", nombre: "Resumen Final", especial: true }
];

// --- 4. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    // Leer ID de la URL
    const params = new URLSearchParams(window.location.search);
    expedienteId = params.get('id');

    if (!expedienteId) {
        alert("⚠️ No se especificó un ID de expediente.");
        window.location.href = 'gestion.html';
        return;
    }

    console.log("Iniciando captura para expediente:", expedienteId);
    await cargarExpediente();
});

// --- 5. LÓGICA CORE ---

async function cargarExpediente() {
    const docRef = doc(db, "Expedientes", expedienteId);
    
    // Usamos onSnapshot para ver cambios en tiempo real (por si el admin cambia algo)
    onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            expedienteData = docSnap.data();
            renderizarMenuLateral();
            llenarFormulario();
            actualizarHeader();
        } else {
            alert("El expediente no existe.");
        }
    });
}

function renderizarMenuLateral() {
    const sidebarContainer = document.querySelector('aside .overflow-y-auto'); 
    // Nota: Necesitaremos limpiar el HTML hardcodeado en captura-avaluo.html
    // O apuntar a un contenedor específico id="menu-container"
    const menuContainer = document.getElementById('menu-dinamico');
    if(!menuContainer) return;

    menuContainer.innerHTML = ''; // Limpiar menú anterior

    // Agrupar secciones por categoría
    const categorias = {};
    
    // AQUÍ LA MAGIA DINÁMICA: 
    // Filtramos las secciones maestras según el tipo de trámite del expediente
    // Por ahora mostramos todas, pero aquí pondrías: if (seccion.id === 5 && tipo === 'TERRENO') continue;
    
    SECCIONES_MAESTRAS.forEach(seccion => {
        if (!categorias[seccion.categoria]) {
            categorias[seccion.categoria] = [];
        }
        categorias[seccion.categoria].push(seccion);
    });

    // Renderizar HTML
    Object.keys(categorias).forEach(catNombre => {
        const catDiv = document.createElement('div');
        catDiv.className = 'group mb-2';
        
        let htmlSecciones = '';
        categorias[catNombre].forEach(sec => {
            // Estilo especial para el paso 22 o pasos clave
            const colorClass = sec.especial ? 'text-emerald-600 font-bold' : 'text-slate-600';
            
            htmlSecciones += `
                <button onclick="navTo(${sec.id})" id="nav-${sec.id}" class="nav-item w-full text-left px-3 py-2 text-xs ${colorClass} hover:bg-slate-50 rounded flex gap-2 transition-colors">
                    <span class="text-slate-400 font-mono opacity-50">${String(sec.id).padStart(2, '0')}.</span> 
                    ${sec.nombre}
                </button>
            `;
        });

        catDiv.innerHTML = `
            <div class="sticky top-0 bg-slate-50/90 backdrop-blur-sm px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 z-10">
                ${catNombre}
            </div>
            <div class="p-2 space-y-0.5">
                ${htmlSecciones}
            </div>
        `;
        menuContainer.appendChild(catDiv);
    });
}

function llenarFormulario() {
    // Aquí mapeamos los datos de Firebase a los inputs del HTML
    // Ejemplo:
    if (expedienteData.superficieTerreno) {
        const input = document.getElementById('input-superficie');
        if(input) input.value = expedienteData.superficieTerreno;
    }
    // ... Repetir para todos los campos o hacer un mapeo automático por ID
}

function actualizarHeader() {
    // Poner folio y estatus en el header
    const folioEl = document.getElementById('header-folio'); // Necesitamos ponerle este ID al span del folio en el HTML
    if(folioEl) folioEl.innerText = expedienteData.folio || 'SIN FOLIO';
}

// --- 6. AUTOGUARDADO ---
window.recalcular = function() {
    // Lógica de cálculo (ej. sumas de superficies)
    // ...
    triggerAutoSave();
}

// Escuchar todos los inputs para autoguardado
document.addEventListener('input', (e) => {
    if (e.target.matches('input, select, textarea')) {
        triggerAutoSave();
    }
});

function triggerAutoSave() {
    const statusIndicator = document.getElementById('status-indicator');
    if(statusIndicator) {
        statusIndicator.innerHTML = '<span class="material-symbols-rounded animate-spin text-sm">sync</span> Guardando...';
        statusIndicator.className = "flex items-center gap-1 text-[10px] text-amber-500 bg-amber-50 px-2 py-1 rounded border border-amber-200 transition-all";
    }

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(guardarCambios, 1000); // Guardar 1 seg después de dejar de escribir
}

async function guardarCambios() {
    if (!expedienteId) return;

    // Recolectar datos (ejemplo simplificado)
    const datosAGuardar = {
        superficieTerreno: document.getElementById('input-superficie')?.value || 0,
        // ... recolectar resto de campos
        ultimaModificacion: new Date().toISOString()
    };

    try {
        const docRef = doc(db, "Expedientes", expedienteId);
        await updateDoc(docRef, datosAGuardar);
        
        const statusIndicator = document.getElementById('status-indicator');
        if(statusIndicator) {
            statusIndicator.innerHTML = '<span class="material-symbols-rounded text-sm">cloud_done</span> Guardado';
            statusIndicator.className = "flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 transition-all";
        }
    } catch (error) {
        console.error("Error al guardar:", error);
        // Mostrar error en UI
    }
}

// Exportar funciones necesarias al window para el HTML
window.navTo = function(stepId) {
    // Ocultar todas las secciones
    document.querySelectorAll('.section-wizard').forEach(el => el.classList.add('hidden'));
    
    // Mostrar la seleccionada (asumiendo que los divs tienen id="section-1", "section-4", etc.)
    const target = document.getElementById('section-' + stepId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('fade-in');
    }

    // Actualizar estilo del menú
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('nav-active', 'bg-blue-50', 'text-leezar-600', 'font-bold'));
    const btn = document.getElementById('nav-' + stepId);
    if(btn) btn.classList.add('nav-active', 'bg-blue-50', 'text-leezar-600', 'font-bold');
};