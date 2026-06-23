// netlify/functions/calcular-estimacion.js
const admin = require('firebase-admin');

// Inicializamos Firebase Admin si no está inicializado
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

exports.handler = async (event, context) => {
    // 1. Seguridad básica: Solo peticiones POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 2. EL CADENERO: Extraer el token de autorización enviado desde el frontend
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error("Intento de acceso sin Token");
            return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado. Faltan credenciales.' }) };
        }

        const idToken = authHeader.split('Bearer ')[1];

        // 3. VALIDACIÓN CRIPTOGRÁFICA DEL TOKEN EN FIREBASE
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            console.error("Token falso o expirado:", error);
            return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido o expirado.' }) };
        }

        // ¡EL USUARIO ES REAL! (Puedes acceder a su ID con decodedToken.uid si lo necesitaras)

        // 4. PREPARAMOS EL ENVÍO A GOOGLE CLOUD
        const payload = JSON.parse(event.body);
        const API_KEY_SECRETA = process.env.LEEZAR_API_SECRET; 
        const URL_CLOUD_FUNCTION = "https://motor-pericial-eme-o5hgi24naa-uc.a.run.app";

        if (!API_KEY_SECRETA) {
            throw new Error("Configuración crítica faltante en el servidor.");
        }

        // 🔍 DEBUG: Imprimimos en tu terminal los datos exactos que vamos a enviar
        console.log("🔍 DATOS ENVIADOS A EME:", JSON.stringify(payload, null, 2));

        // 5. HACEMOS LA PETICIÓN A LA BÓVEDA (Evadiendo la guillotina de Netlify)
        const controller = new AbortController();
        // Cortamos a los 28 segundos EXACTOS para ganar de mano al error del servidor
        const timeoutId = setTimeout(() => controller.abort(), 28000); 

        let response;
        try {
            response = await fetch(URL_CLOUD_FUNCTION, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-leezar-secret': API_KEY_SECRETA
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                return { statusCode: 504, body: JSON.stringify({ error: "El Motor de IA estaba en reposo y tardó en despertar. Por favor, haz clic en Procesar nuevamente." }) };
            }
            throw fetchError;
        } finally {
            clearTimeout(timeoutId);
        }

        const data = await response.json();

        if (!response.ok) {
            return { 
                statusCode: response.status, 
                body: JSON.stringify({ error: data.error || "Error en el motor matemático" }) 
            };
        }

        // 6. DEVOLVEMOS EL CÁLCULO
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Error en la pasarela del motor:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Fallo de infraestructura en la nube." })
        };
    }
};