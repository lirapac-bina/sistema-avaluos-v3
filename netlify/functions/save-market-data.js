const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA PARA NETLIFY ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Archivo Local (PC) - Usando 'fs' para engañar a Netlify
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
// ------------------------------------------------

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    initFirebase();
    const db = admin.firestore();
    const payload = JSON.parse(event.body);
    const { expedienteId, data, timestamp } = payload;

    if (!expedienteId || !data) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos' }) };
    }

    // Lógica de Folio para el buscador
    const folioEtiqueta = data['folio-gys'] ? data['folio-gys'].trim() : 'SIN_FOLIO';

    console.log(`💾 Guardando ID: ${expedienteId}`);

    await db.collection('expedientes').doc(expedienteId).set({
      hojaTrabajo: data,
      folioIdentificador: folioEtiqueta,
      ultimaActualizacion: timestamp
    }, { merge: true });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Guardado exitoso', id: expedienteId }),
    };

  } catch (error) {
    console.error("🔥 Error Save:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};