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
    // (Al usar 'fs', engañamos a Netlify para que no intente empaquetarlo)
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
    } else {
        console.error("ERROR FATAL: No hay credenciales de Firebase disponibles.");
    }
}
const db = admin.firestore();
// --- FIN DEL BLOQUE BLINDADO ---

    // Buscar en ambas colecciones
    let doc = await db.collection('expedientes_avaluos').doc(id).get();
    if (!doc.exists) doc = await db.collection('expedientes_hipotecas').doc(id).get();

    if (!doc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };

    const data = doc.data();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        nombreCliente: data.nombreCliente,
        tipoTramite: data.tipoTramite,
        fechaCreacion: data.fechaCreacion,
        checklist: data.checklist || {} // Devuelve el checklist guardado
      })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};