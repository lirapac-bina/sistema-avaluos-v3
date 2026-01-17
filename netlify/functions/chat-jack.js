const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event, context) => {
    // Configuración de CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { mensaje, seccionContexto } = JSON.parse(event.body);

        // 1. Iniciar Gemini (Asegúrate de tener GEMINI_API_KEY en tus variables de entorno)
        // Si estás probando en local sin .env, puedes pegar la clave aquí temporalmente (NO RECOMENDADO PARA PROD)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 
        
        // Usamos el modelo Flash por ser rápido y económico
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 2. Definir la Personalidad y Contexto (RAG Simplificado)
        const systemPrompt = `
            Eres Jack, el asistente experto en valuación inmobiliaria de la empresa Leezar.
            Tu misión es guiar al capturista para que el avalúo cumpla con la normativa SHF (Sociedad Hipotecaria Federal).
            
            CONTEXTO ACTUAL: El usuario está llenando la sección: "${seccionContexto}".
            
            REGLAS:
            1. Responde de forma concisa, técnica pero amable.
            2. Si te preguntan algo fuera de la valuación, responde que solo puedes ayudar con el avalúo.
            3. Usa formato Markdown si necesitas listar puntos.
            4. Si el usuario pregunta "qué pongo aquí", dale ejemplos comunes para esa sección específica.
        `;

        // 3. Generar la respuesta
        const result = await model.generateContent([systemPrompt, mensaje]);
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
            body: JSON.stringify({ error: "Jack está durmiendo... (Error de conexión)" })
        };
    }
};