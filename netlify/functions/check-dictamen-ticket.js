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

const db = admin.firestore();

exports.handler = async (event, context) => {
    // Cabeceras de seguridad para lectura
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        // Extraer el ID de la URL (?id=ticket_12345)
        const ticket_id = event.queryStringParameters.id;
        
        if (!ticket_id) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ estatus: 'error', error: "Falta el ID del ticket de dictamen." }) 
            };
        }

        // Consultar la bóveda
        const doc = await db.collection('tickets_motor').doc(ticket_id).get();

        if (!doc.exists) {
            // Si el ticket aún no se crea por latencia de red, le decimos al frontend que siga esperando pacientemente
            return { statusCode: 200, headers, body: JSON.stringify({ estatus: 'procesando' }) };
        }

        // Devolver el estado actual del ticket (procesando, completado o error)
        const data = doc.data();
        return { statusCode: 200, headers, body: JSON.stringify(data) };

    } catch (error) {
        console.error("[ERROR POLLING DICTAMEN]:", error);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ estatus: 'error', error: "Error al consultar la bóveda de dictámenes." }) 
        };
    }
};