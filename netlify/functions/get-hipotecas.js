const admin = require('firebase-admin');

// --- INICIALIZACIÓN BLINDADA PARA PROYECTO HIPOTECAS ---
// Usamos 'hipotecasApp' para no chocar con la app de Avalúos
let hipotecasApp;

if (!admin.apps.length || !admin.apps.find(app => app.name === 'hipotecasApp')) {
    let serviceAccount;
    
    // 1. Variable de Entorno (Nube) para producción
    if (process.env.FIREBASE_SERVICE_ACCOUNT_HIPOTECA) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_HIPOTECA); } 
        catch (e) { console.error("Error ENV Hipoteca:", e); }
    }
    
    // 2. Archivo Local (PC) para pruebas - USANDO REQUIRE
    if (!serviceAccount) {
        try {
            // Esto obliga a Netlify a empaquetar el JSON
            serviceAccount = require('./serviceAccountKeyHipoteca.json');
        } catch (e) { 
            console.warn("No se encontró JSON local de hipotecas."); 
        }
    }

    if (serviceAccount) {
        hipotecasApp = admin.initializeApp({ 
            credential: admin.credential.cert(serviceAccount) 
        }, 'hipotecasApp');
    } else {
        console.error("FATAL: No se encontraron credenciales para Hipotecas.");
    }
} else {
    hipotecasApp = admin.app('hipotecasApp');
}

// Si la app se inicializó correctamente, sacamos la base de datos
const db = hipotecasApp ? hipotecasApp.firestore() : null;
// ------------------------------------------------

exports.handler = async (event, context) => {
    // Solo permitir método GET
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!db) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Error de conexión a la base de datos de Hipotecas." }) 
        };
    }

    try {
        const expedientes = [];
        
        // Leemos la colección 'expedientes'
        const snapshot = await db.collection('expedientes').get();

        snapshot.forEach(doc => {
            const data = doc.data();
            
            const montoFormateado = data.montoSolicitado 
                ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(data.montoSolicitado)
                : '$0.00';

            let fechaCorta = 'Sin fecha';
            if (data.fechaCreacion) {
                const dateObj = new Date(data.fechaCreacion);
                fechaCorta = dateObj.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }

            expedientes.push({
                id: doc.id,
                cliente: data.nombreCliente || 'Sin Nombre',
                telefono: data.telefono || '',
                correo: data.correo || '',
                monto: montoFormateado,
                banco: data.institucionFinanciera || 'PENDIENTE',
                tramite: data.tipoCredito || 'ADQUISICION',
                estatus: data.estatus || 'PERFILAMIENTO',
                fechaCreacion: data.fechaCreacion || null,
                fecha: fechaCorta,
                tipo: 'hipoteca'
            });
        });

        // Ordenar por fecha
        expedientes.sort((a, b) => {
             const dateA = new Date(a.fechaCreacion || 0);
             const dateB = new Date(b.fechaCreacion || 0);
             return dateB - dateA; 
        });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(expedientes)
        };

    } catch (error) {
        console.error("Error al obtener hipotecas:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};