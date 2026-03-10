const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA PARA PROYECTO HIPOTECAS ---
let hipotecasApp;

if (!admin.apps.length || !admin.apps.find(app => app.name === 'hipotecasApp')) {
    let serviceAccount;
    
    // 1. Variable de Entorno (Nube) para producción en Netlify
    if (process.env.FIREBASE_SERVICE_ACCOUNT_HIPOTECA) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_HIPOTECA); } 
        catch (e) { console.error("Error ENV Hipoteca:", e); }
    }
    
    // 2. Archivo Local (PC) - Usando 'fs' para que Netlify no lo exija al compilar
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceAccountKeyHipoteca.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { console.warn("No se encontró JSON local de hipotecas."); }
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

const db = hipotecasApp ? hipotecasApp.firestore() : null;
// ------------------------------------------------

exports.handler = async (event, context) => {
    // Solo permitimos método POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!db) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Error de conexión a la BD de Hipotecas." }) 
        };
    }

    try {
        const data = JSON.parse(event.body);
        const coleccion = 'expedientes';
        
        // Crear documento en Firebase
        const nuevoDoc = await db.collection(coleccion).add({
            nombreCliente: data.nombre,
            telefono: data.telefono,
            correo: data.correo || '',
            montoSolicitado: data.montoSolicitado || 0,
            institucionFinanciera: data.institucionFinanciera || 'POR_DEFINIR',
            tipoCredito: data.tipoCredito || 'ADQUISICION', 
            estatus: 'PERFILAMIENTO', 
            fechaCreacion: new Date().toISOString(),
            checklist: {} 
        });

        console.log("Expediente Hipotecario creado con ID:", nuevoDoc.id);

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                message: "Crédito perfilado con éxito", 
                id: nuevoDoc.id, 
                url: `/portal-hipoteca.html?id=${nuevoDoc.id}` 
            })
        };

    } catch (error) {
        console.error("Error al crear expediente hipotecario:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};