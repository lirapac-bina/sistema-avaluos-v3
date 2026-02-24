const admin = require('firebase-admin');

// 1. CONEXIÓN A FIREBASE
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        })
    });
}

const db = admin.firestore();

// 🔐 LEEMOS EL TOKEN DIRECTAMENTE DE LA BÓVEDA DE NETLIFY
const TOKEN_SECRETO = process.env.JACK_SECRET_TOKEN;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-jack-token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Método no permitido.' };
    }

    // 🛡️ VERIFICACIÓN DEL ESCUDO
    const incomingToken = event.headers['x-jack-token'];
    
    if (!TOKEN_SECRETO) {
        console.error("Falla de seguridad: El token no está configurado en Netlify.");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuración de servidor incompleta." }) };
    }

    if (incomingToken !== TOKEN_SECRETO) {
        console.warn("Intento de ataque bloqueado. Token incorrecto o ausente.");
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Acceso denegado. No tienes autorización." }) };
    }

    try {
        const data = JSON.parse(event.body);

        if (!data.nombreCompleto) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el nombre del cliente" }) };
        }

        const nuevoExpediente = {
            cliente: data.nombreCompleto.toUpperCase(),
            celular: data.celular || 'Sin teléfono',
            entidad: data.entidad || 'No especificada',
            tipoTramite: data.servicio || 'No especificado',
            tipoInmueble: data.tipoInmueble || 'No especificado',
            estatus: 'PENDIENTE',
            unidad: 'POR ASIGNAR', 
            fecha_creacion: admin.firestore.FieldValue.serverTimestamp(),
            origen: 'JACK_FORMULARIO', 
            checklist: {}, 
        };

        const docRef = await db.collection('expedientes_avaluos').add(nuevoExpediente);
        console.log(`¡Jack atrapó un expediente! ID: ${docRef.id}`);

        return { statusCode: 200, headers, body: JSON.stringify({ message: "¡Pesca exitosa!", id: docRef.id }) };

    } catch (error) {
        console.error("Error procesando:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Error interno del servidor." }) };
    }
};
// Empujoncito para que Netlify despierte