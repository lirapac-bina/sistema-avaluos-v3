const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- 1. INICIALIZACIÓN ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { }
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function normalizar(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

// Función segura para leer listas
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
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        const entidad = normalizar(data.entidad || 'GLOBAL'); 
        const tramite = normalizar(data.tipoTramite || 'AVALUO');
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

        console.log(`🔨 Creando Expediente: ${entidad} - ${tramite}`);

        // --- 2. LEER DE FIREBASE ---
        let plantilla = null;
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            if (docSnap.exists) {
                const todo = docSnap.data().requisitos || docSnap.data();
                let plantillaEntidad = todo[entidad] || todo[Object.keys(todo).find(k => normalizar(k) === entidad)];
                if (!plantillaEntidad) {
                    plantillaEntidad = todo['GLOBAL'] || todo[Object.keys(todo).find(k => normalizar(k) === 'GLOBAL')];
                }
                if (plantillaEntidad) {
                    plantilla = plantillaEntidad[tramite] || plantillaEntidad[Object.keys(plantillaEntidad).find(k => normalizar(k) === tramite)];
                }
            }
        } catch (e) { console.error("Error config:", e); }

        if (!plantilla) plantilla = PLANTILLA_RESPALDO;

        // --- 3. CONSTRUIR CHECKLIST ---
        let checklistFinal = {};
        
        const procesarLista = (origen, cantidad, rol) => {
            if (!origen) return;
            let items = Array.isArray(origen) ? origen : Object.values(origen);
            const loop = cantidad > 0 ? cantidad : 1;

            for (let i = 1; i <= loop; i++) {
                items.forEach(item => {
                    if (!item.nombre) return;
                    
                    const suffixID = loop > 1 ? `_${i}` : '';
                    let cleanID = item.id ? normalizar(item.id).replace(/\s+/g, '_') : `DOC_${Math.floor(Math.random()*99999)}`;
                    const nNorm = normalizar(item.nombre);
                    let esDeSistema = false; 
                    
                    // --- DETECCIÓN DE SISTEMA ---
                    
                    if (nNorm.includes('SOLICITUD') && nNorm.includes('AVAL')) {
                        cleanID = 'SOLICITUD_AVALUO_SYS'; 
                        esDeSistema = true;
                    }
                    else if (nNorm.includes('SOLICITUD') && nNorm.includes('INFONAVIT')) {
                        cleanID = 'SOLICITUD_INFONAVIT_SYS';
                        esDeSistema = true;
                    }
                    // CORRECCIÓN MAESTRA: SOLO SI ES SOLICITANTE ASIGNAMOS LA LLAVE MAESTRA
                    else if (nNorm.includes('CORREO') && rol.toLowerCase() === 'solicitante') {
                        cleanID = 'CORREO_ELECTRONICO_AUTO';
                        esDeSistema = true;
                    }

                    // --- LLAVE EXACTA PARA SISTEMA, DINÁMICA PARA EL RESTO ---
                    let finalKey = esDeSistema ? cleanID : `${cleanID}_${rol.toUpperCase()}${suffixID}`;

                    // Caso borde: Múltiples solicitantes con correo
                    if (esDeSistema && cleanID === 'CORREO_ELECTRONICO_AUTO' && i > 1) {
                         finalKey = `${cleanID}_${i}`; 
                    }

                    checklistFinal[finalKey] = {
                        id: cleanID,
                        nombre: item.nombre + (loop > 1 && !esDeSistema ? ` (${rol} ${i})` : ''),
                        categoria: rol.toLowerCase(), 
                        obligatorio: item.obligatorio !== false, 
                        estatus: 'PENDIENTE',
                        tipo: nNorm.includes('CORREO') ? 'TXT' : 'documento',
                        urlFormato: item.urlFormato || null, 
                        fecha: new Date().toISOString()
                    };
                });
            }
        };

        procesarLista(obtenerListaSegura(plantilla, 'solicitante'), numSol, 'Solicitante');
        procesarLista(obtenerListaSegura(plantilla, 'propietario'), numProp, 'Propietario');
        procesarLista(obtenerListaSegura(plantilla, 'inmueble'), 1, 'Inmueble');

        // --- 4. INYECCIONES DE SISTEMA (Solo si faltan) ---

        const existeKey = (key) => !!checklistFinal[key];

        // A) Mapa
        checklistFinal['UBICACION_MAPS'] = { 
            nombre: 'Ubicación del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'mapa', id: 'UBICACION_MAPS' 
        };

        // B) Correo (Si no venía en la BD del solicitante)
        if (!existeKey('CORREO_ELECTRONICO_AUTO')) {
            checklistFinal['CORREO_ELECTRONICO_AUTO'] = { 
                nombre: 'Correo electrónico', categoria: 'solicitante', estatus: 'PENDIENTE', obligatorio: true, tipo: 'TXT', id: 'CORREO_ELECTRONICO_AUTO' 
            };
        }

        // C) Fotos
        checklistFinal['FOTO_FACHADA'] = { 
            nombre: 'Foto de Fachada', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'imagen', seccion: 'FOTOS', id: 'FOTO_FACHADA' 
        };
        checklistFinal['FOTOS_INTERIORES_GENERAL'] = { 
            nombre: 'Fotografías Interiores y Entorno', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: false, tipo: 'galeria', seccion: 'FOTOS', id: 'FOTOS_INTERIORES_GENERAL' 
        };

        // D) Solicitudes Faltantes (Si la BD no las tenía)
        if (tramite.includes('INFONAVIT')) {
            if (!existeKey('SOLICITUD_AVALUO_SYS')) {
                checklistFinal['SOLICITUD_AVALUO_SYS'] = {
                    id: 'SOLICITUD_AVALUO_SYS',
                    nombre: 'Solicitud Avalúo', categoria: 'solicitante', estatus: 'PENDIENTE', obligatorio: true, tipo: 'documento',
                    urlFormato: 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-avaluo-ave-RLFaTVxxccFJWZIH.pdf'
                };
            }
            if (!existeKey('SOLICITUD_INFONAVIT_SYS')) {
                checklistFinal['SOLICITUD_INFONAVIT_SYS'] = {
                    id: 'SOLICITUD_INFONAVIT_SYS',
                    nombre: 'Solicitud Infonavit', categoria: 'solicitante', estatus: 'PENDIENTE', obligatorio: true, tipo: 'documento',
                    urlFormato: 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-infonavit-BvU7wD8zhF0udyEB.pdf'
                };
            }
            checklistFinal['DETALLES_INMUEBLE'] = { nombre: 'Detalles del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'form', id: 'DETALLES_INMUEBLE' };
        } else if (tramite.includes('AVALUO') || tramite.includes('HIPOTECA')) {
             checklistFinal['DETALLES_INMUEBLE'] = { nombre: 'Detalles del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'form', id: 'DETALLES_INMUEBLE' };
        }

        // --- 5. GUARDAR ---
        const nombreClienteFinal = data.nombre || "Cliente Nuevo";
        const nuevoExpediente = {
            ...data,
            nombreCliente: nombreClienteFinal, 
            cliente: nombreClienteFinal,
            checklist: checklistFinal,
            estatus: 'PENDIENTE',
            entidad: entidad, 
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const coleccionDestino = tramite.includes('HIPOTECA') ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        const ref = await db.collection(coleccionDestino).add(nuevoExpediente);

        return { 
            statusCode: 200, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                id: ref.id, 
                message: "Expediente Creado",
                url: `/portal.html?id=${ref.id}`
            }) 
        };

    } catch (error) {
        console.error("Error Create:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};