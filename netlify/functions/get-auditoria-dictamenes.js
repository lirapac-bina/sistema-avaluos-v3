const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        // 🎯 Ampliamos el límite para asegurar que entren los de hoy. La memoria RAM se encargará de ordenarlos.
        const snapshot = await db.collection('tickets_motor').limit(1000).get();

        const dictamenes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 🎯 Lógica de extracción de fecha (Idéntica a la que usas en tu historial)
            let fechaObjeto = new Date();
            if (data.resultado && data.resultado.fecha_emision) {
                fechaObjeto = new Date(data.resultado.fecha_emision);
            } else if (data.timestamp) {
                // Validación blindada: Soporta objetos Timestamp de Firebase o Strings nativos
                fechaObjeto = typeof data.timestamp.toDate === 'function' 
                    ? data.timestamp.toDate() 
                    : new Date(data.timestamp);
            } else if (doc.id.includes('_')) {
                const partes = doc.id.split('_');
                if (partes.length > 1 && !isNaN(partes[1])) {
                    fechaObjeto = new Date(parseInt(partes[1]));
                }
            }

// Aseguramos capturar el email del usuario para mostrarlo en el Radar
            const emailUser = data.email || (data.parametros_motor ? data.parametros_motor.email_perito : null) || 'Desconocido';

            // 🛑 EL FIX: Extraemos estrictamente los textos para la tabla.
            // Ignoramos las fotos en Base64 para que el servidor vuele sin asfixiarse.
            const params = data.parametros_motor || {};
            
            dictamenes.push({
                id: doc.id,
                folio_institucional: data.folio_institucional || null, // 🎯 EL FIX: Dejamos pasar el folio oficial
                fecha: fechaObjeto.toISOString(),
                email: emailUser,
                estatus_pdf: data.estatus_pdf || data.estatus || 'pendiente',
                pdf_url: data.pdf_url || null,
                valor_comercial: params.valor_comercial_rango || data.valor_comercial || 0,
                parametros_motor: {
                    Tipo_Inmueble: params.Tipo_Inmueble || 'N/D',
                    Colonia: params.Colonia || '',
                    Ciudad_Municipio: params.Ciudad_Municipio || '',
                    perfil_solicitante: params.perfil_solicitante || '1'
                }
            });
        });

        // 🎯 Ordenamos en memoria (RAM) del más nuevo al más viejo
        dictamenes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        return { statusCode: 200, headers, body: JSON.stringify(dictamenes) };

    } catch (error) {
        console.error("[ERROR GET AUDITORIA]:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};