const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA DE FIREBASE ---
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
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
}

const db = admin.firestore();
const COLLECTION_NAME = 'usuarios_dictamen';

exports.handler = async (event, context) => {
    // CORS Header
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (event.httpMethod === 'GET') {
            // Leer todos los usuarios del ecosistema AvEME
            const snapshot = await db.collection(COLLECTION_NAME).get();
            const usuarios = [];
            snapshot.forEach(doc => {
                usuarios.push({ id: doc.id, ...doc.data() });
            });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(usuarios)
            };
        }

        if (event.httpMethod === 'POST') {
            // Crear o actualizar un usuario pericial
            const data = JSON.parse(event.body);
            const { email, nombre, telefono, perfil, cedula_profesional, id_eme, activo, firma_base64 } = data;

            if (!email) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'El email es obligatorio como llave primaria.' }) };
            }

            const usuarioRef = db.collection(COLLECTION_NAME).doc(email);
            
            // Construcción dinámica del payload para no sobreescribir datos con nulls
            const payload = {
                actualizadoEn: new Date().toISOString()
            };
            
            if (nombre !== undefined) payload.nombre = nombre;
            if (telefono !== undefined) payload.telefono = telefono;
            if (perfil !== undefined) payload.perfil = parseInt(perfil, 10);
            if (cedula_profesional !== undefined) payload.cedula_profesional = cedula_profesional;
            if (id_eme !== undefined) payload.id_eme = id_eme;
            if (activo !== undefined) payload.activo = activo;
            if (firma_base64 !== undefined) payload.firma_base64 = firma_base64; // NUEVO: Firma autógrafa PNG sin fondo

            await usuarioRef.set(payload, { merge: true });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Usuario de dictamen procesado correctamente.', email: email })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error("Error en manage-usuarios-dictamen:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Error interno del servidor', detalle: error.message })
        };
    }
};