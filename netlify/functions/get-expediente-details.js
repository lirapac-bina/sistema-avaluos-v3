const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch(e){}
    }
    if (!serviceAccount) {
        try { serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'serviceaccountkey.json'), 'utf8')); } catch(e){}
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

exports.handler = async (event) => {
    // 1. Cabeceras correctas para evitar errores de CORS
    const headers = { 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Headers": "Content-Type", 
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS" 
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        let expedienteId, accessCode;

        // 2. ENRUTADOR INTELIGENTE (POST para Portal, GET para Mesa de Gestión)
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            expedienteId = body.expedienteId;
            accessCode = body.accessCode;
        } else if (event.httpMethod === 'GET') {
            expedienteId = event.queryStringParameters.id;
        } else {
            return { statusCode: 405, headers, body: 'Method Not Allowed' };
        }

        if (!expedienteId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta ID' }) };

        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) { docRef = db.collection('expedientes_hipotecas').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) { docRef = db.collection('Expedientes').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Expediente no encontrado' }) };

        const data = doc.data();

        // 3. SEGURIDAD CERO TRUST (SOLO APLICA AL PORTAL CLIENTE / POST)
        if (event.httpMethod === 'POST') {
            const telefonoRaw = String(data.telefono || data.phone || '0000');
            const telefonoReal = telefonoRaw.replace(/\D/g, ''); 
            let ultimos4 = telefonoReal.slice(-4);
            if (telefonoReal.length < 4) ultimos4 = telefonoRaw.trim(); 

            const inputCode = String(accessCode).trim();

            if (inputCode !== ultimos4) {
                // Consultar Bóveda de Llave Maestra
                const seguridadRef = db.collection('configuracion').doc('seguridad');
                const seguridadDoc = await seguridadRef.get();
                let llaveMaestra = seguridadDoc.exists ? seguridadDoc.data().llave_maestra : null;

                if (!llaveMaestra || inputCode !== String(llaveMaestra).trim()) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Código incorrecto' }) };
                }
            }
        }

        // 4. DATOS DEVUELTOS (¡Aquí va la unidad para el Logo!)
        const responseData = {
            id: doc.id,
            nombreCliente: data.nombreCliente || data.cliente || '',
            tipoTramite: data.tipoTramite || data.tramite || '',
            fechaCreacion: data.fechaCreacion,
            checklist: data.checklist || {},
            telefono: data.telefono || "",
            entidad: data.entidad || data.ubicacion || 'GLOBAL',
            estatusGeneral: data.estatus || 'ACTIVO',
            direccion: data.direccion || '',
            coordenadas: data.coordenadas || null,
            unidad: data.unidad || 'AVE', // <-- ESTO REPARA LOS LOGOS PNA / EME
            visitador: data.visitador || null,
            dibujante: data.dibujante || null
        };

        return { statusCode: 200, headers, body: JSON.stringify(responseData) };

    } catch (error) {
        console.error("Error get-expediente-details:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Error interno" }) };
    }
};