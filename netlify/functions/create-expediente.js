const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA PARA NETLIFY ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Archivo Local (PC) - Usando 'fs' para engañar a Netlify
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
// ------------------------------------------------

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