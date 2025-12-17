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
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    initFirebase();
    const db = admin.firestore();
    const { action, email, nombre, rol } = JSON.parse(event.body);

    if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta email' }) };

    const emailLimpio = email.toLowerCase().trim();

    if (action === 'delete') {
        // DAR DE BAJA
        await db.collection('usuarios').doc(emailLimpio).delete();
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Usuario eliminado' }) };
    } else {
        // DAR DE ALTA / ACTUALIZAR
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