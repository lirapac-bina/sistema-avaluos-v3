const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIO DEL BLOQUE BLINDADO ---
if (admin.apps.length === 0) {
    let serviceAccount;

    // 1. Si estamos en Netlify (Nube), usa la variable de entorno
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) { console.error("Error ENV:", e); }
    }

    // 2. Si estamos en Local (PC), busca el archivo PERO usando 'fs' 
    // (Al usar 'fs', engañamos a Netlify para que no intente empaquetarlo)
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { }
    }

    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("ERROR FATAL: No hay credenciales de Firebase disponibles.");
    }
}
const db = admin.firestore();
// --- FIN DEL BLOQUE BLINDADO ---

// --- CONFIGURACIÓN ---
const initServices = () => {
  const serviceAccount = require('./serviceaccountkey.json');
  
  // 1. Iniciar Firebase (Base de Datos)
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  
  // 2. Iniciar Google Cloud Storage (El Bucket)
  const storage = new Storage({
    projectId: serviceAccount.project_id,
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
  });

  return { db: admin.firestore(), storage };
};

exports.handler = async (event, context) => {
  // Headers CORS para permitir peticiones desde tu web
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método no permitido' };

  try {
    const { expedienteId, itemKey, archivoBase64, nombreArchivo, mimeType } = JSON.parse(event.body);
    
    // 1. INICIAR SERVICIOS
    const { db, storage } = initServices();
    const bucketName = 'leezar-expedientes-prod'; // <--- TU BUCKET EXACTO
    const bucket = storage.bucket(bucketName);

    // 2. BUSCAR EXPEDIENTE (Detectar si es Avalúo o Hipoteca)
    let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
    let doc = await docRef.get();
    let tipoTramite = 'avaluos'; // Carpeta raíz por defecto

    if (!doc.exists) {
      docRef = db.collection('expedientes_hipotecas').doc(expedienteId);
      doc = await docRef.get();
      tipoTramite = 'hipotecas';
    }

    if (!doc.exists) throw new Error("Expediente no encontrado");
    const data = doc.data();

    // 3. DEFINIR RUTA EN EL BUCKET (Estructura Bancaria Ordenada)
    // Ruta: tipo_tramite / id_expediente / categoria / nombre_archivo
    // Ej: avaluos/A100/propietario/escritura.pdf
    
    const categoriaItem = data.checklist[itemKey]?.categoria || 'general';
    // Limpiamos el nombre de archivo de espacios y caracteres raros por seguridad
    const safeFileName = nombreArchivo.replace(/[^a-zA-Z0-9.-]/g, '_'); 
    
    const rutaArchivo = `${tipoTramite}/${expedienteId}/${categoriaItem}/${safeFileName}`;
    const file = bucket.file(rutaArchivo);

    console.log(`🚀 Subiendo a Cloud Storage: ${rutaArchivo}`);

    // 4. SUBIR EL ARCHIVO
    const buffer = Buffer.from(archivoBase64, 'base64');
    
    await file.save(buffer, {
      contentType: mimeType || 'application/octet-stream',
      resumable: false, // Más rápido para archivos de documentos/fotos normales
      metadata: {
        metadata: {
          originalName: nombreArchivo,
          subidoPor: 'cliente-portal'
        }
      }
    });

    // 5. GENERAR URL FIRMADA (Llave segura de acceso)
    // Esto crea un link que funciona, pero el archivo sigue privado.
    // Lo configuramos para que sea válido por mucho tiempo (o puedes reducirlo).
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2030', // Fecha lejana para que el link funcione en tu dashboard
    });

    console.log(`✅ Archivo guardado y URL generada.`);

    // 6. ACTUALIZAR BD (Firebase)
    // Mantenemos la estructura que tu Frontend espera (driveLink) para no romper nada visualmente
    await docRef.update({
      [`checklist.${itemKey}.estado`]: 'en_revision',
      [`checklist.${itemKey}.driveLink`]: signedUrl, // Ahora es la URL de Storage
      [`checklist.${itemKey}.fileId`]: rutaArchivo,  // Guardamos la ruta interna
      [`checklist.${itemKey}.storageType`]: 'gcs_v1' // Marca para saber que ya usamos el sistema nuevo
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