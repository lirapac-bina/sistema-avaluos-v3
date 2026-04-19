const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Archivo Local (PC)
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

exports.handler = async (event, context) => {
    // REFERENCIA CORRECTA: 'configuracion' (según tu base de datos actual)
    const docRef = db.collection('configuracion').doc('legal');

    // Headers estándar para evitar errores de CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    // Manejo de Pre-flight (OPTIONS) para navegadores modernos
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // --- MODO LECTURA (GET) ---
        // Usado por: Portal y Admin (al cargar la página)
        if (event.httpMethod === 'GET') {
            const doc = await docRef.get();

            if (!doc.exists) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ htmlContent: "<p>Sin términos configurados.</p>" })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(doc.data())
            };
        }

        // --- MODO ESCRITURA (POST) ---
        // Usado por: Admin (al guardar cambios)
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);

            // Validación defensiva
            if (!data.htmlContent) {
                return { statusCode: 400, headers, body: "Error: Falta el contenido (htmlContent)" };
            }

            // Sobreescribir el documento con la nueva versión
            await docRef.set({ 
                htmlContent: data.htmlContent,
                ultimaModificacion: new Date().toISOString() 
            }, { merge: true });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: "Términos actualizados correctamente" })
            };
        }

        return { statusCode: 405, headers, body: "Method Not Allowed" };

    } catch (error) {
        console.error("Error en handler legal:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};