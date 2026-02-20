const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN DE CARPETAS MAESTRAS (DRIVE) ---
const DRIVE_FOLDERS = {
    'PNA': '1s_Q8ZOk2GtaAbKmT7bY23G-IYgb-fZU-', 
    'EME': '1DLn4ZzxuzPlxI3M8tirndubZvNQtJwV-',
    'AVE': '1CKOOORFock0TsVbdgHmh4P9FSke2J75r'
};

// --- 1. INICIALIZACIÓN BLINDADA (CORREGIDA PARA NETLIFY) ---
let serviceAccount = null;

// A. SIEMPRE leemos la llave, no importa si Firebase ya está encendido
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { 
        let parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        serviceAccount = parsed;
    } 
    catch (e) { console.error("❌ Error leyendo ENV:", e); }
}

if (!serviceAccount) {
    try {
        const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
        if (fs.existsSync(keyPath)) {
            serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        }
    } catch (e) { console.error("❌ Error leyendo serviceaccountkey.json:", e); }
}

// B. Encendemos Firebase SOLO si estaba apagado
if (admin.apps.length === 0 && serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function normalizar(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function obtenerListaSegura(obj, key) {
    if (!obj) return [];
    return obj[key] || obj[key.toUpperCase()] || obj[key.charAt(0).toUpperCase() + key.slice(1)] || [];
}

// --- FUNCIÓN HELPER: CREAR SUBCARPETA ---
async function crearSubcarpeta(drive, nombre, parentId) {
    const fileMetadata = {
        'name': nombre,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parentId]
    };
    const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    });
    return file.data.id;
}

// --- FUNCIÓN PRINCIPAL: CREAR CARPETA MAESTRA Y SUBCARPETAS ---
async function crearCarpetaDrive(nombreCliente, unidad) {
    console.log(`🔍 DIAGNÓSTICO DRIVE | Intentando crear carpeta para: ${nombreCliente} | Unidad: ${unidad}`);

    if (!serviceAccount || !serviceAccount.client_email) {
        console.error("❌ ERROR DRIVE: No se encontró la llave de Firebase (serviceAccount) o le falta el correo.");
        return null;
    }

    try {
        const parentFolderId = DRIVE_FOLDERS[unidad] || DRIVE_FOLDERS['AVE'];
        if (!parentFolderId || parentFolderId.includes('PONER_AQUI')) {
            console.warn(`⚠️ ERROR DRIVE: No hay ID de carpeta configurado para la unidad: ${unidad}. No se crearán carpetas.`);
            return null;
        }

        const cleanKey = (serviceAccount.private_key || '').replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: serviceAccount.client_email,
                private_key: cleanKey,
            },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // 1. Crear la carpeta principal del cliente
        const mainFolderMeta = {
            'name': nombreCliente,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parentFolderId]
        };

        const mainFolder = await drive.files.create({
            resource: mainFolderMeta,
            fields: 'id'
        });
        
        const mainFolderId = mainFolder.data.id;
        console.log(`✅ DRIVE: Carpeta principal creada con ID: ${mainFolderId}`);

        // 2. MAGIA: Crear las 3 subcarpetas en paralelo
        const [idInmueble, idPropietario, idSolicitante] = await Promise.all([
            crearSubcarpeta(drive, 'INMUEBLE', mainFolderId),
            crearSubcarpeta(drive, 'PROPIETARIO', mainFolderId),
            crearSubcarpeta(drive, 'SOLICITANTE', mainFolderId)
        ]);

        console.log(`✅ DRIVE: Las 3 subcarpetas (INMUEBLE, PROPIETARIO, SOLICITANTE) fueron creadas exitosamente.`);
        
        // Devolvemos todos los IDs
        return {
            main: mainFolderId,
            subfolders: {
                inmueble: idInmueble,
                propietario: idPropietario,
                solicitante: idSolicitante
            }
        };

    } catch (error) {
        console.error("❌ ERROR FINAL DRIVE: La API de Google Drive rechazó la solicitud.", error.message);
        if (error.message.includes('insufficientFilePermissions') || error.message.includes('not found')) {
            console.error("👉 PISTA: Revisa que el correo del robot (" + serviceAccount.client_email + ") tenga permisos de 'Editor' en la carpeta de PNA.");
        }
        return null;
    }
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
        
        // 🔍 NORMALIZAMOS SOLO PARA BUSCAR LA PLANTILLA (No alteramos el texto original)
        const entidadBusqueda = normalizar(data.entidad || data.estado || 'GLOBAL'); 
        const tramiteBusqueda = normalizar(data.tipoTramite || data.tramite || 'AVALUO');
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

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

        const nombreClienteFinal = data.nombre || data.cliente || "CLIENTE NUEVO";
        const unidadDestino = data.unidad || 'AVE'; 

        // --- MAGIA: CREACIÓN DE CARPETAS EN GOOGLE DRIVE ---
        let driveFolderId = null;
        let driveSubfolders = {}; 

        if (serviceAccount) {
            const driveResult = await crearCarpetaDrive(nombreClienteFinal, unidadDestino);
            if (driveResult) {
                driveFolderId = driveResult.main;
                driveSubfolders = driveResult.subfolders;
            }
        } else {
             console.warn("⚠️ No se intentó crear carpeta en Drive porque no se detectó la llave.");
        }

        // 🔥 CORRECCIÓN: GUARDAMOS LOS DATOS ORIGINALES INTACTOS
        const nuevoExpediente = {
            tipoServicio: data.tipoServicio || data.servicio || 'Servicio General',
            cliente: nombreClienteFinal, 
            nombreCliente: nombreClienteFinal,
            telefono: data.telefono || "", 
            entidad: data.entidad || data.estado || 'GLOBAL', 
            tipoTramite: data.tipoTramite || data.tramite || 'Trámite', 
            tramite: data.tipoTramite || data.tramite || 'Trámite', 
            numSolicitantes: numSol, 
            numPropietarios: numProp,
            tipoInmueble: data.tipoInmueble || 'CASA', // 🏠 Conectado al catálogo
            unidad: unidadDestino,
            driveFolderId: driveFolderId,
            driveSubfolders: driveSubfolders, 
            checklist: checklistFinal, 
            estatus: 'PENDIENTE',
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const coleccionDestino = tramiteBusqueda.includes('HIPOTECA') ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        const ref = await db.collection(coleccionDestino).add(nuevoExpediente);

        return { 
            statusCode: 200, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                id: ref.id, message: "Expediente Creado",
                url: `/portal.html?id=${ref.id}`, driveFolderId: driveFolderId
            }) 
        };

    } catch (error) {
        console.error("Error Create:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};