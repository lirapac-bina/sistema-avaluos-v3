const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA PARA NETLIFY ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
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
    // Solo POST
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        const { expedienteId, colaborador, rol } = data; // rol puede ser: 'capturista', 'dibujante', 'visitador'

        if (!expedienteId || !colaborador || !rol) {
            return { statusCode: 400, body: 'Faltan datos (ID, Colaborador o Rol)' };
        }

        console.log(`Asignando ${colaborador} como ${rol} al expediente ${expedienteId}`);

        // --- REGLA DE NEGOCIO: SOLO BUSCAR EN AVALUOS ---
        const docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return { statusCode: 404, body: 'Expediente no encontrado en Avalúos.' };
        }

        // Construir objeto de actualización dinámica
        let updateData = {};
        
        // 1. Guardar el nombre en el campo del rol (ej: 'capturista': 'Ana')
        updateData[rol] = colaborador;
        
        // 2. Guardar la fecha de asignación específica (ej: 'fechaAsignacionCapturista')
        // Convertimos la primera letra del rol a mayúscula para el nombre del campo (ej: Capturista)
        const rolCapitalizado = rol.charAt(0).toUpperCase() + rol.slice(1);
        updateData[`fechaAsignacion${rolCapitalizado}`] = new Date().toISOString();

        // Actualizar en Firebase
        await docRef.update(updateData);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Asignación exitosa', datos: updateData })
        };

    } catch (error) {
        console.error("Error crítico al asignar:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};