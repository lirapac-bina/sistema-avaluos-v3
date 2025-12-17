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
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    // ELIMINADO: initFirebase(); 
    
    const { action, email, nombre, rol } = JSON.parse(event.body);

    if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta email' }) };

    const emailLimpio = email.toLowerCase().trim();

    if (action === 'delete') {
        await db.collection('usuarios').doc(emailLimpio).delete();
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Usuario eliminado' }) };
    } else {
        if (!nombre || !rol) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos' }) };
        
        await db.collection('usuarios').doc(emailLimpio).set({
            nombre,
            rol,
            activo: true,
            fechaActualizacion: new Date().toISOString()
        }, { merge: true });

        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Usuario guardado' }) };
    }

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};