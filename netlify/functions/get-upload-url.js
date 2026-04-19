const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } catch (e) { }
    }
    if (!serviceAccount) {
        try { serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'serviceaccountkey.json'), 'utf8')); } catch (e) { }
    }
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
}

const db = admin.firestore();

// 🔥 LA SOLUCIÓN AL ERROR 500: APUNTAR AL BUCKET EXACTO
const bucket = admin.storage().bucket('leezar-expedientes-prod');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const { expedienteId, itemKey, fileName, mimeType } = JSON.parse(event.body);

        if (!expedienteId || !itemKey) {
            return { statusCode: 400, headers, body: 'Faltan datos' };
        }

        const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = `AVALUOS/${expedienteId}/${itemKey}/${safeFileName}`;
        const file = bucket.file(filePath);

        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 20 * 60 * 1000, 
            contentType: mimeType,
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ uploadUrl: url, filePath: filePath })
        };
    } catch (error) {
        console.error("Error en get-upload-url:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};