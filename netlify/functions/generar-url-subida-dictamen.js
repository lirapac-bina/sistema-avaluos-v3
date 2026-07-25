const admin = require('firebase-admin');

// --- INICIALIZACIÓN BLINDADA DE FIREBASE ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        admin.initializeApp();
    }
}

// 🪣 APUNTAMOS AL BUCKET PRINCIPAL
const bucket = admin.storage().bucket('leezar-expedientes-prod');

exports.handler = async (event) => {
    // Cabeceras CORS para permitir la comunicación con el Frontend
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const { ticketId, categoria, fileName, mimeType } = JSON.parse(event.body);

        // Barrera de Seguridad
        if (!ticketId || !categoria || !fileName) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos de identificación estructurales.' }) };
        }

        // 📂 SEPARACIÓN DE NEGOCIOS: Ruta exclusiva para AvEME
        const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = `DICTAMENES/${ticketId}/${categoria}/${safeFileName}`;
        const file = bucket.file(filePath);

        // 🎫 EMISIÓN DEL TICKET VIP (URL FIRMADA V4)
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 20 * 60 * 1000, // 20 minutos de caducidad
            contentType: mimeType,
        });

        // Devolvemos el pase de abordar y la ruta donde quedará alojado
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ uploadUrl: url, filePath: filePath })
        };

    } catch (error) {
        console.error("[AvEME] Error al generar URL firmada:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};