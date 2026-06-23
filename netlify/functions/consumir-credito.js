// netlify/functions/consumir-credito.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        // 1. VERIFICAR GAFETE DEL USUARIO
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado.' }) };
        }
        
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 2. RECIBIR DATOS DEL FRONTEND
        const body = JSON.parse(event.body);
        const { parametros_motor, valor_elegido, rango_min, rango_max } = body;

        const userRef = db.collection('usuarios_estimador').doc(uid);
        const historialRef = db.collection('historial_estimaciones').doc(); // Creamos un ID nuevo

        // 3. TRANSACCIÓN ATÓMICA EN FIREBASE
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            
            if (!userDoc.exists) throw new Error("Usuario no encontrado en la base de datos.");
            
            const creditosActuales = userDoc.data().creditos || 0;
            
            if (creditosActuales <= 0) {
                throw new Error("Saldo insuficiente. Por favor recarga créditos.");
            }

            // A) DESCONTAR EL CRÉDITO
            transaction.update(userRef, { 
                creditos: admin.firestore.FieldValue.increment(-1) 
            });

            // B) GUARDAR EL HISTORIAL DEL INMUEBLE
            transaction.set(historialRef, {
                uid_cliente: uid,
                fecha_estimacion: admin.firestore.FieldValue.serverTimestamp(),
                datos_inmueble: parametros_motor,
                limite_inferior_calculado: rango_min,
                limite_superior_calculado: rango_max,
                valor_cierre_elegido: valor_elegido,
                estatus: "Completado",
                pdf_url: "Pendiente de Ensamble" // En el futuro aquí guardaremos el enlace al Drive
            });
        });

        // 4. ÉXITO
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                id_transaccion: historialRef.id,
                mensaje: "Crédito descontado e historial guardado."
            })
        };

    } catch (error) {
        console.error("Error en transacción:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: error.message || "Fallo en la base de datos." })
        };
    }
};