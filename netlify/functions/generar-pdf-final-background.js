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
        const { ticket_id } = JSON.parse(event.body);
        if (!ticket_id) return;

        const ticketRef = db.collection('tickets_motor').doc(ticket_id);
        await ticketRef.set({ estatus_pdf: 'forjando' }, { merge: true });

        // 🦴 1. RECUPERAMOS EL ESQUELETO LIGERO
        const doc = await ticketRef.get();
        if (!doc.exists) throw new Error("Expediente no encontrado en la base de datos.");
        const parametros_motor = doc.data().parametros_motor;

        // 🧩 2. RECUPERAMOS LOS PEDACITOS DE LA BÓVEDA Y RECONSTRUIMOS
        const bovedaSnapshot = await ticketRef.collection('boveda_pesada').get();
        
        parametros_motor.fotos_adicionales = [];
        parametros_motor.anexos_adicionales = [];
        
        bovedaSnapshot.forEach(item => {
            const id = item.id;
            const data = item.data();
            
            if (id === 'portada') parametros_motor.foto_base64 = data.base64;
            else if (id === 'memoria') parametros_motor.memoria_serper_json = data.datos;
            else if (id.startsWith('foto_')) parametros_motor.fotos_adicionales.push(data);
            else if (id.startsWith('anexo_')) parametros_motor.anexos_adicionales.push(data);
        });

        // Ordenamos las fotos
        parametros_motor.fotos_adicionales.sort((a, b) => a.indice_eme - b.indice_eme);
        parametros_motor.anexos_adicionales.sort((a, b) => a.indice_eme - b.indice_eme);

        const googleEndpoint = "https://us-central1-motor-valuacion-api.cloudfunctions.net/motor-pericial-eme";
        
        // 🚀 ENVIAMOS EL PAQUETE RECONSTRUIDO A GCP
        const respuestaNube = await fetch(googleEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-leezar-secret': process.env.LEEZAR_API_SECRET },
            body: JSON.stringify({ parametros_motor })
        });

        if (!respuestaNube.ok) {
            const errorTexto = await respuestaNube.text();
            throw new Error(`Falla en GCP: ${errorTexto}`);
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