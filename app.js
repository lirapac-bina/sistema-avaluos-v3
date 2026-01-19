/* ==========================================
   SISTEMA LEEZAR V3 - CEREBRO CENTRAL (app.js)
   ========================================== */

// 1. RECUPERAR DB GLOBAL (La corrección mágica)
// Esto conecta este archivo con la configuración que cargaste en el HTML
const db = window.db || firebase.firestore();

if (!db) {
    console.error("❌ Error Crítico: app.js no encuentra la base de datos.");
} else {
    console.log("✅ app.js conectado a Firebase correctamente.");
}

// 2. VARIABLES GLOBALES
let map, marker, cityCircle;
let coordenadasInicio = null;

const SECCIONES = [
    { id: 1, nombre: "Dirección del Inmueble", icon: "location_on" },
    { id: 2, nombre: "Geolocalización", icon: "map" },
    { id: 3, nombre: "Tipo y Clase", icon: "home_work" },
    { id: 4, nombre: "Características Generales", icon: "square_foot" },
    { id: 5, nombre: "Acabados Obra Negra", icon: "foundation" },
    { id: 6, nombre: "Acabados en Espacios", icon: "format_paint" },
    { id: 7, nombre: "Detalles Específicos", icon: "details" },
    { id: 8, nombre: "Carpintería", icon: "door_front" },
    { id: 9, nombre: "Instalaciones", icon: "plumbing" },
    { id: 10, nombre: "Herrería / Ventanería", icon: "window" },
    { id: 11, nombre: "Detalles Constructivos", icon: "construction" },
    { id: 12, nombre: "Instalaciones Especiales", icon: "settings_system_daydream" },
    { id: 13, nombre: "Características Urbanas", icon: "location_city" },
    { id: 14, nombre: "Infraestructura", icon: "road" },
    { id: 15, nombre: "Equipamiento Urbano", icon: "local_convenience_store" },
    { id: 16, nombre: "Legal y Fuentes", icon: "gavel" },
    { id: 17, nombre: "Medidas y Colindancias", icon: "straighten" },
    { id: 18, nombre: "Expediente Digital", icon: "folder_open" },
    { id: 19, nombre: "Fotografías Básicas", icon: "photo_camera" },
    { id: 20, nombre: "Fotografías Avanzadas", icon: "camera" },
    { id: 21, nombre: "Otras Fotografías", icon: "add_a_photo" },
    { id: 22, nombre: "Resumen General", icon: "assignment_turned_in" }
];

// --- 3. INICIO Y DETECCIÓN DE FOLIO ---
document.addEventListener('DOMContentLoaded', () => {
    renderMenu(); 
    checkTheme(); 
    navTo(1);

    const params = new URLSearchParams(window.location.search);
    const folioUrl = params.get('folio') || params.get('id');
    const headerFolio = document.getElementById('header-folio');

    if (folioUrl) {
        if(headerFolio) headerFolio.innerText = folioUrl;
        console.log(`🔎 INICIANDO CARGA PARA: ${folioUrl}`);
        cargarDatosDeNube(); 
    } else {
        if(headerFolio) {
            headerFolio.innerText = "PRUEBA-SIN-GUARDAR";
            headerFolio.classList.add('text-orange-500');
        }
    }
});

// --- 4. LÓGICA DE GUARDADO ---
async function guardarEnNube(subSeccion, datos) {
    const headerFolio = document.getElementById('header-folio');
    let folio = headerFolio ? headerFolio.getAttribute('data-id') : null;
    
    if(!folio) {
        const params = new URLSearchParams(window.location.search);
        folio = params.get('folio') || params.get('id');
    }

    if (!folio || folio.includes('Cargando')) return;

    try {
        await db.collection('eme_captura').doc(folio).set({
            avaluo_data: { [subSeccion]: datos },
            ultima_modificacion: new Date().toISOString(),
            sistema: "EME"
        }, { merge: true });

        console.log(`✅ Guardado: ${subSeccion}`);
    } catch (error) { console.error("Error guardando:", error); }
}

