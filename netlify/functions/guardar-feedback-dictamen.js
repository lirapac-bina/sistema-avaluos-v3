const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const body = JSON.parse(event.body);
        const { email, ticket_id, comentario } = body;

        if (!comentario) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Comentario vacío." }) };
        }

        // 🗂️ Guardar en una nueva colección dedicada al feedback
        await db.collection('feedback_dictamenes').add({
            email_perito: email || 'Desconocido',
            ticket_id: ticket_id || 'Sin folio',
            comentario: comentario,
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            atendido: false // Etiqueta para control de calidad interno
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: "Comentario guardado exitosamente." })
        };

    } catch (error) {
        console.error("[ERROR FEEDBACK]:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};