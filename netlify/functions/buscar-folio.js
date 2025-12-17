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
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { folio, id } = event.queryStringParameters;

  try {
    // ELIMINADO: initFirebase(); y redeclaración de db
    
    let querySnapshot;
    let docId;
    let data;

    // CASO 1: Búsqueda por ID
    if (id) {
      const doc = await db.collection('expedientes').doc(id).get();
      if (doc.exists) {
        docId = doc.id;
        data = doc.data().hojaTrabajo || {};
        if(doc.data().folioIdentificador) {
            data['folio-gys'] = doc.data().folioIdentificador;
        }
      }
    } 
    // CASO 2: Búsqueda por Folio
    else if (folio) {
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