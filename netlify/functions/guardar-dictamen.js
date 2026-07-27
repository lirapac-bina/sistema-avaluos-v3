const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } catch (e) {}
    }
    if (serviceAccount) { admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); } 
    else { admin.initializeApp(); }
}

const db = admin.firestore();

exports.handler = async (event) => {
    try {
        const payload = JSON.parse(event.body);
        const { ticket_id, parametros_motor } = payload;
        
        if (!ticket_id || !parametros_motor) {
            return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos del expediente." }) };
        }
        
        // Guardamos el paquete pesado directamente en la base de datos
        await db.collection('tickets_motor').doc(ticket_id).set({ parametros_motor: parametros_motor }, { merge: true });
        
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};