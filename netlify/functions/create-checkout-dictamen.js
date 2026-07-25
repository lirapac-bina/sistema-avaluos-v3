// netlify/functions/create-checkout-dictamen.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// --- INICIALIZACIÓN BLINDADA DE FIREBASE ---
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

const db = admin.firestore();

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método no permitido' };

    try {
        // 📦 RECIBIMOS LOS DATOS DEL FRONTEND (Tiempo 2)
        const { ticket_id, email, returnUrl, perfil_usuario } = JSON.parse(event.body);

        if (!ticket_id || !email || !returnUrl || !perfil_usuario) {
            throw new Error('Datos incompletos para procesar el pago del dictamen.');
        }

        // 🔍 CONSULTAR TARIFA DINÁMICA EN FIREBASE
        let precioDictamen = 0; 
        
        try {
            // Buscamos en una colección central de configuración
            const tarifasRef = await db.collection('ajustes_sistema').doc('tarifas_dictamen').get();
            
            if (tarifasRef.exists) {
                const tarifas = tarifasRef.data();
                // Construimos la llave dinámica, ej: "perfil_1", "perfil_3"
                const llavePerfil = `perfil_${perfil_usuario}`;
                precioDictamen = tarifas[llavePerfil] || 500; // Si olvidaste poner ese perfil en BD, cobra 500 por seguridad
            } else {
                console.warn("[AvEME] No se encontró el documento de tarifas, usando fallback.");
                precioDictamen = 500; // Fallback de red
            }
        } catch (dbError) {
            console.error("Error leyendo tarifas de Firebase:", dbError);
            precioDictamen = 500; // Fallback en caso de que Firebase falle
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email, // Le ahorramos al cliente teclear su correo
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: {
                            name: `Desbloqueo de Dictamen Pericial (Perfil ${perfil_usuario})`,
                            description: `Certificación y liberación de PDF (Ticket: ${ticket_id})`
                        },
                        unit_amount: Math.round(precioDictamen * 100), // Stripe procesa en centavos
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&ticket_id=${ticket_id}&success=true`,
            cancel_url: `${returnUrl}?canceled=true`,
            metadata: {
                tipo_operacion: 'dictamen_eme',
                ticket_id: ticket_id,
                email_usuario: email,
                perfil_cobrado: perfil_usuario
            }
        });

        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };

    } catch (error) {
        console.error("❌ Error en Stripe Checkout (Dictamen):", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};