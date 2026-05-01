// netlify/functions/extraer-datos-ia-background.js
const { google } = require('googleapis'); 
const admin = require('firebase-admin');

// 🌟 INICIALIZAMOS FIREBASE ADMIN
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT))
    });
}

exports.handler = async (event) => {
    try {
        // 🔴 Recibimos fileId (Drive) o fileUrl (Firebase)
        const { fileId, fileUrl, promptPersonalizado, expId, reqKey } = JSON.parse(event.body);

        if ((!fileId && !fileUrl) || !promptPersonalizado || !expId || !reqKey) {
            console.error("❌ Background IA: Faltan parámetros.");
            return;
        }

        // 🔴 FIX: Forzamos el uso de la llave correcta (LECTOR)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY_LECTOR;
        if (!GEMINI_API_KEY) console.error("🚨 ALERTA: No se encontró GEMINI_API_KEY_LECTOR en el entorno.");

        let base64Data = "";
        let mimeType = "application/pdf"; // default

        // 1. DESCARGA DEL DOCUMENTO (Inteligente)
        if (fileId) {
            console.log(`🤖 Descargando documento de Google Drive...`);
            const auth = new google.auth.GoogleAuth({
                credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
                scopes: ['https://www.googleapis.com/auth/drive.readonly'],
            });
            const drive = google.drive({ version: 'v3', auth });
            
            const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
            mimeType = fileMeta.data.mimeType;

            const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
            base64Data = Buffer.from(driveRes.data).toString('base64');
        } else if (fileUrl) {
            console.log(`🤖 Descargando documento público (Firebase Storage)...`);
            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            base64Data = Buffer.from(arrayBuffer).toString('base64');
            mimeType = response.headers.get('content-type') || 'application/pdf';
        }

        // 2. EJECUCIÓN DIRECTA A GEMINI
        console.log(`🤖 Analizando con Gemini 2.5 Flash...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            contents: [{
                parts: [
                    { text: promptPersonalizado },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            }],
            generationConfig: { temperature: 0.1, response_mime_type: "application/json" }
        };

        const gRes = await fetch(geminiUrl, { method: 'POST', body: JSON.stringify(payload) });
        const gData = await gRes.json();
        
        if (!gRes.ok) throw new Error(gData.error?.message || "Error en IA");

        let rawResponse = gData.candidates[0].content.parts[0].text;
        rawResponse = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const datosExtraidos = JSON.parse(rawResponse);

        // 3. GUARDADO DIRECTO EN FIREBASE
        console.log(`💾 Guardando resultados en la base de datos...`);
        const db = admin.firestore();
        await db.collection('expedientes_avaluos').doc(expId).set({
            datos_extraidos: { [reqKey]: datosExtraidos }
        }, { merge: true });

        console.log(`✅ MISIÓN BACKGROUND CUMPLIDA PARA: ${reqKey}`);

    } catch (error) {
        console.error("❌ Error fatal en Background IA:", error);
    }
};