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

async function crearSubcarpeta(drive, nombre, parentId) {
    const fileMetadata = { 'name': nombre, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [parentId] };
    const file = await drive.files.create({ resource: fileMetadata, fields: 'id' });
    return file.data.id;
}

async function crearCarpetaDrive(nombreCliente, unidad) {
    if (!serviceAccount || !serviceAccount.client_email) return null;

    try {
        const parentFolderId = DRIVE_FOLDERS[unidad] || DRIVE_FOLDERS['AVE'];
        if (!parentFolderId || parentFolderId.includes('PONER_AQUI')) return null;

        const cleanKey = (serviceAccount.private_key || '').replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: serviceAccount.client_email, private_key: cleanKey },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        const mainFolder = await drive.files.create({
            resource: { 'name': nombreCliente, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [parentFolderId] },
            fields: 'id'
        });
        
        const mainFolderId = mainFolder.data.id;

        const [idExpediente, idDocJust, idFotos, idProyArq, idComparables] = await Promise.all([
            crearSubcarpeta(drive, 'EXPEDIENTE', mainFolderId),
            crearSubcarpeta(drive, 'DOC JUST', mainFolderId),
            crearSubcarpeta(drive, 'FOTOS', mainFolderId),
            crearSubcarpeta(drive, 'PROY ARQ', mainFolderId),
            crearSubcarpeta(drive, 'COMPARABLES', mainFolderId)
        ]);

        const [idInmueble, idPropietario, idSolicitante] = await Promise.all([
            crearSubcarpeta(drive, 'INMUEBLE', idExpediente),
            crearSubcarpeta(drive, 'PROPIETARIO', idExpediente),
            crearSubcarpeta(drive, 'SOLICITANTE', idExpediente)
        ]);
        
        return {
            main: mainFolderId,
            subfolders: { expediente: idExpediente, docJust: idDocJust, fotos: idFotos, proyArq: idProyArq, comparables: idComparables, inmueble: idInmueble, propietario: idPropietario, solicitante: idSolicitante }
        };

    } catch (error) { return null; }
}

const PLANTILLA_RESPALDO = {
    solicitante: [{ id: 'INE', nombre: 'Identificación Oficial', obligatorio: true }],
    propietario: [{ id: 'ESCRITURA', nombre: 'Escritura Pública', obligatorio: true }],
    inmueble: [{ id: 'PREDIAL', nombre: 'Boleta Predial', obligatorio: true }]
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        // 🧠 --- MAGIA: LÓGICA DE CHECKLIST DINÁMICO (CEREBRO RELACIONAL) ---
        const entidadBusqueda = normalizar(data.entidad || data.estado || 'GLOBAL'); 
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
                
                // 1. Buscar la entidad DENTRO de la Matriz
                let plantillaEntidad = matriz[entidadBusqueda] || matriz[Object.keys(matriz).find(k => normalizar(k) === entidadBusqueda)];
                
                // 2. Buscar el trámite
                if (plantillaEntidad) {
                    plantilla = plantillaEntidad[tramiteBusqueda] || plantillaEntidad[Object.keys(plantillaEntidad).find(k => normalizar(k) === tramiteBusqueda)];
                }
            }
        } catch (e) { console.error("Error leyendo plantilla:", e); }

        // Si la base de datos falla, usamos el respaldo de emergencia
        if (!plantilla) plantilla = PLANTILLA_RESPALDO;

        let checklistFinal = {};
        
        const procesarItems = (items, categoria, cantidad = 1) => {
            if (!items) return;
            items.forEach(item => {
                // 3. CRUZAR CON EL DICCIONARIO para obtener nombre real, tipo y plantilla
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
                    
                    // Si el diccionario tiene una plantilla PDF, se la pasamos al cliente
                    if (infoDic.plantilla) checklistFinal[key].plantilla = infoDic.plantilla;
                }
            });
        };

        procesarItems(obtenerListaSegura(plantilla, 'solicitante'), 'solicitante', numSol);
        procesarItems(obtenerListaSegura(plantilla, 'propietario'), 'propietario', numProp);
        procesarItems(obtenerListaSegura(plantilla, 'inmueble'), 'inmueble', 1);

       // Fijos inquebrantables
        checklistFinal['UBICACION_MAPS'] = { nombre: 'Ubicación GPS', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'MAPA', id: 'UBICACION_MAPS' };
        
        // 🧠 --- FIN LÓGICA DE CHECKLIST ---
        
        const nombreClienteFinal = data.nombre || data.cliente || "CLIENTE NUEVO";
        const unidadDestino = data.unidad || 'AVE'; 

        // --- CREACIÓN DE CARPETAS EN GOOGLE DRIVE ---
        let driveFolderId = null;
        let driveSubfolders = {}; 

        if (serviceAccount) {
            const driveResult = await crearCarpetaDrive(nombreClienteFinal, unidadDestino);
            if (driveResult) {
                driveFolderId = driveResult.main;
                driveSubfolders = driveResult.subfolders;
            }
        }

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
            tipoInmueble: data.tipoInmueble || 'CASA', 
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