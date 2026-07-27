const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } catch (e) {}
    }
    if (serviceAccount) { admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); } 
    else { admin.initializeApp(); }
}

const db = admin.firestore();

exports.handler = async (event) => {
    try {
        // Notar que solo recibe el ticket_id (pesa menos de 1 KB)
        const { ticket_id } = JSON.parse(event.body);
        if (!ticket_id) return;

        const ticketRef = db.collection('tickets_motor').doc(ticket_id);
        await ticketRef.set({ estatus_pdf: 'forjando' }, { merge: true });

        // 📥 LECTURA: Extraemos los datos pesados que "guardar-dictamen.js" guardó en el Paso 1
        const doc = await ticketRef.get();
        if (!doc.exists) throw new Error("Dictamen no encontrado en la base de datos.");
        const parametros_motor = doc.data().parametros_motor;

        const googleEndpoint = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";
        
        // 🚀 ENVIAMOS A GCP Y ESPERAMOS (Esta función nos da 15 minutos sin que Netlify corte)
        const respuestaNube = await fetch(googleEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-leezar-secret': process.env.LEEZAR_API_SECRET },
            body: JSON.stringify({ parametros_motor })
        });

        if (!respuestaNube.ok) {
            const errorTexto = await respuestaNube.text();
            throw new Error(`Falla en Motor Central de GCP: ${errorTexto}`);
        }

        const dataGCP = await respuestaNube.json();
        if (dataGCP.error) throw new Error(dataGCP.error);

        const urlFinalDelPdf = (dataGCP.auditoria_inyeccion && dataGCP.auditoria_inyeccion.pdf_url) ? dataGCP.auditoria_inyeccion.pdf_url : dataGCP.pdf_url;
        if (!urlFinalDelPdf) throw new Error("GCP procesó los datos, pero no devolvió el PDF.");

        await ticketRef.set({ estatus_pdf: 'completado', pdf_url: urlFinalDelPdf }, { merge: true });

    } catch (error) {
        console.error("[ERROR BACKGROUND]:", error);
        try {
            const payload = JSON.parse(event.body);
            if (payload.ticket_id) {
                await db.collection('tickets_motor').doc(payload.ticket_id).set({ estatus_pdf: 'error', error_pdf: error.message }, { merge: true });
            }
        } catch(e) {}
    }
};