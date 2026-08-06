exports.handler = async (event) => {
    // Cabeceras de seguridad
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const email = event.queryStringParameters.email;
        
        if (!email) {
            return { statusCode: 400, headers, body: JSON.stringify({ acceso: false }) };
        }

        // 🛡️ LA LISTA BLANCA BLINDADA (Nadie en el frontend puede ver esto)
        const listaBlanca = [
            'lirapac@gmail.com',
            'pamenogue9@gmail.com',
            'eme@emeavaluos.com',
            'ivan.herrera110@gmail.com',
            'perinu88@gmail.com'
        ];

        // Verificamos si el correo está en la lista
        if (listaBlanca.includes(email)) {
            return { statusCode: 200, headers, body: JSON.stringify({ acceso: true }) };
        } else {
            return { statusCode: 200, headers, body: JSON.stringify({ acceso: false }) };
        }

    } catch (error) {
        console.error("Error en Guardián de Acceso:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ acceso: false }) };
    }
};