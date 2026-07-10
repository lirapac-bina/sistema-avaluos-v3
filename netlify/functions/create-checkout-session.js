// netlify/functions/create-checkout-session.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT))
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };

    try {
        const authHeader = event.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) throw new Error('No token provided');
        
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 📦 RECIBIMOS LOS DATOS DINÁMICOS DEL PAQUETE
        const { expedienteId, returnUrl, nombrePaquete, precio, creditos } = JSON.parse(event.body);

        if (!precio || !creditos) throw new Error('Datos de paquete inválidos');

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], 
            line_items: [
                {
                    price_data: {
                        currency: 'mxn', 
                        product_data: {
                            name: nombrePaquete || 'Créditos AVM',
                            description: `Recarga de ${creditos} crédito(s) operativo(s) EME`
                        },
                        unit_amount: Math.round(precio * 100), // Stripe lee en centavos
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${returnUrl}?canceled=true`,
            client_reference_id: uid, 
            metadata: {
                expedienteId: expedienteId || 'generico',
                uid: uid,
                creditos_comprados: creditos
            }
        });

        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        console.error("❌ Error en Stripe Checkout:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};