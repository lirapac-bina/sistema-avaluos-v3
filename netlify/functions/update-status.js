const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- INICIALIZACIÓN BLINDADA ---
let serviceAccount = null;

if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    try { 
        let parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        serviceAccount = parsed;
    } 
    catch (e) { console.error("Error leyendo ENV:", e); }
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
const bucket = admin.storage().bucket('leezar-expedientes-prod');

// Tu Puente Mágico Intacto
const APPS_SCRIPT_WEBHOOK = "https://script.google.com/macros/s/AKfycbzq3FGv2Hd7QVFsFy9ROP4T8ZS_jDr8pwvk8489lbsemlFaYz1cU_eX7kUaDHpVaibOmA/exec";

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        const body = JSON.parse(event.body);
        
        // Atrapamos las variables (Incluyendo las nuevas de carga interna)
        let { expedienteId, itemKey, nuevoEstado, archivoPath, categoriaItem, motivo, autoConvertJpg, pathsJpg, archivoBase64, nombreArchivo, mimeType, esRaiz } = body;

        console.log(`📡 [STATUS] Petición recibida -> Item: ${itemKey} | Nuevo Estatus: ${nuevoEstado}`);

        // 📁 MODO CARGA INTERNA: Si el Admin nos manda un archivo (Ej. Cédula GYS), lo subimos a Firebase Storage primero
        if (archivoBase64 && nombreArchivo) {
            const buffer = Buffer.from(archivoBase64, 'base64');
            const extension = nombreArchivo.substring(nombreArchivo.lastIndexOf('.')) || '.pdf';
            archivoPath = `interno/${expedienteId}/${itemKey}_${Date.now()}${extension}`;
            const file = bucket.file(archivoPath);
            
            // 🛡️ FIX: Forzamos resumable: false para evadir el crash de AbortSignal en Gaxios/Node
            await file.save(buffer, { 
                resumable: false, 
                metadata: { contentType: mimeType || 'application/pdf' } 
            });
            console.log(`✅ [FIREBASE] Archivo interno guardado en bucket: ${archivoPath}`);
        }

        if (!expedienteId || !itemKey || !nuevoEstado) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos' }) };
        }

        let docRef = db.collection('expedientes_avaluos').doc(expedienteId);
        let doc = await docRef.get();
        if (!doc.exists) { docRef = db.collection('expedientes_hipotecas').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) { docRef = db.collection('Expedientes').doc(expedienteId); doc = await docRef.get(); }
        if (!doc.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Expediente no encontrado' }) };

        const docData = doc.data();
        const itemAnterior = docData.checklist[itemKey] || {};

        // 🛡️ REGLA DE ORO: Si subimos un archivo base64 (Cédula), forzamos estatus 'validado'
        let estatusFinal = nuevoEstado === 'anulado' ? 'rechazado' : nuevoEstado;
        if (archivoBase64) estatusFinal = 'validado'; 

        let updateData = {
            [`checklist.${itemKey}.estatus`]: estatusFinal,
            [`checklist.${itemKey}.fechaActualizacion`]: new Date().toISOString()
        };

        // 🚀 FIX: Bautizamos el documento y lo obligamos a ir a la columna "interno"
        if (!itemAnterior.nombre) {
            const nombresAmigables = {
                'CEDULA_GYS': 'Cédula GyS (Raíz)',
                'MAPA_CONSOLIDACION_1': 'Mapa de Consolidación Urbana 1',
                'MAPA_CONSOLIDACION_2': 'Mapa de Consolidación Urbana 2'
            };
            updateData[`checklist.${itemKey}.nombre`] = nombresAmigables[itemKey] || itemKey;
        }
        
        if (!itemAnterior.categoria) {
            updateData[`checklist.${itemKey}.categoria`] = 'interno'; // 🔑 Esto lo mueve a la columna correcta
        }

        if ((nuevoEstado === 'rechazado' || nuevoEstado === 'anulado') && motivo) {
            updateData[`checklist.${itemKey}.retroalimentacion`] = motivo;
        }

        // ☢️ LIMPIEZA NUCLEAR DE IA (Borra los datos de Firebase para que la Hoja de Trabajo quede limpia)
        if (nuevoEstado === 'anulado') {
            updateData[`datos_extraidos.${itemKey}`] = admin.firestore.FieldValue.delete();
            console.log(`☢️ [STATUS] Anulación Nuclear: Borrando datos_extraidos de ${itemKey}`);
        }

        // 🔥 RECUPERAMOS EL MOTOR GENERADOR DE TOKENS 🔥
        let firebaseUrl = itemAnterior.url; 
        const pathEnNube = archivoPath || itemAnterior.archivoPath;

        if (archivoPath) {
            const token = crypto.randomUUID();
            await bucket.file(archivoPath).setMetadata({
                metadata: { firebaseStorageDownloadTokens: token }
            });
            const encodedPath = encodeURIComponent(archivoPath);
            firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

            updateData[`checklist.${itemKey}.url`] = firebaseUrl;
            updateData[`checklist.${itemKey}.archivoPath`] = archivoPath;
            console.log(`✅ [FIREBASE] Token generado para visualización en el Portal.`);
        }

        // 🌟 NUEVO: PROCESAMOS LOS JPGs DE DOC JUST (Generamos sus enlaces públicos) 🌟
        if (autoConvertJpg && pathsJpg && pathsJpg.length > 0) {
            let urlsJpgGeneradas = [];
            for (let pathJpg of pathsJpg) {
                // Si la imagen es la original, reusamos el enlace
                if (pathJpg === archivoPath) {
                    urlsJpgGeneradas.push(firebaseUrl);
                } else {
                    const tokenJpg = crypto.randomUUID();
                    await bucket.file(pathJpg).setMetadata({
                        metadata: { firebaseStorageDownloadTokens: tokenJpg }
                    });
                    const encodedPathJpg = encodeURIComponent(pathJpg);
                    const urlJpg = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPathJpg}?alt=media&token=${tokenJpg}`;
                    urlsJpgGeneradas.push(urlJpg);
                }
            }
            updateData[`checklist.${itemKey}.autoConvertJpg`] = true;
            updateData[`checklist.${itemKey}.urlsJpg`] = urlsJpgGeneradas;
            console.log(`📸 [FIREBASE] Generados ${urlsJpgGeneradas.length} enlaces JPG para DOC JUST.`);
        }

// ========================================================
        // 🌟 MAGIA MASIVA: TRANSFERENCIA A DRIVE VÍA PUENTE MÁGICO 🌟
        // ========================================================
        let archivosAPasar = [];
        const tipoRequisito = itemAnterior.tipo || 'MIXTO';

        if (tipoRequisito === 'GALERIA') {
            console.log(`📸 [GALERÍA DETECTADA] Requisito dinámico: ${itemKey}`);
            Object.keys(docData.checklist).forEach(k => {
                if (k.includes('FOTO_EXTRA_') || k.includes('EXTRA_')) {
                    const fotoItem = docData.checklist[k];
                    const urlReal = fotoItem.url || fotoItem.archivoUrl;
                    if (urlReal) {
                        archivosAPasar.push({ key: k, url: urlReal, nombreBase: fotoItem.nombre || k, categoria: fotoItem.categoria || 'inmueble', pathEnNube: fotoItem.archivoPath });
                        updateData[`checklist.${k}.estatus`] = estatusFinal; 
                    }
                }
            });
            if (firebaseUrl) {
                archivosAPasar.push({ key: itemKey, url: firebaseUrl, nombreBase: itemAnterior.nombre || itemKey, categoria: categoriaItem || itemAnterior.categoria || 'inmueble', pathEnNube: pathEnNube });
            }
        } else {
            if (firebaseUrl) {
                archivosAPasar.push({ key: itemKey, url: firebaseUrl, nombreBase: itemAnterior.nombre || itemKey, categoria: categoriaItem || itemAnterior.categoria || 'solicitante', pathEnNube: pathEnNube });
            }
        }

        // 🚀 ESCUDO ANTI-TIMEOUT: GUARDAMOS EN FIREBASE INMEDIATAMENTE
        await docRef.update(updateData);
        console.log(`✅ [STATUS] Fase 1: BD actualizada con éxito (Evita Error 500 en UI).`);

        if ((estatusFinal === 'validado' || estatusFinal === 'VALIDADO') && archivosAPasar.length > 0) {
            console.log(`🚀 [DRIVE] Procesando ${archivosAPasar.length} archivo(s)...`);
            
            for (let i = 0; i < archivosAPasar.length; i++) {
                const archivo = archivosAPasar[i];
                let catDrive = (archivo.categoria || 'solicitante').toLowerCase();
                
                let driveFolderId = docData.driveSubfolders ? docData.driveSubfolders[catDrive] : null;
                if (esRaiz && docData.driveFolderId) driveFolderId = docData.driveFolderId;
                if (categoriaItem === 'docjust') {
                    const llaves = Object.keys(docData.driveSubfolders || {});
                    for (let llave of llaves) { if (llave.toLowerCase().replace(/\s/g, '') === 'docjust') driveFolderId = docData.driveSubfolders[llave]; }
                }

                if (archivo.url && driveFolderId && APPS_SCRIPT_WEBHOOK.startsWith("https://script.google.com")) {
                    const extension = archivo.pathEnNube && archivo.pathEnNube.toLowerCase().endsWith('.pdf') ? '.pdf' : '.jpg';
                    const mimeType = extension === '.pdf' ? 'application/pdf' : 'image/jpeg';
                    const nomLimpio = archivo.nombreBase.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 40).trim();
                    const fileNameDrive = `${nomLimpio}${extension}`;

                    try {
                        // ⏱️ RACE CONDITION: Si Drive tarda más de 7 segs, soltamos la conexión para que el servidor no explote
                        const fetchPromise = fetch(APPS_SCRIPT_WEBHOOK, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ secretToken: "LeezarMagia2026", fileUrl: archivo.url, fileName: fileNameDrive, mimeType: mimeType, folderId: driveFolderId })
                        });
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Drive")), 7000));
                        
                        const scriptResponse = await Promise.race([fetchPromise, timeoutPromise]);
                        const scriptData = await scriptResponse.json();
                        
                        if (scriptData.success) {
                            console.log(`✅ [DRIVE] Subido: ${fileNameDrive}`);
                            await docRef.update({ [`checklist.${archivo.key}.driveUrl`]: scriptData.url });
                        }
                    } catch (err) {
                        console.warn(`⚠️ [DRIVE] Intermitencia con Google, pero el sistema continúa sin fallar.`);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // 🌟 REPARTIDOR A DOC JUST 🌟
            if (itemAnterior.autoConvertJpg && itemAnterior.urlsJpg && itemAnterior.urlsJpg.length > 0 && !itemAnterior.docJustUrl) {
                let docJustFolderId = null;
                if (docData.driveSubfolders) {
                    const llaves = Object.keys(docData.driveSubfolders);
                    for (let llave of llaves) { if (llave.toLowerCase().replace(/\s/g, '') === 'docjust') docJustFolderId = docData.driveSubfolders[llave]; }
                }
                
                if (docJustFolderId) {
                    for (let i = 0; i < itemAnterior.urlsJpg.length; i++) {
                        const urlJpg = itemAnterior.urlsJpg[i];
                        const cleanName = (itemAnterior.nombre || itemKey).replace(/[/\\?%*:|"<>]/g, '-').trim();
                        const finalName = itemAnterior.urlsJpg.length > 1 ? `${cleanName} Pag_${i+1}.jpg` : `${cleanName}.jpg`;
                        
                        try {
                            const fetchPromise = fetch(APPS_SCRIPT_WEBHOOK, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ secretToken: "LeezarMagia2026", fileUrl: urlJpg, fileName: finalName, mimeType: 'image/jpeg', folderId: docJustFolderId })
                            });
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Drive")), 7000));
                            
                            const scriptResp = await Promise.race([fetchPromise, timeoutPromise]);
                            const scriptData = await scriptResp.json();
                            if (scriptData.success) console.log(`✅ [DRIVE] JPG Subido a DOC JUST: ${finalName}`);
                        } catch(e) {
                            console.warn(`⚠️ [DRIVE] Timeout DOC JUST.`);
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    await docRef.update({ [`checklist.${itemKey}.docJustUrl`]: true });
                }
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Operación asíncrona completada con escudo anti-timeout' })
        };
    } catch (error) {
        console.error("❌ [ERROR CRÍTICO]", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};