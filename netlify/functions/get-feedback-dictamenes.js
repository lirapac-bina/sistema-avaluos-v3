const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA (Idéntica a tu función de guardado) ---
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
        const snapshot = await db.collection('feedback_dictamenes').get();
        const feedbacks = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 🎯 CORRECCIÓN 1: Manejo correcto del Timestamp nativo de Firebase
            let fechaISO = new Date().toISOString();
            if (data.fecha && typeof data.fecha.toDate === 'function') {
                fechaISO = data.fecha.toDate().toISOString();
            } else if (data.fecha) {
                try { fechaISO = new Date(data.fecha).toISOString(); } catch(e) {}
            }

            feedbacks.push({
                id: doc.id,
                // 🎯 CORRECCIÓN 2: Leemos 'email_perito' tal como lo guardas
                email: data.email_perito || data.email || 'Desconocido',
                comentario: data.comentario || 'Sin comentario',
                fecha: fechaISO
            });
        });

        // Ordenar del más reciente al más antiguo
        feedbacks.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        return { statusCode: 200, headers, body: JSON.stringify(feedbacks) };

    } catch (error) {
        console.error("[ERROR GET FEEDBACK]:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};