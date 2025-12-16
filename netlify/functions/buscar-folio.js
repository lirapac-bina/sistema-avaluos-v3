const admin = require('firebase-admin');

// Inicialización segura (Reutilizamos la lógica robusta)
const initFirebase = () => {
  if (admin.apps.length) return;
  
  // Intenta leer credenciales locales o de entorno
  let serviceAccount;
  try {
    serviceAccount = require('./serviceaccountkey.json'); // O .json.json según tu archivo
  } catch (e) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
  }

  if (!serviceAccount) throw new Error("No hay credenciales de Firebase");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
};

exports.handler = async (event, context) => {
  // Solo permitimos GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { folio, id } = event.queryStringParameters;

  try {
    initFirebase();
    const db = admin.firestore();
    let querySnapshot;
    let docId;
    let data;

    // CASO 1: Búsqueda por ID directo (usado al cargar la página)
    if (id) {
      const doc = await db.collection('expedientes').doc(id).get();
      if (doc.exists) {
        docId = doc.id;
        data = doc.data().hojaTrabajo || {};
        // Inyectamos el folioIdentificador si existe en la raíz
        if(doc.data().folioIdentificador) {
            data['folio-gys'] = doc.data().folioIdentificador;
        }
      }
    } 
    // CASO 2: Búsqueda por Folio GYS (usado en la lupa)
    else if (folio) {
      // Buscamos coincidencia exacta en el campo 'folioIdentificador'
      querySnapshot = await db.collection('expedientes')
        .where('folioIdentificador', '==', folio)
        .limit(1)
        .get();

      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        docId = doc.id;
        data = doc.data().hojaTrabajo || {};
      }
    }

    if (docId && data) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, data: data })
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Expediente no encontrado' })
      };
    }

  } catch (error) {
    console.error("Error buscar-folio:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};