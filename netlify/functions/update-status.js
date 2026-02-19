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

        // 🔥 RECUPERAMOS EL MOTOR GENERADOR DE TOKENS QUE SE HABÍA BORRADO 🔥
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
        // 🌟 MAGIA: TRANSFERENCIA A DRIVE VÍA PUENTE MÁGICO 🌟
        // ========================================================
        if (nuevoEstado === 'validado' || nuevoEstado === 'VALIDADO') {
            console.log(`🚀 [DRIVE] Estatus 'Validado'. Iniciando teletransportación...`);
            
            let categoria = (categoriaItem || itemAnterior.categoria || 'solicitante').toLowerCase();
            const driveFolderId = docData.driveSubfolders ? docData.driveSubfolders[categoria] : null;

            if (firebaseUrl && driveFolderId && APPS_SCRIPT_WEBHOOK.startsWith("https://script.google.com")) {
                
                const nombreBase = itemAnterior.nombre || itemKey;
                const extension = pathEnNube && pathEnNube.toLowerCase().endsWith('.pdf') ? '.pdf' : '.jpg';
                const mimeType = extension === '.pdf' ? 'application/pdf' : 'image/jpeg';
                const fileNameDrive = `${nombreBase}_${docData.cliente}${extension}`;

                console.log(`📤 [DRIVE] Solicitando al Puente Mágico que guarde: ${fileNameDrive}`);

                const scriptResponse = await fetch(APPS_SCRIPT_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        secretToken: "LeezarMagia2026",
                        fileUrl: firebaseUrl, 
                        fileName: fileNameDrive,
                        mimeType: mimeType,
                        folderId: driveFolderId
                    })
                });

                const scriptData = await scriptResponse.json();
                
                if (scriptData.success) {
                    console.log(`✅ [DRIVE] ¡Magia completada! El archivo está en Drive. ID: ${scriptData.fileId}`);
                    updateData[`checklist.${itemKey}.driveUrl`] = scriptData.url;
                } else {
                    console.error("❌ [DRIVE] Error del Puente Mágico:", scriptData.error);
                }

            } else {
                console.warn(`⚠️ [DRIVE] Falta la URL del Apps Script o el ID de la subcarpeta.`);
            }
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