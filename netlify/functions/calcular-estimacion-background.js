// netlify/functions/calcular-estimacion-background.js
const admin = require('firebase-admin');

// Inicializamos Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

exports.handler = async (event, context) => {
    // Las background functions no devuelven body al cliente, todo se escribe en la BD
    try {
        const { parametros_motor, expedienteId } = JSON.parse(event.body);
        const API_KEY_SECRETA = process.env.LEEZAR_API_SECRET; 
        const URL_CLOUD_FUNCTION = "https://motor-pericial-eme-o5hgi24naa-uc.a.run.app";

        if (!API_KEY_SECRETA || !expedienteId) {
            console.error("Faltan datos críticos o el ID del expediente.");
            return;
        }

        // 1. Avisamos a Firebase que el motor arrancó (CREANDO el documento si no existe)
        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_motor: 'PROCESANDO'
        }, { merge: true });

        console.log(`🔍 [${expedienteId}] MOTOR INICIADO. DATOS:`, JSON.stringify(parametros_motor));

        // 2. Llamada al motor (SIN timeout, tenemos 15 minutos libres)
        const response = await fetch(URL_CLOUD_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-leezar-secret': API_KEY_SECRETA
            },
            body: JSON.stringify({ parametros_motor })
        });

        const data = await response.json();

        // 3. Manejo de Errores de la IA
        if (!response.ok || data.error) {
            await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
                estatus_motor: 'ERROR',
                error_motor: data.error || "Fallo en el motor matemático."
            }, { merge: true });
            return;
        }

        // 4. ¡ÉXITO! Guardamos la data completa en Firestore
        await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
            estatus_motor: 'COMPLETADO',
            resultados_motor: data, // El JSON completo de EME
            parametros_historico: parametros_motor // Guardamos qué parámetros se usaron
        }, { merge: true });

        console.log(`✅ [${expedienteId}] MOTOR FINALIZADO Y GUARDADO EN BD.`);

    } catch (error) {
        console.error("Error crítico en background:", error);
        try {
            const { expedienteId } = JSON.parse(event.body);
            if(expedienteId) {
                await admin.firestore().collection('expedientes_avaluos').doc(expedienteId).set({
                    estatus_motor: 'ERROR',
                    error_motor: "Fallo de infraestructura en la nube: " + error.message
                }, { merge: true });
            }
        } catch(e) {}
    }
};