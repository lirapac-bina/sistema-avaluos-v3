const admin = require('firebase-admin');

// 1. CONEXIÓN A FIREBASE
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const TOKEN_SECRETO = process.env.JACK_SECRET_TOKEN;

// --- FUNCIONES HELPER ---
function normalizar(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function obtenerListaSegura(obj, key) {
    if (!obj) return [];
    return obj[key] || obj[key.toUpperCase()] || obj[key.charAt(0).toUpperCase() + key.slice(1)] || [];
}

const PLANTILLA_RESPALDO = {
    solicitante: [{ id: 'INE', nombre: 'Identificación Oficial', obligatorio: true }],
    propietario: [{ id: 'ESCRITURA', nombre: 'Escritura Pública', obligatorio: true }],
    inmueble: [{ id: 'PREDIAL', nombre: 'Boleta Predial', obligatorio: true }]
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-jack-token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método no permitido.' };

    const incomingToken = event.headers['x-jack-token'];
    
    if (!TOKEN_SECRETO) return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuración de servidor incompleta." }) };
    if (incomingToken !== TOKEN_SECRETO) return { statusCode: 401, headers, body: JSON.stringify({ error: "Acceso denegado. No tienes autorización." }) };

    try {
        const data = JSON.parse(event.body);

        if (!data.nombreCompleto) return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el nombre del cliente" }) };

        // 🧠 --- MAGIA: LÓGICA DE CHECKLIST DINÁMICO ---
        const entidadBusqueda = normalizar(data.entidad || data.estado || 'NACIONAL (MASTER)'); 
        const tramiteBusqueda = normalizar(data.tipoTramite || data.tramite || data.servicio || 'AVALUO');
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

        let plantilla = null;
        let diccionarioGlobal = {};
        
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            if (docSnap.exists) {
                const dbData = docSnap.data();
                diccionarioGlobal = dbData.diccionario || {};
                const matriz = dbData.matriz || {};
                
                // 1. Buscar la entidad específica primero (Ej. "JALISCO")
                let plantillaEntidad = matriz[entidadBusqueda] || matriz[Object.keys(matriz).find(k => normalizar(k) === entidadBusqueda)];
                
                // 🌟 2. FALLBACK MAESTRO: Si no existe el estado, jalamos "NACIONAL (MASTER)"
                if (!plantillaEntidad) {
                    console.log(`Entidad '${entidadBusqueda}' no encontrada. Usando NACIONAL (MASTER)...`);
                    let masterKey = Object.keys(matriz).find(k => normalizar(k) === normalizar('NACIONAL (MASTER)'));
                    plantillaEntidad = matriz[masterKey];
                }
                
                // 3. Buscar el trámite dentro de la entidad encontrada
                if (plantillaEntidad) {
                    plantilla = plantillaEntidad[tramiteBusqueda] || plantillaEntidad[Object.keys(plantillaEntidad).find(k => normalizar(k) === tramiteBusqueda)];
                }
            }
        } catch (e) { console.error("Error leyendo plantilla:", e); }

        if (!plantilla) plantilla = PLANTILLA_RESPALDO;

        let checklistFinal = {};
        
        const procesarItems = (items, categoria, cantidad = 1) => {
            if (!items) return;
            items.forEach(item => {
                const infoDic = diccionarioGlobal[item.id] || { nombre: item.nombre || item.id, tipo: 'MIXTO', categoria: categoria };
                const loop = (categoria === 'solicitante' || categoria === 'propietario') ? cantidad : 1;
                
                for (let i = 0; i < loop; i++) {
                    let suffix = loop > 1 ? `_${i + 1}` : '';
                    let key = `${normalizar(item.id)}${suffix}`;
                    let nombre = `${infoDic.nombre}${loop > 1 ? ' (' + (i + 1) + ')' : ''}`;
                    
                    checklistFinal[key] = {
                        nombre: nombre, 
                        categoria: infoDic.categoria || categoria, 
                        estatus: 'PENDIENTE',
                        obligatorio: item.obligatorio !== false, 
                        tipo: infoDic.tipo || 'MIXTO', 
                        originalId: item.id
                    };
                    if (infoDic.plantilla) checklistFinal[key].plantilla = infoDic.plantilla;
                }
            });
        };

        procesarItems(obtenerListaSegura(plantilla, 'solicitante'), 'solicitante', numSol);
        procesarItems(obtenerListaSegura(plantilla, 'propietario'), 'propietario', numProp);
        procesarItems(obtenerListaSegura(plantilla, 'inmueble'), 'inmueble', 1);
        checklistFinal['UBICACION_MAPS'] = { nombre: 'Ubicación GPS', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'MAPA', id: 'UBICACION_MAPS' };

        // 🔥 CREACIÓN DEL EXPEDIENTE
        const nuevoExpediente = {
            cliente: data.nombreCompleto.toUpperCase(),
            nombreCliente: data.nombreCompleto.toUpperCase(), 
            telefono: data.celular || 'Sin teléfono',
            celular: data.celular || 'Sin teléfono',
            entidad: data.entidad || 'NACIONAL (MASTER)',
            tramite: data.servicio || 'No especificado',
            tipoTramite: data.servicio || 'No especificado', 
            tipoInmueble: 'POR DEFINIR', // <--- LO DEJAMOS ASÍ PARA QUE TÚ LO LLENES DESPUÉS
            numSolicitantes: numSol,
            numPropietarios: numProp,
            estatus: 'PENDIENTE',
            unidad: 'POR ASIGNAR', 
            origen: 'JACK_FORMULARIO', 
            checklist: checklistFinal,
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        // Guardamos dependiendo de si es avalúo o hipoteca (Misma lógica que create-expediente)
        const coleccionDestino = (data.servicio && data.servicio.toUpperCase().includes('HIPOTECA')) ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        const docRef = await db.collection(coleccionDestino).add(nuevoExpediente);
        
        console.log(`¡Jack atrapó un expediente! ID: ${docRef.id}`);

        return { statusCode: 200, headers, body: JSON.stringify({ message: "¡Pesca exitosa!", id: docRef.id }) };

    } catch (error) {
        console.error("Error procesando:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Error interno del servidor." }) };
    }
};