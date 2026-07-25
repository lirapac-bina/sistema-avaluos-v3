const admin = require('firebase-admin');

// --- INICIALIZACIÓN BLINDADA DE FIREBASE ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    try {
        const payloadFrontend = JSON.parse(event.body);
        const { parametros_motor, ticket_id } = payloadFrontend;

        if (!ticket_id) {
            console.error("[AvEME] Error: Petición sin ticket_id generada.");
            return;
        }

        const ticketRef = db.collection('tickets_motor').doc(ticket_id);
        
        // 1. Marcar inicio y GUARDAR EL PAQUETE COMPLETO EN FIREBASE (Cerebro de Respaldo)
        await ticketRef.set({ 
            estatus: 'procesando', 
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            parametros_motor: parametros_motor // 🧠 MEMORIA RESPALDADA AQUÍ
        });

        const URL_CLOUD_FUNCTION = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";
        const llaveSecreta = process.env.LEEZAR_API_SECRET; 

        if (!llaveSecreta) {
            await ticketRef.set({ estatus: 'error', error: "Falta configuración de seguridad (Secret) en el servidor." }, { merge: true });
            return;
        }

        // 2. Ejecutar la llamada pesada a Google Cloud
        const response = await fetch(URL_CLOUD_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-leezar-secret': llaveSecreta 
            },
            body: JSON.stringify({ parametros_motor }) 
        });

        const data = await response.json();

        if (!response.ok) {
            await ticketRef.set({ estatus: 'error', error: data.error || "Fallo interno en el motor pericial." }, { merge: true });
            return;
        }

        // 3. ¡Éxito!
        await ticketRef.set({ 
            estatus: 'completado', 
            resultado: data 
        }, { merge: true });

        console.log(`[AvEME] Ticket ${ticket_id} procesado exitosamente.`);

    } catch (error) {
        console.error("[ERROR CRÍTICO BACKGROUND]:", error);
        try {
            const payloadFrontend = JSON.parse(event.body);
            if (payloadFrontend.ticket_id) {
                await db.collection('tickets_motor').doc(payloadFrontend.ticket_id).set({ 
                    estatus: 'error', 
                    error: "Fallo de comunicación en la infraestructura: " + error.message 
                }, { merge: true });
            }
        } catch(e) { }
    }
};