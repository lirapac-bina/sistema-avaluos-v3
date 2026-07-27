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
        const payload = JSON.parse(event.body);
        const { ticket_id, parametros_motor } = payload;
        
        if (!ticket_id || !parametros_motor) {
            return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos del expediente." }) };
        }

        // 🪓 1. SEPARAMOS EL PESO MUERTO DEL ESQUELETO
        const fotos = parametros_motor.fotos_adicionales || [];
        const anexos = parametros_motor.anexos_adicionales || [];
        const portada = parametros_motor.foto_base64 || "";
        const memoria = parametros_motor.memoria_serper_json || [];

        // Vaciamos el objeto principal para que sea ultra-ligero y jamás choque con el límite de 1MB
        parametros_motor.fotos_adicionales = [];
        parametros_motor.anexos_adicionales = [];
        parametros_motor.foto_base64 = "";
        parametros_motor.memoria_serper_json = [];

        // 💾 2. GUARDAMOS EL ESQUELETO
        await db.collection('tickets_motor').doc(ticket_id).set({ parametros_motor: parametros_motor }, { merge: true });

        // 🧱 3. GUARDAMOS LO PESADO EN PEDACITOS DENTRO DE UNA SUBCOLECCIÓN
        const batch = db.batch();
        const bovedaRef = db.collection('tickets_motor').doc(ticket_id).collection('boveda_pesada');
        
        if (portada) {
            batch.set(bovedaRef.doc('portada'), { base64: portada });
        }
        if (memoria.length > 0) {
            batch.set(bovedaRef.doc('memoria'), { datos: memoria });
        }
        
        // Asignamos un índice para que el PDF las imprima en el orden exacto
        fotos.forEach((f, i) => {
            batch.set(bovedaRef.doc(`foto_${i}`), { ...f, indice_eme: i });
        });
        
        anexos.forEach((a, i) => {
            batch.set(bovedaRef.doc(`anexo_${i}`), { ...a, indice_eme: i });
        });

        // Disparamos el guardado múltiple
        await batch.commit();
        
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (error) {
        console.error("[ERROR GUARDAR DICTAMEN]:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};