const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Intento Nube (Variable de entorno)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Intento Local (Archivo físico)
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json'); // Busca en la misma carpeta functions
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            } else {
                // Intento buscar un nivel arriba si está compilado
                const keyPathUp = path.resolve(__dirname, '../serviceaccountkey.json');
                if (fs.existsSync(keyPathUp)) serviceAccount = JSON.parse(fs.readFileSync(keyPathUp, 'utf8'));
            }
        } catch (e) { console.error("Error File:", e); }
    }
    
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("FATAL: No se encontró serviceAccountKey.");
    }
}
const db = admin.firestore();

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const snapshot = await db.collection('usuarios').get();
        const users = [];
        
        snapshot.forEach(doc => {
            // Combinamos el ID del documento con sus datos
            users.push({ 
                email: doc.id, // Usamos el ID del doc como email principal
                ...doc.data() 
            });
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(users),
        };

    } catch (error) {
        console.error("Error get-users:", error);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: error.message }) 
        };
    }
};