const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Evita errores si Firebase ya se inició
if (getApps().length === 0) {
    // Aquí carga tu llave recién renombrada
    var serviceAccount = require("./serviceaccountkey.json"); 
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

exports.handler = async (event, context) => {
    try {
        // Buscamos en la colección 'config' el documento 'legal'
        const docRef = db.collection('config').doc('legal');
        const doc = await docRef.get();

        if (!doc.exists) {
            return {
                statusCode: 200,
                body: JSON.stringify({ htmlContent: "<p>Cargando términos...</p>" })
            };
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(doc.data())
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};