const admin = require('firebase-admin');

// 1. CONEXIÓN A FIREBASE (Versión Dieta AWS)
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// 🔐 LEEMOS EL TOKEN DIRECTAMENTE DE LA BÓVEDA DE NETLIFY
const TOKEN_SECRETO = process.env.JACK_SECRET_TOKEN;

// --- FUNCIONES HELPER (El cerebro clonado del Chef) ---
function normalizar(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function obtenerListaSegura(obj, key) {
    if (!obj) return [];
    return obj[key] || obj[key.toUpperCase()] || obj[key.charAt(0).toUpperCase() + key.slice(1)] || [];
}

const PLANTILLA_RESPALDO = {
    solicitante: [{ nombre: 'Identificación Oficial', id: 'INE', obligatorio: true }],
    propietario: [{ nombre: 'Escritura Pública', id: 'ESCRITURA', obligatorio: true }],
    inmueble: [{ nombre: 'Boleta Predial', id: 'PREDIAL', obligatorio: true }]
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-jack-token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método no permitido.' };

    // 🛡️ VERIFICACIÓN DEL ESCUDO
    const incomingToken = event.headers['x-jack-token'];
    
    if (!TOKEN_SECRETO) return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuración de servidor incompleta." }) };
    if (incomingToken !== TOKEN_SECRETO) return { statusCode: 401, headers, body: JSON.stringify({ error: "Acceso denegado. No tienes autorización." }) };

    try {
        const data = JSON.parse(event.body);

        if (!data.nombreCompleto) return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el nombre del cliente" }) };

        // 🧠 --- MAGIA: LÓGICA DE CHECKLIST DINÁMICO ---
        const entidadBusqueda = normalizar(data.entidad || 'GLOBAL'); 
        const tramiteBusqueda = normalizar(data.servicio || 'AVALUO');
        const numSol = 1;
        const numProp = 1;

        let plantilla = null;
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            if (docSnap.exists) {
                const todo = docSnap.data().requisitos || docSnap.data();
                let plantillaEntidad = todo[entidadBusqueda] || todo[Object.keys(todo).find(k => normalizar(k) === entidadBusqueda)];
                if (!plantillaEntidad) plantillaEntidad = todo['GLOBAL'] || todo['VERACRUZ'] || PLANTILLA_RESPALDO;
                const servicios = plantillaEntidad.servicios || plantillaEntidad;
                plantilla = servicios[tramiteBusqueda] || servicios[Object.keys(servicios).find(k => normalizar(k) === tramiteBusqueda)];
            }
        } catch (e) { console.error("Error leyendo plantilla:", e); }

        if (!plantilla) plantilla = PLANTILLA_RESPALDO;

        let checklistFinal = {};
        const procesarItems = (items, categoria, cantidad = 1) => {
            if (!items) return;
            items.forEach(item => {
                const loop = (item.multi || item.porPersona) ? cantidad : 1;
                for (let i = 0; i < loop; i++) {
                    let suffix = loop > 1 ? `_${i + 1}` : '';
                    let key = `${normalizar(item.id || item.nombre)}${suffix}`;
                    let nombre = `${item.nombre}${loop > 1 ? ' (' + (i + 1) + ')' : ''}`;
                    checklistFinal[key] = {
                        nombre: nombre, categoria: categoria, estatus: 'PENDIENTE',
                        obligatorio: item.obligatorio !== false, tipo: item.tipo || 'archivo', originalId: item.id
                    };
                }
            });
        };

        procesarItems(obtenerListaSegura(plantilla, 'solicitante'), 'solicitante', numSol);
        procesarItems(obtenerListaSegura(plantilla, 'propietario'), 'propietario', numProp);
        procesarItems(obtenerListaSegura(plantilla, 'inmueble'), 'inmueble', 1);

        checklistFinal['UBICACION_MAPS'] = { nombre: 'Ubicación GPS', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'mapa', id: 'UBICACION_MAPS' };
        if (tramiteBusqueda.includes('AVALUO') || tramiteBusqueda.includes('HIPOTECA')) {
             checklistFinal['DETALLES_INMUEBLE'] = { nombre: 'Detalles del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'form', id: 'DETALLES_INMUEBLE' };
        }
        // 🧠 --- FIN LÓGICA DE CHECKLIST ---

        // 🔥 CORRECCIÓN: NOMBRES DE VARIABLES Y FORMATO DE FECHA
        const nuevoExpediente = {
            cliente: data.nombreCompleto.toUpperCase(),
            nombreCliente: data.nombreCompleto.toUpperCase(), // Alias para el portal
            telefono: data.celular || 'Sin teléfono',
            celular: data.celular || 'Sin teléfono',
            entidad: data.entidad || 'GLOBAL',
            tramite: data.servicio || 'No especificado',
            tipoTramite: data.servicio || 'No especificado', // Alias para el portal
            tipoInmueble: data.tipoInmueble || 'CASA',
            numSolicitantes: numSol,
            numPropietarios: numProp,
            estatus: 'PENDIENTE',
            unidad: 'POR ASIGNAR', 
            origen: 'JACK_FORMULARIO', 
            checklist: checklistFinal, // <-- AQUÍ SE INYECTA LA LISTA ARMADA
            fechaCreacion: new Date().toISOString(), // <-- FECHA ATÓMICA CORREGIDA
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Para ordenar la tabla
        };

        const docRef = await db.collection('expedientes_avaluos').add(nuevoExpediente);
        console.log(`¡Jack atrapó un expediente! ID: ${docRef.id}`);

        return { statusCode: 200, headers, body: JSON.stringify({ message: "¡Pesca exitosa!", id: docRef.id }) };

    } catch (error) {
        console.error("Error procesando:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Error interno del servidor." }) };
    }
};