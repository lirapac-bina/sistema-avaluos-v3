const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Archivo Local (PC)
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
// ------------------------------

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const collection = db.collection('usuarios');

        // --- 1. LISTAR USUARIOS (GET) ---
        if (event.httpMethod === 'GET') {
            const snapshot = await collection.orderBy('nombre').get();
            const usuarios = [];
            
            snapshot.forEach(doc => {
                usuarios.push({ 
                    id: doc.id, 
                    ...doc.data() 
                });
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(usuarios)
            };
        }

        // --- 2. CREAR O EDITAR COMPLETO (POST) ---
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            
            // Validaciones mínimas obligatorias
            if (!data.email || !data.nombre || !data.rol) {
                return { 
                    statusCode: 400, 
                    headers, 
                    body: JSON.stringify({ error: 'Faltan datos obligatorios (email, nombre, rol)' }) 
                };
            }

            const emailLimpio = data.email.toLowerCase().trim();

            // Guardamos el objeto COMPLETO con las nuevas capacidades
            await collection.doc(emailLimpio).set({
                email: emailLimpio,
                nombre: data.nombre.toUpperCase(),
                rol: data.rol.toUpperCase(), // Nivel de Acceso
                
                // --- NUEVO: Array de funciones operativas (Checkboxes) ---
                funciones: data.funciones || [], 
                
                // --- NUEVO: URL de foto ---
                fotoUrl: data.fotoUrl || '',

                iniciales: (data.iniciales || '').toUpperCase(),
                pin: data.pin || '', // Solo si es admin
                celular: data.celular || '',
                fechaNacimiento: data.fechaNacimiento || '',
                
                activo: data.activo !== undefined ? data.activo : true,
                fechaActualizacion: new Date().toISOString()
            }, { merge: true });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Usuario guardado correctamente' })
            };
        }

        // --- 3. ELIMINAR (DELETE) ---
        if (event.httpMethod === 'DELETE') {
            const { email } = event.queryStringParameters;
            
            if (!email) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el parámetro email' }) };
            }

            await collection.doc(email).delete();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Usuario eliminado correctamente' })
            };
        }

        return { statusCode: 405, headers, body: 'Method Not Allowed' };

    } catch (error) {
        console.error("Error en manage-users:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};