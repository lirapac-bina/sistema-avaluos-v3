const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Inicializamos Firebase Admin para poder leer tu base de datos desde el backend
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

exports.handler = async (event, context) => {
    // Seguridad: Solo aceptamos peticiones POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { paquete, userId, userEmail } = JSON.parse(event.body);
        
        // Ahora "paquete" nos manda el número de créditos (Ej. 1, 5, 10)
        const creditosDeseados = parseInt(paquete);

        // 1. DESCARGAMOS LA CONFIGURACIÓN REAL DE FIREBASE
        const configDoc = await db.collection('configuracion').doc('estimador_eme').get();
        if (!configDoc.exists) {
            throw new Error("Configuración del motor no encontrada en la base de datos.");
        }
        const config = configDoc.data();

        // 2. BUSCAMOS EL PAQUETE QUE EL CLIENTE ELIGIÓ
        const paqueteEncontrado = config.paquetes.find(p => p.creditos === creditosDeseados);
        if (!paqueteEncontrado) {
            throw new Error("Paquete no válido o no existe en la tienda.");
        }

        // 3. MAGIA MATEMÁTICA: APLICAR DESCUENTOS SI HAY PROMOCIÓN ACTIVA
        let precioFinal = paqueteEncontrado.precio;
        let sufijoPromocion = "";

        if (config.promo && config.promo.activa && config.promo.descuento > 0) {
            precioFinal = precioFinal * (1 - (config.promo.descuento / 100));
            sufijoPromocion = ` (Promo: ${config.promo.nombre} -${config.promo.descuento}%)`;
        }

        // 4. CREAR LA SESIÓN EN STRIPE
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: userEmail,
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: {
                            name: `${creditosDeseados} Crédito(s) - Ecosistema Leezar${sufijoPromocion}`,
                            description: `Adquisición de saldo para generación de estimaciones de valor automatizadas.`,
                            images: ['https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/logo-eme-HZjebNvrO2hDhZOM.png'],
                        },
                        // Stripe exige el dinero en centavos (Por eso multiplicamos por 100)
                        unit_amount: Math.round(precioFinal * 100), 
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // A dónde lo mandamos después de pagar
            success_url: 'https://ecosistema-leezar.netlify.app/estimaciones.html?pago=exitoso',
            cancel_url: 'https://ecosistema-leezar.netlify.app/estimaciones.html',
            // Metadata secreta para el Webhook
            metadata: {
                userId: userId,
                creditos: creditosDeseados,
                paquete: `${creditosDeseados} creditos paramétricos`
            }
        });

        // Devolvemos el link mágico a tu frontend
        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (error) {
        console.error("Error en la pasarela de pagos:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: error.message }),
        };
    }
};