const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
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
// ------------------------------

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Método no permitido" };
    }

    try {
        const data = JSON.parse(event.body);
        
        await db.collection('config').doc('legal').set({
            htmlContent: data.htmlContent,
            updatedAt: new Date().toISOString()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "¡Guardado con éxito!" })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};