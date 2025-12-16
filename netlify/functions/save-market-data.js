const admin = require('firebase-admin');

// Inicialización Robusta
const initFirebase = () => {
  if (admin.apps.length) return;

  let serviceAccount;
  try {
    // 1. Intento Local: Buscamos el archivo con doble extensión .json.json
    console.log("Buscando llave local: serviceaccountkey.json");
    serviceAccount = require('./serviceaccountkey.json');
  } catch (e) {
    console.log("No se encontró archivo local, buscando en entorno...");
    // 2. Intento Nube
    // Validamos que la variable exista ANTES de intentar parsearla para evitar el error "undefined"
    const envVar = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (envVar) {
        serviceAccount = JSON.parse(envVar);
    }
  }

  if (!serviceAccount) {
      throw new Error("FATAL: No se encontraron credenciales de Firebase (ni archivo local ni variable de entorno).");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
};

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