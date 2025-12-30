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
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { expedienteId, itemKey, nuevoEstado, motivo } = JSON.parse(event.body);

        if (!expedienteId || !itemKey || !nuevoEstado) {
            return { statusCode: 400, body: 'Faltan datos' };
        }

        console.log(`Actualizando ${itemKey} a ${nuevoEstado}`);

        // 1. Buscar expediente (Avalúo o Hipoteca)
        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        
        if (!doc.exists) {
            docRef = db.collection('expedientes_hipotecas').doc(expedienteId);
            doc = await docRef.get();
        }

        if (!doc.exists) {
            return { statusCode: 404, body: 'Expediente no encontrado' };
        }

        // 2. Preparar actualización
        const updateData = {};
        updateData[`checklist.${itemKey}.estado`] = nuevoEstado; // 'validado' o 'rechazado'
        
        if (nuevoEstado === 'rechazado') {
            updateData[`checklist.${itemKey}.mensajeRechazo`] = motivo || 'Documento ilegible o incorrecto.';
            // Opcional: Borrar la URL para obligar a resubir visualmente, 
            // aunque es mejor mantenerla para historial y solo cambiar el estado.
        } else if (nuevoEstado === 'validado') {
            updateData[`checklist.${itemKey}.mensajeRechazo`] = null;
            // AQUÍ IRÁ LA LÓGICA DE MOVER A DRIVE EN EL FUTURO
        }

        await docRef.update(updateData);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Estatus actualizado', estado: nuevoEstado })
        };

    } catch (error) {
        console.error("Error update-status:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};