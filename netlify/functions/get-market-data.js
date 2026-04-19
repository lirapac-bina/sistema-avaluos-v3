const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
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

// ... DEJA EL RESTO DE TU CÓDIGO (exports.handler...) IGUAL ...

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
    const { id } = event.queryStringParameters;

    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta ID' }) };

    const doc = await db.collection('expedientes').doc(id).get();

    if (!doc.exists) return { statusCode: 200, headers, body: JSON.stringify({ data: {} }) };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: doc.data().hojaTrabajo || {} }),
    };

  } catch (error) {
    console.error("🔥 Error Get:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};