const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // 🌟 AÑADIDO PARA PODER HABLAR CON TELEGRAM

// --- INICIALIZACIÓN BLINDADA PARA NETLIFY ---
if (admin.apps.length === 0) {
    let serviceAccount;
    // 1. Variable de Entorno (Nube)
    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
    // 2. Archivo Local (PC) - Usando 'fs' para engañar a Netlify
    if (!serviceAccount) {
        try {
            const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
            if (fs.existsSync(keyPath)) {
                serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }
        } catch (e) { }
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
// ------------------------------------------------

exports.handler = async (event, context) => {
    // Solo POST
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        let { expedienteId, colaborador, rol } = data; // 🌟 CAMBIAMOS 'const' POR 'let'

        // 🔒 CANDADO MAESTRO DE BACKEND: Siempre a minúsculas y sin espacios
        if (colaborador && colaborador !== 'Sin Asignar') {
            colaborador = colaborador.trim().toLowerCase();
        }

        if (!expedienteId || !colaborador || !rol) {
            return { statusCode: 400, body: 'Faltan datos (ID, Colaborador o Rol)' };
        }

        console.log(`Asignando ${colaborador} como ${rol} al expediente ${expedienteId}`);

        // --- REGLA DE NEGOCIO: SOLO BUSCAR EN AVALUOS ---
        const docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return { statusCode: 404, body: 'Expediente no encontrado en Avalúos.' };
        }

        const expData = doc.data(); // 🌟 EXTRAEMOS LA INFO DEL EXPEDIENTE

        // Construir objeto de actualización dinámica
        let updateData = {};
        updateData[rol] = colaborador;
        
        const rolCapitalizado = rol.charAt(0).toUpperCase() + rol.slice(1);
        updateData[`fechaAsignacion${rolCapitalizado}`] = new Date().toISOString();

        // Actualizar en Firebase
        await docRef.update(updateData);

        // ===========================================================
        // 🤖 EL BOT ENTRA EN ACCIÓN (TELEGRAM)
        // ===========================================================
        // Si están desasignando a alguien (colaborador = 'Sin Asignar' o vacío), no mandamos mensaje.
        if (colaborador && colaborador !== 'Sin Asignar') {
            try {
                // Usamos las llaves de Jack que ya sabemos que funcionan perfectamente
                const TELEGRAM_TOKEN = "8832075655:AAF9d8vnvgKhQM_2tOIduIn8iOfsP9TeSac";
                const TELEGRAM_CHAT_ID = "-1003934917323";

                // Le ponemos su icono visual dependiendo del trabajo
                let emoji = "👤";
                let nombreRol = rol.toUpperCase();
                if(rol === 'capturista') { emoji = "💻"; nombreRol = "CAPTURISTA"; }
                if(rol === 'visitador') { emoji = "📸"; nombreRol = "VISITADOR"; }
                if(rol === 'dibujante') { emoji = "📐"; nombreRol = "DIBUJANTE"; }

                // Armamos los datos limpios
                const folio = expData.folioOperativo && expData.folioOperativo !== 'SIN FOLIO' ? expData.folioOperativo : expedienteId.substring(0,8);
                const cliente = expData.cliente || 'Cliente Desconocido';
                const unidad = expData.unidad || 'POR ASIGNAR';
                const nombreColaborador = colaborador.split('@')[0].toUpperCase(); // Extraemos "PAME" de "pame@gmail.com"

                const mensaje = `🔔 *NUEVA ASIGNACIÓN TÉCNICA*\n` +
                                `──────────────────\n` +
                                `📋 *Folio:* ${folio}\n` +
                                `👤 *Cliente:* ${cliente}\n` +
                                `🏢 *Unidad:* ${unidad}\n\n` +
                                `${emoji} *Rol:* ${nombreRol}\n` +
                                `👷 *Asignado a:* ${nombreColaborador}\n\n` +
                                `👉 [Abrir Sistema Leezar](https://ecosistema-leezar.netlify.app/)`;

                const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: mensaje,
                        parse_mode: 'Markdown'
                    })
                });
                console.log("✅ Notificación de Telegram enviada con éxito.");
            } catch(telErr) {
                console.error("❌ Error enviando mensaje a Telegram:", telErr);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Asignación exitosa', datos: updateData })
        };

    } catch (error) {
        console.error("Error crítico al asignar:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};