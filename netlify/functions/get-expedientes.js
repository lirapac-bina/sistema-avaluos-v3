const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA PARA NETLIFY ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Archivo Local (PC) - Usando 'fs' para engañar a Netlify
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { }
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
// ------------------------------------------------

exports.handler = async (event, context) => {
    // Solo permitir GET
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const expedientes = [];

        // --- SOLO LEEMOS AVALÚOS (REGLA DE NEGOCIO ESTRICTA) ---
        try {
            const avaluosSnapshot = await db.collection('expedientes_avaluos').get();
            
            avaluosSnapshot.forEach(doc => {
                const d = doc.data();
                expedientes.push({
                    id: doc.id,
                    cliente: d.nombreCliente || d.nombre || 'Sin Nombre',
                    // AGREGADO: Recuperamos el teléfono para la edición
                    telefono: d.telefono || '', 
                    tramite: d.tipoTramite || 'Avalúo',
                    
                    // Fechas
                    fechaCreacion: d.fechaCreacion || d.fecha, 
                    fecha: d.fechaCreacion ? new Date(d.fechaCreacion).toLocaleDateString('es-MX') : '-',
                    
                    estatus: d.estatus || 'PENDIENTE',
                    
                    // --- ROLES (NUEVA FUNCIONALIDAD) ---
                    // Capturista: Leemos 'capturista' o 'asignado' (para compatibilidad)
                    capturista: d.capturista || d.asignado || null,
                    fechaAsignacionCapturista: d.fechaAsignacionCapturista || d.fechaAsignacion || null,

                    // Dibujante
                    dibujante: d.dibujante || null,
                    fechaAsignacionDibujante: d.fechaAsignacionDibujante || null,

                    // Visitador
                    visitador: d.visitador || null,
                    fechaAsignacionVisitador: d.fechaAsignacionVisitador || null,

                    tipo: 'avaluo'
                });
            });
        } catch (err) {
            console.warn("Error leyendo avaluos:", err.message);
        }

        // Ordenar por fecha (más reciente primero)
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
        console.error("Error general:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};