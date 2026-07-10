// netlify/functions/consumir-credito.js
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const body = JSON.parse(event.body);
        const { parametros_motor, valor_elegido, rango_min, rango_max, expedienteId } = body;

        const userRef = db.collection('usuarios_estimador').doc(uid);
        const historialRef = db.collection('historial_estimaciones').doc(); 

        // 1. DESCONTAR CRÉDITO
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if ((userDoc.data().creditos || 0) <= 0) throw new Error("Saldo insuficiente.");

            transaction.update(userRef, { creditos: admin.firestore.FieldValue.increment(-1) });
            transaction.set(historialRef, {
                uid_cliente: uid,
                fecha_estimacion: admin.firestore.FieldValue.serverTimestamp(),
                datos_inmueble: parametros_motor,
                limite_inferior_calculado: rango_min,
                limite_superior_calculado: rango_max,
                valor_cierre_elegido: valor_elegido,
                estatus: "Completado"
            });
        });

// 2. 🚀 MANDAR FOTOS Y DATOS A PYTHON V20 PARA GENERAR EL PDF
        try {
            const urlPython = "https://motor-pericial-eme-o5hgi24naa-uc.a.run.app"; 
            
            const pythonRes = await fetch(urlPython, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-leezar-secret': process.env.LEEZAR_API_KEY_PYTHON 
                },
                body: JSON.stringify(parametros_motor) // JSON PLANO
            });

            if (pythonRes.ok) {
                const pythonData = await pythonRes.json();
                
                // 3. RECIBIR EL PDF Y GUARDARLO EN FIREBASE (EN AMBOS LADOS)
                if (pythonData.auditoria_inyeccion && pythonData.auditoria_inyeccion.pdf_url) {
                    const urlFinalPdf = pythonData.auditoria_inyeccion.pdf_url;
                    
                    // A) Guardamos para el Frontend (El cliente lo descarga)
                    await db.collection('expedientes_avaluos').doc(expedienteId).set({
                        pdf_url: urlFinalPdf,
                        resultados_motor: pythonData
                    }, { merge: true });

                    // B) Actualizamos tu Caja Registradora (Historial) con la URL
                    await historialRef.update({
                        estatus: "Completado Exitosamente",
                        pdf_url: urlFinalPdf
                    });
                } else {
                    await historialRef.update({ estatus: "Error: Python no devolvió PDF" });
                }
            } else {
                await historialRef.update({ estatus: "Error: Fallo en Motor Python" });
            }
        } catch (errPython) {
            console.error("❌ Fallo de red con Python:", errPython);
            await historialRef.update({ estatus: "Error de Conexión" });
        }

        return { statusCode: 200, body: JSON.stringify({ success: true, id_transaccion: historialRef.id }) };

    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ error: error.message || "Fallo en la BD." }) };
    }
};