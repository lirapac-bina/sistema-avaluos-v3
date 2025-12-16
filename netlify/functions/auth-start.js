const { google } = require('googleapis');

exports.handler = async (event, context) => {
  try {
    // 1. Carga directa del archivo (Esto obliga a Netlify a subirlo)
    const serviceAccount = require('./serviceaccountkey.json');

    // 2. Configuración dinámica de la URL de retorno
    // Detecta si estás en localhost o en sistema-avaluos-frontend.netlify.app
    const host = event.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/.netlify/functions/auth-finish`;

    console.log("Generando Auth URL para:", redirectUri);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || "880781885603-dra7ci2h2787ot0fncqs1q9vrnrq9k8a.apps.googleusercontent.com",
      process.env.GOOGLE_CLIENT_SECRET || "GOCSPX-u6ddX_qX_S7yX_S7yX_S7yX_S7y", // (Tu secreto real va aquí o en variables de entorno)
      redirectUri
    );

    // 3. Generar la URL de Google
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.file' // Permiso para crear carpetas
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