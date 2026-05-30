exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);

        // 🚀 PEGA AQUÍ LA URL DE TU SCRIPT RECIÉN PUBLICADO
        const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzSN_DW9r4F-XjhBXGhdcEOXZsS1VwCUGBh4OHjIbeOGbFv1wBHi1hTTSBW0rApvC8z/exec";

        console.log(`🚀 Mandando orden a Apps Script para generar Word de: ${data.cliente}`);

        // Le reenviamos el paquete completo al Apps Script
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data) 
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || "Error interno en Google Apps Script");
        }

        console.log(`✅ Documento creado con éxito por GAS: ${result.docUrl}`);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('❌ Error comunicando con Apps Script:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};