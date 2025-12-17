const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIO DEL BLOQUE BLINDADO ---
if (admin.apps.length === 0) {
    let serviceAccount;

    // 1. Si estamos en Netlify (Nube), usa la variable de entorno
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) { console.error("Error ENV:", e); }
    }

    // 2. Si estamos en Local (PC), busca el archivo PERO usando 'fs' 
    // (Al usar 'fs', engañamos a Netlify para que no intente empaquetarlo)
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { }
    }

    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("ERROR FATAL: No hay credenciales de Firebase disponibles.");
    }
}
const db = admin.firestore();
// --- FIN DEL BLOQUE BLINDADO ---

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    initFirebase();
    const db = admin.firestore();
    
    const snapshot = await db.collection('usuarios').get();
    const users = [];
    
    snapshot.forEach(doc => {
      users.push({ email: doc.id, ...doc.data() });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(users),
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};