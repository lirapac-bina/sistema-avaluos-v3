const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA (Compatible con Localhost y Producción) ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } catch (e) { }
    }
    if (!serviceAccount) {
        try { serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'serviceaccountkey.json'), 'utf8')); } catch (e) { }
    }
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();

exports.handler = async (event) => {
    // Cabeceras de seguridad y permisos
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const email = event.queryStringParameters.email;
        
        if (!email) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Correo de usuario requerido." }) };
        }

        // Consultamos la colección
        const snapshot = await db.collection('tickets_motor')
            .where('parametros_motor.email_perito', '==', email)
            .get();

const dictamenes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 1. FECHA: Priorizamos la hora exacta en la que el Motor forjó el PDF
            let fechaObjeto = new Date();
            if (data.resultado && data.resultado.fecha_emision) {
                fechaObjeto = new Date(data.resultado.fecha_emision);
            } else if (data.timestamp) {
                fechaObjeto = data.timestamp.toDate();
            } else if (doc.id.includes('_')) {
                const partes = doc.id.split('_');
                if (partes.length > 1 && !isNaN(partes[1])) {
                    fechaObjeto = new Date(parseInt(partes[1]));
                }
            }

            // 2. VALOR COMERCIAL: Rastreamos la verdad absoluta.
            // Primero, buscamos si el usuario ajustó el valor con el slider (se guarda en parametros_motor.valor_comercial_rango antes de pedir el PDF)
            // Si no existe, buscamos el valor puro que arrojó la auditoría del motor.
            let valorFinal = 0;
            if (data.parametros_motor && data.parametros_motor.valor_comercial_rango) {
                valorFinal = data.parametros_motor.valor_comercial_rango;
            } else if (data.resultado && data.resultado.data && data.resultado.data.VALOR_FINAL) {
                valorFinal = data.resultado.data.VALOR_FINAL;
            }

            // 3. FOLIO: Intentamos sacar el Hash_ID. 
            // Si el motor Python no guardó el folio criptográfico (Ej. #113282...) en Firebase tras forjar el PDF,
            // extraeremos los últimos 12 caracteres del ticket temporal para que al menos se vea "limpio" en la tabla, en lugar del larguísimo "ticket_178...".
            let folioReal = doc.id;
            if (data.resultado && data.resultado.data && data.resultado.data.HASH_ID) {
                folioReal = data.resultado.data.HASH_ID;
            } else if (doc.id.startsWith('ticket_')) {
                folioReal = doc.id.slice(-12).toUpperCase(); // Tomamos el final del ticket para simular un Hash
            }

            dictamenes.push({
                folio: folioReal,
                fecha: fechaObjeto.toISOString(), 
                tipo_inmueble: data.parametros_motor ? (data.parametros_motor.Tipo_Inmueble || 'N/A') : 'N/A',
                calle: data.parametros_motor ? (data.parametros_motor.Calle_Sujeto || 'Sin dirección') : 'Sin dirección',
                estatus: data.estatus_pdf || data.estatus || 'pendiente',
                pdf_url: data.pdf_url || null,
                valor_comercial: valorFinal // Lo mandamos en la raíz del paquete
            });
        });
        // Ordenamos en RAM para no pedir índices compuestos a Firebase
        dictamenes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(dictamenes)
        };

    } catch (error) {
        console.error("[ERROR HISTORIAL BACKEND]:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};