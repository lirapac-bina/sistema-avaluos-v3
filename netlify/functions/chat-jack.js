const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event, context) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { mensaje, seccionContexto, imagenBase64 } = JSON.parse(event.body);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 
        
        // Usamos la configuración por defecto sin forzar la versión para evitar conflictos
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });

        const systemPrompt = `
            Eres Jack, el asistente experto en valuación inmobiliaria de la empresa Leezar.
            Tu misión es guiar al capturista para que el avalúo cumpla con la normativa SHF (Sociedad Hipotecaria Federal).
            
            CONTEXTO ACTUAL: El usuario está llenando la sección: "${seccionContexto}".
            
            REGLAS:
            1. Responde de forma concisa, muy técnica pero amable.
            2. Si te envían una foto de un inmueble (interiores o exteriores), descríbela como un perito valuador: menciona el tipo de piso, acabados en muros, plafones, cancelería y estado de conservación evidente.
            3. Usa formato Markdown si necesitas listar puntos.
        `;

        let promptContent = [systemPrompt, mensaje];

        if (imagenBase64) {
            const imageParts = {
                inlineData: {
                    data: imagenBase64,
                    mimeType: "image/jpeg"
                },
            };
            promptContent = [systemPrompt, imageParts, mensaje];
        }

        const result = await model.generateContent(promptContent);
        const response = await result.response;
        const text = response.text();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ reply: text })
        };

    } catch (error) {
        console.error("Error Jack Brain:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Jack está durmiendo... " + error.message })
        };
    }
};