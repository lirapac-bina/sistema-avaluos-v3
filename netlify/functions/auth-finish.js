const { google } = require('googleapis');
const admin = require('firebase-admin');
const cookie = require('cookie');
const fs = require('fs');
const path = require('path');

// --- 1. INICIALIZACIÓN BLINDADA DE FIREBASE ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
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
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        console.error("ADVERTENCIA: No se pudo conectar a Firebase.");
    }
}
const db = admin.firestore();

// ----------------------------------------------------------------------------

exports.handler = async (event, context) => {
    const { code, state } = event.queryStringParameters;

    // 🛡️ 1. VALIDACIÓN ANTI-CSRF (STATE) - ¡Corregido, declarada solo UNA vez!
    const cookies = cookie.parse(event.headers.cookie || '');
    const storedState = cookies.oauth_state;

    if (!state || !storedState || state !== storedState) {
        console.error("🚨 Alerta de Seguridad: State Mismatch");
        return { 
            statusCode: 403, 
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: `
            <div style="font-family: system-ui, sans-serif; text-align: center; margin-top: 10vh; padding: 20px;">
                <h1 style="color: #e11d48; margin-bottom: 10px;">Acceso Interrumpido</h1>
                <p style="color: #475569; max-width: 400px; margin: 0 auto 20px auto; line-height: 1.5;">
                    No pudimos validar tu sesión de forma segura. Esto suele ocurrir si pasaron más de 10 minutos o si tu navegador tiene <b>bloqueadas las cookies</b>.
                </p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; max-width: 400px; margin: 0 auto 30px auto; font-size: 14px; color: #334155;">
                    <b>💡 Solución:</b> Asegúrate de permitir cookies para este sitio web o intenta usar una ventana normal (no incógnito estricto).
                </div>
                <a href="/" style="background: #0f4c81; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Volver al Inicio</a>
            </div>
            ` 
        };
    }

    if (!code) return { statusCode: 400, body: 'Error: Falta el código.' };

    try {
        const host = event.headers.host;
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const redirectUri = `${protocol}://${host}/.netlify/functions/auth-finish`;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID || "880781885603-dra7ci2h2787ot0fncqs1q9vrnrq9k8a.apps.googleusercontent.com",
            process.env.GOOGLE_CLIENT_SECRET || "GOCSPX-u6ddX_qX_S7yX_S7yX_S7yX_S7y",
            redirectUri
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const userInfo = await oauth2.userinfo.get();
        
        const userEmail = userInfo.data.email;
        const userName = userInfo.data.name;
        const userPhoto = userInfo.data.picture;

        let rolUsuario = null;
        let accesoPermitido = false;
        let targetDashboard = '';

        try {
            // 1. Buscamos primero si el usuario pertenece al Staff (ERP / Hipotecas)
            const userDoc = await db.collection('usuarios').doc(userEmail).get();
            if (userDoc.exists && userDoc.data().activo !== false) {
                rolUsuario = userDoc.data().rol;
                // Bloqueamos a los "invitados". SOLO pasan roles autorizados (admin, gestor, etc.)
                if (rolUsuario && rolUsuario !== 'invitado') {
                    accesoPermitido = true;
                    targetDashboard = '/dashboard.html';
                }
            }

            // 2. Si no es del Staff, buscamos si está autorizado como Cliente (Dictamen AvEME)
            if (!accesoPermitido) {
                const clientDoc = await db.collection('usuarios_dictamen').doc(userEmail).get();
                if (clientDoc.exists && clientDoc.data().activo !== false) {
                    rolUsuario = 'cliente_aveme';
                    accesoPermitido = true;
                    targetDashboard = '/dashboard_dictamen.html';
                }
            }
        } catch (dbError) { console.warn("Error consultando DB:", dbError.message); }

        // 3. Whitelist de Respaldo Seguro
        const WHITELIST_ADMINS = ['lirapac@gmail.com']; 
        if (!accesoPermitido && WHITELIST_ADMINS.includes(userEmail)) {
            rolUsuario = 'admin';
            accesoPermitido = true;
            targetDashboard = '/dashboard.html';
            await db.collection('usuarios').doc(userEmail).set({
                nombre: userName, email: userEmail, rol: 'admin', activo: true, fechaRegistro: new Date().toISOString()
            }, { merge: true });
        }

        // 🚫 4. LA PATADA (ZERO TRUST): Si no existe en BD, no entra a NADA.
        if (!accesoPermitido) {
            console.warn(`Acceso denegado: ${userEmail} intentó entrar sin autorización.`);
            return { 
                statusCode: 302, 
                // Lo mandamos de regreso al login con un parámetro de error
                headers: { 'Location': '/index.html?error=unauthorized', 'Cache-Control': 'no-cache' },
                body: ''
            };
        }

        // --- 5. GENERACIÓN DE SESIÓN (Solo para los que pasaron el filtro) ---
        const firebaseToken = await admin.auth().createCustomToken(userEmail);
        const authCookie = cookie.serialize('leezar_token', firebaseToken, {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: false, 
            path: '/',
            maxAge: 60 * 60 * 24 * 7 
        });

        const targetUrl = `${targetDashboard}?email=${encodeURIComponent(userEmail)}&name=${encodeURIComponent(userName)}&photo=${encodeURIComponent(userPhoto)}&role=${rolUsuario}`;

        return {
            statusCode: 302,
            headers: { 'Set-Cookie': authCookie, 'Location': targetUrl, 'Cache-Control': 'no-cache' },
            body: 'Entrando al sistema...'
        };

    } catch (error) {
        console.error("Error Crítico Auth-Finish:", error);
        // 🎯 REDIRECCIÓN SILENCIOSA: Si el código caducó (invalid_grant), lo regresamos al login
        return { 
            statusCode: 302, 
            headers: { 'Location': '/index.html', 'Cache-Control': 'no-cache' },
            body: ''
        };
    }
};