const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- INICIALIZACIÓN BLINDADA ---
let serviceAccount = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { 
        let parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        serviceAccount = parsed;
    } 
    catch (e) { console.error("Error leyendo ENV:", e); }
}

if (!serviceAccount) {
    try {
        const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
        if (fs.existsSync(keyPath)) {
            serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        }
    } catch (e) { }
}

if (admin.apps.length === 0 && serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const bucket = admin.storage().bucket('leezar-expedientes-prod');

// Tu Puente Mágico Intacto
const APPS_SCRIPT_WEBHOOK = "https://script.google.com/macros/s/AKfycbzq3FGv2Hd7QVFsFy9ROP4T8ZS_jDr8pwvk8489lbsemlFaYz1cU_eX7kUaDHpVaibOmA/exec";

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const body = JSON.parse(event.body);
        
        const { expedienteId, itemKey, nuevoEstado, archivoPath, categoriaItem, motivo } = body;

        console.log(`📡 [STATUS] Petición recibida -> Item: ${itemKey} | Nuevo Estatus: ${nuevoEstado}`);

        if (!expedienteId || !itemKey || !nuevoEstado) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos' }) };
        }

        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) { docRef = db.collection('expedientes_hipotecas').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) { docRef = db.collection('Expedientes').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Expediente no encontrado' }) };

        const docData = doc.data();
        const itemAnterior = docData.checklist[itemKey] || {};

        let updateData = {
            [`checklist.${itemKey}.estatus`]: nuevoEstado,
            [`checklist.${itemKey}.fechaActualizacion`]: new Date().toISOString()
        };

        if (nuevoEstado === 'rechazado' && motivo) {
            updateData[`checklist.${itemKey}.retroalimentacion`] = motivo;
        }

        // 🔥 RECUPERAMOS EL MOTOR GENERADOR DE TOKENS 🔥
        let firebaseUrl = itemAnterior.url; 
        const pathEnNube = archivoPath || itemAnterior.archivoPath;

        if (archivoPath) {
            const token = crypto.randomUUID();
            await bucket.file(archivoPath).setMetadata({
                metadata: { firebaseStorageDownloadTokens: token }
            });
            const encodedPath = encodeURIComponent(archivoPath);
            firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

            updateData[`checklist.${itemKey}.url`] = firebaseUrl;
            updateData[`checklist.${itemKey}.archivoPath`] = archivoPath;
            console.log(`✅ [FIREBASE] Token generado para visualización en el Portal.`);
        }

        // ========================================================
        // 🌟 MAGIA MASIVA: TRANSFERENCIA A DRIVE VÍA PUENTE MÁGICO 🌟
        // ========================================================
        let archivosAPasar = [];
        
        // Si detecta la galería de fotos, recolecta todas las hijas (FOTO_EXTRA_)
        if (itemKey === 'FOTOS_INTERIORES_GENERAL') {
            Object.keys(docData.checklist).forEach(k => {
                if (k.includes('FOTO_EXTRA_')) {
                    const fotoItem = docData.checklist[k];
                    const urlReal = fotoItem.url || fotoItem.archivoUrl;
                    if (urlReal) {
                        archivosAPasar.push({
                            key: k,
                            url: urlReal,
                            nombreBase: fotoItem.nombre || k,
                            categoria: fotoItem.categoria || 'inmueble',
                            pathEnNube: fotoItem.archivoPath
                        });
                        // También validamos las hijas para que la BD esté limpia
                        updateData[`checklist.${k}.estatus`] = nuevoEstado; 
                    }
                }
            });
        } else {
            // Archivo normal individual
            if (firebaseUrl) {
                archivosAPasar.push({
                    key: itemKey,
                    url: firebaseUrl,
                    nombreBase: itemAnterior.nombre || itemKey,
                    categoria: categoriaItem || itemAnterior.categoria || 'solicitante',
                    pathEnNube: pathEnNube
                });
            }
        }

        if ((nuevoEstado === 'validado' || nuevoEstado === 'VALIDADO') && archivosAPasar.length > 0) {
            console.log(`🚀 [DRIVE] Estatus 'Validado'. Procesando ${archivosAPasar.length} archivo(s) en paralelo...`);
            
            // Enviamos todo a Drive en PARALELO para no superar el límite de tiempo de Netlify
            const promesasDrive = archivosAPasar.map(async (archivo) => {
                let catDrive = (archivo.categoria || 'solicitante').toLowerCase();
                const driveFolderId = docData.driveSubfolders ? docData.driveSubfolders[catDrive] : null;

                if (archivo.url && driveFolderId && APPS_SCRIPT_WEBHOOK.startsWith("https://script.google.com")) {
                    const extension = archivo.pathEnNube && archivo.pathEnNube.toLowerCase().endsWith('.pdf') ? '.pdf' : '.jpg';
                    const mimeType = extension === '.pdf' ? 'application/pdf' : 'image/jpeg';
                    
                    // Limitamos el nombre si es muy largo y agregamos un identificador único para no sobrescribir
                    const nomCorto = archivo.nombreBase.substring(0, 30).trim();
                    const hashCorto = Math.random().toString(36).substring(2, 6).toUpperCase();
                    const fileNameDrive = `${nomCorto}_${hashCorto}_${docData.cliente}${extension}`;

                    try {
                        const scriptResponse = await fetch(APPS_SCRIPT_WEBHOOK, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                secretToken: "LeezarMagia2026",
                                fileUrl: archivo.url, 
                                fileName: fileNameDrive,
                                mimeType: mimeType,
                                folderId: driveFolderId
                            })
                        });

                        const scriptData = await scriptResponse.json();
                        
                        if (scriptData.success) {
                            console.log(`✅ [DRIVE] Subido: ${fileNameDrive}`);
                            updateData[`checklist.${archivo.key}.driveUrl`] = scriptData.url;
                        } else {
                            console.error(`❌ [DRIVE] Error con ${fileNameDrive}:`, scriptData.error);
                        }
                    } catch (err) {
                        console.error(`❌ [DRIVE] Falla de conexión con ${fileNameDrive}:`, err.message);
                    }
                }
            });

            // Esperamos a que TODAS las subidas de Drive terminen
            await Promise.all(promesasDrive);
        }
        // ========================================================

        await docRef.update(updateData);
        console.log(`✅ [STATUS] Base de datos actualizada con éxito.`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Estatus actualizado' })
        };
    } catch (error) {
        console.error("❌ [ERROR CRÍTICO]", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};