const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// --- 1. INICIALIZACIÓN BLINDADA (CORREGIDA PARA NETLIFY) ---
let serviceAccount = null;

if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    try { 
        let parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
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
    // 🛡️ ESCUDO ANTI-SPAM (Reinyectado para proteger Drive)
    await new Promise(resolve => setTimeout(resolve, 400));
    return file.data.id;
}

// NUEVO: Recibe el parentFolderId dinámicamente desde la BD, ya no depende de variables fijas
async function crearCarpetaDrive(nombreCarpeta, parentFolderId) {
    if (!serviceAccount || !serviceAccount.client_email) return null;
    if (!parentFolderId || parentFolderId.includes('PONER_AQUI')) return null;

    try {
        const cleanKey = (serviceAccount.private_key || '').replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: serviceAccount.client_email, private_key: cleanKey },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // 🔥 FIX: Ahora usamos la variable correcta que armó el folio
        const mainFolder = await drive.files.create({
            resource: { 'name': nombreCarpeta, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [parentFolderId] },
            fields: 'id'
        });
        
        const mainFolderId = mainFolder.data.id;

        // 🇨🇭 MODO RELOJ SUIZO: Creación Secuencial para evitar el bloqueo por SPAM de Google
        const idExpediente = await crearSubcarpeta(drive, 'EXPEDIENTE', mainFolderId);
        const idDocJust = await crearSubcarpeta(drive, 'DOC JUST', mainFolderId);
        const idFotos = await crearSubcarpeta(drive, 'FOTOS', mainFolderId);
        const idProyArq = await crearSubcarpeta(drive, 'PROY ARQ', mainFolderId);
        const idComparables = await crearSubcarpeta(drive, 'COMPARABLES', mainFolderId);

        const idInmueble = await crearSubcarpeta(drive, 'INMUEBLE', idExpediente);
        const idPropietario = await crearSubcarpeta(drive, 'PROPIETARIO', idExpediente);
        const idSolicitante = await crearSubcarpeta(drive, 'SOLICITANTE', idExpediente);
        
        return {
            main: mainFolderId,
            subfolders: { expediente: idExpediente, docJust: idDocJust, fotos: idFotos, proyArq: idProyArq, comparables: idComparables, inmueble: idInmueble, propietario: idPropietario, solicitante: idSolicitante }
        };

    } catch (error) { 
        console.error("Error al crear carpeta en Google Drive:", error);
        return { errorGrave: error.message }; // <-- Atrapamos el grito de Google
    }
}



exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        // 🧠 --- MAGIA: LÓGICA DE CHECKLIST DINÁMICO ---
        const entidadBusqueda = normalizar(data.entidad || data.estado || 'GLOBAL'); 
        const tramiteBusqueda = normalizar(data.tipoTramite || data.tramite || data.servicio || 'GLOBAL');
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

        let plantilla = null;
        let diccionarioGlobal = {};
        
        // 🧠 --- MAGIA: LÓGICA DE CHECKLIST DINÁMICO (BLINDADO GLOBAL MASTER) ---
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            if (docSnap.exists) {
                const dbData = docSnap.data();
                diccionarioGlobal = dbData.diccionario || {};
                const matriz = dbData.matriz || {};

                // 1. Buscamos la Entidad Exacta. Si no existe, buscamos el MASTER (NACIONAL)
                let entidadKey = Object.keys(matriz).find(k => normalizar(k) === normalizar(entidadBusqueda));
                if (!entidadKey || !matriz[entidadKey]) {
                    console.log(`⚠️ Entidad no encontrada: ${entidadBusqueda}. Usando MASTER.`);
                    entidadKey = Object.keys(matriz).find(k => normalizar(k).includes('NACIONAL') || normalizar(k).includes('MASTER'));
                }
                
                if (entidadKey && matriz[entidadKey]) {
                    const entidadData = matriz[entidadKey];
                    
                    // 2. Buscamos el Trámite. Si no existe, forzamos a GLOBAL
                    let tramiteKey = Object.keys(entidadData).find(k => normalizar(k) === normalizar(tramiteBusqueda));
                    if (!tramiteKey || !entidadData[tramiteKey]) {
                        console.log(`⚠️ Trámite no encontrado: ${tramiteBusqueda}. Usando GLOBAL.`);
                        tramiteKey = Object.keys(entidadData).find(k => normalizar(k).includes('GLOBAL'));
                    }
                    
                    if (tramiteKey) {
                        plantilla = entidadData[tramiteKey];
                    }
                }
                
                // 3. 🛟 SALVAVIDAS ABSOLUTO NIVEL DIOS
                if (!plantilla) {
                    console.log("🛟 Activando salvavidas absoluto NIVEL DIOS...");
                    // Busca automáticamente tu carpeta "NACIONAL_(MASTER)"
                    const masterKey = Object.keys(matriz).find(k => k.toUpperCase().includes('NACIONAL') || k.toUpperCase().includes('MASTER'));
                    if (masterKey && matriz[masterKey]) {
                        // Busca automáticamente la subcarpeta "GLOBAL"
                        const globalKey = Object.keys(matriz[masterKey]).find(k => k.toUpperCase().includes('GLOBAL'));
                        if (globalKey) {
                            plantilla = matriz[masterKey][globalKey];
                        }
                    }
                }
            }
        } catch (e) { 
            console.error("Error crítico leyendo plantilla:", e); 
        }

        // 🛡️ ESCUDO ANTI-ERROR 500: Si falla todo, salva el expediente con requisitos en blanco para no perder al cliente.
        if (!plantilla) {
            console.error("⚠️ No hay matriz válida. Salvando expediente en blanco.");
            plantilla = { solicitante: [], propietario: [], inmueble: [] };
        }

        let checklistFinal = {};
        
        const procesarItems = (items, categoria, cantidad = 1) => {
            if (!items) return;
            items.forEach(item => {
                // Normalizamos el ID para evitar duplicados por nombres similares
                const itemKey = normalizar(item.id);
                const infoDic = diccionarioGlobal[item.id] || { nombre: item.nombre || item.id, tipo: 'MIXTO', categoria: categoria };
                const loop = (categoria === 'solicitante' || categoria === 'propietario') ? cantidad : 1;
                
                for (let i = 0; i < loop; i++) {
                    let suffix = loop > 1 ? `_${i + 1}` : '';
                    let key = `${itemKey}${suffix}`;
                    
                    // 🛡️ BLINDAJE ANTI-DUPLICADOS: Solo agregamos si no existe ya en el checklistFinal
                    if (!checklistFinal[key]) {
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
                    } else {
                        console.warn(`⚠️ Requisito duplicado detectado y bloqueado: ${key}`);
                    }
                }
            });
        };

        procesarItems(obtenerListaSegura(plantilla, 'solicitante'), 'solicitante', numSol);
        procesarItems(obtenerListaSegura(plantilla, 'propietario'), 'propietario', numProp);
        procesarItems(obtenerListaSegura(plantilla, 'inmueble'), 'inmueble', 1);
        checklistFinal['UBICACION_MAPS'] = { nombre: 'Ubicación GPS', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'MAPA', id: 'UBICACION_MAPS' };
        
        // --- CONFIGURACIÓN DE UNIDAD Y GOOGLE DRIVE 100% DINÁMICO ---
        const nombreClienteFinal = data.nombre || data.cliente || "CLIENTE NUEVO";
        
        // 🌟 MAGIA: Recibimos el Folio y armamos la nomenclatura profesional
        const folioOperativo = data.folioOperativo ? data.folioOperativo.trim().toUpperCase() : "SIN FOLIO";
        const nombreCarpetaDrive = folioOperativo !== "SIN FOLIO" ? `${folioOperativo} - ${nombreClienteFinal}` : nombreClienteFinal;
        const unidadDestino = data.unidad || 'AVE'; 

        let driveFolderId = null;
        let driveSubfolders = {}; 
        let parentFolderId = null;

        let errorDeGoogle = null;
        try {
            const unidadDoc = await db.collection('unidades_valuacion').doc(unidadDestino).get();
            if (unidadDoc.exists) {
                parentFolderId = unidadDoc.data().drive_id;
            }
        } catch (e) { console.error("Error al buscar unidad en DB:", e); }

        if (serviceAccount && parentFolderId) {
            parentFolderId = parentFolderId.trim(); // <-- Escudo contra espacios basura invisibles
            const driveResult = await crearCarpetaDrive(nombreCarpetaDrive, parentFolderId);
            if (driveResult && driveResult.main) {
                driveFolderId = driveResult.main;
                driveSubfolders = driveResult.subfolders;
            } else if (driveResult && driveResult.errorGrave) {
                errorDeGoogle = driveResult.errorGrave; // <-- Guardamos el error
            }
        }

