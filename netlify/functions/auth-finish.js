const { google } = require('googleapis');
const admin = require('firebase-admin');
const cookie = require('cookie');
const fs = require('fs');
const path = require('path');

// --- 1. INICIALIZACIÓN BLINDADA DE FIREBASE (Igual que en tus otros archivos) ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // Intentamos cargar desde Variable de Entorno (Nube)
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // Intentamos cargar archivo local (PC)
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
        console.error("ADVERTENCIA: No se pudo conectar a Firebase. La verificación de usuarios fallará.");
    }
}
const db = admin.firestore();

// ----------------------------------------------------------------------------

exports.handler = async (event, context) => {
    const { code } = event.queryStringParameters;

    // Validación básica
    if (!code) {
        return { statusCode: 400, body: 'Error: Falta el código de autorización.' };
    }

    try {
        const host = event.headers.host;
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const redirectUri = `${protocol}://${host}/.netlify/functions/auth-finish`;

        // Configuración del Cliente OAuth
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID || "880781885603-dra7ci2h2787ot0fncqs1q9vrnrq9k8a.apps.googleusercontent.com",
            process.env.GOOGLE_CLIENT_SECRET || "GOCSPX-u6ddX_qX_S7yX_S7yX_S7yX_S7y",
            redirectUri
        );

        // 2. INTERCAMBIO DE TOKEN REAL (Seguridad Google)
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // 3. OBTENER DATOS DE IDENTIDAD
        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const userInfo = await oauth2.userinfo.get();
        
        const userEmail = userInfo.data.email;
        const userName = userInfo.data.name;
        const userPhoto = userInfo.data.picture;

        console.log(`Intento de acceso: ${userEmail}`);

        // 4. VERIFICACIÓN DE PERMISOS (EL CADENERO - FIREBASE)
        let rolUsuario = null;
        let accesoPermitido = false;

        // A) Buscamos en la colección 'usuarios' de Firebase
        try {
            const userDoc = await db.collection('usuarios').doc(userEmail).get();
            
            if (userDoc.exists) {
                const datos = userDoc.data();
                if (datos.activo !== false) { // Solo si no está desactivado
                    rolUsuario = datos.rol || 'invitado';
                    accesoPermitido = true;
                    console.log("Usuario encontrado en DB:", rolUsuario);
                }
            }
        } catch (dbError) {
            console.warn("Error consultando DB:", dbError.message);
        }

        // B) PUERTA TRASERA (BACKDOOR) PARA EL ARQUITECTO
        // Esto asegura que tú SIEMPRE puedas entrar para configurar a los demás
        const WHITELIST_ADMINS = ['lirapac@gmail.com']; 
        
        if (!accesoPermitido && WHITELIST_ADMINS.includes(userEmail)) {
            console.log("Activando acceso de emergencia para Admin.");
            rolUsuario = 'admin';
            accesoPermitido = true;
            
            // Opcional: Crear el usuario en DB automáticamente si no existe
            await db.collection('usuarios').doc(userEmail).set({
                nombre: userName,
                email: userEmail,
                rol: 'admin',
                activo: true,
                fechaRegistro: new Date().toISOString()
            }, { merge: true });
        }

        // 5. DECISIÓN FINAL
        if (!accesoPermitido) {
            return {
                statusCode: 403,
                body: `<h1>Acceso Denegado</h1><p>El usuario <strong>${userEmail}</strong> no tiene permisos registrados en el Sistema Leezar.</p><a href="/">Volver</a>`
            };
        }

        // 6. GENERAR SESIÓN FIREBASE
        // Creamos un token oficial de Firebase Auth usando el correo como Identificador (UID)
        const firebaseToken = await admin.auth().createCustomToken(userEmail);

        // Guardamos el token de Firebase en la cookie en lugar del de Google
        const authCookie = cookie.serialize('leezar_token', firebaseToken, {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: false, // Mantenemos false para que layout.js pueda leerlo
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 semana
        });

        // Redirigir al Dashboard
        const targetUrl = `/dashboard.html?email=${encodeURIComponent(userEmail)}&name=${encodeURIComponent(userName)}&photo=${encodeURIComponent(userPhoto)}&role=${rolUsuario}`;

        return {
            statusCode: 302,
            headers: {
                'Set-Cookie': authCookie,
                'Location': targetUrl,
                'Cache-Control': 'no-cache'
            },
            body: 'Entrando al sistema...'
        };

    } catch (error) {
        console.error("Error Crítico Auth-Finish:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Fallo en autenticación", details: error.message }) 
        };
    }
};