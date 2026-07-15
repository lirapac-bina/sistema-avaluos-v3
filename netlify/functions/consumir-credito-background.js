const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)) });
}

exports.handler = async (event, context) => {
    try {
        // 1. Validar identidad del usuario (Token de Google)
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return { statusCode: 401, body: 'No autorizado' };
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 2. Recibir los datos desde estimaciones.html
        const { parametros_motor, expedienteId, valor_elegido } = JSON.parse(event.body);
        const API_KEY_SECRETA = process.env.LEEZAR_API_SECRET || process.env.LEEZAR_API_KEY_PYTHON; 
        const URL_CLOUD_FUNCTION = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";

        if (!API_KEY_SECRETA || !expedienteId || !parametros_motor) return { statusCode: 400, body: 'Faltan parámetros' };

        // 3. Descontar 1 Crédito de forma segura (Transacción)
        const userRef = admin.firestore().collection('usuarios_estimador').doc(uid);
        await admin.firestore().runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const creditos = doc.data().creditos || 0;
            if (creditos <= 0) throw new Error("Sin créditos suficientes");
            t.update(userRef, { creditos: creditos - 1 });
        });

        // 4. Avisar a Firebase que arrancó la generación del PDF
        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_pdf: 'PROCESANDO' }, { merge: true });

        // 🚀 5. ENVIAR A PYTHON V20
        const response = await fetch(URL_CLOUD_FUNCTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-leezar-secret': API_KEY_SECRETA },
            body: JSON.stringify({ parametros_motor: parametros_motor }) 
        });

        const data = await response.json();

        // 6. Si Python falla
        if (!response.ok || data.error) {
            await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_pdf: 'ERROR', error_pdf: data.error || "Fallo al generar PDF." }, { merge: true });
            return { statusCode: 500, body: 'Error en el Motor Python' };
        }

        // 7. Si Python triunfa: Guardar URL del PDF y Valores en la Base de Datos
        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_pdf: 'COMPLETADO',
            pdf_url: data.auditoria_inyeccion?.pdf_url || data.pdf_url || null,
            valor_comercial_rango: valor_elegido,
            parametros_motor: parametros_motor
        }, { merge: true });

        // Al ser función background, retorna 200 rápido y cierra el hilo limpiamente
        return { statusCode: 200, body: "OK" };
        
    } catch (error) {
        console.error("Error crítico en consumir crédito:", error);
        // Si falla la transacción de créditos o la validación, avisamos a Firebase para liberar el frontend
        if (event.body) {
            try {
                const { expedienteId } = JSON.parse(event.body);
                if (expedienteId) {
                    await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({ estatus_pdf: 'ERROR', error_pdf: error.message }, { merge: true });
                }
            } catch(e) {}
        }
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};