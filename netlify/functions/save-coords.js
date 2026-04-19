const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } catch (e) { }
    }
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) { serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8')); }
        } catch (e) { }
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { expedienteId, lat, lng, direccion } = JSON.parse(event.body);

        if (!expedienteId || !lat || !lng) {
            return { statusCode: 400, body: 'Faltan datos' };
        }

        // Buscar en ambas colecciones
        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) {
            docRef = db.collection('expedientes_hipotecas').doc(expedienteId);
        }

        // Guardar coordenadas DIRECTAMENTE en el objeto del checklist
        // Esto es la "Materia Prima" pura en la base de datos
        await docRef.update({
            'checklist.UBICACION_MAPS.coordenadas': `${lat},${lng}`,
            'checklist.UBICACION_MAPS.direccion': direccion || 'Sin dirección',
            'checklist.UBICACION_MAPS.estatus': 'revision', // Bloqueamos edición
            'checklist.UBICACION_MAPS.fechaCarga': new Date().toISOString()
        });

        return { statusCode: 200, body: JSON.stringify({ message: "Coordenadas guardadas" }) };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};