const { google } = require('googleapis');
const busboy = require('busboy');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- 1. BLOQUE BLINDADO (CARGA DE CREDENCIALES) ---
let serviceAccount = null; // Variable global para reutilizar

if (admin.apps.length === 0) {
    // A. Intentar cargar desde Variable de Entorno (Nube)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    
    // B. Intentar cargar archivo local (PC) - Usando 'fs' para engañar a Netlify
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { }
    }

    // C. Inicializar Firebase
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: 'leezar-expedientes-prod' // Definimos el bucket aquí
        });
    } else {
        console.error("FATAL: No hay credenciales para subir archivos.");
    }
}

const db = admin.firestore();
// Usamos el storage nativo de admin, ya no necesitamos 'new Storage' externo
const bucket = admin.storage().bucket('leezar-expedientes-prod'); 
// ----------------------------------------------------

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
    
    // VALIDACIÓN DE SEGURIDAD
    if (!serviceAccount && admin.apps.length === 0) {
        throw new Error("Error de configuración del servidor: Credenciales no cargadas.");
    }

    // 1. BUSCAR EXPEDIENTE (Detectar si es Avalúo o Hipoteca)
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

    // 2. DEFINIR RUTA
    const categoriaItem = data.checklist?.[itemKey]?.categoria || 'general';
    const safeFileName = nombreArchivo.replace(/[^a-zA-Z0-9.-]/g, '_'); 
    const rutaArchivo = `${tipoTramite}/${expedienteId}/${categoriaItem}/${safeFileName}`;
    const file = bucket.file(rutaArchivo);

    console.log(`🚀 Subiendo a Cloud Storage: ${rutaArchivo}`);

    // 3. SUBIR EL ARCHIVO
    const buffer = Buffer.from(archivoBase64, 'base64');
    
    await file.save(buffer, {
      contentType: mimeType || 'application/octet-stream',
      resumable: false,
      metadata: {
        metadata: {
          originalName: nombreArchivo,
          subidoPor: 'cliente-portal'
        }
      }
    });

    // 4. GENERAR URL FIRMADA
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2030', 
    });

    console.log(`✅ Archivo guardado: ${rutaArchivo}`);

    // 5. ACTUALIZAR BD
    await docRef.update({
      [`checklist.${itemKey}.estado`]: 'en_revision',
      [`checklist.${itemKey}.driveLink`]: signedUrl, 
      [`checklist.${itemKey}.fileId`]: rutaArchivo, 
      [`checklist.${itemKey}.storageType`]: 'gcs_v1' 
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: 'Subido correctamente a Bóveda Segura', 
        fileId: rutaArchivo,
        url: signedUrl 
      })
    };

  } catch (error) {
    console.error("🔥 Error subida:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};