/* ==========================================
   DICCIONARIO MAESTRO (i18n.js)
   Español (es) / Inglés (en)
   ========================================== */
const DICTIONARY = {
    es: {
        // UI GENERAL
        ui_loading: "Cargando...",
        ui_save: "Guardar Avance",
        ui_next: "Siguiente Sección",
        ui_back: "Anterior",
        
        // MENÚ LATERAL (Nombres de Secciones)
        sec_1: "Dirección del Inmueble",
        sec_2: "Geolocalización",
        sec_3: "Tipo y Clase",
        // ... (Agregaremos las demás conforme avancemos)

        // SECCIÓN 1: DIRECCIÓN
        lbl_calle: "Calle / Avenida",
        lbl_num_ext: "Número Exterior",
        lbl_num_int: "Número Interior",
        lbl_colonia: "Colonia / Barrio",
        lbl_cp: "Código Postal",
        lbl_municipio: "Municipio / Alcaldía",
        lbl_estado: "Estado / Provincia",
        lbl_referencias: "Referencias de ubicación",
        
        // PLACEHOLDERS
        ph_calle: "Ej. Av. Reforma",
        ph_escribe: "Escriba aquí..."
    },
    en: {
        // GENERAL UI
        ui_loading: "Loading...",
        ui_save: "Save Progress",
        ui_next: "Next Section",
        ui_back: "Previous",

        // SIDEBAR MENU
        sec_1: "Property Address",
        sec_2: "Geolocation",
        sec_3: "Type & Class",

        // SECTION 1: ADDRESS
        lbl_calle: "Street Name",
        lbl_num_ext: "Ext. Number",
        lbl_num_int: "Int. Number",
        lbl_colonia: "Neighborhood",
        lbl_cp: "Zip Code",
        lbl_municipio: "City / Municipality",
        lbl_estado: "State / Province",
        lbl_referencias: "Location References",

        // PLACEHOLDERS
        ph_calle: "E.g. 5th Avenue",
        ph_escribe: "Type here..."
    }
};

// Lógica de Traducción
let currentLang = localStorage.getItem('leezar_lang') || 'es';

function setLanguage(lang) {
    if (!DICTIONARY[lang]) return;
    currentLang = lang;
    localStorage.setItem('leezar_lang', lang);

    // 1. Traducir elementos estáticos (etiquetas, botones)
    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (DICTIONARY[lang][key]) {
            if (elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA') {
                elem.placeholder = DICTIONARY[lang][key];
            } else {
                elem.innerText = DICTIONARY[lang][key];
            }
        }
    });

    // 2. Redibujar Sidebar (para actualizar nombres de menú)
    if (typeof renderSidebar === 'function') renderSidebar();

    console.log(`🌐 Idioma cambiado a: ${lang.toUpperCase()}`);
}

// Inicializar al cargar (si se llama directo)
document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLang);
});