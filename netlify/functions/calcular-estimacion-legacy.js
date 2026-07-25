const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)) });
}

exports.handler = async (event, context) => {
    try {
        const { parametros_motor, expedienteId } = JSON.parse(event.body);
        const API_KEY_SECRETA = process.env.LEEZAR_API_SECRET || process.env.LEEZAR_API_KEY_PYTHON; 
        const URL_CLOUD_FUNCTION = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";

        if (!API_KEY_SECRETA || !expedienteId) return { statusCode: 400 };

        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_motor: 'PROCESANDO' }, { merge: true });

        const response = await fetch(URL_CLOUD_FUNCTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-leezar-secret': API_KEY_SECRETA },
            body: JSON.stringify({ parametros_motor: parametros_motor }) 
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_motor: 'ERROR', error_motor: data.error || "Fallo en motor." }, { merge: true });
            return { statusCode: 500 };
        }

        // 🔥 FIX: Guardamos como "parametros_motor" para que el Dashboard lo detecte
        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_motor: 'COMPLETADO',
            resultados_motor: data, 
            parametros_motor: parametros_motor 
        }, { merge: true });

        return { statusCode: 200, body: "OK" };
    } catch (error) {
        return { statusCode: 500, body: "Error" };
    }
};