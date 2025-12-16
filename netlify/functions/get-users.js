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