async function guardarYAvanzar(seccionId) {
    const contenedor = document.getElementById(`section-${seccionId}`);
    if(!contenedor) return;
    const inputs = contenedor.querySelectorAll('input, select, textarea');
    let datos = {};
    let hayDatos = false;
    inputs.forEach(el => {
        if(el.id && el.value) { datos[el.id] = el.value; hayDatos = true; }
    });
    if (hayDatos) { await guardarEnNube(`seccion_${seccionId}`, datos); }
    navTo(seccionId + 1);
}

// --- 6. CARGAR DATOS (DETECTIVE PRIVADO) ---
async function cargarDatosDeNube() {
    const params = new URLSearchParams(window.location.search);
    const folio = params.get('folio') || params.get('id');
    const headerFolio = document.getElementById('header-folio');
    const scriptMap = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    const apiKey = scriptMap ? new URL(scriptMap.src).searchParams.get("key") : null;

    if (!folio) return;
    if(headerFolio) headerFolio.setAttribute('data-id', folio);

    try {
        // A) INTENTO 1: EME_CAPTURA
        const docNew = await db.collection('eme_captura').doc(folio).get();
        let datosFinales = null;

        if (docNew.exists && docNew.data().avaluo_data) {
            datosFinales = docNew.data().avaluo_data;
        } 
        
        // B) INTENTO 2: EXPEDIENTES_AVALUOS
        if (!datosFinales) {
            let docOld = await db.collection('expedientes_avaluos').doc(folio).get();
            
            if (!docOld.exists) {
                docOld = await db.collection('expediente_avaluos').doc(folio).get();
            }

            if (docOld.exists) {
                const d = docOld.data();
                console.log("📂 DATOS RECIBIDOS:", d);
                
                // 1. INYECTAR NOMBRE
                const nombreCliente = d.nombreCliente || d.cliente || d.solicitante || "Cliente";
                const tramite = (d.tipoTramite || "AVALÚO").toString().replace(/_/g, ' ').toUpperCase();

                if(headerFolio) {
                    headerFolio.innerHTML = `
                        <span class="text-slate-400 font-normal mr-2 text-[10px]">${folio}</span>
                        <span class="text-leezar-accent font-bold uppercase">${nombreCliente}</span>
                        <span class="text-[9px] bg-slate-100 px-2 py-0.5 rounded-full ml-2">${tramite}</span>
                    `;
                }

                // 2. EXTRAER COORDENADAS (MODO AGRESIVO)
                let lat = null, lng = null;
                let origen = "";

                // PRIORIDAD 1: coordenadas_mapa (String)
                if (d.coordenadas_mapa && typeof d.coordenadas_mapa === 'string') {
                    origen = "coordenadas_mapa (String)";
                    const clean = d.coordenadas_mapa.replace(/[() ]/g, ''); 
                    const partes = clean.split(',');
                    if (partes.length >= 2) {
                        lat = parseFloat(partes[0]);
                        lng = parseFloat(partes[1]);
                    }
                }
                // PRIORIDAD 2: coordenadas_mapa (GeoPoint)
                else if (d.coordenadas_mapa && d.coordenadas_mapa.latitude) {
                    origen = "coordenadas_mapa (GeoPoint)";
                    lat = d.coordenadas_mapa.latitude;
                    lng = d.coordenadas_mapa.longitude;
                }
                // PRIORIDAD 3: coordenadas (String)
                else if (d.coordenadas && typeof d.coordenadas === 'string') {
                    origen = "coordenadas (String)";
                    const clean = d.coordenadas.replace(/[() ]/g, '');
                    const partes = clean.split(',');
                    if (partes.length >= 2) {
                        lat = parseFloat(partes[0]);
                        lng = parseFloat(partes[1]);
                    }
                }

                if (lat && lng && !isNaN(lat)) {
                    console.log(`🎯 COORDENADAS ENCONTRADAS [${origen}]: ${lat}, ${lng}`);
                    // Guardamos en variable global
                    coordenadasInicio = { lat: lat, lng: lng };
                    
                    // Preparamos datos finales
                    datosFinales = { 
                        geo_macro: { lat: lat, lng: lng, zoom: 16, radio: 200 }
                    };
                } else {
                    console.error("❌ NO SE ENCONTRARON COORDENADAS VÁLIDAS EN NINGÚN CAMPO.");
                    alert("⚠️ ALERTA: No se encontraron coordenadas válidas en el expediente.");
                }
            } else {
                console.error("❌ EL DOCUMENTO NO EXISTE EN FIREBASE.");
            }
        }

        // C) ACTUALIZAR MAPA (SIEMPRE INTENTAR)
        if (coordenadasInicio) {
            console.log("🚀 Iniciando actualización de mapa hacia:", coordenadasInicio);
            actualizarMapaConFuerza(); // Llamada a la nueva función potente
            
            if (apiKey && datosFinales) {
                renderizarMiniatura('macro', datosFinales.geo_macro, apiKey);
                if(datosFinales.geo_micro) renderizarMiniatura('micro', datosFinales.geo_micro, apiKey);
            }
        }

    } catch (error) { console.error("Error grave:", error); }
}

