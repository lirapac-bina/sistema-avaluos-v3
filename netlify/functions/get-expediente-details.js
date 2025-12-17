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
    // Verificar método
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { id } = JSON.parse(event.body);
    if (!id) return { statusCode: 400, body: 'Falta ID' };

    // Buscar en ambas colecciones
    let doc = await db.collection('expedientes_avaluos').doc(id).get();
    
    // Si no está en avaluos, buscar en hipotecas (lógica defensiva)
    if (!doc.exists) {
        // Nota: Asegúrate de que esta colección exista si la vas a usar
        const docHip = await db.collection('expedientes_hipotecas').doc(id).get();
        if(docHip.exists) doc = docHip;
    }

    if (!doc.exists) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
    }

    const data = doc.data();
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
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