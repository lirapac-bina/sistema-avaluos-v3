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
    }
}
const db = admin.firestore();
// --- FIN DEL BLOQUE BLINDADO ---

exports.handler = async (event, context) => {
  try {
    // CAMBIO IMPORTANTE: Permitir GET y POST
    // Si es GET, el navegador pide datos. Si es POST, quizás envías algo.
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // CAMBIO IMPORTANTE: Buscar el ID donde corresponda
    let id;
    
    if (event.httpMethod === 'GET') {
        // En GET, el ID viene en la URL (queryStringParameters)
        id = event.queryStringParameters.id;
    } else {
        // En POST, el ID viene en el cuerpo (body)
        const body = JSON.parse(event.body);
        id = body.id;
    }

    if (!id) return { statusCode: 400, body: 'Falta ID' };

    // Buscar en ambas colecciones
    let doc = await db.collection('expedientes_avaluos').doc(id).get();
    
    // Si no está en avaluos, buscar en hipotecas (lógica defensiva)
    if (!doc.exists) {
        const docHip = await db.collection('expedientes_hipotecas').doc(id).get();
        if(docHip.exists) doc = docHip;
    }

    if (!doc.exists) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
    }

    const data = doc.data();
    
    return {
      statusCode: 200,
      headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" // Ayuda a evitar bloqueos locales
      },
      body: JSON.stringify({
        nombreCliente: data.nombreCliente || data.cliente || '',
        tipoTramite: data.tipoTramite || data.tramite || '',
        fechaCreacion: data.fechaCreacion,
        checklist: data.checklist || {} 
      })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};