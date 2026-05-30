const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Inicializamos Firebase Admin usando la variable de entorno que ya tienes configurada
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// Tomamos el secreto directamente de las variables de entorno
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event, context) => {
    // Stripe siempre envía los webhooks por POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Método No Permitido' };
    }

    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        // Stripe requiere verificar la firma para asegurar que el mensaje es real y no un hacker
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
    } catch (err) {
        console.error(`⚠️ Error de firma de Webhook:`, err.message);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    // Si el pago fue exitoso...
    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        const metadata = session.metadata; // Aquí viene el userId y los creditos que mandamos desde crear-pago-stripe.js

        if (metadata && metadata.userId) {
            const creditosComprados = parseInt(metadata.creditos, 10);
            
            try {
                // 1. Magia: Sumar los créditos al usuario
                await db.collection('usuarios_estimador').doc(metadata.userId).update({
                    creditos: admin.firestore.FieldValue.increment(creditosComprados),
                    fechaUltimoPago: admin.firestore.FieldValue.serverTimestamp()
                });
                
                // 2. Registro financiero para tu futuro Mega Dashboard Admin
                await db.collection('ingresos_estimador').add({
                    userId: metadata.userId,
                    paquete: metadata.paquete,
                    montoMXN: session.amount_total / 100, // Stripe manda en centavos, lo dividimos
                    fecha: admin.firestore.FieldValue.serverTimestamp(),
                    sessionId: session.id,
                    creditosAbonados: creditosComprados
                });

                console.log(`✅ ÉXITO: ${creditosComprados} créditos asignados a ${metadata.userId}`);
            } catch (error) {
                console.error("Error al actualizar Firestore:", error);
                return { statusCode: 500, body: "Error interno base de datos" };
            }
        }
    }

    // Hay que responderle a Stripe rápido con un 200 OK para que deje de insistir
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};