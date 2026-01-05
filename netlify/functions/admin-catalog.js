const admin = require('firebase-admin');

// Inicializar Firebase si no existe
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (error) {
        console.error('Error init Firebase:', error);
    }
}

const db = admin.firestore();

// PLANTILLA POR DEFECTO (Respaldo)
const PLANTILLA_DEFAULT = {
    'INE_SOLICITANTE': { nombre: 'INE Solicitante', texto: 'Frente y Vuelta', categoria: 'solicitante', activo: true },
    'CURP_SOLICITANTE': { nombre: 'CURP', texto: 'Descarga reciente', categoria: 'solicitante', activo: true },
    'ESCRITURA': { nombre: 'Escritura Pública', texto: 'Completa con sello RPP', categoria: 'inmueble', activo: true, permitirExtras: true },
    'PREDIAL': { nombre: 'Boleta Predial', texto: 'Año en curso', categoria: 'inmueble', activo: true }
};

exports.handler = async (event, context) => {
    // Referencia: configuracion -> plantilla_maestra
    const docRef = db.collection('configuracion').doc('plantilla_maestra');

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // --- MODO LECTURA (GET) ---
        if (event.httpMethod === 'GET') {
            const doc = await docRef.get();
            
            if (!doc.exists) {
                await docRef.set({ requisitos: PLANTILLA_DEFAULT });
                return { statusCode: 200, headers, body: JSON.stringify(PLANTILLA_DEFAULT) };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(doc.data().requisitos)
            };
        }

        // --- MODO GUARDADO (POST) ---
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            
            if (!data.requisitos) throw new Error("Faltan datos de requisitos");

            // CORRECCIÓN CRÍTICA: Quitamos { merge: true }
            // Ahora, lo que envíe el sistema REEMPLAZA totalmente lo que había.
            // Si borraste 'TJ' en el front, desaparecerá de la DB.
            await docRef.set({ requisitos: data.requisitos });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: "Catálogo actualizado y limpiado correctamente" })
            };
        }

        return { statusCode: 405, headers, body: "Method Not Allowed" };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};