/* ==========================================
   SISTEMA LEEZAR V3 - CEREBRO CENTRAL (app.js)
   Versión Blindada & Liberada 🔓
   ========================================== */

// 1. CONEXIÓN SEGURA A BASE DE DATOS
const db = (window.db) ? window.db : (typeof firebase !== 'undefined' ? firebase.firestore() : null);

if (!db) console.warn("⚠️ Advertencia: No hay conexión a BD, pero la interfaz cargará igual.");

// 2. DEFINICIÓN DE SECCIONES
const SECCIONES = [
    { id: 1, key: "sec_1", icon: "location_on" },
    { id: 2, key: "sec_2", icon: "map" },
    { id: 3, key: "sec_3", icon: "home_work" }
];

let currentSectionId = 1;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Sistema iniciando...");

    try {
        // 1. Dibujar Menú
        renderSidebar();
        
        // 2. Cargar Sección 1
        cargarSeccion(1);
        
        // 3. Cargar Idioma
        if(typeof setLanguage === 'function') {
            setLanguage(localStorage.getItem('leezar_lang') || 'es');
        } else {
            console.warn("⚠️ Módulo de idioma (i18n) no cargó.");
        }
        
        // 4. Restaurar Tema Guardado
        const savedTheme = localStorage.getItem('leezar_theme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
            const icon = document.getElementById('theme-icon');
            if(icon) icon.innerText = 'dark_mode';
        }

    } catch (error) {
        console.error("❌ Error fatal en app.js:", error);
    }
});

// --- DIBUJAR SIDEBAR ---
function renderSidebar() {
    const contenedor = document.getElementById('secciones-lista');
    if(!contenedor) return;
    
    contenedor.innerHTML = ''; 

    SECCIONES.forEach(sec => {
        const isActive = sec.id === currentSectionId;
        const activeClass = isActive 
            ? "bg-leezar-50 dark:bg-leezar-900/20 text-leezar-700 dark:text-leezar-300 border-l-4 border-leezar-500 shadow-sm" 
            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent";

        const defaultText = (sec.id === 1) ? "Dirección" : "Sección " + sec.id;

        const btn = `
            <button onclick="cargarSeccion(${sec.id})" 
                class="w-full text-left px-4 py-3 text-xs font-medium rounded-r-lg transition-all flex items-center gap-3 ${activeClass}">
                <span class="material-symbols-rounded text-lg ${isActive ? 'text-leezar-500' : 'text-slate-400'}">${sec.icon}</span>
                <span data-i18n="${sec.key}">${defaultText}</span>
            </button>
        `;
        contenedor.insertAdjacentHTML('beforeend', btn);
    });
}

// --- DIBUJAR FORMULARIO ---
function cargarSeccion(id) {
    currentSectionId = id;
    renderSidebar(); 
    
    const contenedor = document.getElementById('dynamic-form-container');
    if (!contenedor) return;

    let html = '';
    
    if (id === 1) {
        html = `
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 fade-in">
                <h2 class="text-lg font-bold text-slate-700 dark:text-white mb-6 flex items-center gap-2">
                    <span class="material-symbols-rounded text-leezar-500">location_on</span>
                    <span data-i18n="sec_1">Dirección del Inmueble</span>
                </h2>

                <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div class="md:col-span-8">
                        <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1" data-i18n="lbl_calle">Calle</label>
                        <input type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                    </div>
                     <div class="md:col-span-4">
                        <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1" data-i18n="lbl_colonia">Colonia</label>
                        <input type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                    </div>
                </div>
            </div>
        `;
    } else {
        html = `<div class="p-10 text-center"><p>Sección ${id}</p></div>`;
    }
    
    contenedor.innerHTML = html;
    
    if(typeof setLanguage === 'function') setLanguage(localStorage.getItem('leezar_lang') || 'es');
}

// ==========================================
// 4. FUNCIONES AUXILIARES (LIBERADAS 🕊️)
// ==========================================

function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        if(icon) icon.innerText = 'light_mode'; 
        localStorage.setItem('leezar_theme', 'light');
    } else {
        html.classList.add('dark');
        if(icon) icon.innerText = 'dark_mode'; 
        localStorage.setItem('leezar_theme', 'dark');
    }
}

function toggleJack() { 
    const chat = document.getElementById('jack-chat'); 
    if(!chat) return;
    
    chat.classList.toggle('translate-y-[110%]'); 
    
    if(!chat.classList.contains('translate-y-[110%]')) {
        setTimeout(() => {
            const input = document.getElementById('jack-input');
            if(input) input.focus();
        }, 300);
    }
}

async function preguntarAJack() { 
    const input = document.getElementById('jack-input');
    const mensaje = input.value.trim();
    if(!mensaje) return;

    agregarMensajeUI('user', mensaje);
    input.value = '';

    setTimeout(() => {
        const respuestas = [
            "Entendido. Guardaré ese dato.",
            "Recuerda tomar fotos de las fachadas.",
            "Dato registrado. Sigamos avanzando."
        ];
        const randomResp = respuestas[Math.floor(Math.random() * respuestas.length)];
        agregarMensajeUI('jack', randomResp);
    }, 1000);
}

function agregarMensajeUI(remitente, texto) {
     const contenedor = document.getElementById('jack-messages');
     if(!contenedor) return;
     
     const html = remitente === 'jack' 
        ? `<div class="flex gap-3 mb-4 fade-in"><div class="w-6 h-6 rounded-full bg-jack-100 dark:bg-jack-900/50 flex items-center justify-center text-jack-600 text-xs font-bold">J</div><div class="bg-white dark:bg-slate-800 p-3 rounded-tr-xl rounded-br-xl rounded-bl-xl shadow-sm text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700"><p>${texto}</p></div></div>`
        : `<div class="flex gap-3 mb-4 justify-end fade-in"><div class="bg-jack-600 p-3 rounded-tl-xl rounded-br-xl rounded-bl-xl shadow-sm text-xs text-white"><p>${texto}</p></div></div>`;
    
    contenedor.insertAdjacentHTML('beforeend', html);
    contenedor.scrollTop = contenedor.scrollHeight; 
}