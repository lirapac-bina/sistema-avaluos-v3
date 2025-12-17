const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- INICIALIZACIÓN DE FIREBASE (COMPATIBLE CON NETLIFY) ---
if (admin.apps.length === 0) {
    let serviceAccount;

    // 1. Intentar cargar desde Variable de Entorno (Producción/Netlify)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) {
            console.error("Error parseando variable de entorno:", e);
        }
    }

    // 2. Intentar cargar archivo local (Desarrollo) - USANDO 'fs' PARA EVITAR ERROR DE BUILD
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) {
            console.warn("No se encontró credencial local (Normal en Netlify).");
        }
    }

    // 3. Inicializar
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.error("FATAL: No se encontraron credenciales de Firebase.");
    }
}

exports.handler = async (event, context) => {
  try {
    // Detecta si estás en localhost o en producción
    const host = event.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/.netlify/functions/auth-finish`;

    console.log("Generando Auth URL para:", redirectUri);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || "880781885603-dra7ci2h2787ot0fncqs1q9vrnrq9k8a.apps.googleusercontent.com",
      process.env.GOOGLE_CLIENT_SECRET || "GOCSPX-u6ddX_qX_S7yX_S7yX_S7yX_S7y",
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.file'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authUrl: authUrl })
    };

  } catch (error) {
    console.error("Error en Auth Start:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};