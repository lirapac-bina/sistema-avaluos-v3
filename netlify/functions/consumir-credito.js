const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)) });
}

exports.handler = async (event, context) => {
    try {
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return { statusCode: 401, body: 'No autorizado' };
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 🔥 FIX: Recibimos valor_elegido
        const { parametros_motor, expedienteId, valor_elegido } = JSON.parse(event.body);
        const API_KEY_SECRETA = process.env.LEEZAR_API_SECRET || process.env.LEEZAR_API_KEY_PYTHON; 
        const URL_CLOUD_FUNCTION = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";

        if (!API_KEY_SECRETA || !expedienteId || !parametros_motor) return { statusCode: 400, body: 'Faltan parámetros' };

        const userRef = admin.firestore().collection('usuarios_estimador').doc(uid);
        await admin.firestore().runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const creditos = doc.data().creditos || 0;
            if (creditos <= 0) throw new Error("Sin créditos suficientes");
            t.update(userRef, { creditos: creditos - 1 });
        });

        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_pdf: 'PROCESANDO' }, { merge: true });

        const response = await fetch(URL_CLOUD_FUNCTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-leezar-secret': API_KEY_SECRETA },
            body: JSON.stringify({ parametros_motor: parametros_motor }) 
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_pdf: 'ERROR', error_pdf: data.error || "Fallo al generar PDF." }, { merge: true });
            return { statusCode: 500, body: 'Error en el Motor Python' };
        }

        // 🔥 FIX: Guardamos valor_comercial_rango y parametros_motor para el Dashboard
        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_pdf: 'COMPLETADO',
            pdf_url: data.auditoria_inyeccion?.pdf_url || data.pdf_url || null,
            valor_comercial_rango: valor_elegido,
            parametros_motor: parametros_motor
        }, { merge: true });

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};