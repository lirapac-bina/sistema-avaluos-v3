const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA (Igual que en tus otros archivos) ---
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
            } else {
                // Intento buscar un nivel arriba si está compilado
                const keyPathUp = path.resolve(__dirname, '../serviceaccountkey.json');
                if (fs.existsSync(keyPathUp)) serviceAccount = JSON.parse(fs.readFileSync(keyPathUp, 'utf8'));
            }
        } catch (e) { console.error("Error File:", e); }
    }
    
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("FATAL: No se encontró serviceAccountKey.");
    }
}
const db = admin.firestore();

exports.handler = async (event, context) => {
    // HEADERS CORS (Para permitir conexión desde el front)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    };

    // Manejo de Preflight (OPTIONS)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const collection = db.collection('usuarios');

        // --- 1. MODO POST: CREAR O ACTUALIZAR USUARIO ---
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            
            // Validaciones básicas
            if (!data.email) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el email' }) };
            }

            const emailLimpio = data.email.toLowerCase().trim();

            console.log(`📝 Actualizando usuario: ${emailLimpio} | PIN: ${data.pin ? '****' : 'Sin cambio'}`);

            // Objeto a guardar (Solo lo que venga definido)
            const updateData = {
                email: emailLimpio, // Siempre asegurar el ID
                fechaActualizacion: new Date().toISOString()
            };

            // Solo agregamos al objeto los campos que sí traen datos
            if (data.nombre) updateData.nombre = data.nombre.toUpperCase();
            if (data.rol) updateData.rol = data.rol.toUpperCase();
            if (data.iniciales) updateData.iniciales = data.iniciales.toUpperCase();
            if (data.celular) updateData.celular = data.celular;
            if (data.pin) updateData.pin = data.pin; // Guardamos el PIN tal cual (4 dígitos)
            if (data.fotoUrl) updateData.fotoUrl = data.fotoUrl;
            
            // Funciones operativas (Array)
            if (data.funciones) updateData.funciones = data.funciones;

            // Guardar en Firebase con { merge: true } para no borrar otros campos (como fechaAlta)
            await collection.doc(emailLimpio).set(updateData, { merge: true });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Usuario actualizado correctamente', id: emailLimpio })
            };
        }

        // --- 2. MODO GET: LISTAR USUARIOS (Respaldo) ---
        // Aunque admin.html usa get-users.js, dejamos este por si acaso.
        if (event.httpMethod === 'GET') {
            const snapshot = await collection.orderBy('nombre').get();
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

        // --- 3. MODO DELETE: BORRAR USUARIO ---
        if (event.httpMethod === 'DELETE') {
            const { email } = event.queryStringParameters;
            if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta email' }) };

            await collection.doc(email).delete();
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Usuario eliminado' })
            };
        }

        return { statusCode: 405, headers, body: 'Method Not Allowed' };

    } catch (error) {
        console.error("🔥 Error en manage-users:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};