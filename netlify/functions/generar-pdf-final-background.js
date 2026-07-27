const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    if (serviceAccount) { admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); } 
    else { admin.initializeApp(); }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    try {
        const payload = JSON.parse(event.body);
        const { ticket_id, parametros_motor } = payload;

        if (!ticket_id) return;

        const ticketRef = db.collection('tickets_motor').doc(ticket_id);
        
        // Avisamos a la base de datos que ya empezamos a trabajar
        await ticketRef.set({ estatus_pdf: 'forjando' }, { merge: true });

        const googleEndpoint = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";
        const llaveSecreta = process.env.LEEZAR_API_SECRET;

        // 🚀 ENVIAMOS A GCP. Al ser "-background", Netlify nos da 15 minutos para esperar la respuesta.
        const respuestaNube = await fetch(googleEndpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-leezar-secret': llaveSecreta 
            },
            body: JSON.stringify({ parametros_motor: parametros_motor })
        });

        if (!respuestaNube.ok) {
            const errorTexto = await respuestaNube.text();
            throw new Error(`Fallo en el Motor Central: ${errorTexto}`);
        }

        const dataGCP = await respuestaNube.json();
        
        if (dataGCP.error) {
            throw new Error(dataGCP.error);
        }

        const urlFinalDelPdf = (dataGCP.auditoria_inyeccion && dataGCP.auditoria_inyeccion.pdf_url) 
                                ? dataGCP.auditoria_inyeccion.pdf_url 
                                : dataGCP.pdf_url;

        if (!urlFinalDelPdf) {
            throw new Error("GCP procesó los datos, pero no devolvió el PDF.");
        }

        // ¡ÉXITO! Avisamos a la base de datos y guardamos el link del PDF
        await ticketRef.set({ estatus_pdf: 'completado', pdf_url: urlFinalDelPdf }, { merge: true });

    } catch (error) {
        console.error("[ERROR FORJADO BACKGROUND]:", error);
        // Si algo falla, registramos el error en Firebase para que el HTML lo detecte y avise al usuario
        try {
            const payload = JSON.parse(event.body);
            if (payload.ticket_id) {
                await db.collection('tickets_motor').doc(payload.ticket_id).set({ estatus_pdf: 'error', error_pdf: error.message }, { merge: true });
            }
        } catch(e) {}
    }
};