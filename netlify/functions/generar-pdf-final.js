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

        // Actualizamos estatus en Firebase
        if (ticket_id) {
            await db.collection('tickets_motor').doc(ticket_id).set({ estatus_pdf: 'forjando' }, { merge: true });
        }

        const googleEndpoint = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";
        const llaveSecreta = process.env.LEEZAR_API_SECRET;

        // 🚀 ENVIAMOS EL PAQUETE PESADO DIRECTO A GCP
        const respuestaNube = await fetch(googleEndpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-leezar-secret': llaveSecreta 
            },
            body: JSON.stringify({ parametros_motor: parametros_motor })
        });

        // 🛡️ BLINDAJE DE INFRAESTRUCTURA
        if (!respuestaNube.ok) {
            const errorTexto = await respuestaNube.text();
            return { statusCode: 500, body: JSON.stringify({ error: `Fallo en el Motor Central: ${errorTexto}` }) };
        }

        const dataGCP = await respuestaNube.json();
        
        if (dataGCP.error) {
            return { statusCode: 500, body: JSON.stringify({ error: dataGCP.error }) };
        }

        const urlFinalDelPdf = (dataGCP.auditoria_inyeccion && dataGCP.auditoria_inyeccion.pdf_url) 
                                ? dataGCP.auditoria_inyeccion.pdf_url 
                                : dataGCP.pdf_url;

        if (!urlFinalDelPdf) {
            return { statusCode: 500, body: JSON.stringify({ error: "GCP procesó los datos, pero no devolvió el PDF." }) };
        }

        if (ticket_id) {
            await db.collection('tickets_motor').doc(ticket_id).set({ estatus_pdf: 'completado', pdf_url: urlFinalDelPdf }, { merge: true });
        }

        // Devolvemos el link del PDF directo a la pantalla
        return {
            statusCode: 200,
            body: JSON.stringify({ pdf_url: urlFinalDelPdf })
        };

    } catch (error) {
        console.error("[ERROR FORJADO SYNC]:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};