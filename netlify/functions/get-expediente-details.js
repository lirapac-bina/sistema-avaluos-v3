const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIO DEL BLOQUE BLINDADO ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // Intenta leer de variable de entorno (Producción)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { console.error("Error ENV:", e); }
    }
    // Si no, intenta leer archivo local (Desarrollo)
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) { serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8')); }
        } catch (e) { }
    }
    if (serviceAccount) { admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); }
}
const db = admin.firestore();
// --- FIN DEL BLOQUE BLINDADO ---

exports.handler = async (event, context) => {
  try {
    // Permitir CORS preflight (OPTIONS)
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

    // 1. Buscar Documento (Prioridad Avaluos)
    let docRef = db.collection('expedientes_avaluos').doc(id);
    let doc = await docRef.get();
    
    // 2. Si no, buscar en Hipotecas
    if (!doc.exists) {
        docRef = db.collection('expedientes_hipotecas').doc(id);
        doc = await docRef.get();
    }

    // 3. Si no, buscar en Colección Genérica
    if (!doc.exists) {
        docRef = db.collection('Expedientes').doc(id);
        doc = await docRef.get();
    }

    if (!doc.exists) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
    }

    let data = doc.data();
    
    // --- 2. LÓGICA DE AUTO-REPARACIÓN (SELF-HEALING) ---
    let updates = {};
    let needsUpdate = false;
    const tramite = (data.tipoTramite || '').toUpperCase();

    if (tramite.includes('INFONAVIT')) {
        // Asegurar checklist
        if (!data.checklist) { 
            updates['checklist'] = {}; 
            data.checklist = {}; 
            needsUpdate = true; 
        }
        // Solicitud Infonavit
        if (!data.checklist['SOLICITUD_INFONAVIT']) {
            updates['checklist.SOLICITUD_INFONAVIT'] = {
                nombre: 'Solicitud Infonavit',
                estatus: 'pendiente',
                categoria: 'solicitante',
                opcional: false,
                fechaCreacionAuto: new Date().toISOString()
            };
            needsUpdate = true;
        }
        // Solicitud Avalúo
        if (!data.checklist['SOLICITUD_AVALUO']) {
            updates['checklist.SOLICITUD_AVALUO'] = {
                nombre: 'Solicitud Avalúo',
                estatus: 'pendiente',
                categoria: 'solicitante',
                opcional: false,
                fechaCreacionAuto: new Date().toISOString()
            };
            needsUpdate = true;
        }
    }

    // Aplicar cambios si es necesario
    if (needsUpdate) {
        console.log(`[Auto-Repair] Reparando expediente ${id}`);
        await docRef.update(updates);
        // Recargar datos frescos
        const newDoc = await docRef.get();
        data = newDoc.data();
    }
    // ----------------------------------------------------

    // RESPUESTA FINAL AL FRONTEND
    return {
      statusCode: 200,
      headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({
        id: doc.id, // Enviar ID por si acaso
        nombreCliente: data.nombreCliente || data.cliente || '',
        tipoTramite: data.tipoTramite || data.tramite || '',
        fechaCreacion: data.fechaCreacion,
        checklist: data.checklist || {},
        // IMPORTANTE: Aquí enviamos el teléfono para la seguridad
        telefono: data.telefono || "", 
        ubicacion: data.ubicacion || ""
      })
    };

  } catch (error) {
    console.error("Error get-details:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};