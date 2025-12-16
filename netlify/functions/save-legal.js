const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (getApps().length === 0) {
    var serviceAccount = require("./serviceaccountkey.json"); 
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

exports.handler = async (event, context) => {
    // Solo aceptamos peticiones POST (enviar datos)
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Método no permitido" };
    }

    try {
        const data = JSON.parse(event.body);
        
        // Guardamos el texto en la base de datos
        await db.collection('config').doc('legal').set({
            htmlContent: data.htmlContent,
            updatedAt: new Date().toISOString()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "¡Guardado con éxito!" })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};