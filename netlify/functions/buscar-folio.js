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