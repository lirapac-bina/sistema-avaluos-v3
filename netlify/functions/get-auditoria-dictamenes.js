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
        const snapshot = await db.collection('tickets_motor')
            .orderBy('fecha', 'desc')
            .limit(100)
            .get();

        const dictamenes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            let fechaISO = new Date().toISOString();
            if (data.fecha && typeof data.fecha.toDate === 'function') {
                fechaISO = data.fecha.toDate().toISOString();
            } else if (data.fecha) {
                try { fechaISO = new Date(data.fecha).toISOString(); } catch(e) {}
            }

            dictamenes.push({
                id: doc.id,
                ...data,
                fecha: fechaISO
            });
        });

        return { statusCode: 200, headers, body: JSON.stringify(dictamenes) };

    } catch (error) {
        console.error("[ERROR GET AUDITORIA]:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};