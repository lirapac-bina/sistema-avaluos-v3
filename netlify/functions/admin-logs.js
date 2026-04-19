const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
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
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const logsRef = db.collection('bitacora_sistema');

        // --- LECTURA (GET) ---
        if (event.httpMethod === 'GET') {
            // Traemos los últimos 50 logs ordenados por fecha
            const snapshot = await logsRef.orderBy('timestamp', 'desc').limit(50).get();
            const logs = [];
            snapshot.forEach(doc => logs.push(doc.data()));
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(logs)
            };
        }

        // --- ESCRITURA (POST) ---
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            
            const nuevoLog = {
                timestamp: Date.now(),
                fecha: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
                usuario: data.usuario || 'Desconocido',
                accion: data.accion || 'INFO',
                detalle: data.detalle || '-'
            };

            await logsRef.add(nuevoLog);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: "Log registrado" })
            };
        }

        return { statusCode: 405, body: "Method Not Allowed" };

    } catch (error) {
        console.error("Error logs:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};