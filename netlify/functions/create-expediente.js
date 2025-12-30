const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
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

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        if (!data.nombre || !data.tipoTramite) {
            return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos obligatorios" }) };
        }

        const coleccion = data.tipoServicio === 'hipoteca' ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        
        // --- LÓGICA DE BÚSQUEDA "SABUESO" ---
        let checklistInicial = {};
        
        // Normalizamos el nombre del trámite para búsqueda
        const tramiteOriginal = data.tipoTramite.trim(); // Ej: "Infonavit"
        const tramiteUpper = tramiteOriginal.toUpperCase(); // Ej: "INFONAVIT"
        const tramiteLower = tramiteOriginal.toLowerCase(); // Ej: "infonavit"
        
        console.log(`Buscando plantilla para: ${tramiteOriginal}...`);

        try {
            // Intentamos buscar el documento de configuración en varios formatos posibles
            // El Admin suele guardar como 'plantilla_INFONAVIT' o a veces directo el ID
            
            let configDoc = await db.collection('configuracion').doc(`plantilla_${tramiteUpper}`).get(); // 1. plantilla_INFONAVIT
            
            if (!configDoc.exists) {
                configDoc = await db.collection('configuracion').doc(`plantilla_${tramiteLower}`).get(); // 2. plantilla_infonavit
            }
            if (!configDoc.exists) {
                // Intento directo por si acaso
                configDoc = await db.collection('configuracion').doc(tramiteUpper).get(); 
            }

            // Si después de buscar por todos lados no existe, usamos la MAESTRA
            if (!configDoc.exists) {
                console.warn(`⚠️ No se encontró plantilla específica. Usando MAESTRA.`);
                configDoc = await db.collection('configuracion').doc('plantilla_maestra').get();
            } else {
                console.log(`✅ ¡Plantilla específica encontrada! Usando: ${configDoc.id}`);
            }

            if (configDoc.exists) {
                const requisitos = configDoc.data().requisitos || {};
                
                Object.keys(requisitos).forEach(key => {
                    const req = requisitos[key];
                    if (req.activo) {
                        checklistInicial[key] = {
                            nombre: req.nombre,
                            descripcion: req.texto || '',
                            categoria: req.categoria || 'solicitante',
                            estado: 'pendiente', // Minúsculas, crucial para el Portal
                            archivoUrl: null,
                            archivoNombre: null,
                            fechaSubida: null,
                            mensajeRechazo: null
                        };
                    }
                });
            }
        } catch (e) { console.error("Error en lógica de plantillas:", e); }

        // --- CREAR DOCUMENTO ---
        const fechaMexico = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });

        const nuevoDoc = await db.collection(coleccion).add({
            nombreCliente: data.nombre,
            telefono: data.telefono || '',
            email: data.email || '',
            tipoTramite: data.tipoTramite,
            ubicacion: data.ubicacion || 'Veracruz',
            estado: data.estado, 
            estatus: 'ACTIVO',
            fechaCreacion: new Date().toISOString(),
            fecha: fechaMexico,
            checklist: checklistInicial, // Lista inyectada
            capturista: null,
            visitador: null,
            dibujante: null
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: "Creado con éxito", 
                id: nuevoDoc.id, 
                url: `/portal.html?id=${nuevoDoc.id}`,
                requisitosCargados: Object.keys(checklistInicial).length
            })
        };

    } catch (error) {
        console.error("Error general:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};