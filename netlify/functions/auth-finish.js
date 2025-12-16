const cookie = require('cookie');

exports.handler = async (event, context) => {
    const { code } = event.queryStringParameters;

    // Validación básica
    if (!code) {
        return { statusCode: 400, body: 'Falta el código de autorización de Google.' };
    }

    try {
        // En un sistema real, aquí intercambiarías el 'code' por tokens de Google.
        // Como estamos en desarrollo/demo, simulamos un token exitoso.
        // Si tuvieras la lógica de googleapis aquí, iría en este bloque.
        
        const mockToken = "TOKEN_SIMULADO_LEEZAR_V3"; 
        
        // Simulamos obtener datos del usuario
        const userData = {
            email: "lirapac@gmail.com",
            role: "admin",
            name: "Usuario Leezar"
        };

        // Creamos la cookie de sesión segura
        const authCookie = cookie.serialize('leezar_token', mockToken, {
            secure: process.env.NODE_ENV === 'production', // Solo segura en producción
            httpOnly: false, // Permitimos acceso desde JS para leer el usuario en el frontend
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 semana
        });

        // Redirigimos al Dashboard con los datos del usuario en la URL (para que el frontend los guarde)
        const redirectUrl = `/dashboard.html?user=${encodeURIComponent(userData.email)}&role=${userData.role}&token=${mockToken}`;

        return {
            statusCode: 302,
            headers: {
                'Set-Cookie': authCookie,
                'Location': redirectUrl,
                'Cache-Control': 'no-cache'
            },
            body: 'Redireccionando...'
        };

    } catch (error) {
        console.error("Error en auth-finish:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Error interno de autenticación", details: error.message }) 
        };
    }
};