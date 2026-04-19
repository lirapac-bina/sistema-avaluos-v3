const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } catch(e){}
    }
    if (!serviceAccount) {
        try { serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'serviceaccountkey.json'), 'utf8')); } catch(e){}
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

exports.handler = async (event) => {
    const headers = { 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Headers": "Content-Type", 
        "Access-Control-Allow-Methods": "POST, OPTIONS" 
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    // 🔥 BLINDAJE: Solo aceptamos POST. Si intentan hacer GET para saltarse el PIN, los bloqueamos.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido. Acceso denegado.' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const expedienteId = body.expedienteId;
        const accessCode = body.accessCode;

        if (!expedienteId || !accessCode) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan credenciales de acceso' }) };
        }

        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) { docRef = db.collection('expedientes_hipotecas').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) { docRef = db.collection('Expedientes').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Expediente no encontrado' }) };

        const data = doc.data();

        // 🔥 VALIDACIÓN OBLIGATORIA DEL PIN
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
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Código incorrecto o acceso no autorizado.' }) };
            }
        }

        // Si pasó la seguridad, enviamos los datos
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
            unidad: data.unidad || 'AVE', 
            visitador: data.visitador || null,
            dibujante: data.dibujante || null
        };

        return { statusCode: 200, headers, body: JSON.stringify(responseData) };

    } catch (error) {
        console.error("Error get-expediente-details:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Error interno del servidor" }) };
    }
};