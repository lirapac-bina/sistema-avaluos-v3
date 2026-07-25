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
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        // 🎯 QUITAMOS el orderBy('fecha') porque bloqueaba la consulta. Traemos los últimos 100 directos.
        const snapshot = await db.collection('tickets_motor').limit(100).get();

        const dictamenes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 🎯 Lógica de extracción de fecha (Idéntica a la que usas en tu historial)
            let fechaObjeto = new Date();
            if (data.resultado && data.resultado.fecha_emision) {
                fechaObjeto = new Date(data.resultado.fecha_emision);
            } else if (data.timestamp) {
                fechaObjeto = data.timestamp.toDate();
            } else if (doc.id.includes('_')) {
                const partes = doc.id.split('_');
                if (partes.length > 1 && !isNaN(partes[1])) {
                    fechaObjeto = new Date(parseInt(partes[1]));
                }
            }

            // Aseguramos capturar el email del usuario para mostrarlo en el Radar
            const emailUser = data.email || (data.parametros_motor ? data.parametros_motor.email_perito : null) || 'Desconocido';

            dictamenes.push({
                id: doc.id,
                ...data,
                fecha: fechaObjeto.toISOString(),
                email: emailUser
            });
        });

        // 🎯 Ordenamos en memoria (RAM) del más nuevo al más viejo
        dictamenes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        return { statusCode: 200, headers, body: JSON.stringify(dictamenes) };

    } catch (error) {
        console.error("[ERROR GET AUDITORIA]:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};