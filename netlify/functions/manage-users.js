const admin = require('firebase-admin');

const initFirebase = () => {
  if (admin.apps.length) return;
  let serviceAccount;
  try {
    serviceAccount = require('./serviceaccountkey.json');
  } catch (e) {
    const envVar = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (envVar) serviceAccount = JSON.parse(envVar);
  }
  if (!serviceAccount) throw new Error("Credenciales no encontradas");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
};

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