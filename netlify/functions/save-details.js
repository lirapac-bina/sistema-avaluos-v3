const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
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
        const { expedienteId, itemKey, datos, textoDirecto } = JSON.parse(event.body);

        if (!expedienteId || !itemKey) {
            return { statusCode: 400, body: 'Faltan datos' };
        }

        // Buscar en colecciones
        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) {
            docRef = db.collection('expedientes_hipotecas').doc(expedienteId);
        }

        const updateData = {};
        
        // Estado a revisión automáticamente
        updateData[`checklist.${itemKey}.estatus`] = 'revision';
        updateData[`checklist.${itemKey}.fechaCarga`] = new Date().toISOString();
        updateData[`checklist.${itemKey}.retroalimentacion`] = null; // Limpiar rechazos previos

        // Si mandamos datos estructurados (Formulario Detalles)
        if (datos) {
            updateData[`checklist.${itemKey}.metaData`] = datos; // Guardamos el JSON del form
            // Creamos un resumen de texto para visualización rápida
            let resumen = "DETALLES DEL INMUEBLE:\n";
            for (const [k, v] of Object.entries(datos)) {
                resumen += `${k.toUpperCase()}: ${v}\n`;
            }
            updateData[`checklist.${itemKey}.textoPreview`] = resumen;
            updateData[`checklist.${itemKey}.tipo`] = 'TXT'; // Forzamos tipo texto para el visor
        }

        // Si mandamos texto directo (Correo)
        if (textoDirecto) {
            updateData[`checklist.${itemKey}.textoPreview`] = textoDirecto;
            updateData[`checklist.${itemKey}.tipo`] = 'TXT';
        }

        await docRef.update(updateData);

        return { statusCode: 200, body: JSON.stringify({ message: "Detalles guardados" }) };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};