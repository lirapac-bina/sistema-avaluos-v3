const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- 1. INICIALIZACIÓN BLINDADA ---
if (admin.apps.length === 0) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } 
        catch (e) { console.error("Error ENV:", e); }
    }
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

function normalizar(texto) {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

// --- PLANTILLA DE RESPALDO (LIGAS CORRECTAS FIJAS) ---
const PLANTILLA_RESPALDO = {
    solicitante: [
        { nombre: 'Identificación Oficial (INE/Pasaporte)', id: 'INE', obligatorio: true },
        { nombre: 'CURP', id: 'CURP', obligatorio: true },
        { nombre: 'Constancia de Situación Fiscal', id: 'RFC', obligatorio: true },
        { nombre: 'Número de Seguridad Social', id: 'NSS', obligatorio: true },
        // Ligas fijas aquí por seguridad
        { 
            nombre: 'Solicitud Avalúo', 
            id: 'SOL_AVALUO', 
            obligatorio: true,
            urlFormato: 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-avaluo-ave-RLFaTVxxccFJWZIH.pdf'
        },
        { 
            nombre: 'Solicitud Infonavit', 
            id: 'SOL_INFONAVIT', 
            obligatorio: true,
            urlFormato: 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-infonavit-BvU7wD8zhF0udyEB.pdf'
        }
    ],
    propietario: [
        { nombre: 'Escritura Pública', id: 'ESCRITURA', obligatorio: true },
        { nombre: 'Identificación Oficial Propietario', id: 'INE_PROP', obligatorio: true }
    ],
    inmueble: [
        { nombre: 'Boleta Predial', id: 'PREDIAL', obligatorio: true },
        { nombre: 'Recibo de Agua', id: 'AGUA', obligatorio: true }
    ]
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const data = JSON.parse(event.body);
        
        const entidad = normalizar(data.entidad || 'GLOBAL'); 
        const tramite = normalizar(data.tipoTramite || 'AVALUO');
        
        const numSol = parseInt(data.numSolicitantes) || 1;
        const numProp = parseInt(data.numPropietarios) || 1;

        console.log(`🔨 Creando Expediente: ${entidad} - ${tramite} (${numSol} Sol / ${numProp} Prop)`);

        // --- 2. INTENTAR LEER DE FIREBASE ---
        let plantilla = null;
        try {
            const configRef = db.collection('configuracion').doc('plantilla_maestra');
            const docSnap = await configRef.get();
            
            if (docSnap.exists) {
                const todo = docSnap.data().requisitos || docSnap.data();
                if (todo[entidad] && todo[entidad][tramite]) {
                    plantilla = todo[entidad][tramite];
                } else if (todo['GLOBAL'] && todo['GLOBAL'][tramite]) {
                    plantilla = todo['GLOBAL'][tramite];
                }
            }
        } catch (e) { console.error("Error leyendo config:", e); }

        if (!plantilla) plantilla = PLANTILLA_RESPALDO;

        // --- 3. CONSTRUIR CHECKLIST ---
        let checklistFinal = {};

        const procesarLista = (origen, cantidad, rol) => {
            if (!origen) return;
            // Soporte híbrido para Arrays y Mapas de Firebase
            let items = Array.isArray(origen) ? origen : Object.values(origen);

            const loop = cantidad > 0 ? cantidad : 1;
            for (let i = 1; i <= loop; i++) {
                items.forEach(item => {
                    if (!item.nombre) return;
                    
                    const suffixID = loop > 1 ? `_${i}` : '';
                    const cleanID = item.id ? normalizar(item.id).replace(/\s+/g, '_') : `DOC_${Math.floor(Math.random()*99999)}`;
                    const key = `${cleanID}_${rol.toUpperCase()}${suffixID}`;
                    const suffixNombre = loop > 1 ? ` (${rol} ${i})` : '';
                    
                    // Inyectar URL si es solicitud y no la trae (Fallback inteligente)
                    let urlFinal = item.urlFormato || null;
                    if (!urlFinal) {
                        const n = item.nombre.toUpperCase();
                        // Solo asignamos si coincide nombre Y trámite
                        if (n.includes('SOLICITUD AVAL')) urlFinal = 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-avaluo-ave-RLFaTVxxccFJWZIH.pdf';
                        if (n.includes('SOLICITUD INFONAVIT')) urlFinal = 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-infonavit-BvU7wD8zhF0udyEB.pdf';
                    }

                    // Detectar si es correo para asignarle tipo TXT
                    const esCorreo = item.nombre.toLowerCase().includes('correo');
                    
                    checklistFinal[key] = {
                        id: item.id || cleanID,
                        nombre: item.nombre + suffixNombre,
                        categoria: rol.toLowerCase(), 
                        obligatorio: item.obligatorio !== false, 
                        estatus: 'PENDIENTE',
                        tipo: esCorreo ? 'TXT' : 'documento',
                        urlFormato: urlFinal,
                        fecha: new Date().toISOString()
                    };
                });
            }
        };

        procesarLista(plantilla.solicitante, numSol, 'Solicitante');
        procesarLista(plantilla.propietario, numProp, 'Propietario');
        procesarLista(plantilla.inmueble, 1, 'Inmueble');

        // --- 4. INYECCIONES DE SISTEMA (SOLO SI FALTAN O SON OBLIGATORIAS DE SISTEMA) ---

        // A) Mapa (Siempre va)
        checklistFinal['UBICACION_MAPS'] = { 
            nombre: 'Ubicación del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'mapa' 
        };

        // B) Correo (Solo si NO existe ya en la lista traída de Firebase)
        const yaExisteCorreo = Object.values(checklistFinal).some(item => 
            item.nombre.toUpperCase().includes('CORREO')
        );
        
        if (!yaExisteCorreo) {
            checklistFinal['CORREO_ELECTRONICO_AUTO'] = { 
                nombre: 'Correo electrónico', categoria: 'solicitante', estatus: 'PENDIENTE', obligatorio: true, tipo: 'TXT' 
            };
        }

        // C) FOTOS (NUEVA ESTRUCTURA)
        // 1. Fachada (Obligatoria, única)
        checklistFinal['FOTO_FACHADA'] = {
            nombre: 'Foto de Fachada',
            categoria: 'inmueble',
            estatus: 'PENDIENTE',
            obligatorio: true,
            tipo: 'imagen',
            seccion: 'FOTOS' // Marcador para agrupar visualmente en portal
        };
        
        // 2. Interiores (Opcional, Contenedor Lógico para múltiples)
        checklistFinal['FOTOS_INTERIORES_GENERAL'] = {
            nombre: 'Fotografías Interiores y Entorno',
            categoria: 'inmueble',
            estatus: 'PENDIENTE',
            obligatorio: false,
            tipo: 'galeria', // Tipo especial
            seccion: 'FOTOS'
        };

        // D) Detalles (Solo ciertos trámites)
        if (tramite.includes('INFONAVIT') || tramite.includes('AVALUO') || tramite.includes('HIPOTECA')) {
            checklistFinal['DETALLES_INMUEBLE'] = { 
                nombre: 'Detalles del Inmueble', categoria: 'inmueble', estatus: 'PENDIENTE', obligatorio: true, tipo: 'form' 
            };
        }
        
        // E) SOLICITUDES EXTRA (Si no vinieron del admin y son necesarias)
        // Verificamos si ya existen por nombre clave antes de inyectar
        const tieneSolAvaluo = Object.values(checklistFinal).some(i => i.nombre.toUpperCase().includes('SOLICITUD AVAL'));
        const tieneSolInfo = Object.values(checklistFinal).some(i => i.nombre.toUpperCase().includes('SOLICITUD INFO'));

        if (tramite.includes('AVALUO') && !tieneSolAvaluo) {
             checklistFinal['SOLICITUD_AVALUO_SYS'] = { 
                nombre: 'Solicitud Avalúo', categoria: 'solicitante', estatus: 'PENDIENTE', obligatorio: true, tipo: 'documento',
                urlFormato: 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-avaluo-ave-RLFaTVxxccFJWZIH.pdf'
            };
        }
        
        if (tramite.includes('INFONAVIT') && !tieneSolInfo) {
             checklistFinal['SOLICITUD_INFONAVIT_SYS'] = { 
                nombre: 'Solicitud Infonavit', categoria: 'solicitante', estatus: 'PENDIENTE', obligatorio: true, tipo: 'documento',
                urlFormato: 'https://assets.zyrosite.com/YKb8g9DzkGUbzMqW/solicitud-infonavit-BvU7wD8zhF0udyEB.pdf'
            };
        }

        // --- 5. GUARDAR ---
        const nombreClienteFinal = data.nombre || "Cliente Nuevo";
        
        const nuevoExpediente = {
            ...data,
            nombreCliente: nombreClienteFinal, 
            cliente: nombreClienteFinal,
            checklist: checklistFinal,
            estatus: 'PENDIENTE',
            entidad: entidad, 
            fechaCreacion: new Date().toISOString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const coleccionDestino = tramite.includes('HIPOTECA') ? 'expedientes_hipotecas' : 'expedientes_avaluos';
        const ref = await db.collection(coleccionDestino).add(nuevoExpediente);

        return { 
            statusCode: 200, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                id: ref.id, 
                message: "Expediente Creado",
                url: `/portal.html?id=${ref.id}`
            }) 
        };

    } catch (error) {
        console.error("Error Create:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};