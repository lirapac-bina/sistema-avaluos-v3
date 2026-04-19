// Archivo: netlify/functions/send-whatsapp.js
const fetch = require('node-fetch'); // Asegúrate de tener node-fetch instalado en tu package.json

exports.handler = async (event, context) => {
    // 1. Seguridad: Solo aceptar POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);
        const { telefono, cliente, enlace } = data;

        // 🌟 VARIABLES DE ENTORNO (Las configurarás en tu panel de Netlify)
        const WA_TOKEN = process.env.META_WA_TOKEN;
        const WA_PHONE_ID = process.env.META_WA_PHONE_ID;

        // 2. Construir el paquete (Payload) para Meta
        // Nota: Meta exige el uso de "Templates" para iniciar conversaciones.
        // Debes crear un template en Meta Business Manager llamado "aviso_agenda_cita"
        const payload = {
            messaging_product: "whatsapp",
            to: telefono,
            type: "template",
            template: {
                name: "aviso_agenda_cita", // ⚠️ Nombre de tu plantilla aprobada en Meta
                language: {
                    code: "es_MX"
                },
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: cliente } // Variable 1: Nombre del cliente
                        ]
                    },
                    {
                        type: "button",
                        sub_type: "url",
                        index: "0",
                        parameters: [
                            { type: "text", text: enlace } // Variable 2: Botón con URL dinámica
                        ]
                    }
                ]
            }
        };

        // 3. Disparar el mensaje a los servidores de Facebook/Meta
        const response = await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Meta API Error:", result);
            return { statusCode: 400, body: JSON.stringify({ exito: false, error: result.error.message }) };
        }

        return { statusCode: 200, body: JSON.stringify({ exito: true, data: result }) };

    } catch (error) {
        console.error("Function Error:", error);
        return { statusCode: 500, body: JSON.stringify({ exito: false, error: "Error interno del servidor" }) };
    }
};