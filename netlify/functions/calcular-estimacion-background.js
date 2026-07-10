// netlify/functions/calcular-estimacion-background.js
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT))
    });
}

exports.handler = async (event, context) => {
    try {
        const { parametros_motor, expedienteId } = JSON.parse(event.body);
        const API_KEY_SECRETA = process.env.LEEZAR_API_SECRET || process.env.LEEZAR_API_KEY_PYTHON; 
        const URL_CLOUD_FUNCTION = "https://motor-pericial-eme-o5hgi24naa-uc.a.run.app"; // Motor V20

        if (!API_KEY_SECRETA || !expedienteId) return;

        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_motor: 'PROCESANDO'
        }, { merge: true });

        // 🚀 DISPARO A PYTHON V20 (JSON PLANO)
        const response = await fetch(URL_CLOUD_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-leezar-secret': API_KEY_SECRETA
            },
            body: JSON.stringify(parametros_motor) // 🔥 AQUÍ ESTÁ LA MAGIA: Totalmente plano
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
                estatus_motor: 'ERROR', error_motor: data.error || "Fallo en motor."
            }, { merge: true });
            return;
        }

        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_motor: 'COMPLETADO',
            resultados_motor: data, 
            parametros_historico: parametros_motor 
        }, { merge: true });

    } catch (error) {
        console.error("Error crítico en background:", error);
    }
};