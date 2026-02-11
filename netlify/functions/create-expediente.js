const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN DE CARPETAS MAESTRAS (DRIVE) ---
const DRIVE_FOLDERS = {
    'PNA': '1s_Q8ZOk2GtaAbKmT7bY23G-IYgb-fZU-', 
    'EME': 'PONER_AQUI_EL_ID_DE_EME',
    'AVE': 'PONER_AQUI_EL_ID_DE_AVE' 
};

// --- 1. INICIALIZACIÓN BLINDADA ---
let serviceAccount = null;

if (admin.apps.length === 0) {
    // 1. Intentar leer de variable de entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { 
            // Primera pasada de parseo
            let parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            
            // PROTECCIÓN CONTRA DOBLE STRING: Si sigue siendo string, parseamos de nuevo
            if (typeof parsed === 'string') {
                console.log("⚠️ Detectado JSON con doble comilla, reparando...");
                parsed = JSON.parse(parsed);
            }
            serviceAccount = parsed;
        } 
        catch (e) { console.error("❌ Error CRÍTICO leyendo ENV:", e); }
    }
    
    // 2. Si falló, intentar archivo local (PC)
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

function obtenerListaSegura(obj, key) {
    if (!obj) return [];
    return obj[key] || obj[key.toUpperCase()] || obj[key.charAt(0).toUpperCase() + key.slice(1)] || [];
}

// --- FUNCIÓN HELPER: CREAR CARPETA EN DRIVE ---
async function crearCarpetaDrive(nombreCliente, unidad) {
    console.log(`🔍 DIAGNÓSTICO DRIVE | Cliente: ${nombreCliente} | Unidad: ${unidad}`);

    if (!serviceAccount) {
        console.error("❌ ERROR: serviceAccount es NULL. Revisa la variable FIREBASE_SERVICE_ACCOUNT en Netlify.");
        return null;
    }

    // --- REVISIÓN DE CREDENCIALES (Sin mostrar secretos) ---
    const hasEmail = !!serviceAccount.client_email;
    const keyLength = serviceAccount.private_key ? serviceAccount.private_key.length : 0;
    console.log(`🔍 ESTADO DE LLAVE: Email=${hasEmail} | KeyLength=${keyLength}`);

    if (!hasEmail || keyLength < 50) {
        console.error("❌ ERROR: Las credenciales están incompletas o vacías.");
        return null;
    }

    try {
        const parentFolderId = DRIVE_FOLDERS[unidad] || DRIVE_FOLDERS['AVE'];
        if (!parentFolderId || parentFolderId.includes('PONER_AQUI')) {
            console.warn(`⚠️ No hay ID de carpeta configurado para: ${unidad}`);
            return null;
        }

        // --- CORRECCIÓN DE LLAVE ---
        const cleanKey = (serviceAccount.private_key || '').replace(/\\n/g, '\n');

        // USAMOS GoogleAuth (Más robusto que JWT)
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: serviceAccount.client_email,
                private_key: cleanKey,
            },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // Crear la carpeta
        const fileMetadata = {
            'name': nombreCliente,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parentFolderId]
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        console.log(`✅ ¡ÉXITO! Carpeta creada en Drive (${unidad}): ${file.data.id}`);
        return file.data.id;

    } catch (error) {
        console.error("❌ ERROR FINAL DRIVE:", error.message);
        // Si el error es de autenticación, mostramos detalles extra
        if (error.code === 401 || error.code === 403) {
            console.error("💡 PISTA: Verifica que el email del robot tenga permiso de EDITOR en la carpeta de Drive.");
            console.error("💡 ROBOT EMAIL:", serviceAccount.client_email);
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
        const entidad = normalizar(data.entidad || 'GLOBAL'); 
        const tramite = normalizar(data.tipoTramite || 'AVALUO');
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

        console.log(`🔨 Creando Expediente: ${entidad} - ${tramite}`);

        let plantilla = null;
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            if (docSnap.exists) {
                const todo = docSnap.data().requisitos || docSnap.data();
                let plantillaEntidad = todo[entidad] || todo[Object.keys(todo).find(k => normalizar(k) === entidad)];
                if (!plantillaEntidad) plantillaEntidad = todo['GLOBAL'] || todo['VERACRUZ'] || PLANTILLA_RESPALDO;
                const servicios = plantillaEntidad.servicios || plantillaEntidad;
                plantilla = servicios[tramite] || servicios[Object.keys(servicios).find(k => normalizar(k) === tramite)];
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
        if (tramite.includes('AVALUO') || tramite.includes('HIPOTECA')) {
             checklistFinal['DETALLES_INMUEBLE'] = { nombre: 'Detalles del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'form', id: 'DETALLES_INMUEBLE' };
        }

        const nombreClienteFinal = normalizar(data.nombre) || "CLIENTE NUEVO";
        const unidadDestino = data.unidad || 'AVE'; 

        // --- INTENTO DE CREAR CARPETA ---
        let driveFolderId = null;
        if (serviceAccount) {
            driveFolderId = await crearCarpetaDrive(nombreClienteFinal, unidadDestino);
        } else {
            console.warn("⚠️ Saltando creación en Drive porque no hay serviceAccount.");
        }

        const nuevoExpediente = {
            tipoServicio: data.tipoServicio || 'avaluo',
            cliente: nombreClienteFinal, nombreCliente: nombreClienteFinal,
            telefono: data.telefono, entidad: entidad, tipoTramite: tramite, tramite: tramite, 
            numSolicitantes: numSol, numPropietarios: numProp,
            unidad: unidadDestino,
            driveFolderId: driveFolderId,
            checklist: checklistFinal, estatus: 'PENDIENTE',
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const coleccionDestino = tramite.includes('HIPOTECA') ? 'expedientes_hipotecas' : 'expedientes_avaluos';
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