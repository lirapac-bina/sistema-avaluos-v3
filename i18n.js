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
        
        // MENÚ LATERAL
        sec_solicitante: "Datos del solicitante",
        sec_oferente: "Datos del propietario",
        sec_inmueble: "Datos del inmueble",

        // UBICACIÓN DEL INMUEBLE
        sub_ubicacion: "Ubicación del inmueble",
        lbl_cp: "Código postal *",
        lbl_colonia: "Colonia *",
        lbl_ciudad: "Ciudad *",
        lbl_municipio: "Municipio *",
        lbl_estado: "Estado *",
        lbl_pais: "País *",
        lbl_tipo_vialidad: "Tipo de vialidad *",
        lbl_nombre_vialidad: "Nombre de vialidad *",
        lbl_num_ext: "# Exterior *",
        lbl_num_int: "# Interior",

        // DATOS COMPLEMENTARIOS
        sub_complementarios: "Datos complementarios",
        lbl_conjunto: "Nombre del conjunto habitacional",
        lbl_manzana: "Manzana",
        lbl_supermanzana: "Supermanzana",
        lbl_lote: "Lote",
        lbl_calle1: "Calle 1",
        lbl_calle2: "Calle 2",
        lbl_reg_conjunto: "N° registro del conjunto",
        lbl_cve_municipio: "Clave delegación o municipio *",
        lbl_cve_estado: "Clave entidad federativa *",
        lbl_cta_predial: "Cuenta predial",
        lbl_departamento: "Departamento",
        lbl_entrada: "Entrada",
        lbl_edificio: "Edificio",
        lbl_nivel: "Nivel",
        lbl_condominio: "Condominio",
        lbl_cta_agua: "Cuenta de agua",
        lbl_licencia: "Licencia de construcción",
        
        // PLACEHOLDERS / OPCIONES
        ph_escribe: "Escriba aquí...",
        opt_seleccionar: "Seleccione una opción...",
        opt_mexico: "México"
    },
    en: {
        // GENERAL UI
        ui_loading: "Loading...",
        ui_save: "Save Progress",
        ui_next: "Next Section",
        ui_back: "Previous",

        // SIDEBAR MENU
        sec_solicitante: "Applicant data",
        sec_oferente: "Owner data",
        sec_inmueble: "Property data",

        // PROPERTY LOCATION
        sub_ubicacion: "Property location",
        lbl_cp: "Zip code *",
        lbl_colonia: "Neighborhood *",
        lbl_ciudad: "City *",
        lbl_municipio: "Municipality *",
        lbl_estado: "State *",
        lbl_pais: "Country *",
        lbl_tipo_vialidad: "Road type *",
        lbl_nombre_vialidad: "Road name *",
        lbl_num_ext: "Ext. number *",
        lbl_num_int: "Int. number",

        // COMPLEMENTARY DATA
        sub_complementarios: "Complementary data",
        lbl_conjunto: "Housing complex name",
        lbl_manzana: "Block",
        lbl_supermanzana: "Superblock",
        lbl_lote: "Lot",
        lbl_calle1: "Cross street 1",
        lbl_calle2: "Cross street 2",
        lbl_reg_conjunto: "Complex reg. no.",
        lbl_cve_municipio: "Municipality key *",
        lbl_cve_estado: "State key *",
        lbl_cta_predial: "Property tax account",
        lbl_departamento: "Department / Apt",
        lbl_entrada: "Entrance",
        lbl_edificio: "Building",
        lbl_nivel: "Level / Floor",
        lbl_condominio: "Condominium",
        lbl_cta_agua: "Water account",
        lbl_licencia: "Building permit",

        // PLACEHOLDERS / OPTIONS
        ph_escribe: "Type here...",
        opt_seleccionar: "Select an option...",
        opt_mexico: "Mexico"
    }
};

let currentLang = localStorage.getItem('leezar_lang') || 'es';

function setLanguage(lang) {
    if (!DICTIONARY[lang]) return;
    currentLang = lang;
    localStorage.setItem('leezar_lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (DICTIONARY[lang][key]) {
            if (elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA') {
                elem.placeholder = DICTIONARY[lang][key];
            } else if (elem.tagName === 'OPTION') {
                elem.innerText = DICTIONARY[lang][key];
            } else {
                elem.innerText = DICTIONARY[lang][key];
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLang);
});