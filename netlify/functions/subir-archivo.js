const { google } = require('googleapis');
const busboy = require('busboy');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- 1. BLOQUE BLINDADO (CARGA DE CREDENCIALES) ---
let serviceAccount = null;

if (admin.apps.length === 0) {
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
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: 'leezar-expedientes-prod'
        });
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket('leezar-expedientes-prod'); 

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método no permitido' };

  try {
    const { expedienteId, itemKey, archivoBase64, nombreArchivo, mimeType } = JSON.parse(event.body);
    
    // 1. BUSCAR EXPEDIENTE
    let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
    let doc = await docRef.get();
    let tipoTramite = 'avaluos'; 

    if (!doc.exists) {
      docRef = db.collection('expedientes_hipotecas').doc(expedienteId);
      doc = await docRef.get();
      tipoTramite = 'hipotecas';
    }

    if (!doc.exists) throw new Error("Expediente no encontrado");
    const data = doc.data();

    // --- CORRECCIÓN MÁGICA: INICIALIZAR CHECKLIST SI ESTÁ VACÍO ---
    // Esto evita que se "borren" los campos visualmente al subir el primer archivo
    if (!data.checklist || Object.keys(data.checklist).length === 0) {
        const plantillaBase = {
            'INE_SOLICITANTE': { nombre: 'INE Solicitante (Frente y Vuelta)', estado: 'pendiente', categoria: 'solicitante' },
            'CURP_SOLICITANTE': { nombre: 'CURP', estado: 'pendiente', categoria: 'solicitante' },
            'RFC_SOLICITANTE': { nombre: 'Constancia Situación Fiscal', estado: 'pendiente', categoria: 'solicitante' },
            'ACTA_NAC_SOLICITANTE': { nombre: 'Acta de Nacimiento', estado: 'pendiente', categoria: 'solicitante' },
            'NSS_SOLICITANTE': { nombre: 'Número de Seguro Social', estado: 'pendiente', categoria: 'solicitante' },
            'INE_PROPIETARIO': { nombre: 'INE Propietario', estado: 'pendiente', categoria: 'propietario' },
            'ACTA_MAT_PROPIETARIO': { nombre: 'Acta de Matrimonio', estado: 'pendiente', categoria: 'propietario' },
            'ESCRITURA': { nombre: 'Escritura Pública', estado: 'pendiente', categoria: 'inmueble', permitirExtras: true },
            'PREDIAL': { nombre: 'Boleta Predial 2025', estado: 'pendiente', categoria: 'inmueble' },
            'AGUA': { nombre: 'Recibo de Agua', estado: 'pendiente', categoria: 'inmueble' },
            'LUZ': { nombre: 'Recibo de Luz (CFE)', estado: 'pendiente', categoria: 'inmueble' },
            'PLANO': { nombre: 'Plano Arquitectónico', estado: 'pendiente', categoria: 'inmueble' }
        };
        // Guardamos la plantilla base en la BD para que sea permanente
        await docRef.set({ checklist: plantillaBase }, { merge: true });
    }
    // -------------------------------------------------------------

    // 2. DEFINIR RUTA Y SUBIR
    // Volvemos a leer 'checklist' por si acabamos de crearlo, para obtener la categoría correcta
    // Nota: Si el itemKey es nuevo (ej. SOLICITUD_INFONAVIT), la categoría vendrá del frontend en el futuro, 
    // pero por seguridad usamos un fallback
    const checklistActual = (data.checklist && Object.keys(data.checklist).length > 0) ? data.checklist : {};
    const categoriaItem = checklistActual[itemKey]?.categoria || 'general'; // Fallback a 'general' si es nuevo

    const safeFileName = nombreArchivo.replace(/[^a-zA-Z0-9.-]/g, '_'); 
    const rutaArchivo = `${tipoTramite}/${expedienteId}/${categoriaItem}/${safeFileName}`;
    const file = bucket.file(rutaArchivo);

    const buffer = Buffer.from(archivoBase64, 'base64');
    
    await file.save(buffer, {
      contentType: mimeType || 'application/octet-stream',
      resumable: false,
      metadata: { metadata: { originalName: nombreArchivo, subidoPor: 'cliente-portal' } }
    });

    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '01-01-2030' });

    // 3. ACTUALIZAR BD (Solo el campo específico)
    await docRef.update({
      [`checklist.${itemKey}.estado`]: 'en_revision',
      [`checklist.${itemKey}.driveLink`]: signedUrl, 
      [`checklist.${itemKey}.fileId`]: rutaArchivo, 
      [`checklist.${itemKey}.storageType`]: 'gcs_v1',
      // Aseguramos que la categoría se guarde también por si es un item nuevo
      [`checklist.${itemKey}.categoria`]: categoriaItem !== 'general' ? categoriaItem : 'solicitante' 
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Subido correctamente', fileId: rutaArchivo, url: signedUrl })
    };

  } catch (error) {
    console.error("🔥 Error subida:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};