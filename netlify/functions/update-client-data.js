const admin = require('firebase-admin');

// Inicialización Segura
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { id, nombre, telefono } = JSON.parse(event.body);

        if (!id) return { statusCode: 400, body: 'Falta ID' };

        // Buscar en todas las colecciones posibles (Avalúos primero)
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

        if (!doc.exists) return { statusCode: 404, body: JSON.stringify({error: 'Expediente no encontrado'}) };

        // ACTUALIZAR DATOS EN FIRESTORE
        await docRef.update({
            nombreCliente: nombre,
            cliente: nombre, // Guardamos en ambos campos por compatibilidad
            telefono: telefono
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Actualizado exitosamente' }) };

    } catch (error) {
        console.error("Error update:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};