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
        // 🔴 NUEVA ARQUITECTURA: Soportamos un arreglo de archivos múltiples
        const bodyData = JSON.parse(event.body);
        const { promptPersonalizado, expId, reqKey } = bodyData;
        
        let archivosAProcesar = bodyData.archivos || [];

        // Compatibilidad hacia atrás (por si llega un solo archivo desde otra pantalla)
        if (archivosAProcesar.length === 0 && (bodyData.fileId || bodyData.fileUrl)) {
            archivosAProcesar.push({ fileId: bodyData.fileId, fileUrl: bodyData.fileUrl });
        }

        if (archivosAProcesar.length === 0 || !promptPersonalizado || !expId || !reqKey) {
            console.error("❌ Background IA: Faltan parámetros o no hay archivos.");
            return { statusCode: 400, body: JSON.stringify({ error: "Faltan parámetros" }) };
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY_LECTOR;
        if (!GEMINI_API_KEY) console.error("🚨 ALERTA: No se encontró GEMINI_API_KEY_LECTOR.");

        // 1. ARMADO DEL PAQUETE PARA GEMINI (El primer elemento es tu Prompt)
        let partesGemini = [{ text: promptPersonalizado }];

        console.log(`🤖 Descargando y procesando ${archivosAProcesar.length} archivo(s)...`);
        
        // Instanciamos Google Auth una sola vez para eficiencia
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        // 2. BUCLE: BARRIDO DE TODOS LOS DOCUMENTOS (Soporte Galería Multi-PDF)
        for (let archivo of archivosAProcesar) {
            let base64Data = "";
            let mimeType = "application/pdf";

            try {
                if (archivo.fileId) {
                    const fileMeta = await drive.files.get({ fileId: archivo.fileId, fields: 'mimeType' });
                    mimeType = fileMeta.data.mimeType;

                    const driveRes = await drive.files.get({ fileId: archivo.fileId, alt: 'media' }, { responseType: 'arraybuffer' });
                    base64Data = Buffer.from(driveRes.data).toString('base64');
                } else if (archivo.fileUrl) {
                    const response = await fetch(archivo.fileUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    base64Data = Buffer.from(arrayBuffer).toString('base64');
                    mimeType = response.headers.get('content-type') || 'application/pdf';
                }

                if (base64Data) {
                    partesGemini.push({ inline_data: { mime_type: mimeType, data: base64Data } });
                }
            } catch (errArchivo) {
                console.error(`⚠️ Error al descargar archivo individual: ${archivo.fileId || archivo.fileUrl}`, errArchivo);
                // Si uno falla, seguimos con los demás para no abortar todo
            }
        }

        if (partesGemini.length === 1) {
            throw new Error("No se pudo descargar ningún archivo válido para enviar a IA.");
        }

        // 3. EJECUCIÓN DIRECTA A GEMINI (Modo Masivo)
        console.log(`🤖 Analizando paquete completo con Gemini 2.5 Flash...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            contents: [{ parts: partesGemini }],
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
        return { statusCode: 200, body: JSON.stringify({ success: true }) };

    } catch (error) {
        console.error("❌ Error fatal en Background IA:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};