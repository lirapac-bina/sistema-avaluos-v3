// netlify/functions/extraer-datos-ia-background.js
const { google } = require('googleapis'); 
const admin = require('firebase-admin');

// 🌟 INICIALIZAMOS FIREBASE ADMIN (Patrón Singleton)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT))
    });
}

exports.handler = async (event) => {
    // ⚠️ Una Background function no usa el "return" clásico hacia el navegador.
    // Solo hace el trabajo y se apaga en silencio.
    
    try {
        // Recibimos los datos (Ahora incluimos expId y reqKey para saber dónde guardar)
        const { fileId, promptPersonalizado, expId, reqKey } = JSON.parse(event.body);

        if (!fileId || !promptPersonalizado || !expId || !reqKey) {
            console.error("❌ Background IA: Faltan parámetros.");
            return;
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        // 1. CONEXIÓN A DRIVE
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        // 2. DESCARGA DEL DOCUMENTO
        console.log(`🤖 Descargando documento para ${reqKey}...`);
        const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
        const mimeType = fileMeta.data.mimeType;

        const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const base64Data = Buffer.from(driveRes.data).toString('base64');

        // 3. EJECUCIÓN DIRECTA A GEMINI
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

        // 4. GUARDADO DIRECTO EN FIREBASE
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