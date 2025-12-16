const admin = require('firebase-admin');
const path = require('path');

// --- INICIALIZACIÓN ROBUSTA DE FIREBASE ---
if (admin.apps.length === 0) {
    try {
        const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
        const serviceAccount = require(keyPath);
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
            });
        } else {
            console.error("FATAL: No hay credenciales de Firebase.");
        }
    }
}

const db = admin.firestore();

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