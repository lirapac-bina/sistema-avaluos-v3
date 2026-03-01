const admin = require('firebase-admin');

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

const ESTRUCTURA_DEFAULT = {
    diccionario: {},
    matriz: {}
};

exports.handler = async (event, context) => {
    const docRef = db.collection('configuracion').doc('plantilla_maestra');

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        // --- MODO LECTURA (GET) ---
        if (event.httpMethod === 'GET') {
            const doc = await docRef.get();
            
            // Si no existe o tiene la estructura vieja del dinosaurio, inyectamos el nuevo modelo matriz
            if (!doc.exists || !doc.data().diccionario) {
                await docRef.set(ESTRUCTURA_DEFAULT);
                return { statusCode: 200, headers, body: JSON.stringify(ESTRUCTURA_DEFAULT) };
            }

            return { statusCode: 200, headers, body: JSON.stringify(doc.data()) };
        }

        // --- MODO GUARDADO (POST) ---
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            
            if (!data.diccionario || !data.matriz) throw new Error("Falta estructura Diccionario/Matriz");

            // Guardamos la nueva estructura relacional
            await docRef.set({ 
                diccionario: data.diccionario, 
                matriz: data.matriz 
            });

            return { statusCode: 200, headers, body: JSON.stringify({ message: "Catálogo Matriz actualizado" }) };
        }

        return { statusCode: 405, headers, body: "Method Not Allowed" };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};