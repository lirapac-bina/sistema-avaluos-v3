const admin = require('firebase-admin');

// Inicializar Firebase si no existe
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (error) {
        console.error('Error init Firebase:', error);
    }
}

const db = admin.firestore();

// PLANTILLA POR DEFECTO (Si la base de datos está vacía, usará esto la primera vez)
const PLANTILLA_DEFAULT = {
    'INE_SOLICITANTE': { nombre: 'INE Solicitante', texto: 'Frente y Vuelta', categoria: 'solicitante', activo: true },
    'CURP_SOLICITANTE': { nombre: 'CURP', texto: 'Descarga reciente', categoria: 'solicitante', activo: true },
    'RFC_SOLICITANTE': { nombre: 'Constancia Situación Fiscal', texto: 'Vigente', categoria: 'solicitante', activo: true },
    'ACTA_NAC_SOLICITANTE': { nombre: 'Acta de Nacimiento', texto: 'Legible', categoria: 'solicitante', activo: true },
    'NSS_SOLICITANTE': { nombre: 'Número de Seguro Social', texto: 'Documento oficial IMSS', categoria: 'solicitante', activo: true },
    'INE_PROPIETARIO': { nombre: 'INE Propietario', texto: 'Frente y Vuelta', categoria: 'propietario', activo: true },
    'ACTA_MAT_PROPIETARIO': { nombre: 'Acta de Matrimonio', texto: 'Si aplica', categoria: 'propietario', activo: true },
    'ESCRITURA': { nombre: 'Escritura Pública', texto: 'Completa con sello RPP', categoria: 'inmueble', activo: true, permitirExtras: true },
    'PREDIAL': { nombre: 'Boleta Predial', texto: 'Año en curso (2025)', categoria: 'inmueble', activo: true },
    'AGUA': { nombre: 'Recibo de Agua', texto: 'Vigente', categoria: 'inmueble', activo: true },
    'LUZ': { nombre: 'Recibo de Luz (CFE)', texto: 'Vigente', categoria: 'inmueble', activo: true },
    'PLANO': { nombre: 'Plano Arquitectónico', texto: 'Con medidas legibles', categoria: 'inmueble', activo: true }
};

exports.handler = async (event, context) => {
    // Referencia al documento único de configuración
    const docRef = db.collection('configuracion').doc('plantilla_maestra');

    try {
        // --- MODO LECTURA (GET) ---
        if (event.httpMethod === 'GET') {
            const doc = await docRef.get();
            
            if (!doc.exists) {
                // Si no existe, creamos la default y la devolvemos
                await docRef.set({ requisitos: PLANTILLA_DEFAULT });
                return { statusCode: 200, body: JSON.stringify(PLANTILLA_DEFAULT) };
            }

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(doc.data().requisitos)
            };
        }

        // --- MODO GUARDADO (POST) ---
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            
            // data.requisitos debe ser el objeto completo modificado desde el admin
            if (!data.requisitos) throw new Error("Faltan datos");

            await docRef.set({ requisitos: data.requisitos }, { merge: true });

            return {
                statusCode: 200,
                body: JSON.stringify({ message: "Catálogo actualizado correctamente" })
            };
        }

        return { statusCode: 405, body: "Method Not Allowed" };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};