const nuevoExpediente = {
            folioOperativo: folioOperativo,
            tipoServicio: data.tipoServicio || data.servicio || 'Servicio General',
            cliente: nombreClienteFinal, 
            nombreCliente: nombreClienteFinal,
            telefono: data.telefono || data.celular || "", // 🔥 FIX: Acepta teléfono o celular sin perderlo
            entidad: data.entidad || data.estado || 'GLOBAL', 
            tipoTramite: data.tipoTramite || data.tramite || 'Trámite', 
            tramite: data.tipoTramite || data.tramite || 'Trámite', 
            numSolicitantes: numSol, 
            numPropietarios: numProp,
            tipoInmueble: data.tipoInmueble || 'POR DEFINIR', // 🔥 FIX: Nace como "POR DEFINIR"
            anotacion: data.anotacion || '', // 🔥 FIX: Aquí atrapamos la nota de Jack (Yucatán / Comercial)
            unidad: unidadDestino,
            driveFolderId: driveFolderId,
            driveSubfolders: driveSubfolders, 
            checklist: checklistFinal, 
            estatus: unidadDestino === 'POR ASIGNAR' ? 'NUEVO' : 'PENDIENTE', // 🔥 FIX: Nace como NUEVO para Gestión
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const coleccionDestino = tramiteBusqueda.includes('HIPOTECA') ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        const ref = await db.collection(coleccionDestino).add(nuevoExpediente);

// ========================================================
        // 🚀 AVISAR A TELEGRAM LA ASIGNACIÓN DE UNIDAD
        // ========================================================
        try {
            // 🔥 ESCUDO ANTI-DUPLICADOS: Solo notifica "Asignado" si NO está en "POR ASIGNAR"
            if (unidadDestino !== "POR ASIGNAR") {
                // 🔥 PEGA AQUÍ TU NUEVA URL DE APPS SCRIPT (REEMPLAZA EL TEXTO ENTRE COMILLAS)
                const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyKstgpJXXRNZrXzPAs4gxGP2ImQ1j9xJ7uSVffZNptBFLoBmVbnC07tXHDgme6NteE/exec";
                const finalUrl = APPS_SCRIPT_URL + "?cliente=" + encodeURIComponent(data.nombre) + "&unidad=" + encodeURIComponent(unidadDestino) + "&main=" + encodeURIComponent(ref.id);
                
                // Disparamos la notificación a Telegram
                await fetch(finalUrl, { method: 'POST' });
                console.log("✅ [NOTIFICACIÓN] Aviso de asignación enviado a Telegram.");
            } else {
                console.log("⚠️ [NOTIFICACIÓN] Expediente en POR ASIGNAR. Se omite webhook de auto-asignación.");
            }
        } catch (e) {
            console.error("❌ [NOTIFICACIÓN] Error al avisar a Jack:", e.message);
        }

        return { 
            statusCode: 200, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                id: ref.id, message: "Expediente Creado",
                url: `/portal.html?id=${ref.id}`, driveFolderId: driveFolderId,
                errorDrive: errorDeGoogle // <-- Lo enviamos al frontend
            }) 
        };

    } catch (error) {
        console.error("Error Create:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};