// --- NUEVA FUNCIÓN: ACTUALIZAR MAPA CON FUERZA ---
function actualizarMapaConFuerza() {
    // Si el mapa ya existe, muévelo
    if (map && marker && coordenadasInicio) {
        console.log("🔄 Moviendo mapa existente...");
        google.maps.event.trigger(map, 'resize');
        map.setCenter(coordenadasInicio);
        marker.setPosition(coordenadasInicio);
        map.setZoom(16);
        if(cityCircle) cityCircle.setCenter(coordenadasInicio);
        actualizarInputs(marker.getPosition());
    } 
    // Si no existe, créalo
    else {
        console.log("🆕 Creando mapa nuevo...");
        initMap();
    }
}

// --- 7. LÓGICA DE MAPAS ---
function initMap() {
    // Usar coordenadas encontradas o defecto (CDMX)
    const posFinal = coordenadasInicio || { lat: 19.432608, lng: -99.133209 };
    const mapEl = document.getElementById("map-canvas");
    
    if(!mapEl) return;

    console.log("🗺️ initMap ejecutado en:", posFinal);

    map = new google.maps.Map(mapEl, { zoom: 15, center: posFinal, mapTypeId: "satellite", streetViewControl: false });
    marker = new google.maps.Marker({ position: posFinal, map: map, draggable: true });
    cityCircle = new google.maps.Circle({ strokeColor: "#FF0000", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#FF0000", fillOpacity: 0.20, map: map, center: posFinal, radius: 200 });

    marker.addListener("drag", () => { const pos = marker.getPosition(); cityCircle.setCenter(pos); actualizarInputs(pos); });
    marker.addListener("dragend", () => { const pos = marker.getPosition(); cityCircle.setCenter(pos); actualizarInputs(pos); });
    
    actualizarInputs(posFinal);
}

function actualizarInputs(pos) {
    const latField = document.getElementById('lat-field');
    const lngField = document.getElementById('lng-field');
    if(latField) latField.value = pos.lat().toFixed(6);
    if(lngField) lngField.value = pos.lng().toFixed(6);
}

function tomarSnapshot(tipo) {
    if (!map || !marker) return;
    const c = map.getCenter();
    const datos = {
        lat: c.lat(), lng: c.lng(), zoom: map.getZoom(),
        radio: cityCircle ? cityCircle.getRadius() : 200,
        fecha: new Date().toISOString()
    };
    guardarEnNube(`geo_${tipo}`, datos);
    
    const scriptMap = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    const apiKey = scriptMap ? new URL(scriptMap.src).searchParams.get("key") : "";
    renderizarMiniatura(tipo, datos, apiKey);
}

function renderizarMiniatura(tipo, datos, apiKey) {
    const container = document.getElementById(`preview-${tipo}`);
    if(!container) return;

    const embedUrl = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${datos.lat},${datos.lng}&zoom=${datos.zoom}&maptype=satellite`;
    let scaleFactor = datos.zoom >= 18 ? 3.5 : (datos.zoom >= 16 ? 2.0 : 0.5);
    const circlePixelSize = Math.min(180, (datos.radio / 5) * scaleFactor); 

    container.innerHTML = `
        <div class="relative w-full h-full overflow-hidden group bg-slate-100">
            <iframe width="100%" height="100%" style="border:0" loading="lazy" src="${embedUrl}" class="pointer-events-none"></iframe>
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600/20 border-2 border-red-600 rounded-full z-10" style="width: ${circlePixelSize}px; height: ${circlePixelSize}px;"></div>
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full z-20 -mt-1"><span class="material-symbols-rounded text-red-600 text-3xl drop-shadow-md">location_on</span></div>
        </div>
    `;
    const status = document.getElementById(`status-${tipo}`);
    if(status) {
        status.innerHTML = '✅ Listo';
        status.className = "text-[9px] text-emerald-600 font-bold bg-emerald-100 px-2 py-0.5 rounded-full";
    }
}

window.actualizarRadioMapa = function(val) {
    const metros = parseInt(val);
    document.getElementById('radio-valor').innerText = metros + "m";
    if(cityCircle) cityCircle.setRadius(metros);
};

// --- 8. UI Y NAVEGACIÓN ---
function navTo(id) {
    document.querySelectorAll('.section-wizard').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`section-${id}`);
    if(target) target.classList.remove('hidden');
    else {
        const generic = document.getElementById('section-generic');
        if(generic) generic.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('nav-active'));
    const navBtn = document.getElementById(`nav-${id}`);
    if(navBtn) navBtn.classList.add('nav-active');

    const secData = SECCIONES.find(s => s.id === id);
    if(secData) {
        const titleEl = document.getElementById('section-title');
        if(titleEl) titleEl.innerText = secData.nombre;
        
        // --- AQUÍ ESTÁ EL TRUCO PARA EL MAPA ---
        if(id === 2) {
            console.log("🔄 Entrando a sección mapa. Coordenadas actuales:", coordenadasInicio);
            actualizarMapaConFuerza();
        }
    }
}

function renderMenu() {
    const menu = document.getElementById('menu-dinamico'); 
    if(!menu) return;
    menu.innerHTML = '';
    SECCIONES.forEach(sec => {
        const btn = document.createElement('button');
        btn.className = 'nav-item w-full text-left px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-3 group';
        btn.id = `nav-${sec.id}`; btn.onclick = () => navTo(sec.id);
        btn.innerHTML = `<span class="material-symbols-rounded text-base text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-white transition-colors">${sec.icon}</span><span class="font-medium truncate">${sec.id}. ${sec.nombre}</span>`;
        menu.appendChild(btn);
    });
}

function toggleVisor() { document.getElementById('visor-panel').classList.toggle('open'); }
function toggleJack() { 
    const chat = document.getElementById('jack-chat'); 
    chat.classList.toggle('active'); 
    if(chat.classList.contains('active')) setTimeout(() => document.getElementById('jack-input').focus(), 300); 
}
async function preguntarAJack() { 
    const input = document.getElementById('jack-input');
    const mensaje = input.value.trim();
    if(!mensaje) return;
    agregarMensajeUI('user', mensaje);
    input.value = '';
    setTimeout(() => agregarMensajeUI('jack', 'Estoy listo para ayudarte con el avalúo.'), 1000);
}
function agregarMensajeUI(remitente, texto) {
     const contenedor = document.getElementById('jack-messages');
     const html = remitente === 'jack' 
        ? `<div class="flex gap-3 mb-4"><div class="w-6 h-6 rounded-full bg-jack-100 flex items-center justify-center text-jack-600 text-xs font-bold">J</div><div class="bg-white p-3 rounded-tr-xl rounded-br-xl rounded-bl-xl shadow-sm text-xs text-slate-600"><p>${texto}</p></div></div>`
        : `<div class="flex gap-3 mb-4 justify-end"><div class="bg-jack-600 p-3 rounded-tl-xl rounded-br-xl rounded-bl-xl shadow-sm text-xs text-white"><p>${texto}</p></div></div>`;
    contenedor.insertAdjacentHTML('beforeend', html);
}
function toggleDarkMode() { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); }
function checkTheme() { if(localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); }