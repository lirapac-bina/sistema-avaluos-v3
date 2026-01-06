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

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let id;
    if (event.httpMethod === 'GET') {
        id = event.queryStringParameters.id;
    } else {
        const body = JSON.parse(event.body);
        id = body.id;
    }

    if (!id) return { statusCode: 400, body: 'Falta ID' };

    // 1. Buscar Documento
    let docRef = db.collection('expedientes_avaluos').doc(id);
    let doc = await docRef.get();
    
    if (!doc.exists) {
        docRef = db.collection('expedientes_hipotecas').doc(id);
        doc = await docRef.get();
    }
    if (!doc.exists) {
        docRef = db.collection('Expedientes').doc(id);
        doc = await docRef.get();
    }

    if (!doc.exists) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
    }

    let data = doc.data();
    
    // --- 2. LÓGICA DE AUTO-REPARACIÓN (DESACTIVADA POR SEGURIDAD) ---
    // Esta lógica estaba causando duplicados al inyectar documentos viejos.
    // El sistema de creación ya se encarga de esto.
    /* let updates = {};
    let needsUpdate = false;
    const tramite = (data.tipoTramite || '').toUpperCase();

    if (tramite.includes('INFONAVIT')) {
        // ... Código comentado para evitar inyección zombie ...
    }

    if (needsUpdate) {
        await docRef.update(updates);
        const newDoc = await docRef.get();
        data = newDoc.data();
    }
    */

    return {
      statusCode: 200,
      headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({
        id: doc.id,
        nombreCliente: data.nombreCliente || data.cliente || '',
        tipoTramite: data.tipoTramite || data.tramite || '',
        fechaCreacion: data.fechaCreacion,
        checklist: data.checklist || {},
        telefono: data.telefono || "",
        entidad: data.entidad || data.ubicacion || 'GLOBAL' 
      })
    };

  } catch (error) {
    console.error("Error get-details:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};