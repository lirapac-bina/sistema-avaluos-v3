const admin = require('firebase-admin');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!admin.apps.length) {
    try {
        const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
        if (serviceAccountRaw) {
            const serviceAccount = JSON.parse(serviceAccountRaw);
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        } else {
            admin.initializeApp(); 
        }
    } catch (error) {
        console.warn("Advertencia: No se pudo cargar el Service Account de Firebase.");
    }
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const payload = JSON.parse(event.body);
        const { expId, reqKeyLeft, reqKeyRight, nombreIzquierdo, nombreDerecho } = payload;

        if (!expId || !reqKeyLeft || !reqKeyRight) {
            throw new Error("Faltan parámetros. Se requiere documento izquierdo y derecho.");
        }

        const apiKey = process.env.GEMINI_API_KEY_LECTOR || process.env.GEMINI_API_KEY_JACK;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const db = admin.firestore();
        const expRef = await db.collection('expedientes_avaluos').doc(expId).get();
        if (!expRef.exists) throw new Error("Expediente no encontrado.");

        const checklist = expRef.data().checklist || {};

        const docIzq = checklist[reqKeyLeft];
        const docDer = checklist[reqKeyRight];

        if (!docIzq || !docDer) throw new Error("Metadata no encontrada de los documentos.");

        const url1 = docIzq.archivoUrl || docIzq.driveUrl || docIzq.url || docIzq.driveLink;
        const url2 = docDer.archivoUrl || docDer.driveUrl || docDer.url || docDer.driveLink;

        async function getGenerativePart(url) {
            let base64Data = "";
            let mimeType = "application/pdf";
            const driveMatch = url.match(/(?:id=|v\/|d\/)([a-zA-Z0-9_-]{15,})/);
            
            if (driveMatch && driveMatch[1]) {
                const fileId = driveMatch[1];
                const auth = new google.auth.GoogleAuth({
                    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
                    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
                });
                const drive = google.drive({ version: 'v3', auth });
                const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
                mimeType = fileMeta.data.mimeType;

                const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
                base64Data = Buffer.from(driveRes.data).toString('base64');
            } else {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                base64Data = Buffer.from(arrayBuffer).toString('base64');
                mimeType = response.headers.get('content-type') || 'application/pdf';
            }

            if (mimeType.includes('text/html')) throw new Error("HTML no válido.");

            return { inlineData: { data: base64Data, mimeType: mimeType } };
        }

        const [part1, part2] = await Promise.all([
            getGenerativePart(url1),
            getGenerativePart(url2)
        ]);

        const prompt = `
        Actúa como un perito auditor experto en expedientes hipotecarios (normativas SHF y Leezar).
        
        Estás comparando UN REQUISITO contra un DOCUMENTO BASE.
        
        - REQUISITO A ANALIZAR: ${nombreIzquierdo || docIzq.nombre || reqKeyLeft}
        - DOCUMENTO BASE: ${nombreDerecho || docDer.nombre || reqKeyRight}
        
        INSTRUCCIÓN CRÍTICA: La lógica de comparación debe partir del REQUISITO hacia la base, NO al revés. 
        
        PASOS A SEGUIR:
        1. Lee el REQUISITO e identifica qué datos aporta naturalmente. (Ej. Un INE aporta Nombre, CURP y Domicilio. Una Constancia de Situación Fiscal aporta Nombre, RFC y C.P. Un documento de NSS aporta Nombre y Número de Seguridad Social).
        2. Busca ÚNICAMENTE esos datos específicos dentro del DOCUMENTO BASE.
        3. REGLA DE ORO: NO penalices ni menciones datos que el DOCUMENTO BASE pide pero que el REQUISITO no tiene por naturaleza. (Ej. Si analizas un INE, es un error de auditoría decir "Falta el NSS" o "Falta el RFC", ignóralos).
        4. Aplica TOLERANCIA A MANUSCRITOS en el DOCUMENTO BASE. Asume errores de escritura visual (ej. '6' por 'G', '0' por 'O', 'S' por '5', 'Z' por '2'). Si la similitud es evidente, dalo por válido.

        Estructura tu respuesta exactamente así, sin usar asteriscos u otros caracteres de formato:
        
        ✅ DATOS VALIDADOS CON LA BASE:
        - [Dato coincidente 1]
        
        ⚠️ DISCREPANCIAS O ERRORES:
        - [Dato discrepante 1, indicando qué dice el requisito vs la base]
        (Si no hay discrepancias reales, escribe únicamente: "Los datos de este requisito coinciden perfectamente con la solicitud base").
        `;

        const result = await model.generateContent([prompt, part1, part2]);
        let responseText = result.response.text();
        
        // Magia para limpiar los molestos asteriscos de Markdown
        responseText = responseText.replace(/\*\*/g, '').replace(/\*/g, '-');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ resultado: responseText })
        };

    } catch (error) {
        console.error("Error crítico en comparar-ia:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};