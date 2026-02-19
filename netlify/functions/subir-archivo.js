const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- 1. INICIALIZACIÓN (Mantenemos tu lógica blindada) ---
let serviceAccount = null;
if (admin.apps.length === 0) {
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
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: 'leezar-expedientes-prod'
        });
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket('leezar-expedientes-prod');

// --- CONFIGURACIÓN DE SEGURIDAD ---
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

    try {
        const { expedienteId, itemKey, archivoBase64, nombreArchivo, mimeType } = JSON.parse(event.body);

        // --- VALIDACIÓN 1: EXISTENCIA DE DATOS ---
        if (!expedienteId || !itemKey || !archivoBase64) {
            return { statusCode: 400, headers, body: 'Faltan datos obligatorios' };
        }

        // --- VALIDACIÓN 2: SEGURIDAD DE TIPO (Anti-Malware) ---
        if (!ALLOWED_MIMES.includes(mimeType)) {
            return { 
                statusCode: 403, 
                headers, 
                body: JSON.stringify({ error: 'Tipo de archivo no permitido. Solo JPG, PNG y PDF.' }) 
            };
        }

        // --- VALIDACIÓN 3: TAMAÑO (Anti-DoS) ---
        const buffer = Buffer.from(archivoBase64, 'base64');
        if (buffer.length > MAX_SIZE) {
            return { 
                statusCode: 413, 
                headers, 
                body: JSON.stringify({ error: 'El archivo excede el límite de 5MB.' }) 
            };
        }

        // --- VALIDACIÓN 4: EXISTENCIA DEL EXPEDIENTE ---
        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) {
            docRef = db.collection('expedientes_hipotecas').doc(expedienteId);
            doc = await docRef.get();
        }
        if (!doc.exists) return { statusCode: 404, headers, body: 'Expediente no encontrado' };

        const data = doc.data();
        const tipoTramite = (data.tipoTramite || 'AVALUO').replace(/\s+/g, '_');
        const categoriaItem = data.checklist?.[itemKey]?.categoria || 'general';

        // --- PROCESAMIENTO DE ARCHIVO SEGURO ---
        // Sanitizamos el nombre eliminando caracteres que puedan causar Path Traversal
        const safeFileName = nombreArchivo.replace(/[^a-zA-Z0-9.-]/g, '_'); 
        const rutaArchivo = `${tipoTramite}/${expedienteId}/${categoriaItem}/${Date.now()}_${safeFileName}`;
        const file = bucket.file(rutaArchivo);

        await file.save(buffer, {
            contentType: mimeType,
            resumable: false,
            metadata: { 
                metadata: { 
                    originalName: nombreArchivo, 
                    subidoPor: 'portal-cliente-verificado',
                    uploadIp: event.headers['x-forwarded-for'] || 'unknown'
                } 
            }
        });

        // Generar URL firmada (Vigencia larga para comodidad, pero controlada)
        const [signedUrl] = await file.getSignedUrl({ 
            action: 'read', 
            expires: '01-01-2030' 
        });

        // --- ACTUALIZACIÓN DE BASE DE DATOS ---
        await docRef.update({
            [`checklist.${itemKey}.estatus`]: 'revision',
            [`checklist.${itemKey}.driveLink`]: signedUrl, 
            [`checklist.${itemKey}.fileId`]: rutaArchivo, 
            [`checklist.${itemKey}.storageType`]: 'gcs_v1',
            [`checklist.${itemKey}.fechaCarga`]: new Date().toISOString(),
            [`checklist.${itemKey}.mimeType`]: mimeType
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                message: "Archivo verificado y subido con éxito",
                url: signedUrl 
            })
        };

    } catch (error) {
        console.error("Error Crítico en subida:", error);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Error interno al procesar el archivo" }) 
        };
    }
};