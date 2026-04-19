const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// 1. Inicialización Segura Firebase
let serviceAccount = null;

if (process.env.GOOGLE_SERVICE_ACCOUNT && process.env.GOOGLE_SERVICE_ACCOUNT !== "undefined") {
    try { 
        let parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        serviceAccount = parsed;
    } catch (e) { console.error("Error ENV:", e); }
}

if (!serviceAccount) {
    try {
        const keyPath = path.resolve(__dirname, 'serviceaccountkey.json');
        if (fs.existsSync(keyPath)) {
            serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        }
    } catch (e) { }
}

if (admin.apps.length === 0 && serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// 2. Inicialización Google Drive
let driveService = null;
if (serviceAccount) {
    try {
        const cleanKey = (serviceAccount.private_key || '').replace(/\\n/g, '\n');
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: serviceAccount.client_email, private_key: cleanKey },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveService = google.drive({ version: 'v3', auth });
    } catch (e) {
        console.error("Error configurando Google Drive API:", e);
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const bodyObj = JSON.parse(event.body);
        const { id, nombre, telefono, folioOperativo, anotacion, unidad } = bodyObj;

        if (!id) return { statusCode: 400, body: 'Falta ID' };

        let docRef = db.collection('expedientes_avaluos').doc(id);
        let doc = await docRef.get();
        if (!doc.exists) { docRef = db.collection('expedientes_hipotecas').doc(id); doc = await docRef.get(); }
        if (!doc.exists) { docRef = db.collection('Expedientes').doc(id); doc = await docRef.get(); }
        if (!doc.exists) return { statusCode: 404, body: JSON.stringify({error: 'Expediente no encontrado'}) };

        const dataAnterior = doc.data();
        let updateData = { nombreCliente: nombre, cliente: nombre, telefono: telefono };

        // Armado de nombres
        let nuevoNombreDrive = nombre;
        const folioFinal = folioOperativo !== undefined ? folioOperativo.trim().toUpperCase() : (dataAnterior.folioOperativo || "SIN FOLIO");
        
        if (folioOperativo !== undefined) updateData.folioOperativo = folioFinal;
        if (anotacion !== undefined) updateData.anotacion = anotacion;
        if (unidad !== undefined) updateData.unidad = unidad;

        if (folioFinal !== "SIN FOLIO") nuevoNombreDrive = `${folioFinal} - ${nombre}`;

        let driveFolderId = dataAnterior.driveFolderId;
        
        // 🌟 MAGIA: CREACIÓN DE CARPETA (Si venía de Google Forms y no tenía)
        if (!driveFolderId && unidad && unidad !== 'POR ASIGNAR' && driveService) {
            console.log(`🚀 [DRIVE] El expediente no tiene carpeta. Creando nativamente para la unidad: ${unidad}`);
            try {
                const unidadDoc = await db.collection('unidades_valuacion').doc(unidad).get();
                if (unidadDoc.exists && unidadDoc.data().drive_id) {
                    const parentFolderId = unidadDoc.data().drive_id;
                    
                    const mainF = await driveService.files.create({
                        resource: { name: nuevoNombreDrive, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }, fields: 'id'
                    });
                    driveFolderId = mainF.data.id;
                    
                    const crearSub = async (nom, par) => {
                        const f = await driveService.files.create({ resource: { name: nom, mimeType: 'application/vnd.google-apps.folder', parents: [par] }, fields: 'id' });
                        await new Promise(r => setTimeout(r, 400));
                        return f.data.id;
                    };

                    const idExp = await crearSub('EXPEDIENTE', driveFolderId);
                    const idDoc = await crearSub('DOC JUST', driveFolderId);
                    const idFot = await crearSub('FOTOS', driveFolderId);
                    const idProy = await crearSub('PROY ARQ', driveFolderId);
                    const idComp = await crearSub('COMPARABLES', driveFolderId);
                    
                    const idInm = await crearSub('INMUEBLE', idExp);
                    const idProp = await crearSub('PROPIETARIO', idExp);
                    const idSol = await crearSub('SOLICITANTE', idExp);

                    updateData.driveFolderId = driveFolderId;
                    updateData.driveSubfolders = { expediente: idExp, docJust: idDoc, fotos: idFot, proyArq: idProy, comparables: idComp, inmueble: idInm, propietario: idProp, solicitante: idSol };
                    updateData.carpeta_drive = `https://drive.google.com/drive/folders/${driveFolderId}`;
                    
                    console.log(`✅ [DRIVE] Estructura creada con éxito.`);
                }
            } catch(err) {
                console.error("❌ [DRIVE] Error al crear carpeta desde el backend:", err);
            }
        } 
        // 🌟 MAGIA: RENOMBRADO (Si ya tenía carpeta)
        else if (driveFolderId && driveService) {
            const nombreAnteriorDrive = dataAnterior.folioOperativo && dataAnterior.folioOperativo !== "SIN FOLIO" 
                ? `${dataAnterior.folioOperativo} - ${dataAnterior.cliente}` 
                : dataAnterior.cliente;

            if (nuevoNombreDrive !== nombreAnteriorDrive) {
                try {
                    await driveService.files.update({
                        fileId: driveFolderId,
                        resource: { name: nuevoNombreDrive }
                    });
                    console.log(`✅ [DRIVE] Renombrado exitoso a '${nuevoNombreDrive}'`);
                } catch (errDrive) {
                    console.error("❌ [DRIVE] Error al renombrar carpeta:", errDrive.message);
                }
            }
        }

        await docRef.update(updateData);
        return { statusCode: 200, body: JSON.stringify({ message: 'Actualizado', updateData }) };

    } catch (error) {
        console.error("Error update:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};