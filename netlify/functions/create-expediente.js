const admin = require('firebase-admin');
const { google } = require('googleapis'); // <--- REQUISITO: npm install googleapis
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN DE CARPETAS MAESTRAS (DRIVE) ---
// Aquí definimos "qué marca va en qué carpeta"
const DRIVE_FOLDERS = {
    'PNA': '1s_Q8ZOk2GtaAbKmT7bY23G-IYgb-fZU-', // ✅ ID CONFIRMADO (PNA)
    'EME': 'PONER_AQUI_EL_ID_DE_EME',           // ⚠️ PENDIENTE: Cambia esto por el ID real
    'AVE': 'PONER_AQUI_EL_ID_DE_AVE'            // ⚠️ PENDIENTE: Cambia esto por el ID real
};

// --- 1. INICIALIZACIÓN BLINDADA ---
let serviceAccount = null; // Lo hacemos global para reusarlo en Drive

if (admin.apps.length === 0) {
    // Intenta leer de variable de entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // Si no, intenta leer de archivo local (PC)
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

// --- FUNCIÓN HELPER: CREAR CARPETA EN DRIVE ---
async function crearCarpetaDrive(nombreCliente, unidad) {
    if (!serviceAccount) {
        console.error("❌ No hay credenciales para Drive.");
        return null;
    }

    try {
        // 1. Determinar la carpeta padre (PNA, EME o AVE)
        // Si la unidad no tiene carpeta, usamos la de AVE (o la que definas como default)
        const parentFolderId = DRIVE_FOLDERS[unidad] || DRIVE_FOLDERS['AVE'];
        
        if (!parentFolderId || parentFolderId.includes('PONER_AQUI')) {
            console.warn(`⚠️ No hay ID de carpeta configurado para: ${unidad}`);
            return null;
        }

        // 2. Autenticación con Google Drive
        const auth = new google.auth.JWT(
            serviceAccount.client_email,
            null,
            // 🔥 ESTA LÍNEA ES LA SOLUCIÓN: Reparamos los saltos de línea
            (serviceAccount.private_key || '').replace(/\\n/g, '\n'),
            ['https://www.googleapis.com/auth/drive']
        );
        const drive = google.drive({ version: 'v3', auth });

        // 3. Crear la carpeta
        const fileMetadata = {
            'name': nombreCliente, // Nombre de la carpeta = Nombre del Cliente
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parentFolderId] // ¡Aquí está la magia! La metemos en su "casa" correcta
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        console.log(`✅ Carpeta creada en Drive (${unidad}): ${file.data.id}`);
        return file.data.id;

    } catch (error) {
        console.error("❌ Error creando carpeta en Drive:", error);
        return null; // Si falla, no rompemos el proceso, solo no guardamos el ID
    }
}

const PLANTILLA_RESPALDO = {
    solicitante: [{ nombre: 'Identificación Oficial', id: 'INE', obligatorio: true }],
    propietario: [{ nombre: 'Escritura Pública', id: 'ESCRITURA', obligatorio: true }],
    inmueble: [{ nombre: 'Boleta Predial', id: 'PREDIAL', obligatorio: true }]
};

exports.handler = async (event, context) => {
    // Solo permitir POST
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        // Leemos y normalizamos la entidad y el trámite
        const entidad = normalizar(data.entidad || 'GLOBAL'); 
        const tramite = normalizar(data.tipoTramite || 'AVALUO');
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

        console.log(`🔨 Creando Expediente: ${entidad} - ${tramite}`);

        // --- 2. LEER CONFIGURACIÓN (PLANTILLA) ---
        let plantilla = null;
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            if (docSnap.exists) {
                const todo = docSnap.data().requisitos || docSnap.data();
                let plantillaEntidad = todo[entidad] || todo[Object.keys(todo).find(k => normalizar(k) === entidad)];
                
                if (!plantillaEntidad) {
                    console.warn(`⚠️ No se encontró config para ${entidad}, usando respaldo.`);
                    plantillaEntidad = todo['GLOBAL'] || todo['VERACRUZ'] || PLANTILLA_RESPALDO;
                }
                
                const servicios = plantillaEntidad.servicios || plantillaEntidad;
                plantilla = servicios[tramite] || servicios[Object.keys(servicios).find(k => normalizar(k) === tramite)];
            }
        } catch (e) {
            console.error("Error leyendo plantilla:", e);
        }

        if (!plantilla) {
            console.warn("⚠️ Usando plantilla de respaldo hardcoded");
            plantilla = PLANTILLA_RESPALDO;
        }

        // --- 3. GENERAR CHECKLIST ---
        let checklistFinal = {};
        const procesarItems = (items, categoria, cantidad = 1) => {
            if (!items) return;
            items.forEach(item => {
                const esMulti = item.multi || item.porPersona || false;
                const loop = esMulti ? cantidad : 1;
                for (let i = 0; i < loop; i++) {
                    let suffix = loop > 1 ? `_${i + 1}` : '';
                    let key = `${normalizar(item.id || item.nombre)}${suffix}`;
                    let nombre = `${item.nombre}${loop > 1 ? ' (' + (i + 1) + ')' : ''}`;
                    checklistFinal[key] = {
                        nombre: nombre,
                        categoria: categoria,
                        estatus: 'PENDIENTE',
                        obligatorio: item.obligatorio !== false,
                        tipo: item.tipo || 'archivo',
                        originalId: item.id
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

        // --- 4. PREPARAR DATOS DEL EXPEDIENTE ---
        const nombreClienteFinal = normalizar(data.nombre) || "CLIENTE NUEVO";
        
        // Detectamos la unidad para Drive y Logo
        const unidadDestino = data.unidad || 'AVE'; 

        // --- 4.5 CREAR CARPETA EN DRIVE (NUEVO) ---
        // Intentamos crear la carpeta antes de guardar en Firebase
        let driveFolderId = null;
        if (serviceAccount) {
            console.log(`📂 Intentando crear carpeta en Drive para: ${unidadDestino}`);
            driveFolderId = await crearCarpetaDrive(nombreClienteFinal, unidadDestino);
        }

        // --- 5. ARMAR EL OBJETO FINAL ---
        const nuevoExpediente = {
            tipoServicio: data.tipoServicio || 'avaluo',
            cliente: nombreClienteFinal,
            nombreCliente: nombreClienteFinal,
            telefono: data.telefono,
            entidad: entidad,
            tipoTramite: tramite,
            tramite: tramite, 
            numSolicitantes: numSol,
            numPropietarios: numProp,
            
            // Unidad para el logo del portal
            unidad: unidadDestino, 
            
            // ID de la carpeta en Drive (Si se creó con éxito)
            driveFolderId: driveFolderId || null,

            checklist: checklistFinal,
            estatus: 'PENDIENTE',
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        // --- 6. GUARDAR EN FIREBASE ---
        const coleccionDestino = tramite.includes('HIPOTECA') ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        const ref = await db.collection(coleccionDestino).add(nuevoExpediente);

        return { 
            statusCode: 200, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                id: ref.id, 
                message: "Expediente Creado",
                url: `/portal.html?id=${ref.id}`,
                driveFolderId: driveFolderId // Devolvemos el ID por si acaso
            }) 
        };

    } catch (error) {
        console.error("Error Create:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};