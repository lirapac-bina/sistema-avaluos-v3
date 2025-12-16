// netlify/functions/create-expediente.js
const admin = require('firebase-admin');
const path = require('path');

// Inicialización Robusta (Igual que arriba)
if (admin.apps.length === 0) {
    try {
        const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
        admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
    } catch (e) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
        }
    }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        const coleccion = data.tipoServicio === 'hipoteca' ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        
        // Crear documento en Firebase
        const nuevoDoc = await db.collection(coleccion).add({
            nombreCliente: data.nombre,
            telefono: data.telefono,
            tipoTramite: data.tipoTramite,
            estado: data.estado,
            estatus: 'ACTIVO',
            fechaCreacion: new Date().toISOString(),
            // Checklist inicial vacío (se llenará en el portal)
            checklist: {} 
        });

        console.log("Expediente creado con ID:", nuevoDoc.id);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: "Creado con éxito", 
                id: nuevoDoc.id, // ¡ESTE ES EL ID QUE NECESITA EL FRONTEND!
                url: `/portal.html?id=${nuevoDoc.id}`
            })
        };

    } catch (error) {
        console.error("Error al crear:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};