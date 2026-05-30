// Archivo: crear-pago-stripe.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
    // 1. Cabeceras de seguridad y CORS para permitir peticiones desde el frontend
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Manejo de la petición preflight (CORS)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Solo aceptamos peticiones POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Método No Permitido' };
    }

    try {
        // 2. Extraer los datos enviados desde el frontend (estimaciones.html)
        const { paquete, userId, userEmail } = JSON.parse(event.body);

        let precioUnitario;
        let nombrePaquete;
        let creditosOtorgados;

        // 3. Lógica de negocio (Modelos de Precios y Asignación de Créditos)
        if (paquete === 'basico') {
            precioUnitario = 100000; // Stripe lee en centavos. 100000 = $1,000.00 MXN
            nombrePaquete = "Consulta Única (Estimador de Valor)";
            creditosOtorgados = 1;
        } else if (paquete === 'inversor') {
            precioUnitario = 400000; // 400000 = $4,000.00 MXN
            nombrePaquete = "Paquete Inversor (5 Consultas)";
            creditosOtorgados = 5;
        } else {
            throw new Error("Paquete no válido");
        }

        // 4. Detectar dinámicamente si estamos en Localhost o en Producción (Netlify)
        const origin = event.headers.origin || event.headers.referer || 'https://ecosistema-leezar.netlify.app';
        const baseUrl = origin.replace(/\/$/, ""); // Limpiamos la URL quitando el slash final si lo tiene

        // 5. Crear la sesión de pago (Checkout Session de Stripe)
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], // Habilita cobros con tarjeta de crédito/débito
            customer_email: userEmail, // Autocompleta el correo del cliente en la pasarela para mayor comodidad
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: {
                            name: nombrePaquete,
                            description: `Centro Integral Inmobiliario EME`,
                        },
                        unit_amount: precioUnitario,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment', // Es un pago único, no una suscripción mensual
            
            // 6. URLs Dinámicas: Stripe sabrá a dónde devolver al cliente tras el pago
            success_url: `${baseUrl}/estimaciones.html?pago=exito`,
            cancel_url: `${baseUrl}/estimaciones.html?pago=cancelado`,
            
            // 7. METADATA: Información crítica y oculta que viaja a Stripe y regresa a nuestro Webhook
            metadata: {
                userId: userId,
                paquete: paquete,
                creditos: creditosOtorgados
            }
        });

        // 8. Devolvemos la URL generada por Stripe al frontend para redirigir al usuario
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ url: session.url })
        };

    } catch (error) {
        console.error("Error al crear sesión en Stripe:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};