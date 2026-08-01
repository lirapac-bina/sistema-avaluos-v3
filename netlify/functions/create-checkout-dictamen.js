// netlify/functions/create-checkout-dictamen.js
// 🔥 UPDATE FORZADO PARA LIMPIAR CACHÉ DE NETLIFY 🔥
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
        admin.initializeApp();
    }
}

// Silenciamos temporalmente a Firebase para que no imponga los $500
// const db = admin.firestore(); 

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };

    try {
        const { ticket_id, email, perfil_usuario } = JSON.parse(event.body);

        if (!ticket_id || !email || !perfil_usuario) {
            throw new Error('Datos incompletos para procesar el pago del dictamen.');
        }

        // 💰 FORZAMOS EL PRECIO A $125 MXN EXACTOS (Ignorando BD)
        const precioDictamen = 125; 

        // 🚀 STRIPE ELEMENTS (Payment Intents)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(precioDictamen * 100),
            currency: 'mxn',
            receipt_email: email,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                tipo_operacion: 'dictamen_eme',
                ticket_id: ticket_id,
                email_usuario: email,
                perfil_cobrado: perfil_usuario
            }
        });

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                clientSecret: paymentIntent.client_secret 
            }) 
        };

    } catch (error) {
        console.error("❌ Error en Stripe PaymentIntent (Dictamen):", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};